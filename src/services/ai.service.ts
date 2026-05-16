export const generateLegalContract = async (
  employeeName: string,
  role: string,
  salary: number,
  currency: string,
  country: string
): Promise<string | null> => {
  try {
    // Simulamos un retraso de 2 segundos para que parezca que la IA está pensando
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Devolvemos un contrato falso sin gastar tokens de OpenAI
    const mockContract = `
# CONTRATO DE TRABAJO - ${country.toUpperCase()}

**Conste por el presente documento, el contrato de trabajo que celebran:**
De una parte, la Empresa THE FORTRESS, y de la otra parte el colaborador **${employeeName}**.

## PRIMERA: DEL CARGO
El colaborador es contratado para prestar sus servicios como **${role}**.

## SEGUNDA: DE LA REMUNERACIÓN
La empresa abonará al colaborador la cantidad de **${salary} ${currency}** mensuales.

## TERCERA: CONFIDENCIALIDAD Y ZERO TRUST
El colaborador se compromete a mantener estricta confidencialidad sobre los sistemas, arquitectura y claves.

*Firmado electrónicamente y verificado en la Blockchain privada.*
    `;

    return mockContract.trim();
  } catch (error) {
    console.error('Error generando contrato simulado:', error);
    throw new Error('Fallo en la generación del contrato');
  }
};