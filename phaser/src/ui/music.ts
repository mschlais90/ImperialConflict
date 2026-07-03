const MUSIC_ENABLED_KEY = 'ic_music_enabled';

const TRACKS = ['starlit-drift.mp3', 'nebula-drift.mp3'];

let audio: HTMLAudioElement | null = null;
let started = false;
let trackIndex = 0;
let activeInteractionListener: (() => void) | null = null;

function isEnabled(): boolean {
  try {
    const val = localStorage.getItem(MUSIC_ENABLED_KEY);
    return val === null || val === 'true';
  } catch {
    return true;
  }
}

function setEnabled(enabled: boolean): void {
  localStorage.setItem(MUSIC_ENABLED_KEY, String(enabled));
}

export function isMusicEnabled(): boolean {
  return isEnabled();
}

export function setMusicEnabled(enabled: boolean): void {
  setEnabled(enabled);
  if (enabled) {
    startMusic();
  } else {
    stopMusic();
  }
}

function removeInteractionListeners(): void {
  if (activeInteractionListener) {
    document.removeEventListener('click', activeInteractionListener);
    document.removeEventListener('keydown', activeInteractionListener);
    activeInteractionListener = null;
  }
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(TRACKS[trackIndex]);
    audio.volume = 0.3;
    audio.addEventListener('ended', () => {
      trackIndex = (trackIndex + 1) % TRACKS.length;
      audio!.src = TRACKS[trackIndex];
      audio!.play().catch(() => {});
    });
    audio.addEventListener('error', () => {
      console.warn('[music] Failed to load track:', TRACKS[trackIndex]);
    });
  }
  return audio;
}

export function startMusic(): void {
  if (!isEnabled()) return;
  const el = ensureAudio();

  // Clean up any stale listeners from a previous start/stop cycle
  removeInteractionListeners();

  if (!started) {
    const tryPlay = () => {
      el.play().then(() => {
        started = true;
        removeInteractionListeners();
      }).catch(() => {
        // Autoplay blocked — listeners will retry on next user interaction
      });
    };
    tryPlay();
    activeInteractionListener = tryPlay;
    document.addEventListener('click', tryPlay);
    document.addEventListener('keydown', tryPlay);
  }
}

export function stopMusic(): void {
  removeInteractionListeners();
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    started = false;
  }
}
