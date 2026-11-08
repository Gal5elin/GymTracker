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
  return <main className="registration-page"><section className="registration-card panel"><h1>Welcome, {session?.user.displayName}</h1><Button onClick={onLogout}>Sign out</Button><p role={failed ? 'alert' : 'status'}>{status}</p>{failed && <Button onClick={() => setAttempt(current => current + 1)}>Try again</Button>}<a className="registration-demo small" href="#demo/dashboard">Explore the workout demo</a></section></main>;
}

export default function Root({ client: providedClient }: { client?: AuthClient }) {
  const [client] = useState(() => providedClient ?? createAuthClient());
  const session = useSyncExternalStore(client.subscribe, client.getSession);
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => {
      const current = client.getSession();
      if (current && current.expiresAt <= Date.now()) client.logout();
      setHash(window.location.hash);
    };
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [client]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => client.logout(), Math.max(0, session.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [client, session]);
  const authenticated = !!session && session.expiresAt > Date.now();
  const demo = /^#demo\/(dashboard|programs|workout|history|progress)$/.test(hash);
  const protectedPage = !!hash && hash !== '#register' && hash !== '#login' && !demo;
  useEffect(() => {
    if (!protectedPage) return;
    const destination = authenticated ? '#account' : '#login';
    if (hash !== destination) {
      window.history.replaceState(null, '', destination);
      setHash(destination);
    }
  }, [hash, protectedPage, authenticated]);
  function signedIn() { window.location.hash = 'account'; setHash('#account'); }
  function signOut() {
    client.logout();
    window.history.replaceState(null, '', '#login');
    setHash('#login');
  }
  if (demo) return <App/>;
  if (protectedPage) return authenticated ? <Account client={client} onLogout={signOut}/> : <Login client={client} onSuccess={signedIn}/>;
  if (hash === '#login') return <Login client={client} onSuccess={signedIn}/>;
  return <Registration/>;
}
