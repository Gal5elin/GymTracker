import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type AuthClient } from '../api/auth';
import type { ActiveWorkout } from '../api/workouts';
import { createWorkoutSetsApi, type PerformedSet } from '../api/workout-sets';
import { Badge, Button } from './ui';
import SetEntryRow from './SetEntryRow';

export default function WorkoutSets({ client, workout, onCompletedChange }: { client: AuthClient; workout: ActiveWorkout; onCompletedChange?: (completed: boolean) => void }) {
  const api = useMemo(() => createWorkoutSetsApi(client, workout.id), [client, workout.id]);
  const [sets, setSets] = useState<PerformedSet[]>([]);
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [closed, setClosed] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0), [saving, setSaving] = useState(0);
  const mounted = useRef(true), savingRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function refresh(signal: AbortSignal) {
    const [recorded, state] = await Promise.all([api.list(signal), api.state(signal)]);
    if (!Array.isArray(recorded.sets) || !state.workout || !['IN_PROGRESS', 'COMPLETED'].includes(state.workout.status)) throw new Error('Could not load saved sets. Please try again.');
    if (!signal.aborted && mounted.current) { setSets(recorded.sets); setClosed(state.workout.status === 'COMPLETED'); onCompletedChange?.(state.workout.status === 'COMPLETED'); setReady(true); }
  }
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void refresh(controller.signal).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, attempt]);
  const entries = [...(workout.planSnapshot?.exercises ?? [])].sort((a, b) => a.position - b.position);
  const total = entries.reduce((sum, entry) => sum + entry.targetSets, 0);
  async function save(entry: typeof entries[number], number: number, reps: number, weightKg: number | null, signal: AbortSignal) {
    if (savingRef.current) throw new Error('Another set is saving. Please try again in a moment.');
    savingRef.current = true; setSaving(value => value + 1); setNotice(''); setError('');
    try {
      const result = await api.save({ exerciseId: entry.exerciseId, exercisePosition: entry.position, setNumber: number, reps, weightKg }, signal);
      if (!result.set?.id) throw new Error('Could not confirm the saved set. Reload saved sets before retrying.');
      if (!signal.aborted && mounted.current) { setSets(current => [...current.filter(item => item.id !== result.set.id), result.set]); setNotice('Set saved.'); }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409 && !signal.aborted) {
        try { await refresh(signal); if (!signal.aborted && mounted.current) setNotice('Saved sets reloaded. Existing sets cannot be overwritten.'); }
        catch (reloadFailure) { if (!signal.aborted && mounted.current) setError(reloadFailure instanceof Error ? reloadFailure.message : 'Could not reload saved sets.'); }
      }
      throw failure;
    } finally { savingRef.current = false; if (mounted.current) setSaving(value => Math.max(0, value - 1)); }
  }
  return <>
    <div className="workout-overview panel"><div><span className="eyebrow">Your session</span><p>{entries.length} exercises · {total} planned sets</p></div><div className="session-progress"><span><strong>{sets.length}</strong> sets recorded</span>{total > 0 && <progress aria-label="Planned sets recorded" value={Math.min(sets.length, total)} max={total}/>}</div></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
    {closed && <p role="status" className="notice">This workout is complete. Saved sets are read-only.</p>}
    <div className="section-heading"><h2>Exercise sets</h2><Button disabled={loading || saving > 0} onClick={() => { setNotice(''); setAttempt(value => value + 1); }}>{loading ? 'Loading saved sets…' : 'Reload saved sets'}</Button></div>
    <ol className="exercise-list connected-exercise-list">{entries.map(entry => {
      const recorded = sets.filter(item => item.exercisePosition === entry.position).sort((a, b) => a.setNumber - b.setNumber);
      const next = Math.max(0, ...recorded.map(item => item.setNumber)) + 1;
      const label = `${entry.name}, exercise ${entry.position}`;
      return <li key={entry.programExerciseId}><section className="exercise-card panel" aria-label={label}>
        <div className="exercise-header"><div className="exercise-identity"><span className="exercise-index">{String(entry.position).padStart(2, '0')}</span><div><h2>{entry.name}</h2><p>{entry.muscleGroup} · {entry.equipment}</p><p>{entry.targetSets} sets × {entry.targetReps} reps · {entry.targetWeightKg === null ? 'No target weight' : `${entry.targetWeightKg} kg`}</p></div></div><Badge>{recorded.length} saved</Badge></div>
        {ready && <div className="set-table"><div className="set-table-head"><span>Set</span><span className="set-target">Target</span><span>Reps</span><span>Weight <span className="unit">kg</span></span><span className="sr-only">Save set</span></div>
          {recorded.map(set => <SetEntryRow key={set.setNumber} label={label} number={set.setNumber} targetReps={entry.targetReps} targetWeight={entry.targetWeightKg} saved={{ reps: set.reps, weight: set.weightKg }} onSave={async () => {}}/>)}
          {!closed && next <= 2147483647 && <SetEntryRow key={next} label={label} number={next} targetReps={entry.targetReps} targetWeight={entry.targetWeightKg} disabled={loading || saving > 0} onSave={(reps, weight, signal) => save(entry, next, reps, weight, signal)}/>}
        </div>}
      </section></li>;
    })}</ol>
  </>;
}
