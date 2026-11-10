import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { authenticatedUser, HttpError } from './permissions.js';

const exerciseFields = { id: true, name: true, muscleGroup: true, equipment: true, isActive: true } as const;
const noQuery = z.strictObject({});
export const progressRouter = Router();
// The actor always comes from authentication; selecting another member is unsupported here.
progressRouter.use((req, res, next) => {
  if (!noQuery.safeParse(req.query).success) { res.status(400).json({ error: 'Progress does not accept query parameters' }); return; }
  next();
});
progressRouter.get('/exercises', async (_req, res) => {
  const memberId = authenticatedUser(res).id;
  const exercises = await prisma.exercise.findMany({
    where: { OR: [{ isActive: true }, { sessionSets: { some: { session: { memberId, status: 'COMPLETED' } } } }] },
    select: exerciseFields, orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  res.json({ exercises });
});
progressRouter.get('/:exerciseId', async (req, res) => {
  if (!z.uuid().safeParse(req.params.exerciseId).success) throw new HttpError(400, 'Invalid exercise ID');
  const exercise = await prisma.exercise.findUnique({ where: { id: req.params.exerciseId }, select: exerciseFields });
  if (!exercise) throw new HttpError(404, 'Exercise not found');
  const memberId = authenticatedUser(res).id;
  // Aggregate numeric values in PostgreSQL without rounding through JavaScript numbers.
  // Group by workout, not date or exercise position: repeated occurrences contribute to one point.
  const points = await prisma.$queryRaw<{
    workoutId: string; startedAt: Date; finishedAt: Date | null; maxWeightKg: Prisma.Decimal;
  }[]>`
    SELECT w.id AS "workoutId", w.started_at AS "startedAt", w.finished_at AS "finishedAt",
           MAX(s.weight_kg) AS "maxWeightKg"
    FROM session_sets s
    JOIN workout_sessions w ON w.id = s.session_id
    WHERE w.member_id = ${memberId}::uuid AND w.status = 'COMPLETED'
      AND s.exercise_id = ${exercise.id}::uuid AND s.weight_kg IS NOT NULL
    GROUP BY w.id, w.started_at, w.finished_at
    ORDER BY w.started_at ASC, w.id ASC
  `;
  res.json({ exercise, points });
});
