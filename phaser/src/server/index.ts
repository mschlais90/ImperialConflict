import { createServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage } from '../core/protocol/messages';
import { Room, generateRoomCode } from './room';
import { serializeState } from './stateSerializer';

const PORT = Number(process.env.PORT ?? 3001);

const rooms = new Map<string, Room>();

// Extend WebSocket with room tracking
interface TaggedSocket extends WebSocket {
  roomCode?: string;
}

function getRoom(ws: TaggedSocket): Room | undefined {
  return ws.roomCode ? rooms.get(ws.roomCode) : undefined;
}

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Imperial Conflict Game Server');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: TaggedSocket) => {
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

  ws.on('close', () => {
    const room = getRoom(ws);
    if (room) {
      room.removeClient(ws);
      if (room.isEmpty) {
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
  room.broadcastMessage({ type: 'playerJoined', player: { empireId: client.empireId, name: client.playerName, isHost: false } });
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

server.listen(PORT, () => {
  console.log(`Imperial Conflict server listening on port ${PORT}`);
});
