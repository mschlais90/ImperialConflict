import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage } from '../core/protocol/messages';
import { Room, generateRoomCode } from './room';
import { serializeState } from './stateSerializer';

const PORT = Number(process.env.PORT ?? 3001);
const DIST_DIR = join(import.meta.dirname, '../../dist');
const START_TIME = new Date().toISOString();

const rooms = new Map<string, Room>();

// Log crashes and shutdowns so we can diagnose disconnects in Render logs
process.on('uncaughtException', (err) => {
  console.error(`[CRASH] Uncaught exception at ${new Date().toISOString()}:`, err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error(`[CRASH] Unhandled rejection at ${new Date().toISOString()}:`, reason);
});
process.on('SIGTERM', () => {
  console.log(`[SHUTDOWN] SIGTERM received at ${new Date().toISOString()} — server started at ${START_TIME}, active rooms: ${rooms.size}`);
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log(`[SHUTDOWN] SIGINT received at ${new Date().toISOString()}`);
  process.exit(0);
});

// Extend WebSocket with room tracking and heartbeat
interface TaggedSocket extends WebSocket {
  roomCode?: string;
  isAlive?: boolean;
}

function getRoom(ws: TaggedSocket): Room | undefined {
  return ws.roomCode ? rooms.get(ws.roomCode) : undefined;
}

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

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  const pathname = url.split('?')[0];

  // Serve static files from dist/
  let filePath = join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);

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

const wss = new WebSocketServer({ server });

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

// Heartbeat: ping all clients every 30s, terminate unresponsive ones
setInterval(() => {
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

server.listen(PORT, () => {
  console.log(`Imperial Conflict server listening on port ${PORT}`);
  console.log(`Serving client from ${DIST_DIR}`);
});
