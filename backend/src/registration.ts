import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { z } from 'zod';
import { prisma } from './db.js';

const registration = z.strictObject({
  displayName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(12).max(128),
  registerAsTrainer: z.boolean().default(false),
});

export const registrationRouter = Router();
registrationRouter.post('/register', async (req, res, next) => {
  const input = registration.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Invalid registration details', fields: z.flattenError(input.error).fieldErrors });
    return;
  }
  try {
    const { displayName, email, password, registerAsTrainer } = input.data;
    const passwordHash = await hash(password, { type: argon2id });
    const user = await prisma.user.create({
      data: { displayName, email, passwordHash, role: registerAsTrainer ? 'TRAINER' : 'MEMBER', isActive: true },
      select: { id: true, displayName: true, email: true, role: true, isActive: true, createdAt: true },
    });
    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }
    next(error);
  }
});
