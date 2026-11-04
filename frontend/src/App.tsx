import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createMockWorkoutService, type Program, type Snapshot, type Workout, type WorkoutService } from './data/workouts';
import { Badge, Button, EmptyState, Icon, PageHeading, type IconName } from './components/ui';
import { WorkoutScreen } from './components/WorkoutScreen';

const Progress = lazy(() => import('./components/Progress'));

type Page = 'dashboard' | 'programs' | 'workout' | 'history' | 'progress';
const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Overview', icon: 'grid' }, { id: 'programs', label: 'My programs', icon: 'layers' },
  { id: 'workout', label: 'Workout', icon: 'workout' }, { id: 'history', label: 'History', icon: 'history' }, { id: 'progress', label: 'Progress', icon: 'trend' },
];
const formatDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const formatDuration = (workout: Workout) => `${Math.max(1, Math.round((new Date(workout.finishedAt ?? workout.startedAt).getTime() - new Date(workout.startedAt).getTime()) / 60_000))} min`;
function readPage(): Page { return navigation.find((item) => item.id === window.location.hash.slice(1))?.id ?? 'dashboard'; }
const params = new URLSearchParams(window.location.search);
const defaultService = createMockWorkoutService({ empty: params.get('demo') === 'empty', failFirstLoad: params.get('demo') === 'error' });

function ProgramCard({ program, onOpen }: { program: Program; onOpen: () => void }) {
  return <article className="program-card panel"><div className="split"><Badge>{program.days.length}-day split</Badge><Icon name="workout"/></div><h3>{program.name}</h3><div className="program-tags">{program.days.map((day, index) => <span key={day.id}>Day {index + 1}</span>)}</div><Button onClick={onOpen}>View program<Icon name="arrow" size={17}/></Button></article>;
}
function HistoryList({ workouts, onOpen, onStart }: { workouts: Workout[]; onOpen: (id: string) => void; onStart: () => void }) {
  if (!workouts.length) return <div className="panel"><EmptyState title="No completed workouts" action={<Button variant="primary" onClick={onStart}>Choose a workout<Icon name="arrow" size={16}/></Button>}>Completed workouts will appear here.</EmptyState></div>;
  return <div className="history-list panel"><div className="history-head"><span>Session</span><span>Recorded</span><span>Duration</span><span/></div>{workouts.map((workout) => <button className="history-row" key={workout.id} onClick={() => onOpen(workout.id)}><div className="history-title"><span className="date-tile"><strong>{new Date(workout.startedAt).getDate()}</strong><span>{new Date(workout.startedAt).toLocaleDateString('en', { month: 'short' })}</span></span><span><strong>{workout.day.name}</strong><small>{workout.programName}</small></span></div><span className="history-sets">{workout.sets.length} sets</span><span className="history-duration">{formatDuration(workout)}</span><Icon name="chevron" size={17}/></button>)}</div>;
}
function Summary({ workout, onBack }: { workout: Workout; onBack: () => void }) {
  return <><Button className="back-link" variant="ghost" onClick={onBack}>← Back to history</Button><PageHeading eyebrow="Workout complete" title={workout.day.name} description={`${workout.programName} · ${formatDate(workout.startedAt)}`} action={<Badge dark><Icon name="check" size={13}/>Completed</Badge>}/><div className="stats-grid summary-stats"><Stat label="Recorded sets" value={workout.sets.length}/><Stat label="Exercises recorded" value={new Set(workout.sets.map((set) => set.position)).size}/><Stat label="Session duration" value={formatDuration(workout)}/></div><div className="summary-exercises">{workout.day.exercises.map((exercise, position) => {
    const sets = workout.sets.filter((set) => set.position === position).sort((a, b) => a.number - b.number);
    if (!sets.length) return null;
    return <section className="panel summary-exercise" key={position}><div className="section-heading"><div><span className="eyebrow">{exercise.equipment}</span><h2>{exercise.name}</h2></div><Badge>{sets.length} sets</Badge></div><div className="recorded-sets">{sets.map((set) => <div key={set.id}><span className="muted">Set {set.number}</span><strong>{set.reps} reps</strong><span>{set.weight === null ? 'Bodyweight' : `${set.weight} kg`}</span><Icon name="check" size={16}/></div>)}</div></section>;
  })}</div><section className="panel notes-panel"><h2>Session notes</h2><p className="saved-notes">{workout.notes || 'No notes for this session.'}</p></section></>;
}
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="stat panel"><span className="eyebrow">{label}</span><strong>{value}</strong></div>; }

export default function App({ service = defaultService }: { service?: WorkoutService }) {
  const [page, setPage] = useState<Page>(readPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [starting, setStarting] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    const listener = () => { setPage(readPage()); setMenuOpen(false); setActionError(''); };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    service.load().then((snapshot) => { if (!cancelled) setData(snapshot); }).catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load your workouts.'); });
    return () => { cancelled = true; };
  }, [service, loadAttempt]);
  useEffect(() => { mainRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); }, [page, detailId, selectedProgramId, !!data]);
  function navigate(next: Page) { setPage(next); setMenuOpen(false); setDetailId(null); setActionError(''); window.location.hash = next; }
  function update(workout: Workout) { setData((current) => current ? { ...current, workouts: current.workouts.some((entry) => entry.id === workout.id) ? current.workouts.map((entry) => entry.id === workout.id ? workout : entry) : [workout, ...current.workouts] } : current); }
  function openProgram(id: string) { setSelectedProgramId(id); navigate('programs'); }
  function openHistory(id: string) { navigate('history'); setDetailId(id); }
  const active = data?.workouts.find((workout) => workout.status === 'IN_PROGRESS');
  const completed = data?.workouts.filter((workout) => workout.status === 'COMPLETED') ?? [];
  const selectedProgram = data?.programs.find((program) => program.id === selectedProgramId);
  async function start(programId: string, dayId: string) {
    setActionError(''); setStarting(true);
    try { update(await service.start(programId, dayId)); navigate('workout'); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not start your workout. Try again.'); }
    finally { setStarting(false); }
  }
  const navLink = (item: typeof navigation[number]) => <a key={item.id} href={`#${item.id}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => { setMenuOpen(false); setDetailId(null); setActionError(''); }}><Icon name={item.icon}/><span>{item.label}</span>{item.id === 'workout' && active && <span className="active-dot" aria-label="Workout in progress"/>}</a>;
  const totalSets = completed.reduce((total, workout) => total + workout.sets.length, 0);
  let content;
  if (loadError) content = <><PageHeading title="Unable to load workouts"/><div className="panel"><EmptyState title="Your workouts couldn’t be loaded" action={<Button onClick={() => setLoadAttempt(loadAttempt + 1)}>Try again</Button>}><span role="alert">{loadError}</span></EmptyState></div></>;
  else if (!data) content = <div role="status" className="loading-state"><span className="loading-line"/><p>Loading workouts…</p></div>;
  else if (page === 'dashboard') content = <>
    <PageHeading title="Overview" action={<Button variant="primary" onClick={() => navigate(active ? 'workout' : 'programs')}><Icon name={active ? 'arrow' : 'plus'} size={18}/>{active ? 'Resume workout' : 'Start workout'}</Button>}/>
    <div className="stats-grid"><Stat label="Completed workouts" value={completed.length.toString().padStart(2, '0')}/><Stat label="Sets recorded" value={totalSets}/><Stat label="Your programs" value={data.programs.length.toString().padStart(2, '0')}/></div>
    <div className="dashboard-columns"><div><div className="section-heading"><h2>Your programs <span className="count">{data.programs.length}</span></h2><Button variant="ghost" onClick={() => navigate('programs')}>View all<Icon name="arrow" size={16}/></Button></div><div className="program-grid">{data.programs.map((program) => <ProgramCard key={program.id} program={program} onOpen={() => openProgram(program.id)}/>)}</div></div><aside className="next-session panel"><span className="eyebrow">{active ? 'In progress' : 'Up next'}</span><span className="large-workout-icon"><Icon name="workout" size={34}/></span><h2>{active?.day.name ?? data.programs[0]?.days[0]?.name ?? 'Your next workout'}</h2><div className="next-meta"><span><Icon name="layers" size={15}/>{active?.day.exercises.length ?? 3} exercises</span><span><Icon name="check" size={15}/>{active ? `${active.sets.length} saved sets` : '8 planned sets'}</span></div><Button variant="primary" onClick={() => active ? navigate('workout') : openProgram(data.programs[0].id)}>{active ? 'Resume session' : 'Choose your day'}<Icon name="arrow" size={17}/></Button></aside></div>
    <div className="section-heading history-section"><div><h2>Recent workouts</h2></div><Button variant="ghost" onClick={() => navigate('history')}>Full history<Icon name="arrow" size={16}/></Button></div><HistoryList workouts={completed.slice(0, 3)} onOpen={openHistory} onStart={() => navigate('programs')}/>
  </>;
  else if (page === 'programs' || (page === 'workout' && !active)) content = <>
    {selectedProgram && page === 'programs' ? <><Button variant="ghost" className="back-link" onClick={() => setSelectedProgramId(null)}>← All programs</Button><PageHeading eyebrow={`${selectedProgram.days.length}-day training split`} title={selectedProgram.name}/><div className="day-grid">{selectedProgram.days.map((day, index) => <article className="panel day-card" key={day.id}><div className="split"><span className="eyebrow">Day {String(index + 1).padStart(2, '0')}</span><Badge>{day.exercises.length} exercises</Badge></div><h2>{day.name}</h2><p className="muted">{day.focus}</p><ul className="day-exercises">{day.exercises.map((exercise) => <li key={exercise.id}><span>{exercise.name}</span><span>{exercise.sets} × {exercise.reps}</span></li>)}</ul><Button variant="primary" disabled={starting} onClick={() => active ? navigate('workout') : start(selectedProgram.id, day.id)}>{active ? 'Resume current workout' : starting ? 'Starting…' : 'Start this workout'}<Icon name="arrow" size={16}/></Button></article>)}</div></> : <><PageHeading title={page === 'workout' ? 'Choose a workout' : 'My programs'}/>{active && <div className="notice"><span>You have a workout in progress.</span><Button onClick={() => navigate('workout')}>Resume workout<Icon name="arrow" size={16}/></Button></div>}<div className="program-grid">{data.programs.map((program) => <ProgramCard key={program.id} program={program} onOpen={() => openProgram(program.id)}/>)}</div></>}
    {actionError && <p role="alert" className="field-error">{actionError}</p>}
  </>;
  else if (page === 'workout' && active) content = <WorkoutScreen key={active.id} workout={active} service={service} onUpdate={update} notes={noteDrafts[active.id] ?? ''} onNotesChange={(notes) => setNoteDrafts((current) => ({ ...current, [active.id]: notes }))} onFinished={(workout) => { update(workout); openHistory(workout.id); }}/>;
  else if (page === 'history') {
    const detail = completed.find((workout) => workout.id === detailId);
    content = detail ? <Summary workout={detail} onBack={() => setDetailId(null)}/> : <><PageHeading title="Workout history" action={<Button variant="primary" onClick={() => navigate(active ? 'workout' : 'programs')}><Icon name="plus" size={18}/>{active ? 'Resume workout' : 'Start workout'}</Button>}/><HistoryList workouts={completed} onOpen={openHistory} onStart={() => navigate('programs')}/></>;
  } else content = <Suspense fallback={<p role="status">Loading your progress…</p>}><Progress workouts={completed}/></Suspense>;
  return <div className="app-shell"><a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
    <aside className="sidebar"><a className="brand" href="#dashboard"><span className="brand-mark"><Icon name="workout" size={23}/></span>GymTracker<span className="brand-period">.</span></a><nav aria-label="Main navigation">{navigation.map(navLink)}</nav><div className="sidebar-bottom"><div className="profile"><span className="avatar">YO</span><div><strong>Your workspace</strong></div></div></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-left"><button className="menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'}/></button><span className="breadcrumb">Workspace <span>/</span> <strong>{navigation.find((item) => item.id === page)?.label}</strong></span></div></header>
      {menuOpen && <nav className="mobile-nav" id="mobile-navigation" aria-label="Mobile navigation">{navigation.map(navLink)}</nav>}
      <main id="main-content" ref={mainRef} tabIndex={-1}><div className="content">{content}</div></main>
    </div></div>;
}
