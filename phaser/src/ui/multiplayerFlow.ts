import type { AppController } from '../app/appController';
import type { GameState } from '../core/galaxy/galaxyData';
import { listHumanEmpires } from '../core/persistence/multiplayerSave';
import type { PlayerInfo, SerializedGameState } from '../core/protocol/messages';
import { createSeededRng } from '../core/random/rng';
import { MultiplayerClient } from '../net/multiplayerClient';
import type { ChatPanel } from './chatPanel';
import { clearElement } from './dom';
import { renderLobbyScreen, type LobbyController } from './lobbyScreen';
import { clearMpSession, loadMpSession, saveMpSession } from './mpSession';
import { startMusic } from './music';

// Multiplayer lobby + game session wiring: connects a MultiplayerClient,
// drives the lobby screen, starts the game, and applies server ticks.

const CONNECT_TIMEOUT_MS = 5000;
const CONNECT_POLL_MS = 100;

export interface MultiplayerFlowDeps {
  root: HTMLElement;
  controller: AppController;
  toastElement: HTMLElement;
  chat: ChatPanel;
  disconnectedPlayers: Set<number>;
  showToast(message: string, isError: boolean): void;
  showStartScreen(): void;
  isSuppressingCommandToasts(): boolean;
  /** Clear game-over/view/report state for a fresh game. */
  resetForNewGame(): void;
  render(): void;
  refreshAfterTick(): void;
}

export interface MultiplayerFlow {
  showLobby(loadedSave?: GameState | null): void;
}

function serverUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return import.meta.env.DEV
    ? `ws://${window.location.hostname || 'localhost'}:3001`
    : `${wsProtocol}//${window.location.host}`;
}

/** Run `action` once the client's socket is open (gives up after a timeout). */
function whenConnected(client: MultiplayerClient, action: () => void): void {
  const poll = setInterval(() => {
    if (client.isConnected) {
      clearInterval(poll);
      action();
    }
  }, CONNECT_POLL_MS);
  setTimeout(() => clearInterval(poll), CONNECT_TIMEOUT_MS);
}

export function createMultiplayerFlow(deps: MultiplayerFlowDeps): MultiplayerFlow {
  const { root, controller } = deps;

  function startGame(mpClient: MultiplayerClient, serverState: SerializedGameState): void {
    controller.isMultiplayer = true;
    controller.multiplayerClient = mpClient;
    controller.state = { ...serverState, rng: createSeededRng(Date.now()) };
    const empireId = controller.clientState?.empireId ?? 0;
    controller.playerName = controller.state.empires[empireId]?.empireName ?? 'Player';

    // Store reconnect info so the client can auto-rejoin on disconnect
    if (mpClient.roomCode) {
      mpClient.setReconnectInfo(mpClient.roomCode, empireId);
      saveMpSession(mpClient.roomCode, empireId);
    }

    deps.resetForNewGame();
    deps.chat.clearMessages();

    if (controller.startNewGame) {
      // BootScene handles state setup via loadGame (skips clientState reset in MP)
      controller.loadGame?.(controller.state);
    } else {
      deps.render();
    }

    startMusic();

    // Show chat panel for multiplayer games
    deps.chat.ensure();
  }

  function applyServerState(serverState: SerializedGameState): void {
    if (!controller.state) return;

    // Preserve local selection state
    const cs = controller.clientState;

    // Replace game state with server's authoritative copy (keep local RNG for optimistic commands)
    const localRng = controller.state.rng;
    Object.assign(controller.state, serverState);
    controller.state.rng = localRng;

    // Restore selection
    if (cs) {
      controller.state.selectedEmpireId = cs.empireId;
      controller.state.selectedSystemId = cs.selectedSystemId;
      controller.state.selectedPlanetId = cs.selectedPlanetId;
      controller.state.selectedFleetId = cs.selectedFleetId;
    }

    deps.refreshAfterTick();
    controller.refreshScene?.();
  }

  function showLobby(loadedSave: GameState | null = null): void {
    clearElement(root);
    root.append(deps.toastElement);

    let lobbyCtrl: LobbyController | null = null;
    let players: PlayerInfo[] = [];
    let roomCode = '';

    const resetClientState = (empireId: number): void => {
      controller.clientState = {
        empireId,
        selectedSystemId: null,
        selectedPlanetId: null,
        selectedFleetId: null,
      };
    };

    const mpClient = new MultiplayerClient({
      onRoomCreated(code) {
        roomCode = code;
        mpClient.roomCode = code;
      },
      onJoined(empireId, joinedPlayers, openEmpires) {
        players = joinedPlayers;
        const isHost = joinedPlayers.find((p) => p.empireId === empireId)?.isHost ?? false;
        controller.isHost = isHost;
        resetClientState(empireId);
        lobbyCtrl?.showLobby(roomCode, players, isHost);
        if (openEmpires && openEmpires.length > 0) {
          lobbyCtrl?.setStatus(`Waiting for: ${openEmpires.map((e) => e.name).join(', ')}`);
        }
      },
      onPlayerJoined(player) {
        players = [...players, player];
        lobbyCtrl?.updatePlayers(players);
      },
      onPlayerLeft(empireId) {
        players = players.filter((p) => p.empireId !== empireId);
        lobbyCtrl?.updatePlayers(players);
        deps.disconnectedPlayers.add(empireId);
      },
      onPlayerReconnected(empireId) {
        deps.disconnectedPlayers.delete(empireId);
        const empire = controller.state?.empires[empireId];
        deps.showToast(`${empire?.empireName ?? `Player ${empireId}`} reconnected.`, false);
      },
      onGameStarted(state) {
        startGame(mpClient, state);
      },
      onTick(state) {
        applyServerState(state);
      },
      onCommandResult(ok, message) {
        if (!deps.isSuppressingCommandToasts()) deps.showToast(message, !ok);
      },
      onReconnected(empireId, state) {
        resetClientState(empireId);
        startGame(mpClient, state);
        deps.showToast('Reconnected to game.', false);
      },
      onChat(empireId, playerName, text) {
        deps.chat.addMessage(empireId, playerName, text);
      },
      onError(message) {
        deps.showToast(message, true);
        // If the room is gone, clear saved session so the rejoin button disappears
        if (message === 'Room not found.' || message === 'Cannot reconnect to this empire.') {
          clearMpSession();
        }
      },
      onDisconnect() {
        controller.isMultiplayer = false;
        controller.multiplayerClient = null;
        // Go straight to multiplayer lobby so the rejoin button is visible
        if (loadMpSession()) {
          showLobby();
          deps.showToast('Disconnected from server. Click Rejoin to reconnect.', true);
        } else {
          deps.showToast('Disconnected from server.', true);
          deps.showStartScreen();
        }
      },
    });

    // When hosting a loaded save, default the host to the empire they saved as.
    const savedHumans = loadedSave ? listHumanEmpires(loadedSave) : [];
    const hostEmpire = savedHumans.find((e) => e.id === loadedSave?.selectedEmpireId) ?? savedHumans[0];

    lobbyCtrl = renderLobbyScreen(root, {
      savedSession: loadedSave ? null : loadMpSession(),
      loadedGame: loadedSave
        ? { hostEmpireName: hostEmpire?.empireName ?? 'Player Empire', empireNames: savedHumans.map((e) => e.empireName) }
        : null,
      onCreateRoom(playerName) {
        mpClient.connect(serverUrl());
        whenConnected(mpClient, () => {
          if (loadedSave) {
            const { rng, ...serializable } = loadedSave;
            mpClient.createRoom(playerName, { empireName: playerName }, { state: serializable, rngState: rng?.getState() ?? 0 });
          } else {
            mpClient.createRoom(playerName, { empireName: playerName });
          }
        });
      },
      onJoinRoom(code, playerName) {
        roomCode = code;
        mpClient.roomCode = code;
        mpClient.connect(serverUrl());
        whenConnected(mpClient, () => mpClient.joinRoom(code, playerName));
      },
      onRejoinGame(code, empireId) {
        roomCode = code;
        mpClient.roomCode = code;
        mpClient.setReconnectInfo(code, empireId);
        mpClient.connect(serverUrl());
        // reconnectInfo is set, so doConnect will auto-send the reconnect message on open
      },
      onStartGame() {
        mpClient.startGame();
      },
      onLeave() {
        clearMpSession();
        mpClient.disconnect();
        deps.showStartScreen();
      },
    });
  }

  return { showLobby };
}
