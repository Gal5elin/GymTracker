import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './db.js';
import { authenticatedUser, HttpError, lockOwnedWorkout, requireWorkoutOwner } from './permissions.js';
import { workoutPlanSchema } from './workout-plan.js';

const positiveInt = z.number().int().min(1).max(2_147_483_647);
const performedSet = z.strictObject({
  exerciseId: z.uuid(), exercisePosition: positiveInt, setNumber: positiveInt, reps: positiveInt,
  weightKg: z.number().min(0).max(9999.99).refine(value => new Prisma.Decimal(value).decimalPlaces() <= 2, 'Use at most two decimal places').nullable().optional(),
});
export const workoutSetsRouter = Router({ mergeParams: true });
type WorkoutParams = { sessionId: string };
workoutSetsRouter.post<WorkoutParams>('/', async (req, res, next) => {
  // Reject access before interpreting caller-supplied set data.
  const user = authenticatedUser(res);
  await requireWorkoutOwner(user, req.params.sessionId);
  const input = performedSet.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Invalid performed set', fields: z.flattenError(input.error).fieldErrors }); return;
  }
  try {
    const set = await prisma.$transaction(async tx => {
      const workout = await lockOwnedWorkout(tx, user, req.params.sessionId);
      if (workout.status !== 'IN_PROGRESS') throw new HttpError(409, 'Completed workouts cannot receive new sets');
      const plan = workoutPlanSchema.safeParse(workout.planSnapshot);
      if (!plan.success) throw new HttpError(409, 'This workout has no usable saved plan; sets cannot be recorded');
      if (!plan.data.exercises.some(entry => entry.exerciseId === input.data.exerciseId && entry.position === input.data.exercisePosition)) {
        throw new HttpError(400, 'The exercise and position must match this workout’s saved plan');
      }
      return tx.sessionSet.create({ data: { ...input.data, sessionId: workout.id } });
    });
    res.status(201).json({ set });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'This set number is already saved for this exercise position', fields: { setNumber: ['Choose another set number or reload saved sets'] } });
    } else next(error);
  }
});
workoutSetsRouter.get<WorkoutParams>('/', async (req, res) => {
  await requireWorkoutOwner(authenticatedUser(res), req.params.sessionId);
  const sets = await prisma.sessionSet.findMany({ where: { sessionId: req.params.sessionId }, orderBy: [{ exercisePosition: 'asc' }, { setNumber: 'asc' }] });
  res.json({ sets });
});
