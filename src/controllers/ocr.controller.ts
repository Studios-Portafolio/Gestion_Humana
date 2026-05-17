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
              text: "Eres un sistema estricto de seguridad y OCR. Extrae el nombre completo, el número de identificación (cédula o DNI) y la fecha de nacimiento de este documento de identidad. Devuelve ÚNICAMENTE un objeto JSON válido con las claves exactas 'fullName', 'idNumber' y 'birthDate'. No agregues texto adicional, saludos ni etiquetas markdown." 
            },
            { 
              type: "image_url", 
              image_url: { url: `data:${mimeType};base64,${base64Image}` } 
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
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
      const openRouterErrorMessage = data.error?.message || 'Error desconocido en el proveedor de IA';
      throw new Error(`OpenRouter rechazó la petición: ${openRouterErrorMessage}`);
    }

    let jsonString = data.choices[0]?.message?.content || ''; 
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }

    const extractedData = JSON.parse(jsonString);

    if (!extractedData.fullName || !extractedData.idNumber) {
      throw new Error("La IA completó la tarea pero no estructuró las llaves correctamente.");
    }

    console.log(`✅ Proxy Extrajo con éxito: ${extractedData.fullName} (${extractedData.idNumber})`);

    // PERSISTENCIA REAL: Guardamos los datos del OCR directamente en las nuevas columnas de Neon DB
    const newUser = await prisma.user.upsert({
      where: { email: email },
      update: {
        fullName: extractedData.fullName,
        idNumber: extractedData.idNumber,
        birthDate: extractedData.birthDate,
        isActive: true
      },
      create: {
        email: email,
        fullName: extractedData.fullName,
        idNumber: extractedData.idNumber,
        birthDate: extractedData.birthDate,
        role: 'EMPLOYEE',
        isActive: true
      }
    });

    if (req.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id, 
          action: `AUTO_REGISTER_SUCCESS_FOR_${newUser.id}`,
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          endpoint: 'POST /api/ocr/process',
        }
      });
    }

    res.status(200).json({
      nombre: newUser.fullName,
      cedula: newUser.idNumber,
      fechaNacimiento: newUser.birthDate || "No detectada",
      email: newUser.email
    });

  } catch (error: any) {
    console.error('Error crítico en Motor OCR:', error.message || error);
    res.status(500).json({ 
      error: 'Error interno en el motor de IA.',
      detalles: error.message || 'Error de parseo inesperado.'
    });
  }
};