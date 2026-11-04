export interface PlannedExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  sets: number;
  reps: number;
  weight: number | null;
}
export interface ProgramDay { id: string; name: string; focus: string; exercises: PlannedExercise[] }
export interface Program { id: string; name: string; description: string; days: ProgramDay[] }
export interface RecordedSet { id: string; exerciseId: string; position: number; number: number; reps: number; weight: number | null }
export interface Workout {
  id: string;
  programName: string;
  day: ProgramDay;
  status: 'IN_PROGRESS' | 'COMPLETED';
  startedAt: string;
  finishedAt: string | null;
  notes: string;
  sets: RecordedSet[];
}
export interface Snapshot { programs: Program[]; workouts: Workout[] }
export interface WorkoutService {
  load(): Promise<Snapshot>;
  start(programId: string, dayId: string): Promise<Workout>;
  saveSet(workoutId: string, exerciseId: string, position: number, number: number, reps: number, weight: number | null): Promise<Workout>;
  finish(workoutId: string, notes: string): Promise<Workout>;
}
const exercise = (id: string, name: string, muscleGroup: string, equipment: string, sets: number, reps: number, weight: number | null): PlannedExercise => ({ id, name, muscleGroup, equipment, sets, reps, weight });
const bench = exercise('bench', 'Bench press', 'Chest', 'Barbell', 3, 10, 60);
const incline = exercise('incline', 'Incline dumbbell press', 'Chest', 'Dumbbells', 3, 12, 20);
const pushup = exercise('pushup', 'Push-up', 'Chest', 'Bodyweight', 2, 12, null);
const squat = exercise('squat', 'Back squat', 'Legs', 'Barbell', 3, 8, 70);
const row = exercise('row', 'Bent-over row', 'Back', 'Barbell', 3, 10, 40);
const deadlift = exercise('deadlift', 'Deadlift', 'Back', 'Barbell', 3, 6, 80);
export const samplePrograms: Program[] = [
  { id: 'strength', name: 'Build your foundation', description: '', days: [
    { id: 'push', name: 'Upper body · Push', focus: 'Chest, shoulders & triceps', exercises: [bench, incline, pushup] },
    { id: 'pull', name: 'Upper body · Pull', focus: 'Back & biceps', exercises: [deadlift, row] },
    { id: 'legs', name: 'Lower body', focus: 'Quads, hamstrings & glutes', exercises: [squat, deadlift] },
  ] },
  { id: 'fullbody', name: 'Full body essentials', description: '', days: [
    { id: 'full-a', name: 'Full body · A', focus: 'Squat, push & pull', exercises: [squat, bench, row] },
    { id: 'full-b', name: 'Full body · B', focus: 'Hinge & upper body', exercises: [deadlift, incline, pushup] },
  ] },
];
const clone = <T,>(value: T): T => structuredClone(value);
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 180));
export function validateSet(reps: number, weight: number | null) {
  if (!Number.isSafeInteger(reps) || reps <= 0) throw new Error('Reps must be a whole number greater than zero.');
  if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 9999.99)) throw new Error('Weight must be between 0 and 9,999.99 kg, or left blank.');
}
function sampleHistory(): Workout[] {
  return [2, 4, 7].map((daysAgo, index) => {
    const day = samplePrograms[0].days[index];
    const start = new Date();
    start.setDate(start.getDate() - daysAgo);
    start.setHours(17, 30, 0, 0);
    return { id: `sample-${index}`, programName: samplePrograms[0].name, day: clone(day), status: 'COMPLETED', startedAt: start.toISOString(), finishedAt: new Date(start.getTime() + (42 + index * 5) * 60_000).toISOString(), notes: index === 0 ? 'Good energy today. Kept the last few reps controlled.' : '', sets: day.exercises.flatMap((ex, position) => Array.from({ length: ex.sets }, (_, i) => ({ id: `sample-${index}-${position}-${i}`, exerciseId: ex.id, position, number: i + 1, reps: ex.reps, weight: ex.weight }))) };
  });
}

export function createMockWorkoutService(options: { empty?: boolean; failFirstLoad?: boolean } = {}): WorkoutService {
  const programs = clone(samplePrograms);
  const workouts = options.empty ? [] : sampleHistory();
  let fail = options.failFirstLoad ?? false;
  let pendingLoad: Promise<Snapshot> | null = null;
  function active(id: string) {
    const workout = workouts.find((entry) => entry.id === id);
    if (!workout) throw new Error('This workout could not be found.');
    if (workout.status !== 'IN_PROGRESS') throw new Error('This workout is already completed.');
    return workout;
  }
  return {
    load() {
      if (!pendingLoad) {
        pendingLoad = (async () => {
          await pause();
          if (fail) { fail = false; throw new Error('We couldn’t load your workouts. Please try again.'); }
          return clone({ programs, workouts });
        })();
        const request = pendingLoad;
        const clear = () => { if (pendingLoad === request) pendingLoad = null; };
        void request.then(clear, clear);
      }
      return pendingLoad;
    },
    async start(programId, dayId) {
      await pause();
      if (workouts.some((entry) => entry.status === 'IN_PROGRESS')) throw new Error('Finish your current workout before starting another.');
      const program = programs.find((entry) => entry.id === programId);
      const day = program?.days.find((entry) => entry.id === dayId);
      if (!program || !day) throw new Error('This program day could not be found.');
      const workout: Workout = { id: crypto.randomUUID(), programName: program.name, day: clone(day), status: 'IN_PROGRESS', startedAt: new Date().toISOString(), finishedAt: null, notes: '', sets: [] };
      workouts.unshift(workout);
      return clone(workout);
    },
    async saveSet(workoutId, exerciseId, position, number, reps, weight) {
      await pause();
      const workout = active(workoutId);
      validateSet(reps, weight);
      if (workout.day.exercises[position]?.id !== exerciseId || !Number.isSafeInteger(number) || number < 1) throw new Error('Invalid exercise or set number.');
      if (workout.sets.some((entry) => entry.position === position && entry.number === number)) throw new Error('This set has already been recorded.');
      workout.sets.push({ id: crypto.randomUUID(), exerciseId, position, number, reps, weight });
      return clone(workout);
    },
    async finish(workoutId, notes) {
      await pause();
      const workout = active(workoutId);
      if (!workout.sets.length) throw new Error('Record at least one set before finishing your workout.');
      workout.status = 'COMPLETED';
      workout.finishedAt = new Date().toISOString();
      workout.notes = notes.trim();
      return clone(workout);
    },
  };
}
