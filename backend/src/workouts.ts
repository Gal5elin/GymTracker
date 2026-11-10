import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { authenticatedUser, HttpError, requireWorkoutOwner } from './permissions.js';

const startInput = z.strictObject({ programId: z.uuid(), dayId: z.uuid(), assignmentId: z.uuid().optional() });
// Version the stored JSON so later features can validate and read it without consulting the live plan.
export const workoutPlanSchema = z.strictObject({
  version: z.literal(1),
  program: z.strictObject({ id: z.uuid(), name: z.string(), description: z.string().nullable() }),
  day: z.strictObject({ id: z.uuid(), dayNumber: z.number().int().positive(), title: z.string() }),
  exercises: z.array(z.strictObject({
    programExerciseId: z.uuid(), exerciseId: z.uuid(), position: z.number().int().positive(),
    name: z.string(), muscleGroup: z.string(), equipment: z.string(),
    targetSets: z.number().int().positive(), targetReps: z.number().int().positive(), targetWeightKg: z.string().nullable(),
  })),
});
export type WorkoutPlan = z.infer<typeof workoutPlanSchema>;
export const workoutsRouter = Router();

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
workoutsRouter.get('/active', async (_req, res) => {
  const workout = await prisma.workoutSession.findFirst({ where: { memberId: authenticatedUser(res).id, status: 'IN_PROGRESS' }, orderBy: [{ startedAt: 'desc' }, { id: 'asc' }] });
  res.json({ workout });
});
workoutsRouter.get('/:sessionId', async (req, res) => {
  const workout = await requireWorkoutOwner(authenticatedUser(res), req.params.sessionId);
  res.json({ workout });
});
