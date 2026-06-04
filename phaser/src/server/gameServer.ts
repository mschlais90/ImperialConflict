import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { AddressInfo } from 'net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage } from '../core/protocol/messages';
import { Room, generateRoomCode } from './room';
import { serializeState } from './stateSerializer';

const DIST_DIR = join(import.meta.dirname, '../../dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Extend WebSocket with room tracking and heartbeat
interface TaggedSocket extends WebSocket {
  roomCode?: string;
  isAlive?: boolean;
}

export interface RunningServer {
  /** The port the server is actually listening on (resolved even when started with port 0). */
  port: number;
  /** WebSocket URL clients should connect to, e.g. ws://127.0.0.1:3001 */
  url: string;
  /** Shut down the heartbeat, all sockets, and the HTTP/WS servers. */
  close: () => Promise<void>;
}

export interface StartServerOptions {
  /** Port to listen on. Pass 0 for an ephemeral port (used in tests). Defaults to PORT env or 3001. */
  port?: number;
}

export function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const port = options.port ?? Number(process.env.PORT ?? 3001);
  const startTime = new Date().toISOString();
  const rooms = new Map<string, Room>();

  const getRoom = (ws: TaggedSocket): Room | undefined =>
    ws.roomCode ? rooms.get(ws.roomCode) : undefined;

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    const pathname = url.split('?')[0];

    // Keep-alive endpoint to prevent Render free tier from spinning down
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }

    // Serve static files from dist/
    const filePath = join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);

    if (existsSync(filePath)) {
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      const content = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } else {
      // SPA fallback: serve index.html for non-file routes
      const indexPath = join(DIST_DIR, 'index.html');
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Imperial Conflict Game Server (no client build found — run npm run build)');
      }
    }
  });

  // Compress messages on the wire. Tick deltas and the initial full-state
  // payload are highly repetitive JSON, so deflate shrinks them substantially.
  const wss = new WebSocketServer({ server, perMessageDeflate: true });

  function handleCreate(ws: TaggedSocket, message: Extract<ClientMessage, { type: 'create' }>): void {
    let roomCode = generateRoomCode();
    while (rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const room = new Room(roomCode);
    rooms.set(roomCode, room);

    const client = room.addClient(ws, message.playerName, true);
    if (!client) {
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to create room.' }));
      return;
    }

    ws.roomCode = roomCode;
    console.log(`[ROOM] Room ${roomCode} created by "${message.playerName}"`);
    ws.send(JSON.stringify({ type: 'roomCreated', roomCode }));
    ws.send(JSON.stringify({ type: 'joined', empireId: client.empireId, players: room.getPlayerInfoList() }));
  }

  function handleJoin(ws: TaggedSocket, message: Extract<ClientMessage, { type: 'join' }>): void {
    const room = rooms.get(message.roomCode.toUpperCase());
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found.' }));
      return;
    }

    if (room.isStarted) {
      // Try to reconnect by matching player name to a disconnected slot
      const slot = room.findDisconnectedSlot(message.playerName);
      if (slot) {
        handleReconnect(ws, { type: 'reconnect', roomCode: message.roomCode, empireId: slot.empireId });
        return;
      }
      ws.send(JSON.stringify({ type: 'error', message: 'Game already in progress.' }));
      return;
    }

    const client = room.addClient(ws, message.playerName, false);
    if (!client) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room is full.' }));
      return;
    }

    ws.roomCode = room.roomCode;
    ws.send(JSON.stringify({ type: 'joined', empireId: client.empireId, players: room.getPlayerInfoList() }));
    room.broadcastMessage({ type: 'playerJoined', player: { empireId: client.empireId, name: client.playerName, isHost: false, color: room.getPlayerColor(client.empireId) } }, ws);
  }

  function handleReconnect(ws: TaggedSocket, message: Extract<ClientMessage, { type: 'reconnect' }>): void {
    const room = rooms.get(message.roomCode.toUpperCase());
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found.' }));
      return;
    }

    if (!room.isStarted) {
      ws.send(JSON.stringify({ type: 'error', message: 'Game not started.' }));
      return;
    }

    const client = room.reconnectClient(ws, message.empireId);
    if (!client) {
      ws.send(JSON.stringify({ type: 'error', message: 'Cannot reconnect to this empire.' }));
      return;
    }

    ws.roomCode = room.roomCode;

    const state = room.gameState;
    if (state) {
      ws.send(JSON.stringify({ type: 'reconnected', empireId: client.empireId, state: serializeState(state) }));
      room.broadcastMessage({ type: 'playerReconnected', empireId: client.empireId });
    }
  }

  wss.on('connection', (ws: TaggedSocket) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      switch (message.type) {
        case 'create':
          handleCreate(ws, message);
          break;
        case 'join':
          handleJoin(ws, message);
          break;
        case 'reconnect':
          handleReconnect(ws, message);
          break;
        default: {
          const room = getRoom(ws);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not in a room.' }));
            return;
          }
          room.handleMessage(ws, message);
        }
      }
    });

    ws.on('close', (code) => {
      const room = getRoom(ws);
      if (room) {
        console.log(`[DISCONNECT] Client left room ${room.roomCode} (code: ${code})`);
        room.removeClient(ws);
        if (room.isEmpty) {
          console.log(`[ROOM] Room ${room.roomCode} empty — destroyed`);
          room.stop();
          rooms.delete(room.roomCode);
        }
      }
    });
  });

  // Heartbeat: ping all clients every 30s, terminate unresponsive ones.
  // unref() so the interval never keeps the Node process (or a test runner) alive.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const tagged = ws as TaggedSocket;
      if (tagged.isAlive === false) {
        tagged.terminate();
        continue;
      }
      tagged.isAlive = false;
      tagged.ping();
    }
  }, 30_000);
  heartbeat.unref?.();

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      clearInterval(heartbeat);
      for (const room of rooms.values()) room.stop();
      rooms.clear();
      for (const ws of wss.clients) ws.terminate();
      wss.close(() => server.close(() => resolve()));
    });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      const actualPort = (server.address() as AddressInfo).port;
      console.log(`Imperial Conflict server listening on port ${actualPort} (started ${startTime})`);
      resolve({
        port: actualPort,
        url: `ws://127.0.0.1:${actualPort}`,
        close,
      });
    });
  });
}
