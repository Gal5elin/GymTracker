import { ApiError, type AuthClient } from './auth';
interface HistoryLabels { program: { id: string; name: string } | null; day: { id: string; dayNumber: number; title: string } | null; snapshotAvailable: boolean }
interface HistoryBase extends HistoryLabels { id: string; status: 'COMPLETED'; startedAt: string; finishedAt: string | null }
export interface HistorySummary extends HistoryBase { setCount: number }
export interface HistoryDetail extends HistoryBase {
  notes: string | null;
  exercises: { exerciseId: string; exercisePosition: number; name: string | null; muscleGroup: string | null; equipment: string | null; sets: { id: string; setNumber: number; reps: number; weightKg: string | null; createdAt: string }[] }[];
}
export function createHistoryApi(client: AuthClient) {
  async function get<T>(path: string, signal: AbortSignal): Promise<T> {
    try { const response = await client.request(`/api/workout-sessions/history${path}`, { signal }); return await response.json(); }
    catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.status,
        error.status === 401 ? error.message : error.status === 403 ? 'You do not have permission to view this workout history.' :
        error.status === 404 ? 'This completed workout is no longer available.' : error.status === 400 ? 'These history choices are no longer valid. Refresh history and try again.' : 'Could not load your workout history. Please try again.');
      throw new Error('Could not connect. Please try again.');
    }
  }
  return {
    async list(signal: AbortSignal, cursor?: string) {
      const data = await get<{ workouts: HistorySummary[]; nextCursor: string | null }>(cursor ? `?cursor=${encodeURIComponent(cursor)}` : '', signal);
      if (!Array.isArray(data.workouts) || (data.nextCursor !== null && typeof data.nextCursor !== 'string')) throw new Error('Could not load your workout history. Please try again.');
      return data;
    },
    async detail(id: string, signal: AbortSignal) {
      const data = await get<{ workout: HistoryDetail }>(`/${encodeURIComponent(id)}`, signal);
      if (!data.workout || data.workout.status !== 'COMPLETED' || !Array.isArray(data.workout.exercises)) throw new Error('Could not load this completed workout. Please try again.');
      return data.workout;
    },
  };
}
