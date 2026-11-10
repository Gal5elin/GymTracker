import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type AuthClient } from '../api/auth';
import { createWorkoutsApi, type WorkoutRecord, type WorkoutOption } from '../api/workouts';
import { Badge, Button, EmptyState, PageHeading } from './ui';
import WorkoutSets from './WorkoutSets';
import ProgramCard from './ProgramCard';

function SavedPlan({ workout, client, onFinished, onChoose }: { workout: WorkoutRecord; client: AuthClient; onFinished: (record: WorkoutRecord) => void; onChoose: () => void }) {
  const [completed, setCompleted] = useState(workout.status === 'COMPLETED');
  const plan = workout.planSnapshot?.version === 1 ? workout.planSnapshot : null;
  return <>
    <PageHeading eyebrow={completed ? 'Workout complete' : 'Workout in progress'} title={plan?.day.title ?? 'Active workout'} description={plan ? `${plan.program.name} · Day ${plan.day.dayNumber}` : undefined} action={<Badge dark>{completed ? 'Completed' : 'In progress'}</Badge>}/>
    <p className="muted small workout-started">Started {new Date(workout.startedAt).toLocaleString()}</p>
    {!plan ? <div className="panel"><EmptyState title="Saved plan unavailable">The saved plan for this workout is unavailable. Its original exercises cannot be reconstructed from the current program.</EmptyState></div> : null}
    <WorkoutSets key={workout.id} client={client} workout={workout} onCompletedChange={setCompleted} onFinished={onFinished}/>
    {completed && <div className="editor-actions"><a className="button button-primary" href={`#history/${workout.id}`}>View in history</a><Button onClick={onChoose}>Choose another workout</Button></div>}
  </>;
}

export default function Workout({ client, sessionId }: { client: AuthClient; sessionId?: string }) {
  const api = useMemo(() => createWorkoutsApi(client), [client]);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [programs, setPrograms] = useState<WorkoutOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const skipRouteLoad = useRef<string | null>(null);
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.querySelector<HTMLElement>('h1')?.focus(); }, [workout?.id, selectedId, loading]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (sessionId && skipRouteLoad.current === sessionId) { skipRouteLoad.current = null; return; }
    const controller = new AbortController(); setLoading(true); setError(''); setLoadError(false); setConflict(false);
    (async () => {
      try {
        const active = sessionId ? await api.get(sessionId, controller.signal) : await api.active(controller.signal);
        if (controller.signal.aborted) return;
        if (!Object.hasOwn(active, 'workout')) throw new Error('Could not load your workout. Please try again.');
        setWorkout(active.workout);
        if (!active.workout) {
          const choices = await api.options(controller.signal);
          if (!Array.isArray(choices.programs)) throw new Error('Could not load your programs. Please try again.');
          if (!controller.signal.aborted) { setPrograms(choices.programs); setSelectedId(current => choices.programs.some(item => item.id === current) ? current : null); }
        }
      } catch (failure) { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Please try again.'); setLoadError(true); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [api, attempt, sessionId]);
  async function start(program: WorkoutOption, dayId: string) {
    if (busy.current) return;
    busy.current = true; setPendingDay(dayId); setError(''); setConflict(false);
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await api.start(program, dayId, controller.signal);
      if (!result.workout?.id) throw new Error('Could not load the started workout. Refresh to reopen it.');
      if (!controller.signal.aborted) setWorkout(result.workout);
    } catch (failure) {
      if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Please try again.'); setConflict(failure instanceof ApiError && failure.status === 409); }
    } finally { if (!controller.signal.aborted) { busy.current = false; setPendingDay(null); } }
  }
  function finished(record: WorkoutRecord) {
    setWorkout(record);
    const destination = `#workout/${record.id}`;
    if (window.location.hash !== destination) {
      skipRouteLoad.current = record.id;
      window.history.replaceState(null, '', destination);
      window.dispatchEvent(new Event('hashchange'));
    }
  }
  function chooseAnother() {
    setSelectedId(null); setWorkout(null); skipRouteLoad.current = null;
    if (window.location.hash !== '#workout') {
      window.history.replaceState(null, '', '#workout'); window.dispatchEvent(new Event('hashchange'));
    } else setAttempt(value => value + 1);
  }
  const selected = programs.find(program => program.id === selectedId);
  return <div ref={heading}>
    {loading ? <><PageHeading title="Workout"/><div className="panel program-editor" aria-busy="true" aria-label="Loading workout"><div className="session-skeleton"/><div className="session-skeleton short"/></div></>
      : workout && !loadError ? <SavedPlan key={workout.id} workout={workout} client={client} onFinished={finished} onChoose={chooseAnother}/>
      : <>
        {selected && !loadError && <Button variant="ghost" className="back-link" disabled={!!pendingDay} onClick={() => { setSelectedId(null); setError(''); }}>← All workout programs</Button>}
        <PageHeading title="Workout" description={selected ? selected.name : 'Choose a program and training day to begin.'}/>
        {error && <div className="notice"><p role="alert" className="field-error">{error}</p><Button disabled={!!pendingDay} onClick={() => setAttempt(value => value + 1)}>{conflict ? 'Open active workout' : loadError ? 'Try again' : 'Refresh choices'}</Button></div>}
        {!loadError && (selected ? <>
          <div className="section-heading"><h2>{selected.name}</h2><Badge>{selected.source === 'OWNED' ? 'Your program' : 'Assigned to you'}</Badge></div>
          {selected.days.length ? <div className="day-grid">{selected.days.map(day => <article className="panel day-card" key={day.id}><Badge>Day {day.dayNumber}</Badge><h2>{day.title}</h2><ul className="day-exercises">{(day.exercises ?? []).map(entry => <li key={entry.id}><span>{entry.exercise.name}</span><span>{entry.targetSets} × {entry.targetReps}{entry.targetWeightKg === null ? '' : ` · ${entry.targetWeightKg} kg`}</span></li>)}</ul>{!day.exercises?.length && <p className="muted">This day has no planned exercises.</p>}<Button variant="primary" disabled={!!pendingDay || !day.exercises?.length} onClick={() => { void start(selected, day.id); }} aria-label={`Start day ${day.dayNumber}: ${day.title}`}>{pendingDay === day.id ? 'Starting…' : 'Start this workout'}</Button></article>)}</div>
            : <div className="panel"><EmptyState title="No training days yet">Add a day and exercises in My programs, or ask your trainer to update this program.</EmptyState></div>}
        </> : programs.length ? <div className="program-grid">{programs.map(program => <ProgramCard key={program.id} name={program.name} description={program.description} days={program.days.map(day => ({ id: day.id, number: day.dayNumber }))} onOpen={() => setSelectedId(program.id)}/>)}</div>
          : <div className="panel"><EmptyState title="No workout programs yet" action={<a className="button button-primary" href="#programs">Create a program</a>}>Create a program with a training day and exercises, or use a program assigned by your trainer.</EmptyState></div>)}
      </>}
  </div>;
}
