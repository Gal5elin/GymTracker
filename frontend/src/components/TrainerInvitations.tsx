import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { AuthClient } from '../api/auth';
import { createTrainerLinksApi } from '../api/trainer-links';
import { Button, PageHeading } from './ui';

export default function TrainerInvitations({ client }: { client: AuthClient }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const emailId = useId(), helpId = useId(), errorId = useId();
  useEffect(() => () => controller.current?.abort(), [client]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const recipient = email.trim().toLowerCase();
    setSentTo(''); setError(''); setInvalid(false);
    if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setInvalid(true); setError('Enter a valid member email address.'); return;
    }
    busy.current = true; setPending(true);
    const request = new AbortController(); controller.current = request;
    try {
      await createTrainerLinksApi(client).invite(recipient, request.signal);
      if (!request.signal.aborted) { setSentTo(recipient); setEmail(''); }
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not send the invitation. Please try again.');
    } finally {
      busy.current = false;
      if (!request.signal.aborted) setPending(false);
    }
  }
  return <><PageHeading title="Invitations" description="Invite a member to collaborate on their training."/>
    <section className="panel invitation-form" aria-label="Invite a member">
      <h2>Invite a member</h2>
      <p className="muted" id={helpId}>Enter the email of an existing member account. You can access their results and assign programs after they accept.</p>
      <form onSubmit={submit} noValidate aria-label="Send member invitation" aria-busy={pending}>
        <fieldset disabled={pending}>
          <div className="registration-field"><label htmlFor={emailId}>Member email</label><input id={emailId} type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} aria-invalid={invalid || undefined} aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`} onChange={event => { setEmail(event.target.value); setError(''); setInvalid(false); setSentTo(''); }}/></div>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Sending invitation…' : 'Send invitation'}</Button>
        </fieldset>
        {error && <p id={errorId} className="field-error" role="alert">{error}</p>}
        {sentTo && <div className="notice" role="status"><p>Invitation sent to <strong>{sentTo}</strong>. Status: Pending. Waiting for the member to accept.</p></div>}
      </form>
    </section>
  </>;
}
