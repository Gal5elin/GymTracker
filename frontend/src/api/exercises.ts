import { ApiError, type AuthClient } from './auth';
import type { CatalogExercise, ExerciseTargets, PlannedExercise } from './programs';
export function createExercisesApi(client: AuthClient, programId: string, dayId: string) {
  const base = `/api/programs/${programId}/days/${dayId}/exercises`;
  async function send<T>(path: string, method: string, signal: AbortSignal, body?: object): Promise<T> {
    try {
      const response = await client.request(path, { method, signal, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      return response.status === 204 ? undefined as T : await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.status,
        error.status === 401 ? error.message :
        error.status === 403 ? 'You do not have permission to edit this day.' :
        error.status === 404 ? 'This day or exercise is no longer available. Refresh the list.' :
        error.status === 409 ? 'This position is already in use. Refresh the list and try again.' :
        error.status === 400 ? 'The exercise selection, targets or order could not be saved. Refresh the list and check your entries.' :
        'Could not load or save exercises. Please try again.');
      throw new Error('Could not connect. Please try again.');
    }
  }
  return {
    catalog: (signal: AbortSignal) => send<{ exercises: CatalogExercise[] }>('/api/exercises', 'GET', signal),
    list: (signal: AbortSignal) => send<{ exercises: PlannedExercise[] }>(base, 'GET', signal),
    save: (id: string | null, data: ExerciseTargets, signal: AbortSignal) => send<{ exercise: PlannedExercise }>(id ? `${base}/${id}` : base, id ? 'PATCH' : 'POST', signal, data),
    reorder: (ids: string[], signal: AbortSignal) => send<{ exercises: PlannedExercise[] }>(`${base}/order`, 'PUT', signal, { exerciseIds: ids }),
    remove: (id: string, signal: AbortSignal) => send<void>(`${base}/${id}`, 'DELETE', signal),
  };
}
