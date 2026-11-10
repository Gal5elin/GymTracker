import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { AuthClient } from '../api/auth';
import { createExercisesApi } from '../api/exercises';
import type { CatalogExercise, ExerciseTargets, PlannedExercise, ProgramDay } from '../api/programs';
import { Button, EmptyState, PageHeading } from './ui';

function TargetsForm({ entry, catalog, pending, onSave, onCancel }: {
  entry: PlannedExercise | null; catalog: CatalogExercise[]; pending: boolean;
  onSave: (data: ExerciseTargets) => void; onCancel: () => void;
}) {
  const id = useId();
  const [exerciseId, setExerciseId] = useState(entry?.exerciseId ?? '');
  const [sets, setSets] = useState(String(entry?.targetSets ?? 3));
  const [reps, setReps] = useState(String(entry?.targetReps ?? 8));
  const [weight, setWeight] = useState(entry?.targetWeightKg ?? '');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault(); if (pending) return;
    if (!exerciseId || (!catalog.some(item => item.id === exerciseId) && entry?.exerciseId !== exerciseId)) { setError('Choose an exercise from the catalog.'); return; }
    if (![sets, reps].every(value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647)) { setError('Sets and reps must be positive whole numbers.'); return; }
    const value = weight.trim();
    if (value && (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value) || Number(value) > 9999.99)) { setError('Weight must be between 0 and 9999.99 kg, with at most two decimal places.'); return; }
    setError('');
    onSave({ ...(entry?.exerciseId === exerciseId ? {} : { exerciseId }), targetSets: Number(sets), targetReps: Number(reps), targetWeightKg: value ? Number(value) : null });
  }
  const inactive = entry && !catalog.some(item => item.id === entry.exerciseId);
  return <form className="panel program-editor" aria-label="Exercise targets" noValidate onSubmit={submit} aria-busy={pending}>
    <h2>{entry ? 'Edit exercise' : 'Add exercise'}</h2>
    <fieldset disabled={pending}>
      <div className="registration-field"><label htmlFor={`${id}-exercise`}>Exercise</label><select id={`${id}-exercise`} required value={exerciseId} onChange={event => { setExerciseId(event.target.value); setError(''); }}><option value="">Choose an exercise</option>{inactive && <option value={entry.exerciseId}>{entry.exercise.name} (no longer in catalog)</option>}{catalog.map(item => <option value={item.id} key={item.id}>{item.name} · {item.muscleGroup} · {item.equipment}</option>)}</select></div>
      <div className="target-fields">
        <div className="registration-field"><label htmlFor={`${id}-sets`}>Target sets</label><input id={`${id}-sets`} type="number" min={1} max={2147483647} step={1} required value={sets} onChange={event => setSets(event.target.value)}/></div>
        <div className="registration-field"><label htmlFor={`${id}-reps`}>Target reps</label><input id={`${id}-reps`} type="number" min={1} max={2147483647} step={1} required value={reps} onChange={event => setReps(event.target.value)}/></div>
        <div className="registration-field"><label htmlFor={`${id}-weight`}>Target weight (kg, optional)</label><input id={`${id}-weight`} type="number" min={0} max={9999.99} step="0.01" value={weight} onChange={event => setWeight(event.target.value)}/></div>
      </div>
      <div className="editor-actions"><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Save exercise'}</Button><Button type="button" onClick={onCancel}>Cancel</Button></div>
    </fieldset>
    {error && <p role="alert" className="field-error">{error}</p>}
  </form>;
}

export default function ExercisePlanner({ client, programId, day, onBack, onChange }: {
  client: AuthClient; programId: string; day: ProgramDay; onBack: () => void; onChange: (exercises: PlannedExercise[]) => void;
}) {
  const api = useMemo(() => createExercisesApi(client, programId, day.id), [client, programId, day.id]);
  const [entries, setEntries] = useState<PlannedExercise[]>(day.exercises ?? []);
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<PlannedExercise | null | undefined>();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const title = useRef<HTMLDivElement>(null);
  useEffect(() => { title.current?.focus(); }, [editing]);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setNotice('');
    Promise.all([api.list(controller.signal), api.catalog(controller.signal)]).then(([list, available]) => {
      if (!controller.signal.aborted) { setEntries(list.exercises); setCatalog(available.exercises); onChange(list.exercises); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, attempt]);
  async function mutate(work: (signal: AbortSignal) => Promise<PlannedExercise[]>, success: string) {
    if (busy.current || loading) return;
    busy.current = true; setPending(true); setError(''); setNotice('');
    const controller = new AbortController(); mutation.current = controller;
    try {
      const result = await work(controller.signal);
      if (!controller.signal.aborted) { setEntries(result); onChange(result); setEditing(undefined); setNotice(success); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.'); }
    finally { if (!controller.signal.aborted) { busy.current = false; setPending(false); } }
  }
  function save(data: ExerciseTargets) {
    void mutate(async signal => {
      let position = Math.max(0, ...entries.map(item => item.position)) + 1;
      if (position > 2147483647) {
        const used = new Set(entries.map(item => item.position));
        position = 1; while (used.has(position)) position++;
      }
      const { exercise } = await api.save(editing?.id ?? null, { ...data, ...(editing ? {} : { position }) }, signal);
      return [...entries.filter(item => item.id !== exercise.id), exercise].sort((a, b) => a.position - b.position);
    }, 'Exercise saved.');
  }
  function move(index: number, direction: number) {
    const ids = entries.map(item => item.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    void mutate(async signal => (await api.reorder(ids, signal)).exercises, 'Exercise order saved.');
  }
  return <>
    <Button className="back-link" variant="ghost" onClick={onBack}>← Back to program</Button>
    <div ref={title} tabIndex={-1}><PageHeading eyebrow={`Day ${day.dayNumber}`} title={day.title} description="Choose your exercises and set the targets for this day." action={!loading && editing === undefined && <Button variant="primary" disabled={pending || !catalog.length} onClick={() => { setEditing(null); setNotice(''); }}>Add exercise</Button>}/></div>
    {notice && <p role="status" className="notice">{notice}</p>}
    {error && <div className="notice"><p role="alert" className="field-error">{error}</p><Button disabled={pending} onClick={() => setAttempt(value => value + 1)}>Refresh list</Button></div>}
    {editing !== undefined && <TargetsForm key={editing?.id ?? 'new'} entry={editing} catalog={catalog} pending={pending || loading} onSave={save} onCancel={() => { setEditing(undefined); setError(''); }}/> }
    {loading ? <div className="panel program-editor" aria-busy="true" aria-label="Loading exercises"><div className="session-skeleton"/><div className="session-skeleton short"/></div>
      : <>
        {!catalog.length && !error && <p className="notice">No exercises are currently available in the catalog.</p>}
        {entries.length ? <ol className="planned-exercises">{entries.map((entry, index) => <li key={entry.id} className="panel planned-exercise">
          <div><span className="eyebrow">Exercise {entry.position}</span><h2>{entry.exercise.name}</h2><p>{entry.targetSets} sets × {entry.targetReps} reps · {entry.targetWeightKg === null ? 'No target weight' : `${entry.targetWeightKg} kg`}</p></div>
          <div className="editor-actions"><Button disabled={pending || editing !== undefined || index === 0} aria-label={`Move exercise ${entry.position} up`} onClick={() => move(index, -1)}>↑ Up</Button><Button disabled={pending || editing !== undefined || index === entries.length - 1} aria-label={`Move exercise ${entry.position} down`} onClick={() => move(index, 1)}>↓ Down</Button><Button disabled={pending || editing !== undefined} aria-label={`Edit exercise ${entry.position}: ${entry.exercise.name}`} onClick={() => { setEditing(entry); setNotice(''); setError(''); }}>Edit</Button><Button disabled={pending || editing !== undefined} aria-label={`Remove exercise ${entry.position}: ${entry.exercise.name}`} onClick={() => { void mutate(async signal => { await api.remove(entry.id, signal); return entries.filter(item => item.id !== entry.id); }, 'Exercise removed.'); }}>Remove</Button></div>
        </li>)}</ol> : !error && <div className="panel"><EmptyState title="No exercises yet">Add an exercise to start planning this day.</EmptyState></div>}
      </>}
  </>;
}
