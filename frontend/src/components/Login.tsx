import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, type AuthClient } from '../api/auth';
import { Button, Icon, PageHeading } from './ui';

export default function Login({ client, onSuccess }: { client: AuthClient; onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    setError('');
    if (!form.current?.reportValidity()) return;
    busy.current = true; setPending(true);
    const request = new AbortController(); controller.current = request;
    try {
      await client.login(email, password, request.signal);
      if (!request.signal.aborted && client.getSession()) { setPassword(''); onSuccess(); }
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof ApiError ? failure.message : 'Could not connect to sign in. Please try again.');
    } finally {
      busy.current = false;
      if (!request.signal.aborted) setPending(false);
    }
  }
  return <main className="registration-page">
    <a className="brand" href="#login"><span className="brand-mark"><Icon name="workout" size={23}/></span>GymTracker<span className="brand-period">.</span></a>
    <section className="registration-card panel" aria-label="Sign in">
      <PageHeading title="Welcome back" description="Sign in to your GymTracker account."/>
      <form ref={form} onSubmit={submit} aria-busy={pending}>
        <fieldset disabled={pending}>
          <div className="registration-field"><label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setError(''); }}/></div>
          <div className="registration-field"><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => { setPassword(event.target.value); setError(''); }}/></div>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}<Icon name="arrow" size={16}/></Button>
        </fieldset>
        {error && <p className="field-error" role="alert">{error}</p>}
      </form>
      <a className="registration-demo small" href="#register">Create an account</a>
      <a className="registration-demo small" href="#demo/dashboard">Explore the workout demo</a>
    </section>
  </main>;
}
