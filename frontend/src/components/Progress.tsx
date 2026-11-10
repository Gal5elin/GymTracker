import { useState } from 'react';
import ProgressChart from './ProgressChart';
import type { Workout } from '../data/workouts';
import { EmptyState, PageHeading } from './ui';
const formatDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function Progress({ workouts }: { workouts: Workout[] }) {
  const choices = [...new Map(workouts.flatMap((workout) => workout.day.exercises.map((exercise) => [exercise.id, exercise.name] as const))).entries()];
  const [exerciseId, setExerciseId] = useState(choices[0]?.[0] ?? '');
  const points = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).flatMap((workout) => {
    const weights = workout.sets.filter((set) => set.exerciseId === exerciseId && set.weight !== null).map((set) => set.weight!);
    return weights.length ? [{ label: formatDate(workout.startedAt), weight: Math.max(...weights), id: workout.id, date: new Date(workout.startedAt).toLocaleString('en-GB') }] : [];
  });
  return <><PageHeading title="Your progress"/><section className="panel progress-panel"><div className="section-heading"><div><h2>Weight over time</h2><p className="muted small">Maximum recorded weight per completed workout</p></div><label className="select-field">Exercise<select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}><option value="" disabled>Choose an exercise</option>{choices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>{points.length ? <><ProgressChart points={points} exerciseName={choices.find(([id]) => id === exerciseId)?.[1] ?? 'Exercise'}/></> : <EmptyState title="No progress data">Record a weight for this exercise in a completed workout to see it here.</EmptyState>}</section></>;
}

