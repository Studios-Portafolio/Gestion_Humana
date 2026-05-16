import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();

// Inicializamos el nuevo cerebro de la bóveda con tu llave de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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

    console.log(`📸 Analizando documento REAL para: ${email} usando Gemini 1.5 Flash...`);

    // 1. Convertimos la imagen de la memoria RAM a formato Base64
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // 2. Preparamos el modelo y FORZAMOS una respuesta 100% JSON nativa
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = "Eres un sistema estricto de seguridad y OCR. Extrae el nombre completo y el número de identificación (cédula o DNI) de este documento de identidad. Devuelve ÚNICAMENTE un objeto JSON válido con las claves exactas 'fullName' y 'idNumber'. No agregues texto adicional ni etiquetas markdown.";
    
    // 3. Empaquetamos la imagen para Gemini
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: mimeType
      }
    };

    // 4. Disparamos la petición a la Inteligencia Artificial
    const aiResponse = await model.generateContent([prompt, imagePart]);
    
    // Como configuramos responseMimeType, el texto ya es un JSON puro
    const jsonString = aiResponse.response.text(); 
    const extractedData = JSON.parse(jsonString);

    if (!extractedData.fullName || !extractedData.idNumber) {
      throw new Error("La IA no pudo estructurar los datos del documento correctamente.");
    }

    console.log(`✅ Gemini Extrajo con éxito: ${extractedData.fullName} (${extractedData.idNumber})`);

    // 5. Magia Zero Data Entry: Auto-registro en Neon DB
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

    // 6. Dejamos el rastro en la auditoría
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id, 
        action: `AUTO_REGISTER_SUCCESS_FOR_${newUser.id}`,
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        endpoint: 'POST /api/ocr/process',
      }
    });

    res.status(201).json({
      message: 'Documento procesado con Gemini IA y empleado registrado',
      employee: {
        id: newUser.id,
        name: newUser.fullName,
        email: newUser.email,
        status: 'ACTIVE'
      },
      confidence: 0.99 
    });

  } catch (error: any) {
    console.error('Error en Motor OCR (Gemini):', error.message || error);
    res.status(500).json({ error: 'Error interno de la IA al procesar el documento. Verifica la calidad de la imagen.' });
  }
};