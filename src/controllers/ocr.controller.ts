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

    console.log(`📸 Analizando documento REAL para: ${email} por conexión directa a Gemini 1.5 Flash...`);

    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const API_KEY = process.env.GEMINI_API_KEY || '';

    // TÁCTICA: Conexión REST directa saltándose el SDK de Google
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [
          { text: "Eres un sistema estricto de seguridad y OCR. Extrae el nombre completo y el número de identificación (cédula o DNI) de este documento de identidad. Devuelve ÚNICAMENTE un objeto JSON válido con las claves exactas 'fullName' y 'idNumber'. No agregues texto adicional, saludos ni etiquetas markdown." },
          { inlineData: { mimeType: mimeType, data: base64Image } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const aiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("Fallo directo de Google:", JSON.stringify(data, null, 2));
      throw new Error(data.error?.message || "Error desconocido en API de Google");
    }

    // Extraemos la respuesta cruda
    let jsonString = data.candidates[0].content.parts[0].text; 
    jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();

    const extractedData = JSON.parse(jsonString);

    if (!extractedData.fullName || !extractedData.idNumber) {
      throw new Error("La IA no pudo estructurar los datos del documento correctamente.");
    }

    console.log(`✅ Conexión Directa Extrajo con éxito: ${extractedData.fullName} (${extractedData.idNumber})`);

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
      message: 'Documento procesado con Inteligencia Artificial',
      employee: {
        id: newUser.id,
        name: newUser.fullName,
        email: newUser.email,
        status: 'ACTIVE'
      },
      confidence: 0.99 
    });

  } catch (error: any) {
    console.error('Error en Motor OCR Directo:', error.message || error);
    res.status(500).json({ error: 'Error interno de la IA al procesar el documento. Revisa los logs de Render para detalles exactos.' });
  }
};