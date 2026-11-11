import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './db.js';
import { authenticatedUser, HttpError, requireRoles } from './permissions.js';

const invitationInput = z.strictObject({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()) });
export const trainerLinksRouter = Router();
trainerLinksRouter.post('/', requireRoles('TRAINER'), async (req, res) => {
  const parsed = invitationInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Provide a valid member email', fields: { email: 'Enter a valid email address' } }); return; }
  const trainerId = authenticatedUser(res).id;
  try {
    const invitation = await prisma.$transaction(async tx => {
      // Serialize creation for this trainer, including checking an existing accepted link.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${trainerId}::uuid FOR UPDATE`;
      const member = await tx.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, role: true, isActive: true } });
      if (!member || !member.isActive || member.role !== 'MEMBER' || member.id === trainerId) throw new HttpError(400, 'Invite an existing active member account');
      const existing = await tx.trainerLink.findFirst({ where: { trainerId, memberId: member.id, status: { in: ['PENDING', 'ACCEPTED'] } } });
      if (existing) throw new HttpError(409, existing.status === 'PENDING' ? 'An invitation is already pending for this member' : 'You are already connected to this member');
      return tx.trainerLink.create({ data: { trainerId, memberId: member.id, status: 'PENDING' }, select: { id: true, trainerId: true, memberId: true, status: true, createdAt: true } });
    });
    res.status(201).json({ invitation });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new HttpError(409, 'An invitation is already pending for this member');
    throw error;
  }
});
