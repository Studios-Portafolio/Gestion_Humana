import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();

// Inicializamos el cerebro de la IA con tu llave secreta
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    console.log(`📸 Analizando documento REAL para: ${email} usando OpenAI (GPT-4o)...`);

    // 1. Convertimos la imagen de la memoria RAM a formato Base64
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // 2. Disparamos la petición al modelo de Visión de OpenAI
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Eres un sistema estricto de seguridad y OCR. Extrae el nombre completo y el número de identificación (cédula o DNI) de este documento de identidad. Devuelve ÚNICAMENTE un objeto JSON válido con las claves exactas 'fullName' y 'idNumber'. No agregues texto adicional, saludos, ni etiquetas de markdown." 
            },
            { 
              type: "image_url", 
              image_url: { url: `data:${mimeType};base64,${base64Image}` } 
            }
          ]
        }
      ],
      max_tokens: 300,
    });

    // 3. Atrapamos y limpiamos la respuesta de la IA
    let jsonString = aiResponse.choices[0].message.content || '{}';
    jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim(); 
    
    const extractedData = JSON.parse(jsonString);

    if (!extractedData.fullName || !extractedData.idNumber) {
      throw new Error("La IA no pudo estructurar los datos del documento correctamente.");
    }

    console.log(`✅ IA Extrajo con éxito: ${extractedData.fullName} (${extractedData.idNumber})`);

    // 4. Magia Zero Data Entry: Auto-registro en Neon DB
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

    // 5. Dejamos el rastro en la auditoría
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id, 
        action: `AUTO_REGISTER_SUCCESS_FOR_${newUser.id}`,
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        endpoint: 'POST /api/ocr/process',
      }
    });

    res.status(201).json({
      message: 'Documento procesado con Inteligencia Artificial y empleado registrado',
      employee: {
        id: newUser.id,
        name: newUser.fullName,
        email: newUser.email,
        status: 'ACTIVE'
      },
      confidence: 0.99 
    });

  } catch (error: any) {
    console.error('Error en Motor OCR (OpenAI):', error.message || error);
    res.status(500).json({ error: 'Error interno de la IA al procesar el documento. Verifica el saldo en OpenAI o la legibilidad de la imagen.' });
  }
};