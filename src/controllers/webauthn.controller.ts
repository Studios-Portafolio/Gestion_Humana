import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';

const prisma = new PrismaClient();

// Configuración dinámica: Soportamos Localhost por defecto y producción vía Variables de Entorno
const rpName = 'The Fortress LegalTech';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.FRONTEND_URL || `http://${rpID}:5173`;

export const generateRegistration = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    // El servidor genera un desafío criptográfico biométrico
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      // Corrección v10: El userID ahora debe ser estrictamente un Uint8Array
      userID: new Uint8Array(Buffer.from(user.id)), 
      userName: user.email,
      userDisplayName: user.fullName,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform', // Fuerza el uso de sensores locales (FaceID/TouchID)
      },
    });

    // Guardamos el desafío temporalmente en la BD para verificarlo luego
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
  const { email, body } = req.body; // body trae la firma criptográfica del frontend

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
      // Corrección v10: Extraemos 'credential' que ahora agrupa id, publicKey y counter
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      // Guardamos la huella/FaceID en la bóveda de autenticadores
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

      // Limpiamos el desafío por seguridad Zero Trust
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
    res.status(500).json({ error: 'Error verificando la biometría' });
  }
};