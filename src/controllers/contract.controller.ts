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
      res.status(404).json({ error: 'Empleado no encontrado' });
      return;
    }

    const contractContent = await generateLegalContract(
      employee.fullName,
      role,
      salary,
      currency,
      country
    );

    if (!contractContent) {
      res.status(500).json({ error: 'La IA no devolvió contenido válido' });
      return;
    }

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
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor al procesar el contrato' });
  }
};

// NUEVA FUNCIÓN: Obtener la lista de contratos para el Dashboard
export const getContracts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Si es ADMIN o HR_MANAGER, ve todos los contratos. Si es EMPLOYEE, solo ve los suyos.
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'HR_MANAGER';
    
    const contracts = await prisma.contract.findMany({
      where: isAdmin ? {} : { userId: req.user?.id },
      include: {
        user: {
          select: { fullName: true, email: true } // Traemos los datos del empleado asociado
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ contracts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los contratos' });
  }
};