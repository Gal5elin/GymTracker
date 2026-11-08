import { useEffect, useState, useSyncExternalStore } from 'react';
import App from './App';
import Registration from './components/Registration';
import Login from './components/Login';
import { createAuthClient, type AuthClient } from './api/auth';
import { Button } from './components/ui';

function Account({ client, onLogout }: { client: AuthClient; onLogout: () => void }) {
  const session = useSyncExternalStore(client.subscribe, client.getSession);
  const [status, setStatus] = useState('Loading your account…');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('Loading your account…'); setFailed(false);
    client.request('/api/auth/me', { signal: controller.signal }).then(response => response.json()).then(data => {
      if (!controller.signal.aborted) setStatus(`Signed in as ${data.user.displayName}.`);
    }).catch(error => {
      if (!controller.signal.aborted) { setFailed(true); setStatus(error instanceof Error ? error.message : 'Could not load your account.'); }
    });
    return () => controller.abort();
  }, [client, attempt]);
  return <main className="registration-page"><section className="registration-card panel"><h1>Welcome, {session?.user.displayName}</h1><Button onClick={onLogout}>Sign out</Button><p role={failed ? 'alert' : 'status'}>{status}</p>{failed && <Button onClick={() => setAttempt(current => current + 1)}>Try again</Button>}<a className="registration-demo small" href="#dashboard">Explore the workout demo</a></section></main>;
}

export default function Root({ client: providedClient }: { client?: AuthClient }) {
  const [client] = useState(() => providedClient ?? createAuthClient());
  const session = useSyncExternalStore(client.subscribe, client.getSession);
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  function signedIn() { window.location.hash = 'account'; setHash('#account'); }
  function signOut() {
    client.logout();
    window.location.hash = 'login';
    setHash('#login');
  }
  if (hash === '#account' && session) return <Account client={client} onLogout={signOut}/>;
  if (hash === '#login' || hash === '#account') return <Login client={client} onSuccess={signedIn}/>;
  return !hash || hash === '#register' ? <Registration/> : <App/>;
}
