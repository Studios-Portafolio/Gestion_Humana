import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { sendIntruderAlertEmail } from '../services/email.service';

const prisma = new PrismaClient();

const rpName = 'The Fortress LegalTech';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.FRONTEND_URL || `http://${rpID}:5173`;
const JWT_SECRET = process.env.JWT_SECRET || 'fortress-super-secret-key';

// RADAR FORENSE EN MEMORIA: Monitorea reintentos fallidos por IP/Usuario
const failedBiometricAttempts = new Map<string, number>();

// ==========================================
// 1. REGISTRO BIOMÉTRICO
// ==========================================
export const generateRegistration = async (req: Request, res: Response): Promise<void> => {
  const email = req.body.email || req.query.email;
  try {
    if (!email) {
      res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email: String(email) } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }
    const options = await generateRegistrationOptions({
      rpName, rpID,
      userID: new Uint8Array(Buffer.from(user.id)), 
      userName: user.email,
      userDisplayName: user.fullName,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform', 
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { currentChallenge: options.challenge } });
    res.status(200).json(options);
  } catch (error) {
    console.error('Error generando opciones biométricas:', error);
    res.status(500).json({ error: 'Error generando opciones biométricas' });
  }
};

export const verifyRegistration = async (req: Request, res: Response): Promise<void> => {
  const { email, body } = req.body; 
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.currentChallenge) {
      res.status(400).json({ error: 'No hay un desafío pendiente' });
      return;
    }
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      await prisma.authenticator.create({
        data: {
          credentialID: credential.id,
          credentialPublicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          credentialDeviceType: credentialDeviceType,
          credentialBackedUp: credentialBackedUp,
          userId: user.id,
        },
      });
      await prisma.user.update({ where: { id: user.id }, data: { currentChallenge: null } });
      res.status(200).json({ verified: true, message: 'Biometría registrada exitosamente' });
    } else {
      res.status(400).json({ verified: false, error: 'Firma biométrica inválida' });
    }
  } catch (error) {
    console.error('Error verificando la biometría:', error);
    res.status(500).json({ error: 'Error interno verificando biometría' });
  }
};

// ==========================================
// 2. INICIO DE SESIÓN BIOMÉTRICO (LOGIN)
// ==========================================
export const generateAuthentication = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { authenticators: true } });
    if (!user || user.authenticators.length === 0) {
      res.status(400).json({ error: 'Este usuario no tiene llaves registradas.' });
      return;
    }
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.authenticators.map((auth: any) => ({ id: auth.credentialID, type: 'public-key' })),
      userVerification: 'preferred',
    });
    await prisma.user.update({ where: { id: user.id }, data: { currentChallenge: options.challenge } });
    res.status(200).json(options);
  } catch (error) {
    console.error('Error generando desafío de login:', error);
    res.status(500).json({ error: 'Error interno en login biométrico.' });
  }
};

export const verifyAuthentication = async (req: Request, res: Response): Promise<void> => {
  const { email, body } = req.body; 
  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { authenticators: true } });
    if (!user || !user.currentChallenge) {
      res.status(400).json({ error: 'Desafío inexistente o expirado.' });
      return;
    }
    const dbAuthenticator = user.authenticators.find((auth: any) => auth.credentialID === body.id);
    if (!dbAuthenticator) {
      res.status(400).json({ error: 'Llave no coincide con este usuario.' });
      return;
    }
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: dbAuthenticator.credentialID,
        publicKey: new Uint8Array(dbAuthenticator.credentialPublicKey),
        counter: Number(dbAuthenticator.counter),
      },
    });
    if (verification.verified && verification.authenticationInfo) {
      await prisma.authenticator.update({
        where: { credentialID: dbAuthenticator.credentialID },
        data: { counter: BigInt(verification.authenticationInfo.newCounter) }
      });
      await prisma.user.update({ where: { id: user.id }, data: { currentChallenge: null } });
      
      const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
      const refreshToken = jwt.sign({ id: user.id }, process.env.REFRESH_SECRET || 'fortress-refresh-secret-key', { expiresIn: '7d' });
      
      res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000 });
      res.status(200).json({
        message: 'Autenticación biométrica exitosa',
        token: accessToken,
        accessToken,
        user: { id: user.id, name: user.fullName, email: user.email, role: user.role }
      });
    } else {
      res.status(400).json({ verified: false, error: 'Firma biométrica corrupta.' });
    }
  } catch (error) {
    console.error('Error verificando login:', error);
    res.status(500).json({ error: 'Error en la verificación criptográfica.' });
  }
};

// ==========================================
// 3. STEP-UP AUTHENTICATION (CON SENSOR DE ALERTA ROJA)
// ==========================================
export const generateStepUpAssertion = async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { authenticators: true } });
    if (!user || user.authenticators.length === 0) {
      res.status(400).json({ error: 'Operador sin llaves de seguridad. Acción denegada.' });
      return;
    }
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.authenticators.map((auth: any) => ({ id: auth.credentialID, type: 'public-key' })),
      userVerification: 'required', 
    });
    await prisma.user.update({ where: { id: user.id }, data: { currentChallenge: options.challenge } });
    res.status(200).json(options);
  } catch (error) {
    console.error('Error generando Step-Up:', error);
    res.status(500).json({ error: 'Error interno al solicitar confirmación biométrica.' });
  }
};

export const verifyStepUpAssertion = async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { body, actionName } = req.body; 
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { authenticators: true } });
    if (!user || !user.currentChallenge) {
      res.status(400).json({ error: 'Sesión de confirmación expirada.' });
      return;
    }

    const dbAuthenticator = user.authenticators.find((auth: any) => auth.credentialID === body.id);
    if (!dbAuthenticator) {
      res.status(400).json({ error: 'Hardware no reconocido.' });
      return;
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: dbAuthenticator.credentialID,
        publicKey: new Uint8Array(dbAuthenticator.credentialPublicKey),
        counter: Number(dbAuthenticator.counter),
      },
    });

    if (verification.verified && verification.authenticationInfo) {
      failedBiometricAttempts.delete(user.id);

      await prisma.authenticator.update({
        where: { credentialID: dbAuthenticator.credentialID },
        data: { counter: BigInt(verification.authenticationInfo.newCounter) }
      });
      await prisma.user.update({ where: { id: user.id }, data: { currentChallenge: null } });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: `STEP_UP_AUTH_VERIFIED_FOR_${actionName || 'CRITICAL_ACTION'}`,
          ipAddress: clientIp,
          endpoint: 'POST /api/auth/biometrics/verify-assertion',
        }
      });

      res.status(200).json({ verified: true, message: 'Identidad confirmada. Autorización concedida.' });
    } else {
      throw new Error("Firma inválida");
    }
  } catch (error) {
    const currentAttempts = (failedBiometricAttempts.get(userId) || 0) + 1;
    failedBiometricAttempts.set(userId, currentAttempts);

    console.warn(`[SOC RADAR] 🚨 Intento fallido de Step-Up #${currentAttempts} para el Usuario ID: ${userId}`);

    if (currentAttempts >= 3) {
      const userObj = await prisma.user.findUnique({ where: { id: userId } });
      const targetName = userObj ? userObj.fullName : 'Operador Desconocido';
      
      sendIntruderAlertEmail('admin@test.com', targetName, clientIp, actionName || 'PURGA_DE_EXPEDIENTES');
      failedBiometricAttempts.delete(userId); 
    }

    res.status(400).json({ verified: false, error: 'Verificación biométrica fallida. Intento registrado.' });
  }
};