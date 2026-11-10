// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createAuthClient } from '../api/auth';
import Programs from './Programs';
import Root from '../Root';
const user = { id: 'user-1', displayName: 'Member', email: 'member@example.com', role: 'MEMBER', isActive: true };
const program = { id: 'program-1', name: 'Strength', description: 'Three days' };
const day = { id: 'day-1', programId: program.id, dayNumber: 2, title: 'Upper body' };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
async function open(programs: typeof program[] = []) {
  const fetch = vi.fn().mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user })).mockResolvedValueOnce(ok({ programs }));
  vi.stubGlobal('fetch', fetch);
  const client = createAuthClient(); await client.login(user.email, 'password');
  const view = render(<Programs client={client}/>);
  await waitFor(() => expect(screen.queryByLabelText('Loading programs')).toBeNull());
  return { fetch, client, view };
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function click(name: string | RegExp) { fireEvent.click(screen.getByRole('button', { name })); }
async function detail(fetch: ReturnType<typeof vi.fn>, days = [day]) {
  fetch.mockResolvedValueOnce(ok({ program: { ...program, days } }));
  click(`View program: ${program.name}`);
  await screen.findByRole('heading', { name: program.name });
}

describe('connected program and day editor', () => {
  it('creates a program and a numbered day through authenticated API requests, then reloads saved data', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const { fetch, client, view } = await open();
    expect(screen.getByText('No programs yet')).toBeTruthy();
    expect(screen.queryByText('Build your foundation')).toBeNull();
    click('Create program'); change('Program name', '  Strength  '); change('Description (optional)', ' Three days ');
    fetch.mockResolvedValueOnce(ok({ program })).mockResolvedValueOnce(ok({ program: { ...program, days: [] } }));
    click('Save program');
    expect(await screen.findByText('No training days yet')).toBeTruthy();
    expect(fetch.mock.calls[2][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ name: 'Strength', description: 'Three days' }) });
    expect((fetch.mock.calls[2][1].headers as Headers).get('Authorization')).toBe('Bearer token');
    click('Add day'); change('Day title', ' Upper body '); change('Day number', '2');
    fetch.mockResolvedValueOnce(ok({ day })); click('Save day');
    expect(await screen.findByRole('heading', { name: 'Upper body' })).toBeTruthy();
    expect(fetch.mock.calls[4][0]).toContain(`/api/programs/${program.id}/days`);
    expect(fetch.mock.calls[4][1].body).toBe(JSON.stringify({ title: 'Upper body', dayNumber: 2 }));
    expect(storage).not.toHaveBeenCalled();
    view.unmount(); fetch.mockResolvedValueOnce(ok({ programs: [program] })); render(<Programs client={client}/>);
    await screen.findByRole('button', { name: 'View program: Strength' }); await detail(fetch);
    expect(screen.getByRole('heading', { name: 'Upper body' })).toBeTruthy();
  });
  it('updates a program, clears its optional description, and renumbers days into numeric order', async () => {
    const { fetch } = await open([program]);
    const later = { ...day, id: 'day-2', dayNumber: 10, title: 'Lower body' };
    await detail(fetch, [day, later]);
    click('Edit program'); change('Program name', 'Updated'); change('Description (optional)', '');
    fetch.mockResolvedValueOnce(ok({ program: { ...program, name: 'Updated', description: null } })); click('Save program');
    expect(await screen.findByRole('heading', { name: 'Updated' })).toBeTruthy();
    expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ name: 'Updated', description: null }) });
    click('Edit day 10: Lower body'); change('Day number', '1'); change('Day title', 'Full body');
    fetch.mockResolvedValueOnce(ok({ day: { ...later, dayNumber: 1, title: 'Full body' } })); click('Save day');
    await screen.findByRole('heading', { name: 'Full body' });
    expect(screen.getAllByRole('article').map(item => item.querySelector('h2')?.textContent)).toEqual(['Full body', 'Upper body']);
    expect(fetch.mock.calls.at(-1)?.[0]).toContain(`/api/programs/${program.id}/days/day-2`);
  });
  it('rejects blank names and duplicate day numbers without sending mutations', async () => {
    const { fetch } = await open([program]);
    click('Create program'); change('Program name', '   '); click('Save program');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Enter a program name.');
    expect(fetch).toHaveBeenCalledTimes(2);
    click('Cancel'); await detail(fetch);
    click('Add day'); change('Day title', 'Duplicate'); change('Day number', '2'); click('Save day');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'A day with this number already exists. Choose another number.');
    expect(fetch).toHaveBeenCalledTimes(3);
    change('Day title', '  '); change('Day number', '3'); click('Save day');
    expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Enter a day title.');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('preserves day input on a server-side duplicate conflict and supports retry', async () => {
    const { fetch } = await open([program]); await detail(fetch, []);
    click('Add day'); change('Day title', 'Upper body');
    fetch.mockResolvedValueOnce({ ok: false, status: 409 }); click('Save day');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'A day with this number already exists. Choose another number.');
    expect((screen.getByLabelText('Day title') as HTMLInputElement).value).toBe('Upper body');
    change('Day number', '2'); fetch.mockResolvedValueOnce(ok({ day })); click('Save day');
    expect(await screen.findByRole('heading', { name: 'Upper body' })).toBeTruthy();
  });
  it.each([403, 404])('shows denied or missing program feedback for status %s', async status => {
    const { fetch } = await open([program]);
    fetch.mockResolvedValueOnce({ ok: false, status }); click('View program: Strength');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(status === 403 ? 'permission' : 'no longer available');
    expect(screen.queryByRole('button', { name: 'Edit program' })).toBeNull();
    fetch.mockResolvedValueOnce(ok({ programs: [program] })); click('← All programs');
    expect(await screen.findByRole('button', { name: 'View program: Strength' })).toBeTruthy();
  });
  it('shows denied edit feedback without losing the draft', async () => {
    const { fetch } = await open([program]); await detail(fetch);
    click('Edit program'); change('Program name', 'My draft');
    fetch.mockResolvedValueOnce({ ok: false, status: 403 }); click('Save program');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'You do not have permission to view or edit this program.');
    expect((screen.getByLabelText('Program name') as HTMLInputElement).value).toBe('My draft');
  });
  it('retries a failed list load and a failed save', async () => {
    const { fetch } = await open([program]);
    await detail(fetch); fetch.mockRejectedValueOnce(new Error('offline')); click('← All programs');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not connect. Please try again.');
    fetch.mockResolvedValueOnce(ok({ programs: [] })); click('Try again');
    await screen.findByText('No programs yet'); click('Create program'); change('Program name', 'Draft');
    fetch.mockResolvedValueOnce({ ok: false, status: 500 }); click('Save program');
    await screen.findByRole('alert'); expect((screen.getByLabelText('Program name') as HTMLInputElement).value).toBe('Draft');
    fetch.mockResolvedValueOnce(ok({ program })).mockResolvedValueOnce(ok({ program: { ...program, days: [] } })); click('Save program');
    expect(await screen.findByText('No training days yet')).toBeTruthy();
  });
  it('prevents duplicate submissions and aborts pending mutations when unmounted', async () => {
    const { fetch, view } = await open(); click('Create program'); change('Program name', 'Draft');
    let resolve!: (value: unknown) => void;
    fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    click('Save program'); fireEvent.submit(screen.getByRole('form', { name: 'Program editor' }));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true);
    const signal = fetch.mock.calls[2][1].signal as AbortSignal;
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => { resolve(ok({ program })); });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each(['MEMBER', 'TRAINER'])('opens the editor from the authenticated %s workspace', async role => {
    const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(ok(url.endsWith('/login') ? { accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user: { ...user, role } } : url.endsWith('/me') ? { user: { ...user, role } } : { programs: [] })));
    vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login(user.email, 'password');
    window.history.replaceState(null, '', '#programs'); render(<Root client={client}/>);
    expect(await screen.findByText('No programs yet')).toBeTruthy(); click('Create program');
    expect(screen.getByRole('form', { name: 'Program editor' })).toBeTruthy();
  });
});

it('allows editing a day without changing its number and rejects invalid numbers before submission', async () => {
  const { fetch } = await open([program]); await detail(fetch);
  click('Edit day 2: Upper body'); change('Day title', 'Updated day');
  fetch.mockResolvedValueOnce(ok({ day: { ...day, title: 'Updated day' } })); click('Save day');
  await screen.findByRole('heading', { name: 'Updated day' });
  click('Add day'); change('Day title', 'Another day');
  const calls = fetch.mock.calls.length;
  for (const number of ['0', '-1', '1.5', '2147483648']) {
    change('Day number', number);
    fireEvent.submit(screen.getByRole('form', { name: 'Day editor' }));
    expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Enter a positive whole day number.');
    expect(fetch).toHaveBeenCalledTimes(calls);
  }
});
