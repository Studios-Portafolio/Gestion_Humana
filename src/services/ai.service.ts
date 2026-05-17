import { GoogleGenerativeAI } from '@google/generative-ai';

// Volvemos a leer la llave secreta desde el entorno de Render de forma segura
const API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);

export const generateLegalContract = async (
  employeeName: string,
  role: string,
  salary: number,
  currency: string,
  country: string
): Promise<string | null> => {
  try {
    console.log(`📄 Generando contrato inteligente real para ${employeeName}...`);
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Eres el departamento legal corporativo de alta seguridad de la empresa "THE FORTRESS".
      Genera un contrato de trabajo profesional y legalmente estructurado para ${country}.
      
      Datos obligatorios del colaborador:
      - Nombre completo: ${employeeName}
      - Cargo asignado: ${role}
      - Remuneración mensual: ${salary} ${currency}

      Instrucciones vitales:
      1. Usa un tono formal, legal y estricto.
      2. Incluye una cláusula destacada llamada "CONFIDENCIALIDAD Y ZERO TRUST" donde se le exija al colaborador proteger la arquitectura del sistema.
      3. Devuelve únicamente el contrato en formato Markdown estructurado, listo para ser firmado electrónicamente.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error generando contrato inteligente con Gemini:', error);
    throw new Error('Fallo en la generación del contrato por Inteligencia Artificial');
  }
};