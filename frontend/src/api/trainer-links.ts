import { ApiError, type AuthClient } from './auth';
export interface PendingInvitation { id: string; trainerId: string; memberId: string; status: 'PENDING'; createdAt: string }
export function createTrainerLinksApi(client: AuthClient) {
  return {
    async invite(email: string, signal: AbortSignal): Promise<PendingInvitation> {
      let data: { invitation: PendingInvitation };
      try {
        const response = await client.request('/api/trainer-links', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase() }), signal,
        });
        data = await response.json();
      } catch (error) {
        if (error instanceof ApiError) throw new ApiError(error.status,
          error.status === 401 ? error.message :
          error.status === 403 ? 'Only trainers can send member invitations.' :
          error.status === 400 ? 'Enter the email of an existing active member account.' :
          error.status === 409 ? 'An invitation is already pending, or you are already connected to this member.' :
          'Could not send the invitation. Please try again.');
        throw new Error('Could not confirm whether the invitation was sent. Check your connection and try again. A duplicate invitation will be blocked.');
      }
      if (!data.invitation?.id || data.invitation.status !== 'PENDING' || !data.invitation.memberId || !data.invitation.trainerId || !Number.isFinite(Date.parse(data.invitation.createdAt))) throw new Error('Could not confirm whether the invitation was sent. Please try again. A duplicate invitation will be blocked.');
      return data.invitation;
    },
  };
}

export interface ReceivedInvitation {
  id: string; trainerId: string; memberId: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REVOKED';
  createdAt: string; trainer: { id: string; displayName: string };
}
function isInvitation(value: ReceivedInvitation): boolean {
  return !!value && typeof value.id === 'string' && !!value.id && typeof value.memberId === 'string' &&
    typeof value.trainerId === 'string' && value.trainer?.id === value.trainerId && typeof value.trainer.displayName === 'string' &&
    ['PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED'].includes(value.status) && Number.isFinite(Date.parse(value.createdAt));
}
export function createInvitationInboxApi(client: AuthClient) {
  async function send(path: string, signal: AbortSignal, status?: 'ACCEPTED' | 'REJECTED' | 'REVOKED') {
    try {
      const response = await client.request(`/api/trainer-links${path}`, {
        signal, ...(status ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) } : {}),
      });
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.status,
        error.status === 401 ? error.message : error.status === 403 ? 'You do not have permission to view or respond to these invitations.' :
        error.status === 404 ? 'This invitation is no longer available.' : error.status === 409 ? 'This relationship cannot be updated. It may have changed, or the trainer is no longer available.' :
        'Could not load or update invitations. Please try again.');
      throw new Error('Could not connect. Please try again.');
    }
  }
  return {
    async list(signal: AbortSignal): Promise<ReceivedInvitation[]> {
      const data = await send('', signal);
      if (!Array.isArray(data.invitations) || !data.invitations.every(isInvitation)) throw new Error('Could not load invitations. Please try again.');
      return data.invitations;
    },
    async respond(id: string, status: 'ACCEPTED' | 'REJECTED' | 'REVOKED', signal: AbortSignal): Promise<ReceivedInvitation> {
      const data = await send(`/${encodeURIComponent(id)}`, signal, status);
      if (!isInvitation(data.invitation) || data.invitation.id !== id || data.invitation.status !== status) throw new Error('Could not confirm the invitation response. Refresh invitations to check its status.');
      return data.invitation;
    },
  };
}
