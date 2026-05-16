import { GoogleGenerativeAI } from '@google/generative-ai';

// Inicializamos Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const generateLegalContract = async (
  employeeName: string,
  role: string,
  salary: number,
  currency: string,
  country: string
): Promise<string | null> => {
  try {
    console.log(`📄 Generando contrato inteligente real para ${employeeName} usando Gemini...`);
    
    // Usamos el modelo rápido para la generación de texto
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
      2. Incluye una cláusula destacada llamada "CONFIDENCIALIDAD Y ZERO TRUST" donde se le exija al colaborador proteger la arquitectura del sistema, no compartir tokens bajo ninguna circunstancia y obligarlo al uso de sistemas biométricos para el acceso.
      3. Devuelve únicamente el contrato en formato Markdown estructurado, listo para ser firmado electrónicamente. No incluyas saludos ni texto de relleno fuera del contrato.
    `;

    const result = await model.generateContent(prompt);
    const contractText = result.response.text();

    return contractText.trim();
  } catch (error) {
    console.error('Error generando contrato inteligente con Gemini:', error);
    throw new Error('Fallo en la generación del contrato por Inteligencia Artificial');
  }
};