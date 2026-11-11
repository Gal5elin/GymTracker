import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { AuthClient } from '../api/auth';
import { createAssignmentsApi, type AssignmentOptions } from '../api/assignments';
import { Button, EmptyState, PageHeading } from './ui';
export default function Assignments({ client }: { client: AuthClient }) {
  const api = useMemo(() => createAssignmentsApi(client), [client]);
  const [options, setOptions] = useState<AssignmentOptions | null>(null);
  const [programId, setProgramId] = useState(''), [memberId, setMemberId] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const request = new AbortController(); controller.current = request; busy.current = true; setLoading(true); setError(''); setNotice('');
    api.options(request.signal).then(data => {
      if (request.signal.aborted) return;
      setOptions(data); setProgramId(id => data.programs.some(p => p.id === id) ? id : ''); setMemberId(id => data.members.some(m => m.id === id) ? id : '');
    }).catch(failure => { if (!request.signal.aborted) setError(failure.message); })
      .finally(() => { if (!request.signal.aborted) { busy.current = false; setLoading(false); } });
    return () => controller.current?.abort();
  }, [api, attempt]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current) return; setError(''); setNotice('');
    const program = options?.programs.find(p => p.id === programId), member = options?.members.find(m => m.id === memberId);
    if (!program || !member) { setError('Choose a program and a member.'); return; }
    const request = new AbortController(); controller.current = request; busy.current = true; setSaving(true);
    try {
      const assignment = await api.assign(programId, memberId, request.signal);
      if (!request.signal.aborted) setNotice(`${program.name} is assigned to ${member.displayName}. Assigned ${new Date(assignment.assignedAt).toLocaleString('en-GB')}.`);
    } catch (failure) { if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not save assignment. Please try again.'); }
    finally { if (!request.signal.aborted) { busy.current = false; setSaving(false); } }
  }
  return <><PageHeading title="Assignments" description="Assign your programs to members who accepted your invitation." action={<Button disabled={loading || saving} onClick={() => setAttempt(value => value + 1)}>Refresh choices</Button>}/>
    {error && <p className="field-error" role="alert">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
    {loading ? <p role="status">Loading assignment choices…</p> : !options ? <Button onClick={() => setAttempt(value => value + 1)}>Try again</Button> : !options.programs.length ? <div className="panel"><EmptyState title="Create a program first" action={<a className="button button-primary" href="#programs">My programs</a>}>Your own programs will appear here for assignment.</EmptyState></div> : !options.members.length ? <div className="panel"><EmptyState title="No connected members" action={<a className="button button-primary" href="#invitations">Invite a member</a>}>Members appear after accepting your invitation. Pending, rejected and revoked connections cannot receive new assignments.</EmptyState></div> :
      <form className="panel program-editor" aria-label="Assign a program" onSubmit={submit} noValidate aria-busy={saving}><fieldset disabled={saving}>
        <div className="registration-field"><label htmlFor="assignment-program">Program</label><select id="assignment-program" value={programId} onChange={event => { setProgramId(event.target.value); setNotice(''); setError(''); }}><option value="">Choose your program</option>{options.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="registration-field"><label htmlFor="assignment-member">Member</label><select id="assignment-member" value={memberId} onChange={event => { setMemberId(event.target.value); setNotice(''); setError(''); }}><option value="">Choose a connected member</option>{options.members.map(m => <option key={m.id} value={m.id}>{m.displayName} ({m.email})</option>)}</select></div>
        <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Assigning…' : 'Assign program'}</Button>
      </fieldset></form>}
  </>;
}
