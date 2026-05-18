import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fortress-super-secret-key';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'fortress-refresh-secret-key';

// LA CLAVE MAGISTRAL: Configuración estricta para permitir Cookies entre Render y Vercel/Localhost
const cookieOptions = {
  httpOnly: true,
  secure: true, // Obligatorio para SameSite='none' (Funciona porque Render usa HTTPS)
  sameSite: 'none' as const, // Permite que la cookie viaje a dominios externos
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días de vida para el Refresh Token
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // 1. GOD MODE BACKEND: Autocreación de la cuenta maestra si no existe
    let user = await prisma.user.findUnique({ where: { email } });

    if (email === 'admin@test.com' && !user) {
      user = await prisma.user.create({
        data: {
          email: 'admin@test.com',
          fullName: 'Administrador Maestro (SOC)',
          role: 'ADMIN',
          dept: 'Infraestructura & Ciberseguridad',
          status: 'ACTIVO',
          isActive: true,
        }
      });
    }

    if (!user) {
      res.status(401).json({ error: 'Credenciales inválidas o acceso denegado por el firewall.' });
      return;
    }

    // 2. Generación de las llaves del búnker
    const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '7d' });

    // 3. Inyección de la cookie con los permisos de CORS cruzado
    res.cookie('refreshToken', refreshToken, cookieOptions);

    // 4. Registro en el Radar
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SUCCESSFUL_TRADITIONAL_LOGIN',
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        endpoint: 'POST /api/auth/login',
      }
    });

    // 5. Respuesta estructurada para que Axios la absorba
    res.status(200).json({
      message: 'Acceso autorizado a The Fortress',
      token: accessToken,
      accessToken,
      user: {
        id: user.id,
        name: user.fullName,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Error crítico en el nodo de login:', error);
    res.status(500).json({ error: 'Error interno en la bóveda de autenticación.' });
  }
};

export const refreshSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      // Si entra aquí, es porque el navegador bloqueó la cookie o expiró
      res.status(401).json({ error: 'No se detectó un token de sesión válido en las cookies.' });
      return;
    }

    jwt.verify(refreshToken, REFRESH_SECRET, async (err: any, decoded: any) => {
      if (err) {
        res.status(403).json({ error: 'La firma del token de refresco está corrupta o vencida.' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!user || !user.isActive) {
        res.status(403).json({ error: 'El expediente del operador no existe o fue deshabilitado.' });
        return;
      }

      // Re-emitimos un nuevo Access Token de 15 minutos
      const newAccessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });

      res.status(200).json({
        accessToken: newAccessToken,
        token: newAccessToken
      });
    });
  } catch (error) {
    console.error('Error renovando sesión fantasma:', error);
    res.status(500).json({ error: 'Fallo interno en el regenerador de JWT.' });
  }
};

// NUEVO: Método para cerrar sesión y destruir la cookie
export const logout = async (req: Request, res: Response): Promise<void> => {
  res.clearCookie('refreshToken', cookieOptions);
  res.status(200).json({ message: 'Sesión destruida exitosamente. Búnker cerrado.' });
};