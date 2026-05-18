import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: { 
        user: { 
          select: { fullName: true, email: true, role: true } 
        } 
      },
      // CORRECCIÓN PRISMA: Cambiamos 'createdAt' por 'timestamp'. 
      // (Si en tu schema.prisma se llama distinto, ajústalo aquí)
      orderBy: { timestamp: 'desc' }, 
      take: 150 
    });

    const enhancedLogs = logs.map((log: any) => {
      let severity = 'INFO';
      let uiColor = '#10b981'; // Verde esmeralda
      let alertLevel = 'NORMAL';

      const actionUpper = log.action.toUpperCase();

      if (actionUpper.includes('DELETE') || actionUpper.includes('FAIL') || actionUpper.includes('PURGA') || actionUpper.includes('INTRUDER')) {
        severity = 'CRITICAL';
        uiColor = '#ef4444'; // Rojo sangre
        alertLevel = 'ALTO RIESGO';
      } 
      else if (actionUpper.includes('UPDATE') || actionUpper.includes('GENERATE') || actionUpper.includes('STEP_UP')) {
        severity = 'WARNING';
        uiColor = '#f59e0b'; // Naranja/Amarillo
        alertLevel = 'ELEVADO';
      }

      return {
        id: log.id,
        operator: log.user ? log.user.fullName : 'Sistema / Desconocido',
        operatorRole: log.user ? log.user.role : 'GHOST',
        operatorEmail: log.user ? log.user.email : 'N/A',
        action: log.action,
        ip: log.ipAddress === '::1' ? '127.0.0.1 (Local)' : log.ipAddress,
        // CORRECCIÓN PRISMA: Aquí también usamos 'timestamp' en vez de 'createdAt'
        timestamp: new Date(log.timestamp).toLocaleString('es-VE', { timeZone: 'America/Caracas' }),
        securityMatrix: {
          severityCode: severity,
          hexColor: uiColor,
          alertTag: alertLevel
        }
      };
    });

    res.status(200).json({ 
      radarStatus: 'ONLINE',
      totalLogs: enhancedLogs.length,
      logs: enhancedLogs 
    });

  } catch (error) {
    console.error('[SOC RADAR] Error al compilar la bitácora:', error);
    res.status(500).json({ error: 'Fallo crítico al extraer los registros del búnker.' });
  }
};