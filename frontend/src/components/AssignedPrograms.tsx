import { useEffect, useMemo, useState } from 'react';
import type { AuthClient } from '../api/auth';
import { createWorkoutsApi, type WorkoutOption } from '../api/workouts';
import { Badge, Button, EmptyState, PageHeading } from './ui';
export default function AssignedPrograms({ client }: { client: AuthClient }) {
  const api = useMemo(() => createWorkoutsApi(client), [client]);
  const [programs, setPrograms] = useState<WorkoutOption[] | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api.options(controller.signal).then(data => {
      if (!Array.isArray(data.programs)) throw new Error('Could not load assigned programs. Please try again.');
      if (!controller.signal.aborted) setPrograms(data.programs.filter(p => p.source === 'ASSIGNED'));
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, attempt]);
  return <><PageHeading title="Assigned programs" description="Training programs assigned to you. Existing assignments stay available when a collaboration ends." action={<Button disabled={loading} onClick={() => setAttempt(value => value + 1)}>Refresh programs</Button>}/>
    {error && <div role="alert" className="notice"><p>{error}</p><Button onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>}
    {loading && <p role="status">Loading assigned programs…</p>}
    {!loading && programs?.length === 0 && <div className="panel"><EmptyState title="No assigned programs yet">Programs assigned by your trainer will appear here. You can also create your own in My programs.</EmptyState></div>}
    {programs && <div className="assigned-programs">{programs.map(program => <section className="panel assigned-program" key={program.id} aria-label={`Assigned program: ${program.name}`}><Badge>Assigned</Badge><h2>{program.name}</h2>{program.description && <p>{program.description}</p>}
      {!program.days.length ? <p className="muted">No training days yet.</p> : <ol>{program.days.map(day => <li key={day.id}><details><summary>Day {day.dayNumber}: {day.title}</summary>{!day.exercises?.length ? <p className="muted">No planned exercises yet.</p> : <ol>{day.exercises.map(entry => <li key={entry.id}><strong>{entry.exercise.name}</strong> — {entry.targetSets} sets × {entry.targetReps} reps{entry.targetWeightKg !== null ? ` at ${entry.targetWeightKg} kg` : ''}</li>)}</ol>}</details></li>)}</ol>}
      <a className="button button-secondary" href="#workout">Choose a workout</a>
    </section>)}</div>}
  </>;
}
