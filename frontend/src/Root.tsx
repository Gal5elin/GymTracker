import { useEffect, useState, useSyncExternalStore } from 'react';
import App from './App';
import Registration from './components/Registration';
import Login from './components/Login';
import { createAuthClient, type AuthClient } from './api/auth';
import Workspace, { isWorkspaceRoute } from './components/Workspace';

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
    const destination = authenticated ? isWorkspaceRoute(hash) ? hash : '#account' : '#login';
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
  if (protectedPage) return authenticated ? <Workspace client={client} hash={hash} onLogout={signOut}/> : <Login client={client} onSuccess={signedIn}/>;
  if (hash === '#login') return <Login client={client} onSuccess={signedIn}/>;
  return <Registration/>;
}
