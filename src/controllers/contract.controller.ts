import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateLegalContract } from '../services/ai.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const createContract = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { employeeId, role, salary, currency, country } = req.body;

  try {
    const employee = await prisma.user.findUnique({ where: { id: employeeId } });
    if (!employee) {
      res.status(404).json({ error: 'Empleado no encontrado en la base de datos central.' });
      return;
    }

    // Invocamos el puente OpenRouter con los datos reales del colaborador
    const contractContent = await generateLegalContract(
      employee.fullName,
      role,
      Number(salary),
      currency,
      country
    );

    if (!contractContent) {
      res.status(500).json({ error: 'La IA no devolvió contenido legal válido.' });
      return;
    }

    // Generamos el Hash criptográfico SHA-256 único del documento para la auditoría Zero Trust
    const documentHash = crypto.createHash('sha256').update(contractContent).digest('hex');

    const newContract = await prisma.contract.create({
      data: {
        userId: employee.id,
        content: contractContent,
        documentHash: documentHash,
        status: 'DRAFT',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: `CONTRACT_GENERATED_FOR_${employee.id}`,
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        endpoint: 'POST /api/contracts',
      }
    });

    res.status(201).json({ message: 'Contrato generado exitosamente', contract: newContract });
  } catch (error) {
    console.error('Error al generar contrato con IA:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar el contrato' });
  }
};

export const getContracts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Sincronizamos la visibilidad estricta basándonos en tu enum Role de Prisma
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'HR_MANAGER';
    
    const contracts = await prisma.contract.findMany({
      where: isAdmin ? {} : { userId: req.user?.id },
      include: {
        user: {
          select: { fullName: true, email: true, idNumber: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ contracts });
  } catch (error) {
    console.error('Error al obtener contratos del búnker:', error);
    res.status(500).json({ error: 'Error al obtener los contratos' });
  }
};