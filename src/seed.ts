import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando inyección de datos (Seed)...');

  // Upsert: Si el usuario ya existe, no hace nada. Si no existe, lo crea.
  const adminUser = await prisma.user.upsert({
    where: { email: 'angel@thefortress.dev' },
    update: {},
    create: {
      email: 'angel@thefortress.dev',
      fullName: 'Angel Castro',
      role: 'ADMIN',
      isActive: true,
    },
  });

  const testEmployee = await prisma.user.upsert({
    where: { email: 'empleado@thefortress.dev' },
    update: {},
    create: {
      email: 'empleado@thefortress.dev',
      fullName: 'Empleado de Prueba',
      role: 'EMPLOYEE',
      isActive: true,
    },
  });

  console.log('✅ Usuarios creados exitosamente en Neon:');
  console.table([adminUser, testEmployee]);
}

main()
  .catch((e) => {
    console.error('❌ Error al inyectar datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });