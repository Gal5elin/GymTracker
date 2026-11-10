import { useState } from 'react';
import type { PlannedExercise, RecordedSet, Workout, WorkoutService } from '../data/workouts';
import SetEntryRow from './SetEntryRow';
import { Badge, Button, Icon, PageHeading } from './ui';

function SetRow({ exercise, position, number, saved, workoutId, service, onUpdate }: { exercise: PlannedExercise; position: number; number: number; saved?: RecordedSet; workoutId: string; service: WorkoutService; onUpdate: (workout: Workout) => void }) {
  return <SetEntryRow label={exercise.name} number={number} targetReps={exercise.reps} targetWeight={exercise.weight} saved={saved ? { reps: saved.reps, weight: saved.weight } : undefined} initialReps={String(exercise.reps)} initialWeight={exercise.weight === null ? '' : String(exercise.weight)} onSave={async (reps, weight, signal) => {
    const result = await service.saveSet(workoutId, exercise.id, position, number, reps, weight);
    if (!signal.aborted) onUpdate(result);
  }}/>;
}
function ExerciseCard({ exercise, position, workout, service, onUpdate }: { exercise: PlannedExercise; position: number; workout: Workout; service: WorkoutService; onUpdate: (workout: Workout) => void }) {
  const recorded = workout.sets.filter((set) => set.position === position);
  const [count, setCount] = useState(Math.max(exercise.sets, ...recorded.map((set) => set.number)));
  return <section className="exercise-card panel" aria-label={exercise.name}>
    <div className="exercise-header"><div className="exercise-identity"><span className="exercise-index">{String(position + 1).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><p>{exercise.muscleGroup} <span className="dot">·</span> {exercise.equipment}</p></div></div><Badge>{recorded.length} / {count} sets</Badge></div>
    <div className="set-table"><div className="set-table-head"><span>Set</span><span className="set-target">Target</span><span>Reps</span><span>Weight <span className="unit">kg</span></span><span className="sr-only">Save set</span></div>
      {Array.from({ length: count }, (_, index) => <SetRow key={index} exercise={exercise} position={position} number={index + 1} saved={recorded.find((set) => set.number === index + 1)} workoutId={workout.id} service={service} onUpdate={onUpdate}/>)}
    </div>
    <div className="exercise-footer"><Button variant="ghost" onClick={() => setCount(count + 1)}><Icon name="plus" size={16}/>Add set</Button><span>Target: {exercise.sets} sets × {exercise.reps} reps</span></div>
  </section>;
}
export function WorkoutScreen({ workout, service, onUpdate, onFinished, notes, onNotesChange }: { workout: Workout; service: WorkoutService; onUpdate: (workout: Workout) => void; onFinished: (workout: Workout) => void; notes: string; onNotesChange: (notes: string) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const total = workout.day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  async function finish() {
    setError('');
    if (!workout.sets.length) { setError('Record at least one set before finishing your workout.'); return; }
    setBusy(true);
    try { onFinished(await service.finish(workout.id, notes)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not finish your workout. Try again.'); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading title={workout.day.name} description={workout.programName} action={<Badge dark>In progress</Badge>}/>
    <div className="workout-overview panel"><div><span className="eyebrow">Your session</span><p>{workout.day.exercises.length} exercises <span className="dot">/</span> {total} planned sets</p></div><div className="session-progress"><span><strong>{workout.sets.length}</strong> sets recorded</span><progress aria-label="Planned sets recorded" value={Math.min(workout.sets.length, total)} max={total}/></div></div>
    <div className="workout-layout"><div className="exercise-list">
      {workout.day.exercises.map((exercise, position) => <ExerciseCard key={position} exercise={exercise} position={position} workout={workout} service={service} onUpdate={onUpdate}/>)}
      <section className="panel notes-panel"><h2><label htmlFor="workout-notes">Session notes</label> <span className="optional">Optional</span></h2><textarea id="workout-notes" value={notes} disabled={busy} onChange={(event) => onNotesChange(event.target.value)} placeholder="Add a note…" rows={4} maxLength={2000}/></section>
    </div><aside className="session-aside panel"><h2>Session summary</h2><hr/><div className="split"><span>Recorded sets</span><strong>{workout.sets.length}</strong></div><div className="split"><span>Exercises</span><strong>{workout.day.exercises.length}</strong></div></aside></div>
    <div className="finish-bar panel"><div><strong>{workout.sets.length} sets recorded</strong></div><Button variant="primary" disabled={busy} onClick={finish}><Icon name="check"/>{busy ? 'Finishing…' : 'Finish workout'}</Button>{error && <p role="alert" className="field-error finish-error">{error}</p>}</div>
  </>;
}
