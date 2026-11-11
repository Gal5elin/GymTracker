import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthClient } from '../api/auth';
import { createHistoryApi, type HistoryDetail, type HistorySummary } from '../api/history';
import HistoryRows, { workoutDate, workoutDuration } from './HistoryRows';
import { Badge, Button, EmptyState, Icon, PageHeading } from './ui';

function CompletedDetail({ workout }: { workout: HistoryDetail }) {
  const count = workout.exercises.reduce((sum, entry) => sum + entry.sets.length, 0);
  return <>
    <PageHeading eyebrow="Workout complete" title={workout.day?.title ?? 'Completed workout'} description={`${workout.program?.name ?? 'Saved program unavailable'} · ${workoutDate(workout.startedAt)}`} action={<Badge dark>Completed</Badge>}/>
    {!workout.snapshotAvailable && <p className="notice">Original program and exercise names are unavailable. Saved results are shown below.</p>}
    <div className="stats-grid summary-stats">{[['Recorded sets', count], ['Exercises recorded', workout.exercises.length], ['Session duration', workoutDuration(workout.startedAt, workout.finishedAt)]].map(([label, value]) => <div className="stat panel" key={label}><span className="eyebrow">{label}</span><strong>{value}</strong></div>)}</div>
    <div className="summary-exercises">{[...workout.exercises].sort((a, b) => a.exercisePosition - b.exercisePosition).map(entry => <section className="panel summary-exercise" key={`${entry.exercisePosition}-${entry.exerciseId}`} aria-label={`${entry.name ?? 'Exercise'}, position ${entry.exercisePosition}`}>
      <div className="section-heading"><div><span className="eyebrow">Exercise {entry.exercisePosition}{entry.equipment ? ` · ${entry.equipment}` : ''}</span><h2>{entry.name ?? `Exercise ${entry.exercisePosition}`}</h2>{entry.muscleGroup && <p className="muted small">{entry.muscleGroup}</p>}</div><Badge>{entry.sets.length} {entry.sets.length === 1 ? 'set' : 'sets'}</Badge></div>
      <div className="recorded-sets">{[...entry.sets].sort((a, b) => a.setNumber - b.setNumber).map(set => <div key={set.id}><span className="muted">Set {set.setNumber}</span><strong>{set.reps} reps</strong><span>{set.weightKg === null ? 'No weight recorded' : `${set.weightKg} kg`}</span><Icon name="check" size={16}/></div>)}</div>
    </section>)}</div>
    {!workout.exercises.length && <div className="panel"><EmptyState title="No saved sets">No performed sets were recorded for this workout.</EmptyState></div>}
    <section className="panel notes-panel"><h2>Session notes</h2><p className="saved-notes">{workout.notes || 'No notes added.'}</p>{workout.finishedAt && <p>Finished <time dateTime={workout.finishedAt}>{new Date(workout.finishedAt).toLocaleString()}</time></p>}</section>
  </>;
}
export default function History({ client, sessionId, routeBase = '#history', readOnly = false }: { client: AuthClient; sessionId?: string; routeBase?: string; readOnly?: boolean }) {
  const api = useMemo(() => createHistoryApi(client), [client]);
  const [rows, setRows] = useState<HistorySummary[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true), [more, setMore] = useState(false);
  const [error, setError] = useState(''), [pageError, setPageError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const listReady = useRef(false), pageBusy = useRef(false), pageRequest = useRef<AbortController | null>(null);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.querySelector<HTMLElement>('h1')?.focus(); }, [sessionId, loading]);
  useEffect(() => {
    const controller = new AbortController(); pageRequest.current?.abort(); setMore(false); setError(''); setPageError(''); setDetail(null);
    if (!readOnly && !sessionId && listReady.current) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    (async () => {
      try {
        if (sessionId) { const data = await api.detail(sessionId, controller.signal); if (!controller.signal.aborted) setDetail(data); }
        else { const data = await api.list(controller.signal); if (!controller.signal.aborted) { setRows(data.workouts); setCursor(data.nextCursor); listReady.current = true; } }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load history.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); pageRequest.current?.abort(); };
  }, [api, sessionId, attempt, readOnly]);
  async function loadMore() {
    if (pageBusy.current || !cursor) return;
    pageBusy.current = true; setMore(true); setPageError('');
    const controller = new AbortController(); pageRequest.current = controller;
    try {
      const data = await api.list(controller.signal, cursor);
      if (!controller.signal.aborted) { setRows(current => [...current, ...data.workouts.filter(row => !current.some(item => item.id === row.id))]); setCursor(data.nextCursor); }
    } catch (failure) { if (!controller.signal.aborted) setPageError(failure instanceof Error ? failure.message : 'Could not load more history.'); }
    finally { pageBusy.current = false; if (!controller.signal.aborted) setMore(false); }
  }
  return <div ref={heading}>
    {sessionId && <a href={routeBase} className="button button-ghost back-link">← Back to history</a>}
    {sessionId && detail?.id === sessionId && !loading && !error ? <CompletedDetail workout={detail}/> : <>
      <PageHeading title="History" description={readOnly ? 'Completed workouts and saved results. Read-only access.' : sessionId ? 'Your saved workout results.' : 'Review your completed workouts.'} action={!readOnly && !sessionId && <a href="#workout" className="button button-primary">Start workout</a>}/>
      {loading ? <div className="panel program-editor" aria-busy="true" aria-label="Loading history"><div className="session-skeleton"/><div className="session-skeleton short"/></div>
        : error ? <div className="panel program-editor"><p role="alert" className="field-error">{error}</p><Button onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
        : !sessionId && <>
          {rows.length ? <HistoryRows rows={rows.map(row => ({ ...row, title: row.day?.title ?? 'Workout', programName: row.program?.name ?? 'Saved program unavailable', href: `${routeBase}/${row.id}` }))}/> : <div className="panel"><EmptyState title="No completed workouts" action={!readOnly && <a href="#workout" className="button button-primary">Choose a workout</a>}>Completed workouts will appear here after they are finished.</EmptyState></div>}
          {pageError && <p className="field-error" role="alert">{pageError}</p>}
          {cursor && <Button className="history-more" disabled={more} onClick={() => { void loadMore(); }}>{more ? 'Loading more…' : pageError ? 'Retry loading more' : 'Load more workouts'}</Button>}
          {rows.length > 0 && <Button variant="ghost" disabled={more} onClick={() => { listReady.current = false; setAttempt(value => value + 1); }}>Refresh history</Button>}
        </>}
    </>}
  </div>;
}
