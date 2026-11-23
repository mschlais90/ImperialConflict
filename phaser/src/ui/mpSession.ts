// Remembers the last multiplayer room/empire so the lobby can offer "Rejoin"
// after a disconnect or page reload.

const MP_SESSION_KEY = 'ic_mp_session';

export interface MpSession {
  roomCode: string;
  empireId: number;
}

export function saveMpSession(roomCode: string, empireId: number): void {
  try {
    localStorage.setItem(MP_SESSION_KEY, JSON.stringify({ roomCode, empireId }));
  } catch { /* storage full or unavailable */ }
}

export function loadMpSession(): MpSession | null {
  try {
    const raw = localStorage.getItem(MP_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.roomCode === 'string' && typeof parsed.empireId === 'number') {
      return parsed;
    }
  } catch { /* corrupt data */ }
  return null;
}

export function clearMpSession(): void {
  try {
    localStorage.removeItem(MP_SESSION_KEY);
  } catch { /* ignore */ }
}
