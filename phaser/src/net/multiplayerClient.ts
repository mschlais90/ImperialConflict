import type { ClientMessage, GameSettings, PlayerInfo, SerializedCommand, SerializedGameState, ServerMessage } from '../core/protocol/messages';
import type { GameSpeed } from '../core/events/eventLog';

export interface MultiplayerCallbacks {
  onRoomCreated: (roomCode: string) => void;
  onJoined: (empireId: number, players: PlayerInfo[]) => void;
  onPlayerJoined: (player: PlayerInfo) => void;
  onPlayerLeft: (empireId: number) => void;
  onPlayerReconnected: (empireId: number) => void;
  onGameStarted: (state: SerializedGameState) => void;
  onTick: (state: SerializedGameState) => void;
  onCommandResult: (ok: boolean, message: string) => void;
  onReconnected: (empireId: number, state: SerializedGameState) => void;
  onChat: (empireId: number, playerName: string, text: string) => void;
  onError: (message: string) => void;
  onDisconnect: () => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks;
  private serverUrl: string | null = null;
  private reconnectInfo: { roomCode: string; empireId: number } | null = null;
  private intentionalDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly MAX_RECONNECT_ATTEMPTS = 10;
  private static readonly RECONNECT_DELAY_MS = 3000;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  connect(serverUrl: string): void {
    this.intentionalDisconnect = false;
    this.serverUrl = serverUrl;
    this.doConnect(serverUrl);
  }

  private doConnect(serverUrl: string): void {
    this.ws?.close();
    this.ws = new WebSocket(serverUrl);

    this.ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      // If we have reconnect info, send reconnect message automatically
      if (this.reconnectInfo) {
        this.reconnect(this.reconnectInfo.roomCode, this.reconnectInfo.empireId);
      }
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
      if (this.intentionalDisconnect) {
        this.callbacks.onDisconnect();
        return;
      }
      // Attempt auto-reconnect if we have reconnect info
      if (this.reconnectInfo && this.serverUrl && this.reconnectAttempts < MultiplayerClient.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
          if (this.serverUrl) this.doConnect(this.serverUrl);
        }, MultiplayerClient.RECONNECT_DELAY_MS);
      } else {
        this.callbacks.onDisconnect();
      }
    });

    this.ws.addEventListener('error', () => {
      // Error will trigger close event
    });
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.reconnectInfo = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  roomCode: string | null = null;

  setReconnectInfo(roomCode: string, empireId: number): void {
    this.reconnectInfo = { roomCode, empireId };
    this.roomCode = roomCode;
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

  reconnect(roomCode: string, empireId: number): void {
    this.send({ type: 'reconnect', roomCode, empireId });
  }

  sendChat(text: string): void {
    this.send({ type: 'chat', text });
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
      case 'playerReconnected':
        this.callbacks.onPlayerReconnected(message.empireId);
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
      case 'reconnected':
        this.callbacks.onReconnected(message.empireId, message.state);
        break;
      case 'chat':
        this.callbacks.onChat(message.empireId, message.playerName, message.text);
        break;
      case 'error':
        this.callbacks.onError(message.message);
        break;
    }
  }
}
