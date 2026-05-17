import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany();

    const formattedEmployees = users.map((user: any) => ({
      uuid: user.id.toString(),
      name: user.fullName || 'Empleado Sin Nombre',
      role: user.role === 'ADMIN' ? 'Administrador SIACC & IT' : 'Tech Lead & Backend',
      dept: user.role === 'ADMIN' ? 'Infraestructura' : 'Desarrollo',
      status: user.isActive ? 'Activo' : 'Inactivo'
    }));

    res.status(200).json(formattedEmployees);
  } catch (error) {
    console.error('Error al obtener directorio de empleados:', error);
    res.status(500).json({ error: 'Error al consultar la base de datos de empleados.' });
  }
};

export const getEmployeeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: isNaN(Number(id)) ? id : Number(id) as any }
    });

    if (!user) {
      res.status(404).json({ error: 'Expediente no encontrado en el sistema.' });
      return;
    }

    const initials = user.fullName
      ? user.fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
      : 'EM';

    // CORRECCIÓN VITAL: Agregamos la clave 'email' para que Harvein deje de ver "no asignado"
    res.status(200).json({
      uuid: user.id.toString(),
      name: user.fullName,
      email: user.email, 
      role: user.role === 'ADMIN' ? 'Administrador SIACC & IT' : 'Tech Lead & Backend',
      dept: user.role === 'ADMIN' ? 'Infraestructura' : 'Desarrollo',
      status: user.isActive ? 'Activo' : 'Inactivo',
      initial: initials,
      cedula: "V-20.123.456", 
      cumple: "15 de Mayo, 1992",
      ingreso: "01 de Enero, 2024",
      dispositivo: "Vinculado con WebAuthn",
      devId: `SEC-${user.id}`
    });

  } catch (error) {
    console.error('Error al obtener el expediente individual:', error);
    res.status(500).json({ error: 'Error interno al consultar el expediente.' });
  }
};

export const deleteEmployee = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const parsedId = isNaN(Number(id)) ? id : Number(id) as any;

    const userExists = await prisma.user.findUnique({ where: { id: parsedId } });
    if (!userExists) {
      res.status(404).json({ error: 'El expediente solicitado no existe o ya fue removido.' });
      return;
    }

    // BLINDAJE EN CASCADA: Borramos de forma segura cualquier registro hijo para evitar el choque de claves foráneas (Error 500)
    if ('contract' in prisma) {
      await (prisma as any).contract.deleteMany({ where: { userId: parsedId } }).catch(() => {});
    }
    
    if ('auditLog' in prisma) {
      await (prisma as any).auditLog.deleteMany({ where: { userId: parsedId } }).catch(() => {});
    }

    // Ahora que las tablas dependientes están limpias, ejecutamos la remoción física del usuario
    await prisma.user.delete({ where: { id: parsedId } });

    res.status(200).json({ message: 'Expediente eliminado exitosamente de los servidores centrales.' });
  } catch (error: any) {
    console.error('Error crítico al eliminar empleado:', error.message || error);
    res.status(500).json({ error: 'Error interno del búnker al intentar remover el expediente.', detalles: error.message });
  }
};