import { ApiError, type AuthClient } from './auth';
export interface ProgressExercise { id: string; name: string; muscleGroup: string | null; equipment: string | null; isActive: boolean }
export interface ProgressPoint { workoutId: string; startedAt: string; finishedAt: string | null; maxWeightKg: string }
export interface ExerciseProgress { exercise: ProgressExercise; points: ProgressPoint[] }
export function createProgressApi(client: AuthClient) {
  async function get<T>(path: string, signal: AbortSignal): Promise<T> {
    try { return await (await client.request(`/api/progress/${path}`, { signal })).json(); }
    catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.status, error.status === 401 ? error.message : error.status === 403 ? 'You do not have permission to view this progress.' : error.status === 404 ? 'This exercise is no longer available.' : 'Could not load progress. Please try again.');
      throw new Error('Could not connect. Please try again.');
    }
  }
  return {
    async exercises(signal: AbortSignal) {
      const data = await get<{ exercises: ProgressExercise[] }>('exercises', signal);
      if (!Array.isArray(data.exercises)) throw new Error('Could not load exercises. Please try again.');
      return data.exercises;
    },
    async progress(id: string, signal: AbortSignal) {
      const data = await get<ExerciseProgress>(encodeURIComponent(id), signal);
      if (data.exercise?.id !== id || !Array.isArray(data.points) || data.points.some(point => !Number.isFinite(Number(point.maxWeightKg)) || !Number.isFinite(Date.parse(point.startedAt)))) throw new Error('Could not load progress. Please try again.');
      return data;
    },
  };
}
