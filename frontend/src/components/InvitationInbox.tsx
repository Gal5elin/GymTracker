import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthClient } from '../api/auth';
import { createInvitationInboxApi, type ReceivedInvitation } from '../api/trainer-links';
import { Badge, Button, EmptyState, PageHeading } from './ui';
const labels = { PENDING: 'Pending', ACCEPTED: 'Accepted', REJECTED: 'Rejected', REVOKED: 'Revoked' };
export default function InvitationInbox({ client }: { client: AuthClient }) {
  const api = useMemo(() => createInvitationInboxApi(client), [client]);
  const [invitations, setInvitations] = useState<ReceivedInvitation[] | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [confirming, setConfirming] = useState('');
  const revokeSection = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  function cancelRevoke() { restoreFocus.current = true; setConfirming(''); }
  useEffect(() => {
    if (!confirming && restoreFocus.current) { revokeSection.current?.querySelector('button')?.focus(); restoreFocus.current = false; }
  }, [confirming]);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const request = new AbortController(); controller.current = request; busy.current = true;
    setInvitations(null); setLoading(true); setError(''); setMessage(''); setConfirming(''); setUncertain(false);
    api.list(request.signal).then(rows => { if (!request.signal.aborted) setInvitations(rows); })
      .catch(failure => { if (!request.signal.aborted) setError(failure.message); })
      .finally(() => { if (!request.signal.aborted) { setLoading(false); busy.current = false; } });
    return () => controller.current?.abort();
  }, [api]);
  async function refresh() {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(''); setMessage(''); setConfirming('');
    const request = new AbortController(); controller.current = request;
    try { const rows = await api.list(request.signal); if (!request.signal.aborted) { setInvitations(rows); setUncertain(false); } }
    catch (failure) { if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load invitations. Please try again.'); }
    finally { if (!request.signal.aborted) { busy.current = false; setLoading(false); } }
  }
  async function respond(invitation: ReceivedInvitation, status: 'ACCEPTED' | 'REJECTED' | 'REVOKED') {
    if (busy.current || uncertain || (status === 'REVOKED' && confirming !== invitation.id)) return;
    setConfirming('');
    busy.current = true; setResponding(invitation.id); setError(''); setMessage('');
    const request = new AbortController(); controller.current = request;
    try {
      const saved = await api.respond(invitation.id, status, request.signal);
      if (!request.signal.aborted) {
        setInvitations(rows => rows?.map(row => row.id === saved.id ? saved : row) ?? null);
        setMessage(status === 'REVOKED' ? `Collaboration with ${saved.trainer.displayName} revoked. Your existing programs and workout history remain available.` : `${status === 'ACCEPTED' ? 'Accepted' : 'Rejected'} the invitation from ${saved.trainer.displayName}.`);
      }
    } catch (failure) {
      if (request.signal.aborted) return;
      const detail = failure instanceof Error ? failure.message : 'Could not confirm your response.';
      try {
        const rows = await api.list(request.signal);
        if (!request.signal.aborted) { setInvitations(rows); setError(`${detail} The inbox now shows the saved statuses.`); }
      } catch {
        if (!request.signal.aborted) { setUncertain(true); setError(`${detail} Could not verify the saved status. Refresh invitations before responding again.`); }
      }
    } finally { if (!request.signal.aborted) { busy.current = false; setResponding(''); } }
  }
  const disabled = loading || !!responding || uncertain;
  return <><PageHeading title="Invitations" description="Choose which trainers can collaborate with you." action={<Button disabled={loading || !!responding} onClick={refresh}>Refresh invitations</Button>}/>
    <p className="muted">Accepting lets this trainer view your workout results and assign programs. Rejecting grants no access.</p>
    {error && <div className="notice" role="alert"><p>{error}</p>{!loading && <Button onClick={refresh}>Try again</Button>}</div>}
    {message && <p className="notice" role="status">{message}</p>}
    {loading && <p role="status">Loading invitations…</p>}
    {!loading && invitations?.length === 0 && <div className="panel"><EmptyState title="No invitations yet">Invitations from trainers will appear here.</EmptyState></div>}
    {invitations && invitations.length > 0 && <ul className="invitation-list">{invitations.map(invitation => <li key={invitation.id}><section className="panel invitation-item" aria-label={`Invitation from ${invitation.trainer.displayName}`} aria-busy={responding === invitation.id}>
      <div><h2>{invitation.trainer.displayName}</h2><p className="muted small">Received <time dateTime={invitation.createdAt}>{new Date(invitation.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</time></p><Badge>{labels[invitation.status]}</Badge></div>
      {invitation.status === 'PENDING' && <div className="invitation-actions"><Button variant="primary" disabled={disabled} onClick={() => respond(invitation, 'ACCEPTED')}>Accept</Button><Button disabled={disabled} onClick={() => respond(invitation, 'REJECTED')}>Reject</Button>{responding === invitation.id && <span role="status">Saving response…</span>}</div>}
      {invitation.status === 'ACCEPTED' && <div className="invitation-actions">{confirming === invitation.id ? <RevokeConfirmation trainerName={invitation.trainer.displayName} onCancel={cancelRevoke} onConfirm={() => respond(invitation, 'REVOKED')}/> : <Button disabled={disabled} onClick={event => { if (busy.current || uncertain) return; revokeSection.current = event.currentTarget.closest('section'); setConfirming(invitation.id); }}>Revoke collaboration</Button>}{responding === invitation.id && <span role="status">Revoking collaboration…</span>}</div>}
    </section></li>)}</ul>}
  </>;
}


function RevokeConfirmation({ trainerName, onCancel, onConfirm }: { trainerName: string; onCancel: () => void; onConfirm: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return <div className="revoke-confirmation" role="group" aria-label={`Revoke collaboration with ${trainerName}?`} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onCancel(); } }}>
    <p>Revoke collaboration with <strong>{trainerName}</strong>? They will lose access to your results and cannot assign new programs. Your existing programs and workout history stay available.</p>
    <div className="invitation-actions"><button ref={cancel} type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><Button onClick={onConfirm}>Confirm revocation</Button></div>
  </div>;
}
