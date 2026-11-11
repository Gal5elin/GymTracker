import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { authenticatedUser, requireRoles, requireTrainerAssignment } from './permissions.js';

const assignmentInput = z.strictObject({ programId: z.uuid(), memberId: z.uuid() });
export const assignmentsRouter = Router();
assignmentsRouter.post('/', requireRoles('TRAINER'), async (req, res) => {
  const input = assignmentInput.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Provide valid program and member IDs', fields: z.flattenError(input.error).fieldErrors }); return; }
  const user = authenticatedUser(res);
  const { programId, memberId } = input.data;
  const result = await prisma.$transaction(async tx => {
    // Relationship changes lock this same trainer row. Consent remains valid until commit.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
    await requireTrainerAssignment(user, programId, memberId, tx);
    // Retrying a request must not create a second assignment or reset its timestamp.
    const existing = await tx.programAssignment.findFirst({
      where: { programId, memberId, assignedById: user.id }, orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
    });
    if (existing) return { assignment: existing, created: false };
    const assignment = await tx.programAssignment.create({ data: { programId, memberId, assignedById: user.id } });
    return { assignment, created: true };
  });
  res.status(result.created ? 201 : 200).json({ assignment: result.assignment });
});
