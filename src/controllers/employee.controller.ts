import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany();

    const formattedEmployees = users.map((user: any) => ({
      uuid: user.id.toString(),
      name: user.fullName || 'Empleado Sin Nombre',
      role: user.role === 'ADMIN' ? 'Administrador SIACC & IT' : user.role === 'HR_MANAGER' ? 'HR Manager' : 'Tech Lead & Backend',
      dept: user.dept,
      status: user.status.charAt(0) + user.status.slice(1).toLowerCase() 
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

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      res.status(404).json({ error: 'Expediente no encontrado en el sistema.' });
      return;
    }

    const initials = user.fullName
      ? user.fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
      : 'EM';

    res.status(200).json({
      uuid: user.id.toString(),
      name: user.fullName,
      email: user.email, 
      role: user.role === 'ADMIN' ? 'Administrador SIACC & IT' : user.role === 'HR_MANAGER' ? 'HR Manager' : 'Tech Lead & Backend',
      dept: user.dept,
      status: user.status.charAt(0) + user.status.slice(1).toLowerCase(),
      initial: initials,
      cedula: user.idNumber || "No registrada", 
      cumple: user.birthDate || "No registrada",
      ingreso: user.createdAt ? new Date(user.createdAt).toLocaleDateString('es-ES') : "No registrada",
      dispositivo: "Vinculado con WebAuthn",
      devId: `SEC-${user.id}`
    });

  } catch (error) {
    console.error('Error al obtener el expediente individual:', error);
    res.status(500).json({ error: 'Error interno al consultar el expediente.' });
  }
};

// NUEVA FUNCIÓN: Guarda de forma física el registro enviado desde Onboarding.jsx (POST /api/employees)
export const createEmployee = async (req: any, res: Response): Promise<void> => {
  try {
    const { name, cedula, cumple, email, status, role, dept } = req.body;

    if (!email || !name) {
      res.status(400).json({ error: 'El correo electrónico y el nombre completo son campos obligatorios.' });
      return;
    }

    // Mapeo adaptativo de roles de texto hacia el Enum estricto de tu Prisma Schema
    let finalRole = 'EMPLOYEE';
    if (role) {
      if (role.toUpperCase().includes('ADMIN')) finalRole = 'ADMIN';
      else if (role.toUpperCase().includes('HR') || role.toUpperCase().includes('MANAGER')) finalRole = 'HR_MANAGER';
    }

    // Usamos Upsert para evitar errores de clave duplicada si el correo ya existe en Neon DB
    const newEmployee = await prisma.user.upsert({
      where: { email: email },
      update: {
        fullName: name,
        idNumber: cedula,
        birthDate: cumple,
        status: status ? status.toUpperCase() : 'ACTIVO',
        role: finalRole as any,
        dept: dept || 'General',
        isActive: status ? status.toUpperCase() === 'ACTIVO' : true
      },
      create: {
        email: email,
        fullName: name,
        idNumber: cedula,
        birthDate: cumple,
        status: status ? status.toUpperCase() : 'ACTIVO',
        role: finalRole as any,
        dept: dept || 'General',
        isActive: status ? status.toUpperCase() === 'ACTIVO' : true
      }
    });

    if (req.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: `MANUAL_EMPLOYEE_CREATION_SUCCESS_EMAIL_${email}`,
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          endpoint: 'POST /api/employees',
        }
      });
    }

    res.status(201).json({
      message: 'Expediente creado y guardado exitosamente en Postgres.',
      employee: newEmployee
    });
  } catch (error: any) {
    console.error('Error crítico al insertar empleado en la DB:', error.message || error);
    res.status(500).json({ error: 'Error interno del búnker al intentar almacenar el expediente.' });
  }
};

export const updateEmployee = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { role, dept, status } = req.body;

    const userExists = await prisma.user.findUnique({ where: { id } });
    if (!userExists) {
      res.status(404).json({ error: 'El expediente a modificar no existe.' });
      return;
    }

    let updatedRole: string = userExists.role;
    if (role) {
      if (role.toUpperCase().includes('ADMIN')) updatedRole = 'ADMIN';
      else if (role.toUpperCase().includes('HR') || role.toUpperCase().includes('MANAGER')) updatedRole = 'HR_MANAGER';
      else updatedRole = 'EMPLOYEE';
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        role: updatedRole as any, 
        dept: dept || userExists.dept,
        status: status ? status.toUpperCase() : userExists.status,
        isActive: status ? status.toUpperCase() === 'ACTIVO' : userExists.isActive
      }
    });

    if (req.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: `UPDATE_EMPLOYEE_SUCCESS_ID_${id}`,
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          endpoint: `PUT /api/employees/${id}`,
        }
      });
    }

    res.status(200).json({ 
      message: 'Expediente actualizado exitosamente en el núcleo central.',
      employee: updatedUser
    });
  } catch (error: any) {
    console.error('Error al actualizar empleado:', error.message || error);
    res.status(500).json({ error: 'Error interno en el servidor al intentar guardar los cambios.' });
  }
};

export const deleteEmployee = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const userExists = await prisma.user.findUnique({ where: { id } });
    if (!userExists) {
      res.status(404).json({ error: 'El expediente solicitado no existe o ya fue removido.' });
      return;
    }

    await prisma.user.delete({ where: { id } });

    if (req.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: `DELETE_EMPLOYEE_SUCCESS_ID_${id}`,
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          endpoint: `DELETE /api/employees/${id}`,
        }
      });
    }

    res.status(200).json({ message: 'Expediente eliminado exitosamente de los servidores centrales.' });
  } catch (error: any) {
    console.error('Error crítico al eliminar empleado:', error.message || error);
    res.status(500).json({ error: 'Error interno del búnker al intentar remover el expediente.' });
  }
};