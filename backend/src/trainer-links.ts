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

const invitationFields = {
  id: true, trainerId: true, memberId: true, status: true, createdAt: true,
  trainer: { select: { id: true, displayName: true } },
} as const;
trainerLinksRouter.get('/', requireRoles('MEMBER'), async (req, res) => {
  if (!z.strictObject({}).safeParse(req.query).success) throw new HttpError(400, 'Invitation listing does not accept query parameters');
  const invitations = await prisma.trainerLink.findMany({
    where: { memberId: authenticatedUser(res).id }, select: invitationFields,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  res.json({ invitations });
});

const responseInput = z.strictObject({ status: z.enum(['ACCEPTED', 'REJECTED']) });
trainerLinksRouter.patch('/:invitationId', requireRoles('MEMBER'), async (req, res) => {
  const id = z.uuid().safeParse(req.params.invitationId);
  if (!id.success) throw new HttpError(400, 'Invalid invitation ID');
  const parsed = responseInput.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Choose ACCEPTED or REJECTED');
  const memberId = authenticatedUser(res).id;
  const invitation = await prisma.$transaction(async tx => {
    const existing = await tx.trainerLink.findUnique({ where: { id: id.data } });
    if (!existing) throw new HttpError(404, 'Invitation not found');
    if (existing.memberId !== memberId) throw new HttpError(403, 'Only the invited member can respond');
    // Share the creation lock: accepting and sending another invitation cannot race.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${existing.trainerId}::uuid FOR UPDATE`;
    if (parsed.data.status === 'ACCEPTED') {
      const trainer = await tx.user.findUnique({ where: { id: existing.trainerId }, select: { role: true, isActive: true } });
      if (!trainer?.isActive || trainer.role !== 'TRAINER') throw new HttpError(409, 'This trainer is no longer available');
    }
    // Conditional update checks state after waiting for concurrent writes.
    const changed = await tx.trainerLink.updateMany({
      where: { id: existing.id, memberId, status: 'PENDING' }, data: { status: parsed.data.status },
    });
    if (changed.count !== 1) throw new HttpError(409, 'Only pending invitations can be answered');
    return tx.trainerLink.findUniqueOrThrow({ where: { id: existing.id }, select: invitationFields });
  });
  res.json({ invitation });
});
