import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const prisma = new PrismaClient();

async function testAIContract() {
  console.log('🔍 Preparando la prueba del Motor de IA Legal...');

  // 1. Obtener al Admin y al Empleado de la BD
  const admin = await prisma.user.findUnique({ where: { email: 'angel@thefortress.dev' } });
  const employee = await prisma.user.findUnique({ where: { email: 'empleado@thefortress.dev' } });

  if (!admin || !employee) {
    console.error('❌ Faltan usuarios en la BD. Corre el seed primero.');
    return;
  }

  // 2. Generar el Token JWT Zero Trust simulando un login exitoso
  const token = jwt.sign(
    { id: admin.id, role: admin.role },
    process.env.JWT_SECRET as string,
    { expiresIn: '15m' } // Acceso temporal JIT de 15 minutos
  );
  console.log('🔑 Token JWT temporal generado con éxito.');

  // 3. Disparar la petición al servidor local
  console.log(`🤖 Solicitando a la IA la redacción del contrato para ${employee.fullName}... (Esto puede tomar unos 10 segundos)`);
  
  try {
    const response = await fetch('http://localhost:3000/api/contracts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        employeeId: employee.id,
        role: "Ingeniero de Software Fullstack",
        salary: 2500,
        currency: "USD",
        country: "Venezuela"
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('\n✅ ¡CONTRATO GENERADO Y ENCRIPTADO CON ÉXITO!');
      console.log('--------------------------------------------------');
      console.log(data.contract.content); 
      console.log('--------------------------------------------------');
      console.log(`🔒 Hash de Integridad (SHA-256): ${data.contract.documentHash}`);
    } else {
      console.error('\n❌ Error del servidor:', data);
    }
  } catch (error) {
    console.error('\n❌ Error de conexión. ¿Está encendido el servidor principal en otra terminal (npm run dev)?');
  } finally {
    await prisma.$disconnect();
  }
}

testAIContract();