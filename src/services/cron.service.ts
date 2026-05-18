import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const initAutomatedPayroll = (): void => {
  console.log('[CRON CORE] 🤖 Inicializando autómata invisible de nómina bimonetaria...');

  // EXPRESIÓN CRON MATEMÁTICA: Ejecuta el minuto 59, hora 23 (11:59 PM), los días 15 y 30 de cada mes
  cron.schedule('59 23 15,30 * *', async () => {
    try {
      console.log('[CRON ACTION] 🕒 El radar de tiempo detectó corte de quincena. Procesando nómina...');
      
      const rateBcv = 515.18; // Indexación oficial del búnker
      const activeEmployees = await prisma.user.findMany({
        where: { status: 'ACTIVO' }
      });

      if (activeEmployees.length === 0) {
        console.log('[CRON CORE] ⚠️ No se detectaron operadores activos para procesar en este ciclo.');
        return;
      }

      // Procesamiento por lotes (Batch processing)
      for (const emp of activeEmployees) {
        const sueldoUSD = 650.00; // Base líquida de simulación financiera
        const sueldoBS = (sueldoUSD * rateBcv).toFixed(2);

        // Guardamos el recibo inmutable directamente en los logs del sistema
        await prisma.auditLog.create({
          data: {
            userId: emp.id,
            action: `AUTOMATED_PAYROLL_CLOSURE_USD_${sueldoUSD}_BS_${sueldoBS}_RATE_${rateBcv}`,
            ipAddress: '127.0.0.1 (Internal Loopback)',
            endpoint: 'SYSTEM_CRON_WORKER'
          }
        });
      }

      console.log(`[CRON CORE] ✅ Sábana de nómina resguardada en Postgres para ${activeEmployees.length} operadores.`);
    } catch (error) {
      console.error('[CRON ERROR] Fallo crítico en el motor autómata de nómina:', error);
    }
  }, {
    // FIX TYPESCRIPT: Eliminado 'scheduled: true' porque ya es el comportamiento por defecto.
    timezone: 'America/Caracas' 
  });
};