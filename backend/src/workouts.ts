import { Router } from 'express';
import { workoutPlanSchema } from './workout-plan.js';
import { workoutSetsRouter } from './workout-sets.js';
import { z } from 'zod';
import { plannedExerciseInclude } from './program-exercises.js';
import { prisma } from './db.js';
import { authenticatedUser, HttpError, requireWorkoutOwner } from './permissions.js';

export { workoutPlanSchema, type WorkoutPlan } from './workout-plan.js';

const startInput = z.strictObject({ programId: z.uuid(), dayId: z.uuid(), assignmentId: z.uuid().optional() });
export const workoutsRouter = Router();
workoutsRouter.use('/:sessionId/sets', workoutSetsRouter);

workoutsRouter.post('/', async (req, res) => {
  const input = startInput.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Invalid workout start details', fields: z.flattenError(input.error).fieldErrors }); return; }
  const user = authenticatedUser(res);
  const { programId, dayId, assignmentId } = input.data;
  const result = await prisma.$transaction(async tx => {
    // All start requests for one account serialize, including self-assignment creation.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
    const programRows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM workout_programs WHERE id = ${programId}::uuid FOR SHARE`;
    if (!programRows.length) throw new HttpError(404, 'Program not found');
    const program = await tx.workoutProgram.findUniqueOrThrow({ where: { id: programId } });
    let assignment = await tx.programAssignment.findFirst({
      where: assignmentId ? { id: assignmentId, memberId: user.id, programId } : {
        programId, memberId: user.id, ...(program.ownerId === user.id ? { assignedById: user.id } : {}),
      }, orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
    });
    if ((assignmentId && !assignment) || (program.ownerId !== user.id && !assignment)) throw new HttpError(403, 'This program is not available to you');
    // Exercise mutations lock this same day row; snapshot sees an entire committed order.
    const days = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM program_days WHERE id = ${dayId}::uuid AND program_id = ${programId}::uuid FOR SHARE`;
    if (!days.length) throw new HttpError(404, 'Program day not found');
    const active = await tx.workoutSession.findFirst({ where: { memberId: user.id, status: 'IN_PROGRESS' }, orderBy: [{ startedAt: 'desc' }, { id: 'asc' }] });
    if (active) {
      if (active.programDayId === dayId && (!assignmentId || active.assignmentId === assignmentId)) return { workout: active, created: false };
      throw new HttpError(409, 'Finish your current workout before starting another');
    }
    const day = await tx.programDay.findUniqueOrThrow({ where: { id: dayId }, include: { exercises: { orderBy: { position: 'asc' }, include: { exercise: true } } } });
    if (!day.exercises.length) throw new HttpError(400, 'Add exercises to this day before starting a workout');
    const planSnapshot = workoutPlanSchema.parse({
      version: 1,
      program: { id: program.id, name: program.name, description: program.description },
      day: { id: day.id, dayNumber: day.dayNumber, title: day.title },
      exercises: day.exercises.map(entry => ({
        programExerciseId: entry.id, exerciseId: entry.exerciseId, position: entry.position,
        name: entry.exercise.name, muscleGroup: entry.exercise.muscleGroup, equipment: entry.exercise.equipment,
        targetSets: entry.targetSets, targetReps: entry.targetReps, targetWeightKg: entry.targetWeightKg?.toString() ?? null,
      })),
    });
    if (!assignment) assignment = await tx.programAssignment.create({ data: { programId, memberId: user.id, assignedById: user.id } });
    const workout = await tx.workoutSession.create({ data: { memberId: user.id, programDayId: dayId, assignmentId: assignment.id, planSnapshot, status: 'IN_PROGRESS' } });
    return { workout, created: true };
  });
  res.location(`/api/workout-sessions/${result.workout.id}`).status(result.created ? 201 : 200).json({ workout: result.workout });
});
// Read-only launch choices: assignments grant training access, never plan editing rights.
workoutsRouter.get('/options', async (_req, res) => {
  const memberId = authenticatedUser(res).id;
  const available = await prisma.workoutProgram.findMany({
    where: { OR: [{ ownerId: memberId }, { assignments: { some: { memberId } } }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    include: {
      assignments: { where: { memberId }, orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }], take: 1 },
      days: { orderBy: { dayNumber: 'asc' }, include: { exercises: { orderBy: { position: 'asc' }, include: plannedExerciseInclude } } },
    },
  });
  const programs = available.map(program => ({
    id: program.id, name: program.name, description: program.description,
    source: program.ownerId === memberId ? 'OWNED' : 'ASSIGNED',
    assignmentId: program.ownerId === memberId ? null : program.assignments[0].id,
    days: program.days,
  }));
  res.json({ programs });
});
workoutsRouter.get('/active', async (_req, res) => {
  const workout = await prisma.workoutSession.findFirst({ where: { memberId: authenticatedUser(res).id, status: 'IN_PROGRESS' }, orderBy: [{ startedAt: 'desc' }, { id: 'asc' }] });
  res.json({ workout });
});
workoutsRouter.get('/:sessionId', async (req, res) => {
  const workout = await requireWorkoutOwner(authenticatedUser(res), req.params.sessionId);
  res.json({ workout });
});
