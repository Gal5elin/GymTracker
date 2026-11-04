import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

const app = createApp('http://localhost:5173');
describe('API foundation', () => {
  it('reports health and allows the configured frontend', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  it('does not grant CORS access to other origins', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'https://other.example');
    expect(response.headers['access-control-allow-origin']).not.toBe('https://other.example');
  });
  it('returns a JSON 404', async () => {
    expect((await request(app).get('/missing')).status).toBe(404);
  });
  it('handles malformed JSON', async () => {
    const response = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid JSON' });
  });
});
