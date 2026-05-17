export const generateLegalContract = async (
  employeeName: string,
  role: string,
  salary: number,
  currency: string,
  country: string
): Promise<string | null> => {
  try {
    // CORRECCIÓN VITAL: Cambiado a Gemini 2.5 Flash para responder en 2 segundos y evitar el timeout de Render
    console.log(`📄 Generando contrato inteligente real para ${employeeName} vía Gemini 2.5 Flash...`);
    
    const API_KEY = process.env.OPENROUTER_API_KEY || '';
    const url = "https://openrouter.ai/api/v1/chat/completions";

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
      model: "google/gemini-2.5-flash", // Utiliza Flash para velocidad de respuesta relámpago
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000 
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
      console.error("Fallo del Proxy OpenRouter en contrato:", JSON.stringify(data, null, 2));
      throw new Error(data.error?.message || "Fallo en el puente de OpenRouter");
    }

    return data.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('Error generando contrato inteligente con Proxy:', error);
    throw error;
  }
};