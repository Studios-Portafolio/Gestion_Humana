import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateLegalContract } from '../services/ai.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const createContract = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  // Soportamos tanto 'employeeId' como 'userId' por si Harvein lo envía con cualquier nombre en el cuerpo
  const { employeeId, userId, role, salary, currency, country } = req.body;
  const targetId = employeeId || userId;

  try {
    if (!targetId) {
      res.status(400).json({ error: 'ID del colaborador requerido (employeeId o userId).' });
      return;
    }

    // Buscamos el expediente real en tu Neon DB
    const employee = await prisma.user.findUnique({ where: { id: targetId } });
    if (!employee) {
      res.status(404).json({ error: 'El colaborador seleccionado no existe en el búnker.' });
      return;
    }

    // INTELIGENCIA ADAPTATIVA: Si el formulario de Harvein no incluye el cargo o el país,
    // los extraemos de su registro en la DB o asignamos valores por defecto para no romper el flujo.
    const finalRole = role || employee.role || 'EMPLOYEE';
    const finalCountry = country || 'Venezuela';
    const finalSalary = salary ? Number(salary) : 100;
    const finalCurrency = currency || 'USD';

    console.log(`📄 Generando contrato real para ${employee.fullName} Vía Gemini 2.5 Pro...`);

    const contractContent = await generateLegalContract(
      employee.fullName,
      finalRole,
      finalSalary,
      finalCurrency,
      finalCountry
    );

    if (!contractContent) {
      res.status(500).json({ error: 'El motor de Inteligencia Artificial no devolvió contenido legal válido.' });
      return;
    }

    // Generamos el Hash criptográfico real SHA-256 para la Bóveda Criptográfica del Front
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

    // ALINEACIÓN TOTAL CON EL FRONTEND: Enviamos una respuesta plana con múltiples alias de llaves
    // para que se acople perfectamente con la destructuración que haya hecho Harvein en su React
    res.status(201).json({
      message: 'Contrato generado exitosamente',
      content: contractContent,
      contractContent: contractContent,
      documentHash: documentHash,
      hash: documentHash, // Mapea directo al recuadro de "HASH:" de la pantalla
      contract: newContract
    });

  } catch (error: any) {
    console.error('Error crítico al crear contrato inteligente:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar el contrato', detalles: error.message });
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
    console.error('Error al obtener contratos del repositorio:', error);
    res.status(500).json({ error: 'Error al obtener los contratos' });
  }
};