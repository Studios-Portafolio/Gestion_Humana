import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateLegalContract } from '../services/ai.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import crypto from 'crypto';
import { encryptData, decryptData } from '../utils/crypto.util';

const prisma = new PrismaClient();

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

    // 2. Calculamos la huella digital criptográfica (Hash) basándonos en el texto original y legal
    const documentHash = crypto.createHash('sha256').update(contractContent).digest('hex');

    // 3. CIFRAMOS EL DOCUMENTO (Para que nadie pueda leerlo en la Base de Datos)
    const encryptedContent = encryptData(contractContent);

    const newContract = await prisma.contract.create({
      data: {
        userId: employee.id,
        content: encryptedContent, // Guardamos la versión cifrada
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

    // Devolvemos el contenido limpio (desencriptado) a Harvein para que lo renderice en pantalla sin problemas
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

    // DESCIFRAMOS AL VUELO: Le devolvemos el array a Harvein con los contratos desencriptados
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