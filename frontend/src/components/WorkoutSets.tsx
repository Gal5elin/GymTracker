import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type AuthClient } from '../api/auth';
import type { WorkoutRecord } from '../api/workouts';
import { completeWorkout } from '../api/workout-completion';
import { createWorkoutSetsApi, type PerformedSet } from '../api/workout-sets';
import { Badge, Button } from './ui';
import SetEntryRow from './SetEntryRow';

export default function WorkoutSets({ client, workout, onCompletedChange, onFinished }: { client: AuthClient; workout: WorkoutRecord; onCompletedChange?: (completed: boolean) => void; onFinished?: (record: WorkoutRecord) => void }) {
  const api = useMemo(() => createWorkoutSetsApi(client, workout.id), [client, workout.id]);
  const [notes, setNotes] = useState(workout.notes ?? '');
  const [finishedRecord, setFinishedRecord] = useState<WorkoutRecord | null>(workout.status === 'COMPLETED' ? workout : null);
  const [finishing, setFinishing] = useState(false), [finishError, setFinishError] = useState(''), [uncertain, setUncertain] = useState(false);
  const touched = useRef(false), completionRequest = useRef<AbortController | null>(null);
  const summary = useRef<HTMLElement>(null);
  useEffect(() => { if (finishedRecord) summary.current?.focus(); }, [finishedRecord?.id]);
  useEffect(() => () => completionRequest.current?.abort(), []);
  const [sets, setSets] = useState<PerformedSet[]>([]);
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [closed, setClosed] = useState(workout.status === 'COMPLETED');
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0), [saving, setSaving] = useState(0);
  const mounted = useRef(true), savingRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function refresh(signal: AbortSignal) {
    const [recorded, state] = await Promise.all([api.list(signal), api.state(signal)]);
    if (!Array.isArray(recorded.sets) || !state.workout || !['IN_PROGRESS', 'COMPLETED'].includes(state.workout.status)) throw new Error('Could not load saved sets. Please try again.');
    if (!signal.aborted && mounted.current) { setSets(recorded.sets); setClosed(state.workout.status === 'COMPLETED'); onCompletedChange?.(state.workout.status === 'COMPLETED'); setReady(true); setUncertain(false);
      if (state.workout.status === 'COMPLETED') setFinishedRecord(state.workout);
      else if (!touched.current) setNotes(state.workout.notes ?? '');
    }
    return state.workout;
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
  function completed(record: WorkoutRecord) {
    setClosed(true); setFinishedRecord(record); setFinishError(''); setUncertain(false);
    onCompletedChange?.(true); onFinished?.(record);
  }
  async function finish() {
    if (savingRef.current || loading || !ready || closed || uncertain) return;
    setFinishError('');
    if (!sets.length) { setFinishError('Record at least one set before finishing your workout.'); return; }
    if (notes.trim().length > 2000) { setFinishError('Keep notes within 2000 characters.'); return; }
    savingRef.current = true; setFinishing(true); setNotice('');
    const controller = new AbortController(); completionRequest.current = controller;
    try {
      const record = await completeWorkout(client, workout.id, notes, controller.signal);
      if (!controller.signal.aborted && mounted.current) {
        const recorded = await api.list(controller.signal);
        if (!Array.isArray(recorded.sets)) throw new Error('Could not reload completed sets.');
        if (!controller.signal.aborted && mounted.current) { setSets(recorded.sets); completed(record); }
      }
    } catch (failure) {
      if (controller.signal.aborted || !mounted.current) return;
      if (!(failure instanceof ApiError) || failure.status >= 500 || failure.status === 409) {
        try {
          const record = await refresh(controller.signal);
          if (controller.signal.aborted || !mounted.current) return;
          if (record.status === 'COMPLETED') { completed(record); setNotice('Workout completion recovered.'); return; }
        } catch {
          if (!controller.signal.aborted && mounted.current) { setUncertain(true); setFinishError('Could not confirm completion. Reload saved sets to check before trying again.'); }
          return;
        }
      }
      setFinishError(failure instanceof Error ? failure.message : 'Could not finish. Please try again.');
    } finally { savingRef.current = false; if (mounted.current) setFinishing(false); }
  }
  return <>
    <div className="workout-overview panel"><div><span className="eyebrow">Your session</span><p>{entries.length} exercises · {total} planned sets</p></div><div className="session-progress"><span><strong>{sets.length}</strong> sets recorded</span>{total > 0 && <progress aria-label="Planned sets recorded" value={Math.min(sets.length, total)} max={total}/>}</div></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
    {closed && <p role="status" className="notice">This workout is complete. Saved sets are read-only.</p>}
    <div className="section-heading"><h2>Exercise sets</h2><Button disabled={loading || saving > 0 || finishing} onClick={() => { if (savingRef.current) return; setNotice(''); setAttempt(value => value + 1); }}>{loading ? 'Loading saved sets…' : 'Reload saved sets'}</Button></div>
    <ol className="exercise-list connected-exercise-list">{entries.map(entry => {
      const recorded = sets.filter(item => item.exercisePosition === entry.position).sort((a, b) => a.setNumber - b.setNumber);
      const next = Math.max(0, ...recorded.map(item => item.setNumber)) + 1;
      const label = `${entry.name}, exercise ${entry.position}`;
      return <li key={entry.programExerciseId}><section className="exercise-card panel" aria-label={label}>
        <div className="exercise-header"><div className="exercise-identity"><span className="exercise-index">{String(entry.position).padStart(2, '0')}</span><div><h2>{entry.name}</h2><p>{entry.muscleGroup} · {entry.equipment}</p><p>{entry.targetSets} sets × {entry.targetReps} reps · {entry.targetWeightKg === null ? 'No target weight' : `${entry.targetWeightKg} kg`}</p></div></div><Badge>{recorded.length} saved</Badge></div>
        {ready && <div className="set-table"><div className="set-table-head"><span>Set</span><span className="set-target">Target</span><span>Reps</span><span>Weight <span className="unit">kg</span></span><span className="sr-only">Save set</span></div>
          {recorded.map(set => <SetEntryRow key={set.setNumber} label={label} number={set.setNumber} targetReps={entry.targetReps} targetWeight={entry.targetWeightKg} saved={{ reps: set.reps, weight: set.weightKg }} onSave={async () => {}}/>)}
          {!closed && next <= 2147483647 && <SetEntryRow key={next} label={label} number={next} targetReps={entry.targetReps} targetWeight={entry.targetWeightKg} disabled={loading || saving > 0 || finishing || uncertain} onSave={(reps, weight, signal) => save(entry, next, reps, weight, signal)}/>}
        </div>}
      </section></li>;
    })}</ol>
    {closed ? <section className="panel notes-panel" ref={summary} tabIndex={-1} aria-label="Completed workout">
      <h2>Workout complete</h2>
      {finishedRecord?.finishedAt && <p>Finished <time dateTime={finishedRecord.finishedAt}>{new Date(finishedRecord.finishedAt).toLocaleString()}</time></p>}
      <h3>Saved notes</h3><p className="saved-workout-notes">{finishedRecord?.notes || 'No notes added.'}</p>
    </section> : <>
      <section className="panel notes-panel"><h2><label htmlFor={`notes-${workout.id}`}>Session notes</label> <span className="optional">Optional</span></h2>
        <textarea id={`notes-${workout.id}`} rows={4} maxLength={2000} value={notes} disabled={loading || finishing || uncertain} onChange={event => { touched.current = true; setNotes(event.target.value); setFinishError(''); }} placeholder="Add a note…"/>
      </section>
      <div className="finish-bar panel"><div><strong>{sets.length} sets recorded</strong><p>Save any entered sets before finishing.</p></div>
        <Button variant="primary" disabled={!ready || loading || saving > 0 || finishing || uncertain} onClick={() => { void finish(); }}>{finishing ? 'Finishing…' : 'Finish workout'}</Button>
        {finishError && <p className="field-error" role="alert">{finishError}</p>}
      </div>
    </>}
  </>;
}
