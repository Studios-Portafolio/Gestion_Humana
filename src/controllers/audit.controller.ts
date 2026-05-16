import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const prisma = new PrismaClient();

export const getAuditLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Solo traemos los últimos 50 registros de seguridad para no saturar
    const logs = await prisma.auditLog.findMany({
      take: 50,
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: { fullName: true, role: true }
        }
      }
    });

    res.status(200).json({ logs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los logs de auditoría' });
  }
};