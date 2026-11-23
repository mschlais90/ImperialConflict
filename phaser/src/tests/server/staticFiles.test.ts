import { request } from 'http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/gameServer';

// http.request sends the path verbatim (no "../" normalization), which is
// exactly what a hostile client can do with a raw socket.
function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('game server HTTP + socket hardening', () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    server = await startServer({ port: 0 });
  });

  afterAll(async () => {
    await server.close();
  });

  it.each([
    '/../package.json',
    '/../../package.json',
    '/%2e%2e/package.json',
    '/%2e%2e%2f%2e%2e%2fpackage.json',
    '/..%5c..%5cpackage.json',
  ])('does not serve files outside dist/ for %s', async (path) => {
    const res = await get(server.port, path);
    expect(res.body).not.toContain('"imperial-conflict-phaser"');
  });

  it('survives a request for a directory and a malformed escape', async () => {
    await get(server.port, '/assets');
    const bad = await get(server.port, '/%E0%A4%A');
    expect(bad.status).toBe(400);
    const health = await get(server.port, '/health');
    expect(health.status).toBe(200);
  });

  it('answers malformed socket messages with an error instead of acting on them', async () => {
    const ws = new WebSocket(server.url);
    await new Promise((resolve) => ws.once('open', resolve));
    const replies: Array<{ type: string; message?: string }> = [];
    ws.on('message', (data) => replies.push(JSON.parse(String(data))));

    ws.send('not json');
    ws.send(JSON.stringify({ type: 'create', playerName: 42, settings: {} }));
    ws.send(JSON.stringify({ type: 'join', roomCode: { $ne: 1 }, playerName: 'x' }));

    const start = Date.now();
    while (replies.length < 3 && Date.now() - start < 2000) await new Promise((r) => setTimeout(r, 10));
    ws.close();

    expect(replies.map((r) => r.type)).toEqual(['error', 'error', 'error']);
    expect(replies[1].message).toMatch(/Invalid message/);
  });
});
