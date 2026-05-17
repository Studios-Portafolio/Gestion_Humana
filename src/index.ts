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
import { generateRegistration, verifyRegistration, generateAuthentication, verifyAuthentication } from './controllers/webauthn.controller'; 
import { getAllEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee, getBcvRate } from './controllers/employee.controller'; // CORRECCIÓN: getBcvRate ahora se importa desde aquí

// Middlewares
import { requireAuth, requireAdmin } from './middlewares/auth.middleware';
import { upload } from './middlewares/upload.middleware';
import { validateSchema } from './middlewares/validate.middleware'; 

// Schemas de Zod
import { loginSchema } from './schemas/main.schema'; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet()); 

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

// --- 📡 MONITOR DE TRÁFICO ---
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    console.log(`[RADAR] 🟢 Acción detectada: ${req.method} ${req.url}`);
  }
  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
  message: 'Demasiadas peticiones desde esta IP.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// --- 🛠️ ENRUTADOR MAESTRO DE THE FORTRESS ---

// 1. Autenticación, Sesiones y Utilidades
app.post('/api/auth/login', validateSchema(loginSchema), login);
app.post('/api/auth/refresh', refreshSession); 
app.get('/api/utils/bcv', getBcvRate); // Mantiene su ruta intacta

// 2. Suite Completa de Biometría WebAuthn v10 (Alineada con el Frontend de Harvein)
app.get('/api/auth/biometrics/register-options', generateRegistration);  
app.post('/api/auth/biometrics/register-options', generateRegistration); 
app.post('/api/auth/biometrics/verify', verifyRegistration);
app.post('/api/auth/biometrics/login/generate', generateAuthentication); 
app.post('/api/auth/biometrics/login/verify', verifyAuthentication);     

// 3. Contratos y Auditoría
app.post('/api/contracts', requireAuth, requireAdmin, createContract);
app.get('/api/contracts', requireAuth, getContracts); 
app.get('/api/audit', requireAuth, requireAdmin, getAuditLogs); 

// 4. Onboarding y Directorio General
app.post('/api/ocr/process', requireAuth, upload.single('document'), processDocumentOCR);
app.get('/api/employees', requireAuth, getAllEmployees);
app.post('/api/employees', requireAuth, createEmployee); 
app.get('/api/employees/:id', requireAuth, getEmployeeById);
app.put('/api/employees/:id', requireAuth, updateEmployee); 
app.delete('/api/employees/:id', requireAuth, deleteEmployee); 

// ---------------------------------------------

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Secure API is running' });
});

app.listen(PORT as number, '0.0.0.0', () => {
  console.log(`[The Fortress] Server running securely on port ${PORT}`);
});