import { ApiError, type AuthClient } from './auth';
export interface Program { id: string; name: string; description: string | null }
export interface ProgramDay { id: string; programId: string; dayNumber: number; title: string }
export interface ProgramDetail extends Program { days: ProgramDay[] }
export function createProgramsApi(client: AuthClient) {
  async function send<T>(path: string, method: string, body?: object, signal?: AbortSignal): Promise<T> {
    try {
      const response = await client.request(`/api/programs${path}`, {
        method, signal, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.status,
        error.status === 403 ? 'You do not have permission to view or edit this program.' :
        error.status === 404 ? 'This program or day is no longer available.' :
        error.status === 409 ? 'A day with this number already exists. Choose another number.' :
        error.status === 400 ? 'Check the name, description and day number and try again.' :
        error.status === 401 ? error.message : 'Could not save or load your programs. Please try again.');
      throw new Error('Could not connect. Please try again.');
    }
  }
  return {
    list: (signal?: AbortSignal) => send<{ programs: Program[] }>('', 'GET', undefined, signal),
    get: (id: string, signal?: AbortSignal) => send<{ program: ProgramDetail }>(`/${id}`, 'GET', undefined, signal),
    save: (id: string | null, data: { name: string; description: string | null }, signal?: AbortSignal) => send<{ program: Program }>(id ? `/${id}` : '', id ? 'PATCH' : 'POST', data, signal),
    saveDay: (programId: string, dayId: string | null, data: { dayNumber: number; title: string }, signal?: AbortSignal) => send<{ day: ProgramDay }>(`/${programId}/days${dayId ? `/${dayId}` : ''}`, dayId ? 'PATCH' : 'POST', data, signal),
  };
}
