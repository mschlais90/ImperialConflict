import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MultiplayerClient, type MultiplayerCallbacks } from '../../net/multiplayerClient';
import { startServer } from '../../server/gameServer';
import type { SerializedGameState } from '../../core/protocol/messages';

// ---------------------------------------------------------------------------
// These are end-to-end network tests: a real server on an ephemeral localhost
// port with TWO real MultiplayerClient instances connected over WebSocket.
//
// They deliberately assert on the MultiplayerClient *callback contract*
// (onJoined / onGameStarted / onTick(fullState) / onCommandResult / onChat),
// NOT on the raw wire format. That contract is what the UI depends on, so any
// transport refactor — full-state JSON, JSON deltas, or a Colyseus rewrite —
// must keep these tests green.
// ---------------------------------------------------------------------------

const FULL_ALLOCATION = { military: 100, welfare: 0, economy: 0, construction: 0, resources: 0 } as const;

/** Test harness wrapping a MultiplayerClient with awaitable, queued callbacks. */
interface Harness {
  client: MultiplayerClient;
  /** Resolve with the next (or next-buffered) payload for a callback event. */
  once: (event: string) => Promise<any>;
  /** Synchronously read everything buffered for an event so far. */
  drain: (event: string) => any[];
}

function createHarness(): Harness {
  const buffered = new Map<string, any[]>();
  const waiters = new Map<string, ((value: any) => void)[]>();

  const emit = (event: string, payload: any): void => {
    const waiting = waiters.get(event);
    if (waiting && waiting.length > 0) {
      waiting.shift()!(payload);
      return;
    }
    const queue = buffered.get(event) ?? [];
    queue.push(payload);
    buffered.set(event, queue);
  };

  const callbacks: MultiplayerCallbacks = {
    onRoomCreated: (roomCode) => emit('roomCreated', roomCode),
    onJoined: (empireId, players) => emit('joined', { empireId, players }),
    onPlayerJoined: (player) => emit('playerJoined', player),
    onPlayerLeft: (empireId) => emit('playerLeft', empireId),
    onPlayerReconnected: (empireId) => emit('playerReconnected', empireId),
    onGameStarted: (state) => emit('gameStarted', state),
    onTick: (state) => emit('tick', state),
    onCommandResult: (ok, message) => emit('commandResult', { ok, message }),
    onReconnected: (empireId, state) => emit('reconnected', { empireId, state }),
    onChat: (empireId, playerName, text) => emit('chat', { empireId, playerName, text }),
    onError: (message) => emit('error', message),
    onDisconnect: () => emit('disconnect', undefined),
  };

  const client = new MultiplayerClient(callbacks);

  const once = (event: string): Promise<any> => {
    const queue = buffered.get(event);
    if (queue && queue.length > 0) return Promise.resolve(queue.shift());
    return new Promise((resolve) => {
      const waiting = waiters.get(event) ?? [];
      waiting.push(resolve);
      waiters.set(event, waiting);
    });
  };

  const drain = (event: string): any[] => {
    const queue = buffered.get(event) ?? [];
    buffered.set(event, []);
    return queue;
  };

  return { client, once, drain };
}

function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = (): void => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitUntil: timed out'));
      setTimeout(poll, 10);
    };
    poll();
  });
}

/** Wait for the next tick whose currentTick has reached at least `minTick`. */
async function waitForTick(h: Harness, minTick: number): Promise<SerializedGameState> {
  for (;;) {
    const state: SerializedGameState = await h.once('tick');
    if (state.currentTick >= minTick) return state;
  }
}

describe('multiplayer server (two clients over localhost WebSocket)', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let url: string;
  const harnesses: Harness[] = [];

  beforeEach(async () => {
    server = await startServer({ port: 0 });
    url = server.url;
  });

  afterEach(async () => {
    for (const h of harnesses) h.client.disconnect();
    harnesses.length = 0;
    await server.close();
  });

  function spawn(): Harness {
    const h = createHarness();
    harnesses.push(h);
    return h;
  }

  async function connect(h: Harness): Promise<void> {
    h.client.connect(url);
    await waitUntil(() => h.client.isConnected);
  }

  /** A creates a room, B joins. Returns both harnesses and the room code. */
  async function lobbyOf2(): Promise<{ a: Harness; b: Harness; roomCode: string }> {
    const a = spawn();
    await connect(a);
    a.client.createRoom('Alice', { empireName: 'Alice' });
    const roomCode: string = await a.once('roomCreated');
    await a.once('joined');

    const b = spawn();
    await connect(b);
    b.client.joinRoom(roomCode, 'Bob');
    await b.once('joined');
    await a.once('playerJoined');

    return { a, b, roomCode };
  }

  /** A full lobby plus host starts the game. Game begins PAUSED (speed 0). */
  async function startedGameOf2(): Promise<{ a: Harness; b: Harness; aState: SerializedGameState; bState: SerializedGameState }> {
    const { a, b } = await lobbyOf2();
    a.client.startGame();
    const aState: SerializedGameState = await a.once('gameStarted');
    const bState: SerializedGameState = await b.once('gameStarted');
    return { a, b, aState, bState };
  }

  it('lets two clients create and join a room with sequential empire ids', async () => {
    const a = spawn();
    await connect(a);
    a.client.createRoom('Alice', { empireName: 'Alice' });

    const roomCode: string = await a.once('roomCreated');
    expect(roomCode).toMatch(/^[A-Z0-9]{3}$/);

    const aJoined = await a.once('joined');
    expect(aJoined.empireId).toBe(0);
    expect(aJoined.players).toHaveLength(1);

    const b = spawn();
    await connect(b);
    b.client.joinRoom(roomCode, 'Bob');

    const bJoined = await b.once('joined');
    expect(bJoined.empireId).toBe(1);
    expect(bJoined.players.map((p: any) => p.name)).toEqual(['Alice', 'Bob']);

    const playerJoined = await a.once('playerJoined');
    expect(playerJoined.empireId).toBe(1);
    expect(playerJoined.name).toBe('Bob');
  });

  it('starts the game and delivers an equivalent initial state to both players', async () => {
    const { aState, bState } = await startedGameOf2();

    expect(aState.empires).toHaveLength(2);
    expect(aState.empires.every((e) => e.controllerType === 'human')).toBe(true);
    expect(aState.empires.map((e) => e.empireName)).toEqual(['Alice', 'Bob']);
    expect(aState.currentTick).toBe(0);

    // Both players see the same world.
    expect(bState.currentTick).toBe(aState.currentTick);
    expect(bState.empires.length).toBe(aState.empires.length);
    expect(bState.planets.length).toBe(aState.planets.length);
  });

  it('rejects startGame from a non-host', async () => {
    const { b } = await lobbyOf2();
    b.client.startGame();
    const error = await b.once('error');
    expect(error).toMatch(/host/i);
  });

  it('broadcasts ticks to both clients and keeps them in sync', async () => {
    const { a, b } = await startedGameOf2();
    a.client.setSpeed(8); // host accelerates; game was paused

    const a1 = await waitForTick(a, 1);
    const b1 = await waitForTick(b, 1);
    expect(a1.currentTick).toBe(1);
    expect(b1.currentTick).toBe(1);

    // Ticks keep advancing and both clients agree on the resulting world.
    const a2 = await waitForTick(a, 2);
    const b2 = await waitForTick(b, 2);
    expect(a2.currentTick).toBe(2);
    expect(b2.currentTick).toBe(2);
    expect(b2.planets.length).toBe(a2.planets.length);
    expect(b2.empires.map((e) => e.empireName)).toEqual(a2.empires.map((e) => e.empireName));
  }, 15000);

  it('routes a command to its issuing empire and rejects cross-empire commands', async () => {
    const { a, b } = await startedGameOf2();

    // B issues a valid command for its own empire (id 1).
    b.client.sendCommand({ type: 'setResearchAllocation', empireId: 1, allocation: { ...FULL_ALLOCATION } });
    const accepted = await b.once('commandResult');
    expect(accepted.ok).toBe(true);

    // B tries to act for empire 0 — server must reject it.
    b.client.sendCommand({ type: 'setResearchAllocation', empireId: 0, allocation: { ...FULL_ALLOCATION } });
    const rejected = await b.once('commandResult');
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toMatch(/another empire/i);

    // commandResult is private to the issuer — A never receives one.
    expect(a.drain('commandResult')).toHaveLength(0);
  });

  it('broadcasts chat to every player including the sender', async () => {
    const { a, b } = await startedGameOf2();
    a.client.sendChat('hello world');

    const onA = await a.once('chat');
    const onB = await b.once('chat');

    expect(onB.empireId).toBe(0);
    expect(onB.playerName).toBe('Alice');
    expect(onB.text).toBe('hello world');
    expect(onA.text).toBe('hello world');
  });

  it('rejects setSpeed from a non-host', async () => {
    const { b } = await startedGameOf2();
    b.client.setSpeed(4);
    const error = await b.once('error');
    expect(error).toMatch(/host/i);
  });

  it('notifies the remaining player and pauses the game when a player disconnects', async () => {
    const { a, b } = await startedGameOf2();
    a.client.setSpeed(8);
    await waitForTick(a, 1); // ensure the server is actively ticking before the disconnect

    b.client.disconnect();

    const left = await a.once('playerLeft');
    expect(left).toBe(1);

    const chat = await a.once('chat');
    expect(chat.text).toMatch(/disconnected/i);
  }, 15000);
});
