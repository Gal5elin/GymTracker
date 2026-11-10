import { ApiError, type AuthClient } from './auth';
export interface PerformedSet { id: string; sessionId: string; exerciseId: string; exercisePosition: number; setNumber: number; reps: number; weightKg: string | null }
export function createWorkoutSetsApi(client: AuthClient, workoutId: string) {
  async function send<T>(sets: boolean, signal: AbortSignal, body?: object): Promise<T> {
    try {
      const response = await client.request(`/api/workout-sessions/${workoutId}${sets ? '/sets' : ''}`, { signal, method: body ? 'POST' : 'GET', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.status,
        error.status === 401 ? error.message :
        error.status === 403 ? 'You do not have permission to record or view sets for this workout.' :
        error.status === 404 ? 'This workout is no longer available.' :
        error.status === 409 ? 'This set is already saved or the workout is no longer active. Reload saved sets to check.' :
        error.status === 400 ? 'Check your reps and weight. The exercise must belong to the saved workout plan.' :
        'Could not load or save sets. Please try again.');
      throw new Error('Could not connect. Your entries are still here. Please try again.');
    }
  }
  return {
    list: (signal: AbortSignal) => send<{ sets: PerformedSet[] }>(true, signal),
    state: (signal: AbortSignal) => send<{ workout: { id: string; status: 'IN_PROGRESS' | 'COMPLETED' } }>(false, signal),
    save: (data: { exerciseId: string; exercisePosition: number; setNumber: number; reps: number; weightKg: number | null }, signal: AbortSignal) => send<{ set: PerformedSet }>(true, signal, data),
  };
}
