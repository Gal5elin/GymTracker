import { Router, type NextFunction, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { plannedExerciseInclude, programExercisesRouter } from './program-exercises.js';
import { prisma } from './db.js';
import { authenticatedUser, HttpError, requireProgramOwner } from './permissions.js';

const programFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().transform(value => value || null).optional(),
};
const dayFields = {
  dayNumber: z.number().int().min(1).max(2_147_483_647),
  title: z.string().trim().min(1).max(100),
};
const newProgram = z.strictObject(programFields);
const programChanges = z.strictObject({
  name: programFields.name.optional(),
  description: programFields.description,
}).refine(value => Object.keys(value).length > 0, 'Provide at least one field');
const newDay = z.strictObject(dayFields);
const dayChanges = newDay.partial().refine(value => Object.keys(value).length > 0, 'Provide at least one field');
const orderedDays = { days: { orderBy: { dayNumber: 'asc' as const }, include: { exercises: { orderBy: { position: 'asc' as const }, include: plannedExerciseInclude } } } };

export const programsRouter = Router();
programsRouter.use('/:programId/days/:dayId/exercises', programExercisesRouter);
programsRouter.get('/', async (_req, res) => {
  const user = authenticatedUser(res);
  const programs = await prisma.workoutProgram.findMany({
    where: { ownerId: user.id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  res.json({ programs });
});
programsRouter.post('/', async (req, res) => {
  const input = newProgram.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Invalid program details', fields: z.flattenError(input.error).fieldErrors }); return;
  }
  const program = await prisma.workoutProgram.create({ data: { ...input.data, ownerId: authenticatedUser(res).id } });
  res.location(`/api/programs/${program.id}`).status(201).json({ program });
});
programsRouter.get('/:programId', async (req, res) => {
  await requireProgramOwner(authenticatedUser(res), req.params.programId);
  const program = await prisma.workoutProgram.findUniqueOrThrow({ where: { id: req.params.programId }, include: orderedDays });
  res.json({ program });
});
programsRouter.patch('/:programId', async (req, res) => {
  await requireProgramOwner(authenticatedUser(res), req.params.programId);
  const input = programChanges.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Invalid program details', fields: z.flattenError(input.error).fieldErrors }); return;
  }
  const program = await prisma.workoutProgram.update({ where: { id: req.params.programId }, data: input.data });
  res.json({ program });
});
programsRouter.post('/:programId/days', async (req, res, next) => {
  await requireProgramOwner(authenticatedUser(res), req.params.programId);
  const input = newDay.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Invalid program day', fields: z.flattenError(input.error).fieldErrors }); return;
  }
  try {
    const day = await prisma.programDay.create({ data: { ...input.data, programId: req.params.programId } });
    res.status(201).json({ day });
  } catch (error) { duplicateDay(error, res, next); }
});
programsRouter.patch('/:programId/days/:dayId', async (req, res, next) => {
  await requireProgramOwner(authenticatedUser(res), req.params.programId);
  if (!z.uuid().safeParse(req.params.dayId).success) throw new HttpError(400, 'Invalid record ID');
  const existing = await prisma.programDay.findFirst({ where: { id: req.params.dayId, programId: req.params.programId } });
  if (!existing) throw new HttpError(404, 'Program day not found');
  const input = dayChanges.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Invalid program day', fields: z.flattenError(input.error).fieldErrors }); return;
  }
  try {
    const day = await prisma.programDay.update({ where: { id: existing.id }, data: input.data });
    res.json({ day });
  } catch (error) { duplicateDay(error, res, next); }
});

function duplicateDay(error: unknown, res: Response, next: NextFunction) {
  // Let the database uniqueness constraint arbitrate concurrent requests too.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json({ error: 'A day with this number already exists in this program', fields: { dayNumber: ['Choose a different day number'] } });
  } else next(error);
}
