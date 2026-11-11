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
