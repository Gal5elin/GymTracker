import { Router, type NextFunction, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './db.js';
import { authenticatedUser, HttpError, requireProgramOwner } from './permissions.js';

const positiveInt = z.number().int().min(1).max(2_147_483_647);
const targets = z.strictObject({
  exerciseId: z.uuid(),
  position: positiveInt,
  targetSets: positiveInt,
  targetReps: positiveInt,
  // Reject excess precision instead of letting numeric(6,2) silently round it.
  targetWeightKg: z.number().min(0).max(9999.99).refine(value => new Prisma.Decimal(value).decimalPlaces() <= 2, 'Use at most two decimal places').nullable().optional(),
});
const changes = targets.partial().refine(value => Object.keys(value).length > 0, 'Provide at least one field');
const order = z.strictObject({ exerciseIds: z.array(z.uuid()).refine(ids => new Set(ids).size === ids.length, 'Duplicate exercise entry IDs') });
const exerciseFields = { id: true, name: true, muscleGroup: true, equipment: true, isActive: true } as const;
export const plannedExerciseInclude = { exercise: { select: exerciseFields } };
export const exerciseCatalogRouter = Router();
exerciseCatalogRouter.get('/', async (_req, res) => {
  const exercises = await prisma.exercise.findMany({ where: { isActive: true }, select: exerciseFields, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  res.json({ exercises });
});

// Every mutation of a day's exercise list takes the same parent row lock.
// This serializes additions, edits, removals and reorder without changing the schema.
async function lockDay(tx: Prisma.TransactionClient, dayId: string, programId: string) {
  if (!z.uuid().safeParse(dayId).success) throw new HttpError(400, 'Invalid record ID');
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM program_days WHERE id = ${dayId}::uuid AND program_id = ${programId}::uuid FOR UPDATE`;
  if (!rows.length) throw new HttpError(404, 'Program day not found');
}
async function activeExercise(tx: Prisma.TransactionClient, id: string) {
  const exercise = await tx.exercise.findUnique({ where: { id } });
  if (!exercise?.isActive) throw new HttpError(400, 'Choose an active exercise from the catalog');
}
function conflict(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json({ error: 'An exercise already uses this position in this day', fields: { position: ['Choose another position or reorder the exercises'] } });
  } else next(error);
}
type DayParams = { programId: string; dayId: string };
export const programExercisesRouter = Router({ mergeParams: true });
// Parent program ownership is checked for reads as well as writes.
programExercisesRouter.use(async (req, res, next) => {
  await requireProgramOwner(authenticatedUser(res), String(req.params.programId)); next();
});
programExercisesRouter.get<DayParams>('/', async (req, res) => {
  const exercises = await prisma.$transaction(async tx => {
    await lockDay(tx, req.params.dayId, req.params.programId);
    return tx.programExercise.findMany({ where: { dayId: req.params.dayId }, orderBy: { position: 'asc' }, include: plannedExerciseInclude });
  });
  res.json({ exercises });
});
programExercisesRouter.post<DayParams>('/', async (req, res, next) => {
  const input = targets.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Invalid planned exercise', fields: z.flattenError(input.error).fieldErrors }); return; }
  try {
    const exercise = await prisma.$transaction(async tx => {
      await lockDay(tx, req.params.dayId, req.params.programId);
      await activeExercise(tx, input.data.exerciseId);
      return tx.programExercise.create({ data: { ...input.data, dayId: req.params.dayId }, include: plannedExerciseInclude });
    });
    res.status(201).json({ exercise });
  } catch (error) { conflict(error, res, next); }
});
programExercisesRouter.put<DayParams>('/order', async (req, res) => {
  const input = order.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Invalid exercise order', fields: z.flattenError(input.error).fieldErrors }); return; }
  const exercises = await prisma.$transaction(async tx => {
    await lockDay(tx, req.params.dayId, req.params.programId);
    const existing = await tx.programExercise.findMany({ where: { dayId: req.params.dayId } });
    const ids = new Set(existing.map(item => item.id));
    if (existing.length !== input.data.exerciseIds.length || input.data.exerciseIds.some(id => !ids.has(id))) throw new HttpError(400, 'Supply every exercise entry in this day exactly once');
    // First move every entry to unused positive slots outside the final 1..N range.
    // This works even when an existing position is the maximum PostgreSQL integer.
    const used = new Set(existing.map(item => item.position));
    let temporary = existing.length + 1;
    for (const id of input.data.exerciseIds) {
      while (used.has(temporary)) temporary++;
      await tx.programExercise.update({ where: { id }, data: { position: temporary } });
      temporary++;
    }
    for (const [index, id] of input.data.exerciseIds.entries()) await tx.programExercise.update({ where: { id }, data: { position: index + 1 } });
    return tx.programExercise.findMany({ where: { dayId: req.params.dayId }, orderBy: { position: 'asc' }, include: plannedExerciseInclude });
  });
  res.json({ exercises });
});
programExercisesRouter.patch<DayParams & { entryId: string }>('/:entryId', async (req, res, next) => {
  if (!z.uuid().safeParse(req.params.entryId).success) throw new HttpError(400, 'Invalid record ID');
  const input = changes.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Invalid planned exercise', fields: z.flattenError(input.error).fieldErrors }); return; }
  try {
    const exercise = await prisma.$transaction(async tx => {
      await lockDay(tx, req.params.dayId, req.params.programId);
      const existing = await tx.programExercise.findFirst({ where: { id: req.params.entryId, dayId: req.params.dayId } });
      if (!existing) throw new HttpError(404, 'Planned exercise not found');
      if (input.data.exerciseId) await activeExercise(tx, input.data.exerciseId);
      return tx.programExercise.update({ where: { id: existing.id }, data: input.data, include: plannedExerciseInclude });
    });
    res.json({ exercise });
  } catch (error) { conflict(error, res, next); }
});
programExercisesRouter.delete<DayParams & { entryId: string }>('/:entryId', async (req, res) => {
  if (!z.uuid().safeParse(req.params.entryId).success) throw new HttpError(400, 'Invalid record ID');
  await prisma.$transaction(async tx => {
    await lockDay(tx, req.params.dayId, req.params.programId);
    const deleted = await tx.programExercise.deleteMany({ where: { id: req.params.entryId, dayId: req.params.dayId } });
    if (!deleted.count) throw new HttpError(404, 'Planned exercise not found');
  });
  res.sendStatus(204);
});
