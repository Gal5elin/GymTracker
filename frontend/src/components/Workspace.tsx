import { useEffect, useState } from 'react';
import type { AuthClient, User } from '../api/auth';
import AppShell, { type NavigationItem } from './AppShell';
import { Button, EmptyState, PageHeading } from './ui';

interface WorkspacePage extends NavigationItem { roles: User['role'][]; description: string }
const personal: User['role'][] = ['MEMBER', 'TRAINER'];
const pages: WorkspacePage[] = [
  { id: 'account', label: 'Overview', href: '#account', icon: 'grid', roles: ['MEMBER', 'TRAINER', 'ADMIN'], description: '' },
  { id: 'programs', label: 'My programs', href: '#programs', icon: 'layers', roles: personal, description: 'Create and organize your training programs here. Program planning is coming soon.' },
  { id: 'workout', label: 'Workout', href: '#workout', icon: 'workout', roles: personal, description: 'Start a workout from one of your programs here. Workout recording is coming soon.' },
  { id: 'history', label: 'History', href: '#history', icon: 'history', roles: personal, description: 'Review your completed workouts here. Workout history is coming soon.' },
  { id: 'progress', label: 'Progress', href: '#progress', icon: 'trend', roles: personal, description: 'Follow your exercise progress here. Progress tracking is coming soon.' },
  { id: 'invitations', label: 'Invitations', href: '#invitations', icon: 'plus', roles: ['TRAINER'], description: 'Invite members to collaborate here. Trainer invitations are coming soon.' },
  { id: 'assignments', label: 'Assignments', href: '#assignments', icon: 'layers', roles: ['TRAINER'], description: 'Assign your programs to members who accept your invitation. Program assignments are coming soon.' },
  { id: 'members', label: 'Member results', href: '#members', icon: 'trend', roles: ['TRAINER'], description: 'Review workouts and progress for members who accept your invitation. Member results are coming soon.' },
];
export function isWorkspaceRoute(hash: string) { return pages.some(page => page.href === hash); }
const roleLabels = { MEMBER: 'Member workspace', TRAINER: 'Trainer workspace', ADMIN: 'Administrator workspace' };

export default function Workspace({ client, hash, onLogout }: { client: AuthClient; hash: string; onLogout: () => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    client.request('/api/auth/me', { signal: controller.signal }).then(response => response.json()).then(data => {
      if (!data.user || !['MEMBER', 'TRAINER', 'ADMIN'].includes(data.user.role) || typeof data.user.displayName !== 'string') throw new Error('Could not load your account. Please try again.');
      if (!controller.signal.aborted) setUser(data.user);
    }).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load your account. Please try again.');
    });
    return () => controller.abort();
  }, [client, hash, attempt]);
  const navigation = user ? pages.filter(page => page.roles.includes(user.role)) : [];
  const page = pages.find(item => item.href === hash);
  const permitted = user && page?.roles.includes(user.role);
  return <AppShell navigation={navigation} activePage={page?.id ?? ''} displayName={user?.displayName ?? 'GymTracker'} roleLabel={user ? roleLabels[user.role] : 'Workspace'} onLogout={onLogout}>
    {user && error && <div className="notice" role="alert"><span>Could not refresh your account.</span><Button onClick={() => setAttempt(current => current + 1)}>Try again</Button></div>}
    {!user ? error ? <><PageHeading title="Unable to load account"/><p role="alert" className="field-error">{error}</p><Button onClick={() => setAttempt(current => current + 1)}>Try again</Button></> : <p role="status">Loading your account…</p>
      : !page || !permitted ? <><PageHeading title="Access denied"/><div className="panel"><EmptyState title="This page is not available for your role" action={<a className="button button-primary" href="#account">Return to overview</a>}>Choose a page from your workspace navigation.</EmptyState></div></>
      : page.id === 'account' ? <><PageHeading title={`Welcome, ${user.displayName}`} description={`Signed in as ${user.displayName}.`}/><div className="panel"><EmptyState title={user.role === 'ADMIN' ? 'Administration' : 'Your training workspace'}>{user.role === 'ADMIN' ? 'Your account is reserved for user, role and exercise catalog administration. Management tools are planned for a later version.' : 'Your account is ready. Program planning, workout recording and progress features are coming soon.'}</EmptyState></div></>
      : <><PageHeading title={page.label}/><div className="panel"><EmptyState title="Coming soon">{page.description}</EmptyState></div></>}
  </AppShell>;
}
