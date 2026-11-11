import { useEffect, useMemo, useState } from 'react';
import { ApiError, type AuthClient } from '../api/auth';
import { createAssignmentsApi, type AssignmentOptions } from '../api/assignments';
import History from './History';
import PersonalProgress from './PersonalProgress';
import { Button, EmptyState, PageHeading } from './ui';

function Results({ client, memberId, view, sessionId, onDenied }: { client: AuthClient; memberId: string; view: string; sessionId?: string; onDenied: () => void }) {
  const scoped = useMemo<AuthClient>(() => ({ ...client, async request(path, init) {
    const memberBase = `/api/trainer/members/${encodeURIComponent(memberId)}`;
    const target = path.startsWith('/api/workout-sessions/history') || path.startsWith('/api/progress/') ? `${memberBase}${path.slice('/api'.length)}` : '';
    if (!target || (init?.method && init.method !== 'GET')) throw new Error('Member results are read-only.');
    try { return await client.request(target, init); }
    catch (error) {
      if (!init?.signal?.aborted && error instanceof ApiError && error.status === 403) onDenied();
      throw error;
    }
  } }), [client, memberId, onDenied]);
  const historyBase = `#members/${memberId}/history`;
  return view === 'progress' ? <PersonalProgress client={scoped} historyBase={historyBase} readOnly/> : <History client={scoped} sessionId={sessionId} routeBase={historyBase} readOnly/>;
}

export default function MemberResults({ client, hash }: { client: AuthClient; hash: string }) {
  const [, memberId = '', view = 'history', sessionId] = hash.split('/');
  const [members, setMembers] = useState<AssignmentOptions['members'] | null>(null);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const api = useMemo(() => createAssignmentsApi(client), [client]);
  // A fresh member/view checks choices again. Never carry one member's data into another view.
  useEffect(() => {
    const controller = new AbortController(); setMembers(null); setError(''); setDenied(false);
    api.options(controller.signal).then(data => {
      if (!controller.signal.aborted) setMembers(data.members);
    }).catch(() => { if (!controller.signal.aborted) setError('Could not load accepted members. Please try again.'); });
    return () => controller.abort();
  }, [api, hash, attempt]);
  useEffect(() => {
    const refresh = () => { setMembers(null); setAttempt(value => value + 1); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  const onDenied = useMemo(() => () => setDenied(true), []);
  const selected = members?.find(member => member.id === memberId);
  const lostAccess = denied || (members !== null && !!memberId && !selected);
  return <>
    <PageHeading title="Member results" description="Review completed workouts and exercise progress for accepted members."/>
    <section className="panel program-editor" aria-label="Member selection">
      <label className="select-field">Member<select value={selected?.id ?? ''} disabled={!members} onChange={event => { setDenied(false); window.location.hash = event.target.value ? `members/${event.target.value}/history` : 'members'; }}>
        <option value="">Choose an accepted member</option>
        {members?.map(member => <option key={member.id} value={member.id}>{member.displayName} ({member.email})</option>)}
      </select></label>
      <Button onClick={() => { setMembers(null); setAttempt(value => value + 1); }}>Refresh members</Button>
      {error ? <p role="alert" className="field-error">{error}</p> : !members ? <p role="status">Loading members…</p> : !members.length && !lostAccess ? <EmptyState title="No accepted members">Members appear here after accepting your invitation.</EmptyState> : null}
    </section>
    {lostAccess ? <div className="panel"><p role="alert">Access to this member’s results is no longer available. Choose another accepted member or refresh members.</p></div>
      : selected && <section key={`${hash}/${attempt}`} aria-label={`Results for ${selected.displayName}`}>
        <p className="notice">Viewing {selected.displayName} · Read-only</p>
        <nav aria-label="Member result views"><a className="button button-ghost" href={`#members/${memberId}/history`} aria-current={view === 'history' ? 'page' : undefined}>Workout history</a><a className="button button-ghost" href={`#members/${memberId}/progress`} aria-current={view === 'progress' ? 'page' : undefined}>Exercise progress</a></nav>
        <Results client={client} memberId={memberId} view={view} sessionId={sessionId} onDenied={onDenied}/>
      </section>}
  </>;
}
