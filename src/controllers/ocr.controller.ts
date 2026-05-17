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
      // Forzamos a la API a responder estrictamente en formato estructurado JSON
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

    // DIAGNÓSTICO: Si OpenRouter responde mal, capturamos su mensaje exacto y lo lanzamos al catch
    if (!aiResponse.ok) {
      const openRouterErrorMessage = data.error?.message || 'Error desconocido en el proveedor de IA';
      console.error("Fallo detallado del Proxy OpenRouter:", JSON.stringify(data, null, 2));
      throw new Error(`OpenRouter rechazó la petición: ${openRouterErrorMessage}`);
    }

    let jsonString = data.choices[0]?.message?.content || ''; 
    
    // BLINDAJE EXTRA: Aislamos el objeto JSON usando expresiones regulares para evitar fallos de parseo
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }

    const extractedData = JSON.parse(jsonString);

    if (!extractedData.fullName || !extractedData.idNumber) {
      throw new Error("La IA completó la tarea pero no estructuró las llaves 'fullName' o 'idNumber' correctamente.");
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
      cedula: extractedData.idNumber,
      fechaNacimiento: extractedData.birthDate || "No detectada",
      email: newUser.email
    });

  } catch (error: any) {
    console.error('Error crítico en Motor OCR:', error.message || error);
    
    // Revelamos la causa real del fallo al frontend para solucionar el problema de inmediato
    res.status(500).json({ 
      error: 'Error interno en el motor de IA.',
      detalles: error.message || 'Error de parseo o conectividad inesperado.'
    });
  }
};