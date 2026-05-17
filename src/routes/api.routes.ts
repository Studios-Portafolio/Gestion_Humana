import { Router } from 'express';
import multer from 'multer';
import { login } from '../controllers/auth.controller'; // CORRECCIÓN: Importamos 'login' en lugar de 'loginAdmin'
import { processDocumentOCR } from '../controllers/ocr.controller';
import { getAllEmployees, getEmployeeById } from '../controllers/employee.controller';

const router = Router();

// Configuramos Multer en memoria para procesar la imagen de la cédula de forma ultrarrápida
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 1. MÓDULO DE AUTENTICACIÓN (LOGIN)
router.post('/login', login); // CORRECCIÓN: Usamos la función 'login' armada con tu doble token

// 2. MÓDULO DE ONBOARDING (ESCÁNER OCR CON IA VIA PUENTE OPENROUTER)
router.post('/ocr/process', upload.single('document'), processDocumentOCR);

// 3. MÓDULO DE DIRECTORIO GENERAL (NEON DB + PRISMA)
router.get('/employees', getAllEmployees);

// 4. MÓDULO DE DETALLE DE EXPEDIENTE (FICHA ÚNICA)
router.get('/employees/:id', getEmployeeById);

export default router;