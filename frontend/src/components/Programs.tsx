import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { AuthClient } from '../api/auth';
import { createProgramsApi, type Program, type ProgramDay, type ProgramDetail } from '../api/programs';
import ExercisePlanner from './ExercisePlanner';
import ProgramCard from './ProgramCard';
import { Badge, Button, EmptyState, Icon, PageHeading } from './ui';

type ProgramsApi = ReturnType<typeof createProgramsApi>;
const message = (failure: unknown) => failure instanceof Error ? failure.message : 'Please try again.';

function EditorForm({ api, program, day, days = [], onSave, onCancel }: {
  api: ProgramsApi; program: Program | null; day?: ProgramDay | null; days?: ProgramDay[];
  onSave: (value: Program | ProgramDay) => void; onCancel: () => void;
}) {
  const isDay = day !== undefined;
  const [name, setName] = useState(isDay ? day?.title ?? '' : program?.name ?? '');
  const [description, setDescription] = useState(program?.description ?? '');
  const [number, setNumber] = useState(String(day?.dayNumber ?? Math.max(0, ...days.map(item => item.dayNumber)) + 1));
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    if (!name.trim()) { setError(isDay ? 'Enter a day title.' : 'Enter a program name.'); return; }
    const dayNumber = Number(number);
    if (isDay && (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 2147483647)) { setError('Enter a positive whole day number.'); return; }
    if (isDay && days.some(item => item.id !== day?.id && item.dayNumber === dayNumber)) { setError('A day with this number already exists. Choose another number.'); return; }
    busy.current = true; setPending(true); setError('');
    const request = new AbortController(); controller.current = request;
    try {
      const value = isDay
        ? (await api.saveDay(program!.id, day?.id ?? null, { title: name.trim(), dayNumber }, request.signal)).day
        : (await api.save(program?.id ?? null, { name: name.trim(), description: description.trim() || null }, request.signal)).program;
      if (!request.signal.aborted) onSave(value);
    } catch (failure) { if (!request.signal.aborted) setError(message(failure)); }
    finally { if (!request.signal.aborted) { busy.current = false; setPending(false); } }
  }
  return <form className="panel program-editor" onSubmit={submit} aria-label={isDay ? 'Day editor' : 'Program editor'} aria-busy={pending}>
    <h2>{isDay ? day ? 'Edit day' : 'Add day' : program ? 'Edit program' : 'Create program'}</h2>
    <fieldset disabled={pending}>
      <div className="registration-field"><label htmlFor="editor-name">{isDay ? 'Day title' : 'Program name'}</label><input id="editor-name" value={name} required maxLength={isDay ? 100 : 200} onChange={event => { setName(event.target.value); setError(''); }}/></div>
      {isDay ? <div className="registration-field"><label htmlFor="editor-number">Day number</label><input id="editor-number" type="number" min={1} max={2147483647} step={1} required value={number} onChange={event => { setNumber(event.target.value); setError(''); }}/></div>
        : <div className="registration-field"><label htmlFor="editor-description">Description (optional)</label><textarea id="editor-description" maxLength={5000} value={description} onChange={event => setDescription(event.target.value)}/></div>}
      <div className="editor-actions"><Button variant="primary" type="submit" disabled={pending}>{pending ? 'Saving…' : isDay ? 'Save day' : 'Save program'}</Button><Button type="button" onClick={onCancel}>Cancel</Button></div>
    </fieldset>
    {error && <p className="field-error" role="alert">{error}</p>}
  </form>;
}

export default function Programs({ client }: { client: AuthClient }) {
  const api = useMemo(() => createProgramsApi(client), [client]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProgramDetail | null>(null);
  const [exerciseDay, setExerciseDay] = useState<string | null>(null);
  const [editor, setEditor] = useState<'program' | 'day' | null>(null);
  const [editingDay, setEditingDay] = useState<ProgramDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [selected, editor, detail?.id]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setDetail(null);
    (async () => {
      try {
        if (selected) { const data = await api.get(selected, controller.signal); if (!controller.signal.aborted) setDetail(data.program); }
        else { const data = await api.list(controller.signal); if (!controller.signal.aborted) setPrograms(data.programs); }
      } catch (failure) { if (!controller.signal.aborted) setError(message(failure)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [api, selected, attempt]);
  function saveProgram(value: Program | ProgramDay) {
    const program = value as Program;
    setPrograms(current => [program, ...current.filter(item => item.id !== program.id)]);
    if (detail) setDetail({ ...detail, ...program });
    setEditor(null); setNotice(selected ? 'Program saved.' : 'Program created.');
    if (!selected) setSelected(program.id);
  }
  function saveDay(value: Program | ProgramDay) {
    const day = value as ProgramDay;
    setDetail(current => current ? { ...current, days: [...current.days.filter(item => item.id !== day.id), { ...current.days.find(item => item.id === day.id), ...day }].sort((a, b) => a.dayNumber - b.dayNumber) } : current);
    setEditor(null); setNotice('Day saved.');
  }
  function back() { setSelected(null); setEditor(null); setNotice(''); }
  if (detail && exerciseDay) {
    const day = detail.days.find(item => item.id === exerciseDay);
    if (day) return <ExercisePlanner key={day.id} client={client} programId={detail.id} day={day} onBack={() => setExerciseDay(null)} onChange={exercises => setDetail(current => current ? { ...current, days: current.days.map(item => item.id === day.id ? { ...item, exercises } : item) } : current)}/>;
  }
  return <>
    {selected && <Button variant="ghost" className="back-link" onClick={back}>← All programs</Button>}
    <div ref={heading} tabIndex={-1}><PageHeading title={detail?.name ?? 'My programs'} description={detail?.description ?? (selected ? undefined : 'Build your training plan, one day at a time.')} action={!loading && !error && !editor ? <Button variant="primary" onClick={() => { setEditor('program'); setNotice(''); }}>{selected ? 'Edit program' : 'Create program'}<Icon name="plus" size={16}/></Button> : undefined}/></div>
    {notice && <p role="status" className="notice">{notice}</p>}
    {loading ? <div className="panel program-editor" aria-busy="true" aria-label="Loading programs"><div className="session-skeleton"/><div className="session-skeleton short"/></div>
      : error ? <div className="panel program-editor"><p role="alert" className="field-error">{error}</p><Button onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
      : editor ? <EditorForm key={`${selected}-${editor}-${editingDay?.id}`} api={api} program={detail} {...(editor === 'day' ? { day: editingDay, days: detail?.days } : {})} onSave={editor === 'day' ? saveDay : saveProgram} onCancel={() => setEditor(null)}/>
      : detail ? <>
        <div className="section-heading"><h2>Training days <span className="count">{detail.days.length}</span></h2><Button onClick={() => { setEditingDay(null); setEditor('day'); setNotice(''); }}>Add day<Icon name="plus" size={16}/></Button></div>
        {detail.days.length ? <div className="day-grid">{detail.days.map(day => <article className="panel day-card" key={day.id}><Badge>Day {day.dayNumber}</Badge><h2>{day.title}</h2><p className="muted">{day.exercises?.length ?? 0} planned {day.exercises?.length === 1 ? 'exercise' : 'exercises'}</p><Button aria-label={`Plan exercises for day ${day.dayNumber}: ${day.title}`} onClick={() => setExerciseDay(day.id)}>Plan exercises<Icon name="workout" size={16}/></Button><Button onClick={() => { setEditingDay(day); setEditor('day'); setNotice(''); }} aria-label={`Edit day ${day.dayNumber}: ${day.title}`}>Edit day<Icon name="arrow" size={16}/></Button></article>)}</div>
          : <div className="panel"><EmptyState title="No training days yet">Add your first day to organize this program.</EmptyState></div>}
      </> : programs.length ? <div className="program-grid">{programs.map(program => <ProgramCard key={program.id} name={program.name} description={program.description} onOpen={() => { setSelected(program.id); setNotice(''); }}/>)}</div>
        : <div className="panel"><EmptyState title="No programs yet">Create your first program to start planning your training.</EmptyState></div>}
  </>;
}
