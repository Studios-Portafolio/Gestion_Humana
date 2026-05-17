import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// La llave maestra (Debe tener exactamente 32 caracteres para AES-256)
// En producción, Render leerá esto del entorno. Si no existe, usa un fallback seguro.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'fortress-super-secret-key-32char'; 
const ALGORITHM = 'aes-256-cbc';

export const encryptData = (text: string): string => {
  if (!text) return text;
  
  try {
    // Generamos un Vector de Inicialización (IV) único para cada encriptación
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    
    let encrypted = cipher.update(text, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    
    // Retornamos el IV pegado al dato encriptado (separado por dos puntos) para poder descifrarlo luego
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Error en el módulo de cifrado:', error);
    throw new Error('Fallo crítico al encriptar el dato.');
  }
};

export const decryptData = (encryptedText: string): string => {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;

  try {
    // Separamos el IV del contenido real
    const [ivHex, encryptedHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    
    return decrypted;
  } catch (error) {
    console.error('Error en el módulo de descifrado:', error);
    return 'DATA_CORRUPTA'; // Fallback de seguridad si alguien manipula la DB
  }
};