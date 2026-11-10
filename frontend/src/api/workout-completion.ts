import { ApiError, type AuthClient } from './auth';
import type { WorkoutRecord } from './workouts';
export async function completeWorkout(client: AuthClient, id: string, notes: string, signal: AbortSignal): Promise<WorkoutRecord> {
  try {
    const response = await client.request(`/api/workout-sessions/${id}/complete`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: notes.trim() || null }) });
    const data = await response.json();
    if (data.workout?.id !== id || data.workout.status !== 'COMPLETED' || !data.workout.finishedAt) throw new Error('Could not confirm workout completion.');
    return data.workout;
  } catch (error) {
    if (error instanceof ApiError) throw new ApiError(error.status,
      error.status === 401 ? error.message :
      error.status === 403 ? 'You do not have permission to finish this workout.' :
      error.status === 404 ? 'This workout is no longer available.' :
      error.status === 400 ? 'Save at least one set and keep notes within 2000 characters before finishing.' :
      error.status === 409 ? 'This workout has already been completed. Checking its saved state.' :
      'Could not finish your workout. Please try again.');
    throw new Error('Could not connect to finish your workout. Your notes are still here.');
  }
}
