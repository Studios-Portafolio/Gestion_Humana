import { Response, NextFunction } from 'express';

// 🌐 LISTA BLANCA CORPORATIVA (Whitelist)
// Aquí se colocan las IPs estáticas de la oficina. Por ahora permitimos localhost para desarrollo.
const WHITELISTED_IPS = [
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1'
  // '190.200.XX.XX' -> Ejemplo de IP pública de las oficinas en Caracas
];

export const requireCorporateIP = (req: any, res: Response, next: NextFunction): void => {
  try {
    // Extraemos la IP cruda del socket
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Como estamos detrás de los balanceadores de Render/Vercel, buscamos la IP real del cliente
    const forwardedIpsStr = req.headers['x-forwarded-for'] as string;
    const realIp = forwardedIpsStr ? forwardedIpsStr.split(',')[0].trim() : clientIp;

    // KIL SWITCH: Si en Render pones la variable BYPASS_IP_FIREWALL=true, se apaga el bloqueo temporalmente
    const bypassFirewall = process.env.BYPASS_IP_FIREWALL === 'true';

    if (bypassFirewall || WHITELISTED_IPS.includes(realIp)) {
      // La IP está limpia y autorizada. El flujo continúa.
      next();
    } else {
      console.warn(`[FIREWALL ZERO TRUST] 🛑 Intento de acceso bloqueado desde IP no autorizada: ${realIp}`);
      
      res.status(403).json({
        error: 'Geocercado Activo (Zero Trust). Tu ubicación de red no pertenece a las oficinas corporativas autorizadas. Acceso denegado.'
      });
    }
  } catch (error) {
    console.error('[FIREWALL ERROR] Fallo interno en la inspección de red:', error);
    res.status(500).json({ error: 'Fallo crítico en el módulo de seguridad de red perimetral.' });
  }
};