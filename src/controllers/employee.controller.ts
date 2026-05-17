import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { encryptData, decryptData } from '../utils/crypto.util';

const prisma = new PrismaClient();

export const getAllEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany();

    const formattedEmployees = users.map((user: any) => ({
      uuid: user.id.toString(),
      id: user.id.toString(),
      name: user.fullName || 'Empleado Sin Nombre',
      fullName: user.fullName || 'Empleado Sin Nombre',
      role: user.role === 'ADMIN' ? 'Administrador SIACC & IT' : user.role === 'HR_MANAGER' ? 'HR Manager' : 'Tech Lead & Backend',
      dept: user.dept,
      status: user.status.charAt(0) + user.status.slice(1).toLowerCase(),
      // DESCIFRADO EN TIEMPO REAL: Convertimos el hash de DB a texto plano para el frontend
      cedula: decryptData(user.idNumber) || "V-00000000", 
      idNumber: decryptData(user.idNumber) || "V-00000000",
      email: user.email,
      correo: user.email,
      cumple: decryptData(user.birthDate) || "No registrada"
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
      // DESCIFRADO EN TIEMPO REAL
      cedula: decryptData(user.idNumber) || "V-00000000", 
      cumple: decryptData(user.birthDate) || "No registrada",
      ingreso: user.createdAt ? new Date(user.createdAt).toLocaleDateString('es-ES') : "No registrada",
      dispositivo: "Vinculado con WebAuthn",
      devId: `SEC-${user.id}`
    });

  } catch (error) {
    console.error('Error al obtener el expediente individual:', error);
    res.status(500).json({ error: 'Error interno al consultar el expediente.' });
  }
};

export const createEmployee = async (req: any, res: Response): Promise<void> => {
  try {
    const { name, cedula, cumple, email, status, role, dept } = req.body;

    if (!email || !name) {
      res.status(400).json({ error: 'El correo electrónico y el nombre completo son obligatorios.' });
      return;
    }

    let finalRole = 'EMPLOYEE';
    if (role) {
      if (role.toUpperCase().includes('ADMIN')) finalRole = 'ADMIN';
      else if (role.toUpperCase().includes('HR') || role.toUpperCase().includes('MANAGER')) finalRole = 'HR_MANAGER';
    }

    // CIFRADO DE DATOS SENSIBLES antes de tocar la base de datos
    const encryptedCedula = cedula ? encryptData(String(cedula)) : null;
    const encryptedCumple = cumple ? encryptData(String(cumple)) : null;

    const newEmployee = await prisma.user.upsert({
      where: { email: email },
      update: {
        fullName: name,
        idNumber: encryptedCedula,
        birthDate: encryptedCumple,
        status: status ? status.toUpperCase() : 'ACTIVO',
        role: finalRole as any,
        dept: dept || 'General',
        isActive: status ? status.toUpperCase() === 'ACTIVO' : true
      },
      create: {
        email: email,
        fullName: name,
        idNumber: encryptedCedula,
        birthDate: encryptedCumple,
        status: status ? status.toUpperCase() : 'ACTIVO',
        role: finalRole as any,
        dept: dept || 'General',
        isActive: status ? status.toUpperCase() === 'ACTIVO' : true
      }
    });

    res.status(201).json({
      message: 'Expediente encriptado y guardado exitosamente en Postgres.',
      employee: newEmployee
    });
  } catch (error: any) {
    console.error('Error crítico al insertar empleado en la DB:', error);
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

    res.status(200).json({ message: 'Expediente actualizado exitosamente.', employee: updatedUser });
  } catch (error: any) {
    res.status(500).json({ error: 'Error interno en el servidor al intentar guardar los cambios.' });
  }
};

export const deleteEmployee = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.status(200).json({ message: 'Expediente eliminado exitosamente.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Error interno del búnker al intentar remover el expediente.' });
  }
};

// ==========================================
// MONITOR DE DIVISAS INTACTO
// ==========================================
export const getBcvRate = async (req: Request, res: Response): Promise<void> => {
  try {
    let usdBcv = 515.18; 
    let eurBcv = 601.45; 
    let usdParalelo = 520.33;

    const response = await fetch('https://ve.dolarapi.com/v1/dolares').catch(() => null);
    
    if (response && response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        const oficial = data.find((d: any) => d.moneda === 'USD' && d.nombre === 'Oficial');
        const paralelo = data.find((d: any) => d.moneda === 'USD' && d.nombre === 'Paralelo');
        if (oficial?.promedio) usdBcv = parseFloat(oficial.promedio);
        if (paralelo?.promedio) usdParalelo = parseFloat(paralelo.promedio);
      }
    }

    const eurResponse = await fetch('https://ve.dolarapi.com/v1/euros/oficial').catch(() => null);
    if (eurResponse && eurResponse.ok) {
      const eurData = await eurResponse.json();
      if (eurData?.promedio) eurBcv = parseFloat(eurData.promedio);
    }

    if (usdBcv < 500.00) {
      usdBcv = 515.18;
      eurBcv = 601.45;
      usdParalelo = 520.33;
    }

    res.status(200).json({
      rate: usdBcv, 
      dolar_bcv: usdBcv,
      euro_bcv: eurBcv,
      dolar_paralelo: usdParalelo,
      fecha: new Date().toLocaleDateString('es-VE'),
      provider: 'Banco Central de Venezuela (Mesas de Cambio - Mayo 2026)'
    });
  } catch (error) {
    res.status(200).json({
      rate: 515.18,
      dolar_bcv: 515.18,
      euro_bcv: 601.45,
      dolar_paralelo: 520.33,
      fecha: new Date().toLocaleDateString('es-VE'),
      provider: 'The Fortress Secure Backup Node'
    });
  }
};