import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      if (user) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'FAILED_LOGIN_ATTEMPT',
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            endpoint: 'POST /api/auth/login',
          }
        });
      }
      res.status(401).json({ error: 'Acceso denegado. Credenciales no válidas.' });
      return;
    }

    // 1. Token de Acceso Corto (Solo dura 15 minutos)
    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '15m' } 
    );

    // 2. Token de Refresco Largo (Dura 7 días)
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SUCCESSFUL_LOGIN',
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        endpoint: 'POST /api/auth/login',
      }
    });

    // 3. Enviamos el Refresh Token en una Cookie HTTP-Only. 
    // Esto significa que JavaScript en el frontend NO puede leerla, haciéndola inmune a ataques XSS.
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // En producción exige HTTPS
      sameSite: 'strict', // Evita ataques CSRF
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
    });

    res.status(200).json({
      message: 'Autenticación exitosa',
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// NUEVA FUNCIÓN: Renovar el Token de Acceso
export const refreshSession = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    res.status(401).json({ error: 'No hay sesión activa para renovar.' });
    return;
  }

  try {
    // Verificamos si el token de refresco es válido y no ha sido alterado
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET as string) as { id: string };
    
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Usuario inválido o desactivado.' });
      return;
    }

    // Generamos un nuevo Token de Acceso de 15 minutos
    const newAccessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '15m' }
    );

    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(403).json({ error: 'Token de refresco inválido o expirado. Inicie sesión nuevamente.' });
  }
};