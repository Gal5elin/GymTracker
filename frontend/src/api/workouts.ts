import { ApiError, type AuthClient } from './auth';
import type { ProgramDetail } from './programs';
export interface WorkoutPlan {
  version: 1;
  program: { id: string; name: string; description: string | null };
  day: { id: string; dayNumber: number; title: string };
  exercises: { programExerciseId: string; exerciseId: string; position: number; name: string; muscleGroup: string; equipment: string; targetSets: number; targetReps: number; targetWeightKg: string | null }[];
}
export interface ActiveWorkout { id: string; status: 'IN_PROGRESS'; startedAt: string; planSnapshot: WorkoutPlan | null }
export interface WorkoutOption extends ProgramDetail { source: 'OWNED' | 'ASSIGNED'; assignmentId: string | null }
export function createWorkoutsApi(client: AuthClient) {
  async function send<T>(path: string, signal: AbortSignal, body?: object): Promise<T> {
    try {
      const response = await client.request(`/api/workout-sessions${path}`, { signal, method: body ? 'POST' : 'GET', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      return await response.json();
    } catch (failure) {
      if (failure instanceof ApiError) throw new ApiError(failure.status,
        failure.status === 401 ? failure.message :
        failure.status === 403 ? 'You do not have access to this workout or program.' :
        failure.status === 404 ? 'This program or day is no longer available. Refresh your choices.' :
        failure.status === 409 ? 'Another workout is already active. Open your active workout to continue.' :
        failure.status === 400 ? 'This day could not be started. Check that it still has planned exercises and refresh your choices.' :
        'Could not load or start your workout. Please try again.');
      throw new Error('Could not connect. Please try again.');
    }
  }
  return {
    active: (signal: AbortSignal) => send<{ workout: ActiveWorkout | null }>('/active', signal),
    options: (signal: AbortSignal) => send<{ programs: WorkoutOption[] }>('/options', signal),
    start: (program: WorkoutOption, dayId: string, signal: AbortSignal) => send<{ workout: ActiveWorkout }>('', signal, { programId: program.id, dayId, ...(program.assignmentId ? { assignmentId: program.assignmentId } : {}) }),
  };
}
