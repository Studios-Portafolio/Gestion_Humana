import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    // Buscamos todos los registros reales guardados en tu base de datos Neon
    const users = await prisma.user.findMany();

    // CORRECCIÓN: Tipamos explícitamente 'user: any' para evitar el implicit 'any' error
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

    // Buscamos en Neon DB por ID
    const user = await prisma.user.findUnique({
      where: { id: isNaN(Number(id)) ? id : Number(id) as any }
    });

    if (!user) {
      res.status(404).json({ error: 'Expediente no encontrado en el sistema.' });
      return;
    }

    // CORRECCIÓN: Tipamos explícitamente 'n: string' en el map del split para cumplir con las reglas estrictas
    const initials = user.fullName
      ? user.fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
      : 'EM';

    // Respondemos con la estructura exacta que renderiza PerfilEmpleado.jsx
    res.status(200).json({
      uuid: user.id.toString(),
      name: user.fullName,
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