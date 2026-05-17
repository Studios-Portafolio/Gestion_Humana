import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser'; 

// Controladores
import { createContract, getContracts } from './controllers/contract.controller';
import { getAuditLogs } from './controllers/audit.controller';
import { login, refreshSession } from './controllers/auth.controller'; 
import { processDocumentOCR } from './controllers/ocr.controller';
import { generateRegistration, verifyRegistration } from './controllers/webauthn.controller';
import { getAllEmployees, getEmployeeById } from './controllers/employee.controller'; // UNIFICADO: Importación de tu directorio

// Middlewares
import { requireAuth, requireAdmin } from './middlewares/auth.middleware';
import { upload } from './middlewares/upload.middleware';
import { validateSchema } from './middlewares/validate.middleware'; 

// Schemas de Zod
import { loginSchema, contractSchema } from './schemas/main.schema'; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet()); 

// Configuración CORS blindada (Soporta red local, localhost y entornos en la nube como Render/Vercel)
app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin || origin.includes('localhost') || origin.includes('192.168.') || origin.includes('10.') || origin.includes('172.') || origin.includes('onrender.com') || origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por el Firewall CORS'));
    }
  }, 
  credentials: true 
})); 

app.use(express.json());
app.use(cookieParser()); 

// --- 📡 EL RADAR: Monitor de Tráfico en Tiempo Real ---
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    const ip = req.ip || req.socket.remoteAddress || 'IP desconocida';
    console.log(`[RADAR] 🟢 Alguien disparó: ${req.method} ${req.url} | Desde la IP: ${ip}`);
  }
  next();
});
// ------------------------------------------------------

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo en 15 minutos.',
});
app.use(limiter);

// --- 🛠️ ENRUTADOR MAESTRO DE THE FORTRESS ---

// 1. Módulo de Autenticación y Sesiones
app.post('/api/auth/login', validateSchema(loginSchema), login);
app.post('/api/auth/refresh', refreshSession); 
app.post('/api/auth/biometrics/generate', generateRegistration);
app.post('/api/auth/biometrics/verify', verifyRegistration);

// 2. Módulo de Contratos y Auditoría
app.post('/api/contracts', requireAuth, requireAdmin, validateSchema(contractSchema), createContract);
app.get('/api/contracts', requireAuth, getContracts); 
app.get('/api/audit', requireAuth, requireAdmin, getAuditLogs); 

// 3. Módulo de Onboarding (Escáner OCR con IA via OpenRouter)
app.post('/api/ocr/process', requireAuth, upload.single('document'), processDocumentOCR);

// 4. UNIFICADO: Módulo de Directorio General y Expedientes (Sincronizado con Harvein)
app.get('/api/employees', requireAuth, getAllEmployees);
app.get('/api/employees/:id', requireAuth, getEmployeeById);

// ---------------------------------------------

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Secure API is running' });
});

app.listen(PORT as number, '0.0.0.0', () => {
  console.log(`[The Fortress] Server running securely on port ${PORT} across local network`);
});