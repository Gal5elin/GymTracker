import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Workout } from '../data/workouts';
import { EmptyState, PageHeading } from './ui';
const formatDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function Progress({ workouts }: { workouts: Workout[] }) {
  const choices = [...new Map(workouts.flatMap((workout) => workout.day.exercises.map((exercise) => [exercise.id, exercise.name] as const))).entries()];
  const [exerciseId, setExerciseId] = useState(choices[0]?.[0] ?? '');
  const points = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).flatMap((workout) => {
    const weights = workout.sets.filter((set) => set.exerciseId === exerciseId && set.weight !== null).map((set) => set.weight!);
    return weights.length ? [{ label: formatDate(workout.startedAt), weight: Math.max(...weights), id: workout.id }] : [];
  });
  return <><PageHeading title="Your progress"/><section className="panel progress-panel"><div className="section-heading"><div><h2>Weight over time</h2><p className="muted small">Maximum recorded weight per completed workout</p></div><label className="select-field">Exercise<select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}><option value="" disabled>Choose an exercise</option>{choices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>{points.length ? <><div className="chart" role="img" aria-label={`Maximum weights for ${choices.find(([id]) => id === exerciseId)?.[1]}: ${points.map((p) => `${p.label}, ${p.weight} kg`).join('; ')}`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{ top: 25, right: 20, left: 0, bottom: 10 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e5e5e5"/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#737373', fontSize: 12 }}/><YAxis tickLine={false} axisLine={false} width={45} tick={{ fill: '#737373', fontSize: 12 }} unit=" kg"/><Tooltip contentStyle={{ borderRadius: 0, border: '1px solid #d4d4d4' }} formatter={(value) => [`${value} kg`, 'Max weight']}/><Area type="linear" dataKey="weight" stroke="#171717" strokeWidth={2} fill="#f0f0f0" dot={{ r: 4, fill: '#171717' }} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div></> : <EmptyState title="No progress data">Record a weight for this exercise in a completed workout to see it here.</EmptyState>}</section></>;
}

