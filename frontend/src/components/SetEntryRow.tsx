import { useEffect, useId, useRef, useState } from 'react';
import { Button, Icon } from './ui';

export interface SavedSetValues { reps: number; weight: number | string | null }
export default function SetEntryRow({ label, number, targetReps, targetWeight, saved, disabled = false, initialReps = '', initialWeight = '', onSave }: {
  label: string; number: number; targetReps: number; targetWeight: number | string | null;
  saved?: SavedSetValues; disabled?: boolean; initialReps?: string; initialWeight?: string;
  onSave: (reps: number, weight: number | null, signal: AbortSignal) => Promise<void>;
}) {
  const [reps, setReps] = useState(initialReps), [weight, setWeight] = useState(initialWeight);
  const [error, setError] = useState(''), [pending, setPending] = useState(false);
  const busy = useRef(false), controller = useRef<AbortController | null>(null);
  const errorId = useId();
  useEffect(() => () => controller.current?.abort(), []);
  async function save() {
    if (busy.current || saved || disabled) return;
    const actualReps = Number(reps), value = weight.trim();
    if (!reps.trim() || !Number.isInteger(actualReps) || actualReps < 1 || actualReps > 2147483647) { setError('Enter a positive whole number of reps.'); return; }
    if (value && (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value) || Number(value) > 9999.99)) { setError('Weight must be 0–9999.99 kg with at most two decimal places.'); return; }
    busy.current = true; setPending(true); setError('');
    const request = new AbortController(); controller.current = request;
    try { await onSave(actualReps, value ? Number(value) : null, request.signal); }
    catch (failure) { if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not save this set. Please try again.'); }
    finally { if (!request.signal.aborted) { busy.current = false; setPending(false); } }
  }
  const locked = !!saved || disabled || pending;
  return <div className={`set-row ${saved ? 'set-saved' : ''}`}>
    <span className="set-number">{String(number).padStart(2, '0')}</span>
    <span className="set-target">{targetReps} × {targetWeight === null ? '—' : `${targetWeight} kg`}</span>
    <label className="number-field"><span className="sr-only">Reps for {label}, set {number}</span><input type="number" inputMode="numeric" min={1} max={2147483647} step={1} value={saved ? saved.reps : reps} disabled={locked} onChange={event => { setReps(event.target.value); setError(''); }} aria-invalid={!saved && !!error} aria-describedby={!saved && error ? errorId : undefined}/></label>
    <label className="number-field"><span className="sr-only">Weight in kg for {label}, set {number}</span><input type="number" inputMode="decimal" min={0} max={9999.99} step="0.01" placeholder="—" value={saved ? saved.weight ?? '' : weight} disabled={locked} onChange={event => { setWeight(event.target.value); setError(''); }} aria-invalid={!saved && !!error} aria-describedby={!saved && error ? errorId : undefined}/></label>
    <Button className="save-set" variant={saved ? 'ghost' : 'secondary'} disabled={locked} onClick={() => { void save(); }} aria-label={saved ? `Set ${number} of ${label} saved` : `Save set ${number} of ${label}`}><Icon name="check" size={16}/><span>{saved ? 'Saved' : pending ? 'Saving…' : 'Save'}</span></Button>
    {!saved && error && <p id={errorId} className="field-error" role="alert">{error}</p>}
  </div>;
}
