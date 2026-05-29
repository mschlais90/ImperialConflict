import type { PlayerInfo } from '../core/protocol/messages';
import { button } from './dom';

export interface LobbyCallbacks {
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onStartGame: () => void;
  onLeave: () => void;
}

export function renderLobbyScreen(root: HTMLElement, callbacks: LobbyCallbacks): LobbyController {
  const shell = document.createElement('div');
  shell.className = 'start-screen interactive';

  const panel = document.createElement('div');
  panel.className = 'start-panel';

  const title = document.createElement('h1');
  title.textContent = 'Multiplayer';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Empire name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = 'Player Empire';
  nameInput.maxLength = 32;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameLabel.append(nameInput);

  // Create section
  const createSection = document.createElement('div');
  createSection.className = 'lobby-section';
  const createBtn = button('Create New Game', () => {
    const name = nameInput.value.trim() || 'Player Empire';
    callbacks.onCreateRoom(name);
  }, 'ui-button primary lobby-action-btn');
  createSection.append(createBtn);

  // OR divider
  const divider = document.createElement('div');
  divider.className = 'lobby-divider';
  const dividerLine1 = document.createElement('span');
  dividerLine1.className = 'lobby-divider-line';
  const dividerText = document.createElement('span');
  dividerText.className = 'lobby-divider-text';
  dividerText.textContent = 'OR';
  const dividerLine2 = document.createElement('span');
  dividerLine2.className = 'lobby-divider-line';
  divider.append(dividerLine1, dividerText, dividerLine2);

  // Join section
  const joinSection = document.createElement('div');
  joinSection.className = 'lobby-section';
  const codeLabel = document.createElement('label');
  codeLabel.textContent = 'Room code';
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.placeholder = 'ABC';
  codeInput.maxLength = 3;
  codeInput.autocomplete = 'off';
  codeInput.spellcheck = false;
  codeInput.className = 'room-code-input';
  codeInput.style.textTransform = 'uppercase';
  codeLabel.append(codeInput);
  const joinBtn = button('Join Game', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;
    const name = nameInput.value.trim() || 'Player Empire';
    callbacks.onJoinRoom(code, name);
  }, 'ui-button lobby-action-btn');
  joinSection.append(codeLabel, joinBtn);

  const backBtn = button('Back', () => callbacks.onLeave(), 'ui-button');

  // Lobby view (shown after create/join)
  const lobbyView = document.createElement('div');
  lobbyView.className = 'lobby-view';
  lobbyView.style.display = 'none';

  const roomCodeDisplay = document.createElement('div');
  roomCodeDisplay.className = 'room-code-display';

  const playerList = document.createElement('div');
  playerList.className = 'player-list';

  const startBtn = button('Start Game', () => callbacks.onStartGame(), 'ui-button primary');
  startBtn.style.display = 'none';

  const lobbyBackBtn = button('Leave', () => callbacks.onLeave(), 'ui-button');

  const statusText = document.createElement('p');
  statusText.className = 'empty-text';

  lobbyView.append(roomCodeDisplay, playerList, statusText, startBtn, lobbyBackBtn);

  // Initial view
  const joinView = document.createElement('div');
  joinView.className = 'lobby-join-view';
  joinView.append(nameLabel, createSection, divider, joinSection, backBtn);

  panel.append(title, joinView, lobbyView);
  shell.append(panel);
  root.append(shell);
  nameInput.focus();
  nameInput.select();

  return {
    showLobby(roomCode: string, players: PlayerInfo[], isHost: boolean) {
      joinView.style.display = 'none';
      lobbyView.style.display = '';
      roomCodeDisplay.textContent = `Room: ${roomCode}`;
      startBtn.style.display = isHost ? '' : 'none';
      statusText.textContent = isHost ? 'Waiting for players...' : 'Waiting for host to start...';
      updatePlayerList(playerList, players);
    },
    updatePlayers(players: PlayerInfo[]) {
      updatePlayerList(playerList, players);
    },
    setStatus(message: string) {
      statusText.textContent = message;
    },
  };
}

export interface LobbyController {
  showLobby(roomCode: string, players: PlayerInfo[], isHost: boolean): void;
  updatePlayers(players: PlayerInfo[]): void;
  setStatus(message: string): void;
}

function updatePlayerList(container: HTMLElement, players: PlayerInfo[]): void {
  container.innerHTML = '';
  for (const player of players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    if (player.color) {
      const dot = document.createElement('span');
      dot.className = 'player-color-dot';
      dot.style.background = player.color;
      row.append(dot);
    }
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${player.name}${player.isHost ? ' (Host)' : ''}`;
    row.append(nameSpan);
    container.append(row);
  }
}
