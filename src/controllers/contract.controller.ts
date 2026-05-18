import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateLegalContract } from '../services/ai.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import crypto from 'crypto';
import { encryptData, decryptData } from '../utils/crypto.util';

const prisma = new PrismaClient();

// ==========================================
// 1. GENERADOR DE CONTRATOS IA (INTERNO)
// ==========================================
export const createContract = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { employeeId, userId, id, uuid, role, salary, currency, country } = req.body;
    let targetId = employeeId || userId || id || uuid;

    if (!targetId) {
      const lastEmployee = await prisma.user.findFirst({
        orderBy: { createdAt: 'desc' }
      });
      if (lastEmployee) {
        targetId = lastEmployee.id;
      } else {
        res.status(400).json({ error: 'No se detectó ningún ID de empleado.' });
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

    // 1. Generamos el contrato con Gemini
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

    // 2. Calculamos la huella digital criptográfica (Hash) del texto puro
    const documentHash = crypto.createHash('sha256').update(contractContent).digest('hex');

    // 3. CIFRAMOS EL DOCUMENTO (E2EE) para la Base de Datos
    const encryptedContent = encryptData(contractContent);

    const newContract = await prisma.contract.create({
      data: {
        userId: employee.id,
        content: encryptedContent, 
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

    res.status(201).json({
      message: 'Contrato generado y cifrado exitosamente en BD',
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

    // DESCIFRAMOS AL VUELO para Harvein
    const decryptedContracts = contracts.map((contract: any) => ({
      ...contract,
      content: decryptData(contract.content)
    }));

    res.status(200).json({ contracts: decryptedContracts });
  } catch (error) {
    console.error('Error al obtener contratos:', error);
    res.status(500).json({ error: 'Error al obtener los contratos' });
  }
};

// ==========================================
// 2. NUEVO: VALIDADOR CRIPTOGRÁFICO PÚBLICO (AUDITORÍA EXTERNA)
// ==========================================
export const verifyContractPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { contractText, documentHash } = req.body;

    if (!contractText || !documentHash) {
      res.status(400).json({ 
        error: 'Petición rechazada. Se requiere el texto exacto del contrato y su Hash para realizar el peritaje.' 
      });
      return;
    }

    // 1. RECALCULAMOS EN VIVO: Si el usuario cambió un solo espacio o coma, este hash será distinto
    const recalculatedHash = crypto.createHash('sha256').update(contractText).digest('hex');

    if (recalculatedHash !== documentHash) {
      res.status(400).json({
        verified: false,
        status: 'FORGED_DOCUMENT',
        message: 'ALERTA ROJA: El texto ingresado ha sido alterado o falsificado. El sello matemático no coincide.',
        expectedHash: documentHash,
        actualHash: recalculatedHash
      });
      return;
    }

    // 2. BUSCAMOS EN EL BÚNKER: Si la matemática coincide, buscamos si nosotros lo emitimos
    const dbContract = await prisma.contract.findFirst({
      where: { documentHash: documentHash },
      include: {
        user: { select: { fullName: true, email: true } }
      }
    });

    if (!dbContract) {
      res.status(404).json({
        verified: false,
        status: 'GHOST_DOCUMENT',
        message: 'El contrato tiene un hash válido, pero no existe en los registros de la base de datos de The Fortress. Posible emisión no autorizada.'
      });
      return;
    }

    // 3. SELLO VERDE: El contrato es real y fue emitido por nuestra infraestructura
    res.status(200).json({
      verified: true,
      status: 'AUTHENTIC_DOCUMENT',
      message: 'PERITAJE EXITOSO: Documento original, inmutable y registrado legalmente en The Fortress.',
      metadata: {
        issuedTo: dbContract.user?.fullName,
        email: dbContract.user?.email,
        issueDate: new Date(dbContract.createdAt).toLocaleString('es-VE', { timeZone: 'America/Caracas' }),
        signatureHash: dbContract.documentHash
      }
    });

  } catch (error) {
    console.error('[AUDITOR CRIPTO] Error en el proceso de verificación externa:', error);
    res.status(500).json({ error: 'Error interno en el motor de validación criptográfica.' });
  }
};