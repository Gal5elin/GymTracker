import { lazy, Suspense, useEffect, useState } from 'react';
import type { AuthClient, User } from '../api/auth';
import History from './History';
const MemberResults = lazy(() => import('./MemberResults'));
const PersonalProgress = lazy(() => import('./PersonalProgress'));
import Workout from './Workout';
import Programs from './Programs';
import TrainerInvitations from './TrainerInvitations';
import InvitationInbox from './InvitationInbox';
import Assignments from './Assignments';
import AssignedPrograms from './AssignedPrograms';
import AppShell, { type NavigationItem } from './AppShell';
import { Button, EmptyState, PageHeading } from './ui';

interface WorkspacePage extends NavigationItem { roles: User['role'][]; description: string }
const personal: User['role'][] = ['MEMBER', 'TRAINER'];
const pages: WorkspacePage[] = [
  { id: 'account', label: 'Overview', href: '#account', icon: 'grid', roles: ['MEMBER', 'TRAINER', 'ADMIN'], description: '' },
  { id: 'programs', label: 'My programs', href: '#programs', icon: 'layers', roles: personal, description: 'Create and organize your training programs and numbered days.' },
  { id: 'workout', label: 'Workout', href: '#workout', icon: 'workout', roles: personal, description: 'Start a workout or return to your active workout.' },
  { id: 'history', label: 'History', href: '#history', icon: 'history', roles: personal, description: 'Review your completed workouts and saved results.' },
  { id: 'progress', label: 'Progress', href: '#progress', icon: 'trend', roles: personal, description: 'Follow your maximum recorded weights over time.' },
  { id: 'invitations', label: 'Invitations', href: '#invitations', icon: 'plus', roles: personal, description: 'Invite an existing member to collaborate on their training.' },
  { id: 'assignments', label: 'Assignments', href: '#assignments', icon: 'layers', roles: personal, description: 'Assign your programs to members who accept your invitation.' },
  { id: 'members', label: 'Member results', href: '#members', icon: 'trend', roles: ['TRAINER'], description: 'Review workouts and progress for members who accept your invitation.' },
];
const workoutRoute = /^#workout\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const historyRoute = /^#history\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const memberRoute = /^#members\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:progress|history(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)$/i;
export function isWorkspaceRoute(hash: string) { return pages.some(page => page.href === hash) || workoutRoute.test(hash) || historyRoute.test(hash) || memberRoute.test(hash); }
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
  const navigation = user ? pages.filter(page => page.roles.includes(user.role)).map(page => user.role === 'MEMBER' && page.id === 'assignments' ? { ...page, label: 'Assigned programs' } : page) : [];
  const page = pages.find(item => item.href === hash || (item.id === 'workout' && workoutRoute.test(hash)) || (item.id === 'history' && historyRoute.test(hash)) || (item.id === 'members' && memberRoute.test(hash)));
  const permitted = user && page?.roles.includes(user.role);
  return <AppShell navigation={navigation} activePage={page?.id ?? ''} displayName={user?.displayName ?? 'GymTracker'} roleLabel={user ? roleLabels[user.role] : 'Workspace'} onLogout={onLogout}>
    {user && error && <div className="notice" role="alert"><span>Could not refresh your account.</span><Button onClick={() => setAttempt(current => current + 1)}>Try again</Button></div>}
    {!user ? error ? <><PageHeading title="Unable to load account"/><p role="alert" className="field-error">{error}</p><Button onClick={() => setAttempt(current => current + 1)}>Try again</Button></> : <p role="status">Loading your account…</p>
      : !page || !permitted ? <><PageHeading title="Access denied"/><div className="panel"><EmptyState title="This page is not available for your role" action={<a className="button button-primary" href="#account">Return to overview</a>}>Choose a page from your workspace navigation.</EmptyState></div></>
      : page.id === 'members' ? <Suspense fallback={<p role="status">Loading member results…</p>}><MemberResults client={client} hash={hash}/></Suspense>
      : page.id === 'progress' ? <Suspense fallback={<p role="status">Loading progress…</p>}><PersonalProgress client={client}/></Suspense>
      : page.id === 'history' ? <History client={client} sessionId={historyRoute.test(hash) ? hash.slice('#history/'.length) : undefined}/>
      : page.id === 'workout' ? <Workout client={client} sessionId={workoutRoute.test(hash) ? hash.slice('#workout/'.length) : undefined}/>
      : page.id === 'invitations' ? user.role === 'MEMBER' ? <InvitationInbox client={client}/> : <TrainerInvitations client={client}/>
      : page.id === 'assignments' ? user.role === 'MEMBER' ? <AssignedPrograms client={client}/> : <Assignments client={client}/>
      : page.id === 'programs' ? <Programs client={client}/>
      : page.id === 'account' ? <><PageHeading title={`Welcome, ${user.displayName}`} description={`Signed in as ${user.displayName}.`}/><div className="panel"><EmptyState title={user.role === 'ADMIN' ? 'Administration' : 'Your training workspace'}>{user.role === 'ADMIN' ? 'Your account is reserved for user, role and exercise catalog administration. Management tools are planned for a later version.' : 'Your account is ready. Create a program in My programs, then start it in Workout. Record your sets in Workout. Finish your workout when you are done. Review your completed workouts in History and your exercise weights in Progress.'}</EmptyState></div></>
      : <><PageHeading title={page.label}/><div className="panel"><EmptyState title="Coming soon">{page.description}</EmptyState></div></>}
  </AppShell>;
}
