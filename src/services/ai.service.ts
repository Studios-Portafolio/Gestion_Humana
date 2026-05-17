export const generateLegalContract = async (
  employeeName: string,
  role: string,
  salary: number,
  currency: string,
  country: string
): Promise<string | null> => {
  try {
    console.log(`📄 Generando contrato inteligente real para ${employeeName} vía conexión directa...`);
    
    const API_KEY = process.env.GEMINI_API_KEY || '';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

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

    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    const aiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      throw new Error(data.error?.message || "Fallo en la API cruda de Google");
    }

    return data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error('Error generando contrato inteligente directo:', error);
    throw new Error('Fallo en la generación del contrato por Inteligencia Artificial');
  }
};