import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const processDocumentOCR = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!req.file) {
      res.status(400).json({ error: 'No se detectó ningún documento en la petición.' });
      return;
    }

    if (!email) {
      res.status(400).json({ error: 'El correo electrónico es necesario para el auto-registro.' });
      return;
    }

    console.log(`📸 Analizando documento REAL para: ${email} usando Proxy OpenRouter -> Gemini 2.5 Flash...`);

    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const API_KEY = process.env.OPENROUTER_API_KEY || '';

    const url = "https://openrouter.ai/api/v1/chat/completions";
    
    const payload = {
      model: "google/gemini-2.5-flash", 
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Eres un sistema estricto de seguridad y OCR. Extrae el nombre completo y el número de identificación (cédula o DNI) de este documento de identidad. Devuelve ÚNICAMENTE un objeto JSON válido con las claves exactas 'fullName' y 'idNumber'. No agregues texto adicional, saludos ni etiquetas markdown." 
            },
            { 
              type: "image_url", 
              image_url: { url: `data:${mimeType};base64,${base64Image}` } 
            }
          ]
        }
      ],
      // SOLUCIÓN: Forzamos un límite bajo de tokens para cumplir con el plan gratuito de OpenRouter
      max_tokens: 400 
    };

    const aiResponse = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://the-fortress-backend.onrender.com',
        'X-Title': 'The Fortress'
      },
      body: JSON.stringify(payload)
    });

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("Fallo del Proxy OpenRouter:", JSON.stringify(data, null, 2));
      throw new Error("Error en el puente de Inteligencia Artificial");
    }

    let jsonString = data.choices[0].message.content; 
    jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();

    const extractedData = JSON.parse(jsonString);

    if (!extractedData.fullName || !extractedData.idNumber) {
      throw new Error("La IA no pudo estructurar los datos correctamente.");
    }

    console.log(`✅ Proxy Extrajo con éxito: ${extractedData.fullName} (${extractedData.idNumber})`);

    const newUser = await prisma.user.upsert({
      where: { email: email },
      update: {
        fullName: extractedData.fullName,
        isActive: true
      },
      create: {
        email: email,
        fullName: extractedData.fullName,
        role: 'EMPLOYEE',
        isActive: true
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id, 
        action: `AUTO_REGISTER_SUCCESS_FOR_${newUser.id}`,
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        endpoint: 'POST /api/ocr/process',
      }
    });

    res.status(201).json({
      message: 'Documento procesado con Inteligencia Artificial vía Proxy',
      employee: {
        id: newUser.id,
        name: newUser.fullName,
        email: newUser.email,
        status: 'ACTIVE'
      },
      confidence: 0.99 
    });

  } catch (error: any) {
    console.error('Error en Motor OCR (Proxy OpenRouter):', error.message || error);
    res.status(500).json({ error: 'Error interno de la IA al procesar el documento. Verifica la conexión o la calidad de la imagen.' });
  }
};