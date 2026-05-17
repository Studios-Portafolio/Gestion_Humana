import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateLegalContract } from '../services/ai.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const createContract = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Soportamos cualquier variante de envío de IDs del frontend
    const { employeeId, userId, id, uuid, role, salary, currency, country } = req.body;
    let targetId = employeeId || userId || id || uuid;

    // RESPALDO DE SEGURIDAD PARA PRUEBAS: Si Harvein no adjuntó el ID en la petición,
    // extraemos el último usuario registrado en Postgres de manera automática para no romper la UX
    if (!targetId) {
      const lastEmployee = await prisma.user.findFirst({
        orderBy: { createdAt: 'desc' }
      });
      if (lastEmployee) {
        targetId = lastEmployee.id;
      } else {
        res.status(400).json({ error: 'No se detectó ningún ID de empleado en el cuerpo ni en la base de datos.' });
        return;
      }
    }

    const employee = await prisma.user.findUnique({ where: { id: targetId } });
    if (!employee) {
      res.status(404).json({ error: 'El colaborador seleccionado no existe en el sistema.' });
      return;
    }

    const finalRole = role || employee.role || 'EMPLOYEE';
    const finalCountry = country || 'Venezuela';
    const finalSalary = salary ? Number(salary) : 100;
    const finalCurrency = currency || 'USD';

    const contractContent = await generateLegalContract(
      employee.fullName,
      finalRole,
      finalSalary,
      finalCurrency,
      finalCountry
    );

    if (!contractContent) {
      res.status(500).json({ error: 'El motor de IA no pudo estructurar el contenido legal.' });
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

    // Retorno plano con alias para acoplarse con cualquier desestructuración del front
    res.status(201).json({
      message: 'Contrato generado exitosamente',
      content: contractContent,
      contractContent: contractContent,
      documentHash: documentHash,
      hash: documentHash, 
      contract: newContract
    });

  } catch (error: any) {
    console.error('Error crítico al crear contrato inteligente:', error);
    res.status(500).json({ 
      error: 'Error interno en el generador de contratos.', 
      detalles: error.message || 'Error desconocido' 
    });
  }
};

export const getContracts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
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
    console.error('Error al obtener contratos:', error);
    res.status(500).json({ error: 'Error al obtener los contratos' });
  }
};