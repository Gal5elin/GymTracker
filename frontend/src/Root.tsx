import { useEffect, useState, useSyncExternalStore } from 'react';
import App from './App';
import Registration from './components/Registration';
import Login from './components/Login';
import { createAuthClient, type AuthClient } from './api/auth';
import { Button, PageHeading } from './components/ui';
import Workspace, { isWorkspaceRoute } from './components/Workspace';

export default function Root({ client: providedClient }: { client?: AuthClient }) {
  const [client] = useState(() => providedClient ?? createAuthClient());
  const session = useSyncExternalStore(client.subscribe, client.getSession);
  const [restoring, setRestoring] = useState(!client.getSession() && !!window.location.hash && !/^#demo\/(dashboard|programs|workout|history|progress)$/.test(window.location.hash) && window.location.hash !== '#register');
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [authError, setAuthError] = useState('');
  function restore() {
    setRestoring(true); setAuthError('');
    void client.restore().then(() => {
      if (client.getSession() && window.location.hash === '#login') {
        window.history.replaceState(null, '', '#account'); setHash('#account');
      }
    }).catch(() => setAuthError('Could not restore your session. Please try again.')).finally(() => setRestoring(false));
  }
  useEffect(() => { if (restoring) restore(); }, [client]);
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => {
      const current = client.getSession();
      if (current && current.expiresAt <= Date.now()) restore();
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
    const timer = window.setTimeout(restore, Math.max(0, session.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [client, session]);
  const authenticated = !!session && session.expiresAt > Date.now();
  const demo = /^#demo\/(dashboard|programs|workout|history|progress)$/.test(hash);
  const protectedPage = !!hash && hash !== '#register' && hash !== '#login' && !demo;
  useEffect(() => {
    if (!protectedPage || restoring || authError) return;
    const destination = authenticated ? isWorkspaceRoute(hash) ? hash : '#account' : '#login';
    if (hash !== destination) {
      window.history.replaceState(null, '', destination);
      setHash(destination);
    }
  }, [hash, protectedPage, authenticated, restoring, authError]);
  function signedIn() { window.location.hash = 'account'; setHash('#account'); }
  function signOut() {
    setLogoutFailed(false); setAuthError('');
    void client.logout().catch(() => { setLogoutFailed(true); setAuthError('Could not sign out on the server. Please retry sign out.'); });
    window.history.replaceState(null, '', '#login');
    setHash('#login');
  }
  if (demo) return <App/>;
  if (authError) return <main className="registration-page"><section className="registration-card panel">
    <PageHeading title="Connection problem" description="Your account could not be reached."/>
    <p role="alert" className="field-error">{authError}</p>
    <Button onClick={logoutFailed ? signOut : restore}>Try again</Button>
  </section></main>;
  if (restoring) return <main aria-busy="true" aria-label="Restoring session" className="registration-page"><section className="registration-card panel" aria-hidden="true"><div className="session-skeleton"/><div className="session-skeleton short"/><div className="session-skeleton"/></section></main>;
  if (protectedPage) return authenticated ? <Workspace client={client} hash={hash} onLogout={signOut}/> : <Login client={client} onSuccess={signedIn}/>;
  if (hash === '#login') return <Login client={client} onSuccess={signedIn}/>;
  return <Registration/>;
}
