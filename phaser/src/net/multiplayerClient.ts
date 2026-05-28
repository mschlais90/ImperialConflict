import type { ClientMessage, GameSettings, PlayerInfo, SerializedCommand, SerializedGameState, ServerMessage } from '../core/protocol/messages';
import type { GameSpeed } from '../core/events/eventLog';

export interface MultiplayerCallbacks {
  onRoomCreated: (roomCode: string) => void;
  onJoined: (empireId: number, players: PlayerInfo[]) => void;
  onPlayerJoined: (player: PlayerInfo) => void;
  onPlayerLeft: (empireId: number) => void;
  onGameStarted: (state: SerializedGameState) => void;
  onTick: (state: SerializedGameState) => void;
  onCommandResult: (ok: boolean, message: string) => void;
  onError: (message: string) => void;
  onDisconnect: () => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  connect(serverUrl: string): void {
    this.disconnect();
    this.ws = new WebSocket(serverUrl);

    this.ws.addEventListener('open', () => {
      // Connection established
    });

    this.ws.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handleMessage(message);
    });

    this.ws.addEventListener('close', () => {
      this.ws = null;
      this.callbacks.onDisconnect();
    });

    this.ws.addEventListener('error', () => {
      // Error will trigger close event
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  createRoom(playerName: string, settings: GameSettings): void {
    this.send({ type: 'create', playerName, settings });
  }

  joinRoom(roomCode: string, playerName: string): void {
    this.send({ type: 'join', roomCode, playerName });
  }

  startGame(): void {
    this.send({ type: 'startGame' });
  }

  sendCommand(command: SerializedCommand): void {
    this.send({ type: 'command', command });
  }

  setSpeed(speed: GameSpeed): void {
    this.send({ type: 'setSpeed', speed });
  }

  private send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'roomCreated':
        this.callbacks.onRoomCreated(message.roomCode);
        break;
      case 'joined':
        this.callbacks.onJoined(message.empireId, message.players);
        break;
      case 'playerJoined':
        this.callbacks.onPlayerJoined(message.player);
        break;
      case 'playerLeft':
        this.callbacks.onPlayerLeft(message.empireId);
        break;
      case 'gameStarted':
        this.callbacks.onGameStarted(message.state);
        break;
      case 'tick':
        this.callbacks.onTick(message.state);
        break;
      case 'commandResult':
        this.callbacks.onCommandResult(message.ok, message.message);
        break;
      case 'error':
        this.callbacks.onError(message.message);
        break;
    }
  }
}
