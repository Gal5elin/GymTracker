// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import App from './App';
import { createMockWorkoutService } from './data/workouts';

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });
it('keeps sample programs and navigation in the explicit demo workspace', async () => {
  window.history.replaceState(null, '', '#demo/dashboard');
  render(<App service={createMockWorkoutService()}/>);
  expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(within(nav).getAllByRole('link').every(link => link.getAttribute('href')?.startsWith('#demo/'))).toBe(true);
  act(() => { window.history.replaceState(null, '', '#demo/programs'); window.dispatchEvent(new Event('hashchange')); });
  expect(screen.getByRole('heading', { name: 'My programs' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Build your foundation' })).toBeTruthy();
});
