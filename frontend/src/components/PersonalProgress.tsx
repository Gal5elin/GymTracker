import { useEffect, useMemo, useState } from 'react';
import type { AuthClient } from '../api/auth';
import { createProgressApi, type ExerciseProgress, type ProgressExercise } from '../api/progress';
import ProgressChart from './ProgressChart';
import { Button, EmptyState, PageHeading } from './ui';

export default function PersonalProgress({ client }: { client: AuthClient }) {
  const api = useMemo(() => createProgressApi(client), [client]);
  const [choices, setChoices] = useState<ProgressExercise[] | null>(null);
  const [exerciseId, setExerciseId] = useState('');
  const [result, setResult] = useState<ExerciseProgress | null>(null);
  const [choicesError, setChoicesError] = useState('');
  const [error, setError] = useState('');
  const [choicesAttempt, setChoicesAttempt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setChoicesError('');
    api.exercises(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setChoices(data); setExerciseId(data[0]?.id ?? '');
    }).catch(failure => { if (!controller.signal.aborted) setChoicesError(failure.message); });
    return () => controller.abort();
  }, [api, choicesAttempt]);
  useEffect(() => {
    const controller = new AbortController(); setResult(null); setError('');
    if (exerciseId) api.progress(exerciseId, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [api, exerciseId, attempt]);
  const current = result?.exercise.id === exerciseId ? result : null;
  const points = current?.points.map(point => ({ id: point.workoutId, label: new Date(point.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), date: new Date(point.startedAt).toLocaleString('en-GB'), weight: Number(point.maxWeightKg) })) ?? [];
  return <><PageHeading title="Your progress"/><section className="panel progress-panel"><div className="section-heading"><div><h2>Weight over time</h2><p className="muted small">Maximum recorded weight per completed workout</p></div>{choices && choices.length > 0 && <label className="select-field">Exercise<select value={exerciseId} onChange={event => { setExerciseId(event.target.value); setError(''); }}>
    {choices.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}{exercise.isActive ? '' : ' (inactive)'}</option>)}
  </select></label>}</div>
    {choicesError ? <><p role="alert" className="field-error">{choicesError}</p><Button onClick={() => setChoicesAttempt(value => value + 1)}>Retry loading exercises</Button></>
      : !choices ? <p role="status">Loading exercises…</p>
      : !choices.length ? <EmptyState title="No exercises available">Exercises will appear here when available in the catalog or your completed workouts.</EmptyState>
      : error ? <><p role="alert" className="field-error">{error}</p><Button onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry loading progress</Button></>
      : !current ? <p role="status">Loading progress…</p>
      : !points.length ? <EmptyState title="No progress data">Record a weight for this exercise in a completed workout to see it here.</EmptyState>
      : <><ProgressChart points={points} exerciseName={current.exercise.name}/><details><summary>View workout values</summary><table><caption>Maximum weights for {current.exercise.name}</caption><thead><tr><th scope="col">Workout date</th><th scope="col">Maximum weight (kg)</th></tr></thead><tbody>{current.points.map(point => <tr key={point.workoutId}><td><a href={`#history/${point.workoutId}`}>{new Date(point.startedAt).toLocaleString('en-GB')}</a></td><td>{point.maxWeightKg}</td></tr>)}</tbody></table></details></>}
  </section></>;
}
