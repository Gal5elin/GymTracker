import { ApiError, type AuthClient } from './auth';
import type { Program } from './programs';
export interface AssignmentOptions { programs: Program[]; members: { id: string; displayName: string; email: string }[] }
export interface Assignment { id: string; programId: string; memberId: string; assignedById: string; assignedAt: string }
export function createAssignmentsApi(client: AuthClient) {
  async function send(path: string, signal: AbortSignal, body?: object) {
    try { return await (await client.request(`/api/assignments${path}`, { signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })).json(); }
    catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.status, error.status === 401 ? error.message :
        error.status === 403 ? 'You can assign only your own programs to active members who have accepted your invitation. Refresh choices to check access.' :
        error.status === 404 ? 'This program is no longer available. Refresh choices.' : 'Could not load or save assignments. Please try again.');
      throw new Error('Could not connect. Please try again. Retrying the same assignment will not create a duplicate.');
    }
  }
  return {
    async options(signal: AbortSignal): Promise<AssignmentOptions> {
      const data = await send('/options', signal);
      if (!Array.isArray(data.programs) || !Array.isArray(data.members)) throw new Error('Could not load assignment choices. Please try again.');
      return data;
    },
    async assign(programId: string, memberId: string, signal: AbortSignal): Promise<Assignment> {
      const data = await send('', signal, { programId, memberId });
      if (!data.assignment?.id || data.assignment.programId !== programId || data.assignment.memberId !== memberId || !Number.isFinite(Date.parse(data.assignment.assignedAt))) throw new Error('Could not confirm the assignment. Retry the same choices to check the saved assignment.');
      return data.assignment;
    },
  };
}
