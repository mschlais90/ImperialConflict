import type { WebSocket } from 'ws';
import { createNewGame } from '../core/engines/gameManager';
import { advanceTick, setSpeed, SPEEDS } from '../core/engines/tickEngine';
import type { GameSpeed } from '../core/events/eventLog';
import type { GameState } from '../core/galaxy/galaxyData';
import type { ClientMessage, PlayerInfo, SerializedCommand, ServerMessage } from '../core/protocol/messages';
import { executeCommand } from './commandHandler';
import { serializeState } from './stateSerializer';

const TICK_INTERVAL_MS = 2000;
const MAX_PLAYERS = 6;
const ROOM_CODE_LENGTH = 6;

export interface ConnectedClient {
  ws: WebSocket;
  empireId: number;
  playerName: string;
  isHost: boolean;
}

// Tracks empire assignment even after disconnect
interface EmpireSlot {
  empireId: number;
  playerName: string;
  isHost: boolean;
  connected: boolean;
}

export class Room {
  readonly roomCode: string;
  private clients: ConnectedClient[] = [];
  private empireSlots: EmpireSlot[] = [];
  private state: GameState | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private autoPauseOnDisconnect = true;

  constructor(roomCode: string) {
    this.roomCode = roomCode;
  }

  get playerCount(): number {
    return this.clients.length;
  }

  get isStarted(): boolean {
    return this.started;
  }

  get gameState(): GameState | null {
    return this.state;
  }

  get isEmpty(): boolean {
    return this.clients.length === 0 && (!this.started || this.empireSlots.every((s) => !s.connected));
  }

  addClient(ws: WebSocket, playerName: string, isHost: boolean): ConnectedClient | null {
    if (this.clients.length >= MAX_PLAYERS) return null;
    if (this.started) return null;

    const empireId = this.clients.length;
    const client: ConnectedClient = { ws, empireId, playerName, isHost };
    this.clients.push(client);
    this.empireSlots.push({ empireId, playerName, isHost, connected: true });
    return client;
  }

  reconnectClient(ws: WebSocket, empireId: number): ConnectedClient | null {
    if (!this.started) return null;

    const slot = this.empireSlots.find((s) => s.empireId === empireId);
    if (!slot || slot.connected) return null;

    // Restore empire to human control
    if (this.state) {
      const empire = this.state.empires[empireId];
      if (empire) {
        empire.controllerType = 'human';
      }
    }

    slot.connected = true;
    const client: ConnectedClient = {
      ws,
      empireId,
      playerName: slot.playerName,
      isHost: slot.isHost,
    };
    this.clients.push(client);
    return client;
  }

  removeClient(ws: WebSocket): void {
    const index = this.clients.findIndex((c) => c.ws === ws);
    if (index < 0) return;

    const removed = this.clients[index];
    this.clients.splice(index, 1);

    if (this.started) {
      // Mark slot as disconnected, convert empire to AI
      const slot = this.empireSlots.find((s) => s.empireId === removed.empireId);
      if (slot) {
        slot.connected = false;
      }

      if (this.state) {
        const empire = this.state.empires[removed.empireId];
        if (empire) {
          empire.controllerType = 'ai';
          // Ensure AI controller state exists
          if (!this.state.aiControllers[removed.empireId]) {
            this.state.aiControllers[removed.empireId] = {
              empireId: removed.empireId,
              recentAttacks: {},
            };
          }
        }
      }

      this.broadcast({ type: 'playerLeft', empireId: removed.empireId });

      // Auto-pause when a player disconnects
      if (this.autoPauseOnDisconnect && this.state && this.state.currentSpeed !== SPEEDS.PAUSED) {
        setSpeed(this.state, SPEEDS.PAUSED);
        this.broadcast({
          type: 'chat',
          empireId: -1,
          playerName: 'Server',
          text: `${removed.playerName} disconnected. Game paused.`,
        });
      }

      // If host left, promote next connected client
      if (removed.isHost) {
        const nextClient = this.clients[0];
        if (nextClient) {
          nextClient.isHost = true;
          const nextSlot = this.empireSlots.find((s) => s.empireId === nextClient.empireId);
          if (nextSlot) nextSlot.isHost = true;
        }
      }

      // If all human players disconnected, stop the room
      if (this.clients.length === 0) {
        this.stop();
      }
    } else {
      // Pre-game: remove the slot entirely
      const slotIdx = this.empireSlots.findIndex((s) => s.empireId === removed.empireId);
      if (slotIdx >= 0) this.empireSlots.splice(slotIdx, 1);

      if (this.clients.length === 0) {
        this.stop();
        return;
      }

      this.broadcast({ type: 'playerLeft', empireId: removed.empireId });

      if (removed.isHost && this.clients.length > 0) {
        this.clients[0].isHost = true;
        const nextSlot = this.empireSlots.find((s) => s.empireId === this.clients[0].empireId);
        if (nextSlot) nextSlot.isHost = true;
      }
    }
  }

  getPlayerInfoList(): PlayerInfo[] {
    return this.empireSlots
      .filter((s) => s.connected)
      .map((s) => ({
        empireId: s.empireId,
        name: s.playerName,
        isHost: s.isHost,
      }));
  }

  handleMessage(ws: WebSocket, message: ClientMessage): void {
    const client = this.clients.find((c) => c.ws === ws);
    if (!client) return;

    switch (message.type) {
      case 'startGame':
        this.handleStartGame(client);
        break;
      case 'command':
        this.handleCommand(client, message.command);
        break;
      case 'setSpeed':
        this.handleSetSpeed(client, message.speed);
        break;
      case 'chat':
        this.handleChat(client, message.text);
        break;
      default:
        this.send(ws, { type: 'error', message: `Unexpected message type in room: ${(message as ClientMessage).type}` });
    }
  }

  private handleStartGame(client: ConnectedClient): void {
    if (!client.isHost) {
      this.send(client.ws, { type: 'error', message: 'Only the host can start the game.' });
      return;
    }
    if (this.started) {
      this.send(client.ws, { type: 'error', message: 'Game already started.' });
      return;
    }

    this.state = createMultiplayerGame(this.empireSlots);
    this.started = true;

    const serialized = serializeState(this.state);
    for (const c of this.clients) {
      this.send(c.ws, { type: 'gameStarted', state: serialized });
    }

    this.startTickLoop();
  }

  private handleCommand(client: ConnectedClient, command: SerializedCommand): void {
    if (!this.state) {
      this.send(client.ws, { type: 'error', message: 'Game not started.' });
      return;
    }

    if (command.empireId !== client.empireId) {
      this.send(client.ws, { type: 'commandResult', ok: false, message: 'Cannot issue commands for another empire.' });
      return;
    }

    const result = executeCommand(this.state, command);
    this.send(client.ws, { type: 'commandResult', ok: result.ok, message: result.message });
  }

  private handleSetSpeed(client: ConnectedClient, speed: GameSpeed): void {
    if (!client.isHost) {
      this.send(client.ws, { type: 'error', message: 'Only the host can change game speed.' });
      return;
    }
    if (!this.state) return;

    setSpeed(this.state, speed);
  }

  private handleChat(client: ConnectedClient, text: string): void {
    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return;
    this.broadcast({
      type: 'chat',
      empireId: client.empireId,
      playerName: client.playerName,
      text: trimmed,
    });
  }

  private startTickLoop(): void {
    this.tickTimer = setInterval(() => {
      if (!this.state) return;

      const speed = this.state.currentSpeed;
      if (speed === SPEEDS.PAUSED) return;

      for (let i = 0; i < speed; i++) {
        advanceTick(this.state);
      }

      this.broadcastState();
    }, TICK_INTERVAL_MS);
  }

  private broadcastState(): void {
    if (!this.state) return;
    const serialized = serializeState(this.state);
    this.broadcast({ type: 'tick', state: serialized });
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.started = false;
  }

  broadcastMessage(message: ServerMessage): void {
    this.broadcast(message);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(data);
      }
    }
  }
}

function createMultiplayerGame(slots: EmpireSlot[]): GameState {
  const hostName = slots.find((s) => s.isHost)?.playerName ?? 'Host';
  const state = createNewGame({ empireName: hostName, seed: Date.now() });

  const totalEmpires = state.empires.length;
  for (let i = 0; i < totalEmpires; i++) {
    const empire = state.empires[i];
    const slot = slots.find((s) => s.empireId === i);
    if (slot) {
      empire.controllerType = 'human';
      empire.empireName = slot.playerName;
    } else {
      empire.controllerType = 'ai';
    }
  }

  return state;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
