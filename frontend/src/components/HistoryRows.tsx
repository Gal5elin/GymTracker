import { Icon } from './ui';
export function workoutDate(value: string) { return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
export function workoutDuration(start: string, end: string | null | undefined) {
  if (!end) return 'Unavailable';
  const minutes = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? `${Math.max(1, Math.round(minutes))} min` : 'Unavailable';
}
interface HistoryRow { id: string; startedAt: string; finishedAt?: string | null; title: string; programName: string; setCount: number; href?: string }
export default function HistoryRows({ rows, onOpen }: { rows: HistoryRow[]; onOpen?: (id: string) => void }) {
  return <div className="history-list panel"><div className="history-head"><span>Session</span><span>Recorded</span><span>Duration</span><span/></div>{rows.map(row => {
    const content = <><div className="history-title"><span className="date-tile"><strong>{new Date(row.startedAt).getDate()}</strong><span>{new Date(row.startedAt).toLocaleDateString('en', { month: 'short' })}</span></span><span><strong>{row.title}</strong><small>{row.programName} · {workoutDate(row.startedAt)}</small></span></div><span className="history-sets">{row.setCount} {row.setCount === 1 ? 'set' : 'sets'}</span><span className="history-duration">{workoutDuration(row.startedAt, row.finishedAt)}</span><Icon name="chevron" size={17}/></>;
    const label = `View workout: ${row.title}, ${workoutDate(row.startedAt)}`;
    return row.href ? <a className="history-row" key={row.id} href={row.href} aria-label={label}>{content}</a> : <button className="history-row" key={row.id} onClick={() => onOpen?.(row.id)} aria-label={label}>{content}</button>;
  })}</div>;
}
