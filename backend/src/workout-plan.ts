import { z } from 'zod';

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
