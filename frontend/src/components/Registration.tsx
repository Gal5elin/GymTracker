import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Icon, PageHeading } from './ui';

type Field = 'displayName' | 'email' | 'password';
type Errors = Partial<Record<Field, string>>;
const fields: Field[] = ['displayName', 'email', 'password'];

export default function Registration() {
  const [values, setValues] = useState({ displayName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const submitting = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  function showErrors(next: Errors) {
    setErrors(next);
  }
  useEffect(() => {
    if (pending) return;
    const first = fields.find(field => errors[field]);
    if (first) form.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  }, [errors, pending]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    const next: Errors = {};
    if (!values.displayName.trim() || values.displayName.trim().length > 100) next.displayName = 'Enter a name between 1 and 100 characters.';
    if (!values.email.trim() || !form.current?.querySelector<HTMLInputElement>('[name="email"]')?.validity.valid) next.email = 'Enter a valid email address.';
    if (values.password.length < 12 || values.password.length > 128) next.password = 'Use a password between 12 and 128 characters.';
    showErrors(next);
    if (Object.keys(next).length) return;
    submitting.current = true;
    setPending(true);
    try {
      const origin = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
      const response = await fetch(`${origin}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, displayName: values.displayName.trim(), email: values.email.trim() }),
      });
      if (response.status === 201) {
        setValues({ displayName: '', email: '', password: '' });
        setSuccess(true);
        return;
      }
      if (response.status === 409) {
        showErrors({ email: 'An account with this email already exists.' });
        return;
      }
      if (response.status === 400) {
        const body = await response.json();
        const serverErrors: Errors = {};
        for (const field of fields) {
          if (Array.isArray(body.fields?.[field]) && typeof body.fields[field][0] === 'string') serverErrors[field] = body.fields[field][0];
        }
        showErrors(serverErrors);
        setError('Please check your details and try again.');
        return;
      }
      setError('Registration is unavailable right now. Please try again.');
    } catch {
      setError('Could not connect to registration. Please try again.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <main className="registration-page">
    <a className="brand" href="#register"><span className="brand-mark"><Icon name="workout" size={23}/></span>GymTracker<span className="brand-period">.</span></a>
    <section className="registration-card panel" aria-label="Registration">
      {success ? <><h1 id="registration-title">Account created</h1><p role="status">Your member account is ready. Sign in to continue.</p></> : <>
        <PageHeading title="Create your account" description="Start planning and recording your workouts."/>
        <form ref={form} onSubmit={submit} noValidate aria-busy={pending}>
          <fieldset disabled={pending}>
            {fields.map(field => <div className="registration-field" key={field}>
              <label htmlFor={`register-${field}`}>{field === 'displayName' ? 'Display name' : field === 'email' ? 'Email address' : 'Password'}</label>
              <input id={`register-${field}`} name={field} type={field === 'displayName' ? 'text' : field} autoComplete={field === 'displayName' ? 'nickname' : field === 'password' ? 'new-password' : 'email'} required maxLength={field === 'displayName' ? 100 : field === 'email' ? 254 : 128} minLength={field === 'password' ? 12 : undefined} value={values[field]} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `${field}-error` : field === 'password' ? 'password-help' : undefined} onChange={event => { setValues(current => ({ ...current, [field]: event.target.value })); setErrors(current => ({ ...current, [field]: undefined })); setError(''); }}/>
              {field === 'password' && <p id="password-help" className="muted small">Use 12–128 characters.</p>}
              {errors[field] && <p className="field-error" id={`${field}-error`} role="alert">{errors[field]}</p>}
            </div>)}
            <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}<Icon name="arrow" size={16}/></Button>
          </fieldset>
          {error && <p className="field-error" role="alert">{error}</p>}
        </form>
      </>}
      <a className="registration-demo small" href="#login">Sign in</a>
      <a className="registration-demo small" href="#dashboard">Explore the workout demo</a>
    </section>
  </main>;
}
