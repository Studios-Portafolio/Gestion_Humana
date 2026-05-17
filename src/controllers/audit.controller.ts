import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const prisma = new PrismaClient();

export const getAuditLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Consultamos la tabla real de logs e incluimos los datos del usuario que gatilló la acción
    const logs = await prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        timestamp: 'desc' // Los eventos más recientes aparecen primero en el radar
      }
    });

    // Formateamos la respuesta para que Harvein la reciba limpia y estructurada
    const formattedLogs = logs.map((log: any) => ({
      id: log.id,
      timestamp: log.timestamp,
      endpoint: log.endpoint,
      ipAddress: log.ipAddress,
      action: log.action,
      operator: log.user ? {
        name: log.user.fullName,
        email: log.user.email,
        role: log.user.role
      } : {
        name: "SISTEMA_CORE",
        email: "internal@thefortress.com",
        role: "SYSTEM"
      }
    }));

    res.status(200).json(formattedLogs);
  } catch (error: any) {
    console.error('Error al extraer logs de auditoría:', error);
    res.status(500).json({ error: 'Error interno al consultar la bitácora de auditoría de la base de datos.' });
  }
};