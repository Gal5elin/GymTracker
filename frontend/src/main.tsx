import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [status, setStatus] = useState('Connecting…');
  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
    fetch(`${apiUrl}/api/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('API unavailable');
        const body = await response.json();
        if (body.status !== 'ok') throw new Error('Unexpected API response');
        setStatus('Connected');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setStatus('Unable to connect. Check that the API is running.');
      });
    return () => controller.abort();
  }, []);
  return <main className="min-h-screen bg-slate-950 px-6 py-20 text-slate-100">
    <section className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8">
      <h1 className="text-3xl font-bold">GymTracker</h1>
      <p className="mt-3 text-slate-300">Your development environment is ready.</p>
      <p role="status" className="mt-6 text-sm text-emerald-300">API: {status}</p>
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
