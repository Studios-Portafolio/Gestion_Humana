import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Formato de correo inválido o intento de inyección detectado." }),
  }),
});

export const contractSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid({ message: "El ID del empleado debe ser un UUID válido." }),
    role: z.string().min(3, { message: "El cargo es muy corto." }),
    salary: z.number().positive({ message: "El salario debe ser un número positivo." }),
    currency: z.string().length(3, { message: "La moneda debe tener 3 letras exactas (ej. USD, VES)." }),
    country: z.string().min(2, { message: "El país es requerido." }),
  }),
});