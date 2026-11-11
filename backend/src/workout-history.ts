import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { authenticatedUser, HttpError } from './permissions.js';
import { workoutPlanSchema } from './workout-plan.js';

const pageInput = z.strictObject({
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).default(20),
  cursor: z.uuid().optional(),
});
function savedLabels(snapshot: unknown) {
  const parsed = workoutPlanSchema.safeParse(snapshot);
  return {
    snapshotAvailable: parsed.success,
    program: parsed.success ? { id: parsed.data.program.id, name: parsed.data.program.name } : null,
    day: parsed.success ? parsed.data.day : null,
  };
}
// Both personal and trainer reads share the same pagination and saved-result format.
export type ResultsMemberResolver = (req: Request, res: Response) => Promise<string>;
export function createWorkoutHistoryRouter(resolveMember: ResultsMemberResolver) {
  const workoutHistoryRouter = Router({ mergeParams: true });
  workoutHistoryRouter.get('/', async (req, res) => {
    const memberId = await resolveMember(req, res);
    const input = pageInput.safeParse(req.query);
    if (!input.success) { res.status(400).json({ error: 'Invalid history pagination', fields: z.flattenError(input.error).fieldErrors }); return; }
    const { cursor, limit } = input.data;
    if (cursor) {
      const ownedCursor = await prisma.workoutSession.findFirst({ where: { id: cursor, memberId, status: 'COMPLETED' }, select: { id: true } });
      if (!ownedCursor) throw new HttpError(400, 'Invalid history cursor');
    }
    const rows = await prisma.workoutSession.findMany({
      where: { memberId, status: 'COMPLETED' },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: limit + 1,
      select: { id: true, status: true, startedAt: true, finishedAt: true, planSnapshot: true, _count: { select: { sets: true } } },
    });
    const page = rows.slice(0, limit);
    const workouts = page.map(row => ({
      id: row.id, status: row.status, startedAt: row.startedAt, finishedAt: row.finishedAt,
      ...savedLabels(row.planSnapshot), setCount: row._count.sets,
    }));
    res.json({ workouts, nextCursor: rows.length > limit ? page[page.length - 1].id : null });
  });
  workoutHistoryRouter.get('/:sessionId', async (req, res) => {
    const memberId = await resolveMember(req, res);
    if (!z.uuid().safeParse(req.params.sessionId).success) throw new HttpError(400, 'Invalid record ID');
    const workout = await prisma.workoutSession.findUnique({ where: { id: req.params.sessionId } });
    if (!workout) throw new HttpError(404, 'Workout not found');
    if (workout.memberId !== memberId) throw new HttpError(403, 'Forbidden');
    if (workout.status !== 'COMPLETED') throw new HttpError(404, 'Completed workout not found');
    const sets = await prisma.sessionSet.findMany({ where: { sessionId: workout.id }, orderBy: [{ exercisePosition: 'asc' }, { setNumber: 'asc' }] });
    const plan = workoutPlanSchema.safeParse(workout.planSnapshot);
    // Groups originate from performed sets, never from target counts or the current program.
    const exercises: {
      exerciseId: string; exercisePosition: number; name: string | null; muscleGroup: string | null; equipment: string | null;
      sets: { id: string; setNumber: number; reps: number; weightKg: typeof sets[number]['weightKg']; createdAt: Date }[];
    }[] = [];
    for (const set of sets) {
      let group = exercises.find(item => item.exercisePosition === set.exercisePosition && item.exerciseId === set.exerciseId);
      if (!group) {
        const entry = plan.success ? plan.data.exercises.find(item => item.position === set.exercisePosition && item.exerciseId === set.exerciseId) : undefined;
        group = { exerciseId: set.exerciseId, exercisePosition: set.exercisePosition, name: entry?.name ?? null, muscleGroup: entry?.muscleGroup ?? null, equipment: entry?.equipment ?? null, sets: [] };
        exercises.push(group);
      }
      group.sets.push({ id: set.id, setNumber: set.setNumber, reps: set.reps, weightKg: set.weightKg, createdAt: set.createdAt });
    }
    res.json({ workout: {
      id: workout.id, status: workout.status, startedAt: workout.startedAt, finishedAt: workout.finishedAt,
      notes: workout.notes, ...savedLabels(workout.planSnapshot), exercises,
    } });
  });

  return workoutHistoryRouter;
}
export const workoutHistoryRouter = createWorkoutHistoryRouter(async (_req, res) => authenticatedUser(res).id);
