import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';

const prisma = new PrismaClient();

const rpName = 'The Fortress LegalTech';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.FRONTEND_URL || `http://${rpID}:5173`;
const JWT_SECRET = process.env.JWT_SECRET || 'fortress-super-secret-key';

// ==========================================
// 1. REGISTRO BIOMÉTRICO (HUELLA/FACEID)
// ==========================================

export const generateRegistration = async (req: Request, res: Response): Promise<void> => {
  // ALINEACIÓN COMPLETA: Extraemos el email de req.body (POST) o de req.query (GET) para acoplarnos a Harvein
  const email = req.body.email || req.query.email;

  try {
    if (!email) {
      res.status(400).json({ error: 'El correo electrónico es obligatorio para generar las opciones.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: String(email) } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado en los registros de seguridad.' });
      return;
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
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

    await prisma.user.update({
      where: { id: user.id },
      data: { currentChallenge: options.challenge },
    });

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

      await prisma.user.update({
        where: { id: user.id },
        data: { currentChallenge: null },
      });

      res.status(200).json({ verified: true, message: 'Biometría registrada exitosamente' });
    } else {
      res.status(400).json({ verified: false, error: 'Firma biométrica inválida' });
    }
  } catch (error) {
    console.error('Error verificando la biometría:', error);
    res.status(500).json({ error: 'Error verifying biometrics' });
  }
};

// ==========================================
// 2. INICIO DE SESIÓN BIOMÉTRICO (LOGIN CON FACEID)
// ==========================================

export const generateAuthentication = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { authenticators: true }
    });

    if (!user || user.authenticators.length === 0) {
      res.status(400).json({ error: 'Este usuario no tiene llaves biométricas registradas en el búnker.' });
      return;
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.authenticators.map((auth: any) => ({
        id: auth.credentialID,
        type: 'public-key',
      })),
      userVerification: 'preferred',
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { currentChallenge: options.challenge }
    });

    res.status(200).json(options);
  } catch (error) {
    console.error('Error generando desafío de login biométrico:', error);
    res.status(500).json({ error: 'Error interno al solicitar verificación biométrica.' });
  }
};

export const verifyAuthentication = async (req: Request, res: Response): Promise<void> => {
  const { email, body } = req.body; 

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { authenticators: true }
    });

    if (!user || !user.currentChallenge) {
      res.status(400).json({ error: 'Desafío de login inexistente o expirado.' });
      return;
    }

    const dbAuthenticator = user.authenticators.find((auth: any) => auth.credentialID === body.id);
    if (!dbAuthenticator) {
      res.status(400).json({ error: 'La llave biométrica presentada no coincide con este usuario.' });
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

      await prisma.user.update({
        where: { id: user.id },
        data: { currentChallenge: null }
      });

      const accessToken = jwt.sign(
        { id: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { id: user.id },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'BIOMETRIC_SUCCESSFUL_LOGIN',
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          endpoint: 'POST /api/auth/biometrics/login/verify',
        }
      });

      res.status(200).json({
        message: 'Autenticación biométrica exitosa',
        token: accessToken,
        accessToken,
        user: {
          id: user.id,
          name: user.fullName,
          fullName: user.fullName,
          email: user.email,
          role: user.role === 'ADMIN' ? 'Admin' : 'Employee'
        }
      });
    } else {
      res.status(400).json({ verified: false, error: 'Firma biométrica corrupta o rechazada.' });
    }
  } catch (error) {
    console.error('Error verificando login biométrico:', error);
    res.status(500).json({ error: 'Error interno en la verificación criptográfica.' });
  }
};