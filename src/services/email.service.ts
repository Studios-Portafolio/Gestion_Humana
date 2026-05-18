import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Configuración del servidor de correo saliente (SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true para puerto 465, false para otros puertos
  auth: {
    user: process.env.SMTP_USER || 'alertas.thefortress@gmail.com',
    pass: process.env.SMTP_PASS || 'tu-app-password-de-google', // Contraseña de aplicación de Google
  },
});

export const sendIntruderAlertEmail = async (adminEmail: string, operatorName: string, ip: string, action: string): Promise<void> => {
  const timestamp = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' });

  const mailOptions = {
    from: '"The Fortress SOC Core" <alertas.thefortress@gmail.com>',
    to: adminEmail,
    subject: '🚨 ALERTA ROJA: Intrusión Biométrica Detectada en Terminal PC',
    html: `
      <div style="background-color: #0b1424; color: #ffffff; padding: 30px; font-family: 'Courier New', monospace; border: 3px solid #ff3333; border-radius: 8px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff3333; text-align: center; margin-top: 0; letter-spacing: 2px;">⚠️ ALERTA DE SEGURIDAD CRÍTICA ⚠️</h2>
        <p style="font-size: 15px; border-bottom: 1px solid #ff3333; padding-bottom: 10px; color: #e2e8f0;">
          El cortafuegos Zero Trust ha bloqueado una operación no autorizada por fallos reiterados de hardware.
        </p>
        <div style="background-color: #162235; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 5px solid #ff3333;">
          <p style="margin: 5px 0;"><strong>🔐 Operador Comprometido:</strong> ${operatorName}</p>
          <p style="margin: 5px 0;"><strong>💥 Operación Bloqueada:</strong> ${action}</p>
          <p style="margin: 5px 0;"><strong>🌐 Dirección IP Atacante:</strong> ${ip}</p>
          <p style="margin: 5px 0;"><strong>💻 Vector de Ataque:</strong> Terminal PC (Windows Hello / TouchID)</p>
          <p style="margin: 5px 0;"><strong>⏰ Hora del Radar (Vzla):</strong> ${timestamp}</p>
        </div>
        <p style="color: #ff9999; font-size: 13px; text-align: center; font-weight: bold;">
          [ACCIONES TOMADAS]: Cuenta congelada preventivamente en la sesión actual.
        </p>
        <hr style="border: 0; border-top: 1px solid #1e293b; margin-top: 25px;" />
        <p style="color: #64748b; font-size: 11px; text-align: center; margin-bottom: 0;">
          Este es un reporte automático cifrado emitido por el núcleo central de The Fortress LegalTech.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[SOC MAIL] 📧 Alerta forense enviada exitosamente a ${adminEmail}`);
  } catch (error) {
    console.error('[SOC MAIL] ❌ Error crítico al despachar el correo de alerta:', error);
  }
};