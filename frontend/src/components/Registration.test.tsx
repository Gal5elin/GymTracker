// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Registration from './Registration';
import Root from '../Root';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ''; });
function fill() {
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: ' Test member ' } });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'member@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A-long-password-123!' } });
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'Create account' })); }

describe('Registration', () => {
  it('shows registration at the default route', () => {
    render(<Root/>);
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy();
  });
  it('validates inputs and focuses the first invalid field without submitting', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    render(<Registration/>); submit();
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByLabelText('Display name'));
    expect(fetch).not.toHaveBeenCalled();
    fill();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'invalid' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    submit();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('submits the API contract, prevents repeated submissions, and clears credentials on success', async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal('fetch', fetch);
    render(<Registration/>); fill(); submit();
    expect((screen.getByRole('button', { name: 'Creating account…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText('Display name').closest('form')!);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Test member', email: 'member@example.com', password: 'A-long-password-123!' }),
    });
    resolve({ status: 201 } as Response);
    expect(await screen.findByRole('heading', { name: 'Account created' })).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
  it('shows duplicate-email feedback and lets the user retry', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ status: 409 }).mockResolvedValueOnce({ status: 201 }); vi.stubGlobal('fetch', fetch);
    render(<Registration/>); fill(); submit();
    expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Email address'));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'another@example.com' } });
    submit();
    expect(await screen.findByText('Account created')).toBeTruthy();
  });
  it('displays server validation on the relevant field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 400, json: async () => ({ fields: { email: ['Invalid email address'] } }) }));
    render(<Registration/>); fill(); submit();
    expect(await screen.findByText('Invalid email address')).toBeTruthy();
    expect(screen.getByLabelText('Email address').getAttribute('aria-invalid')).toBe('true');
  });
  it.each(['network', 'server', 'malformed'])('handles %s failure and retains entered values', async (failure) => {
    const fetch = failure === 'network' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ status: failure === 'server' ? 500 : 400, json: async () => { throw new Error('invalid JSON'); } });
    vi.stubGlobal('fetch', fetch);
    render(<Registration/>); fill(); submit();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe('member@example.com');
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
