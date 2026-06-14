const MUSIC_ENABLED_KEY = 'ic_music_enabled';

const TRACKS = ['orbit-wardens.mp3', 'starlit-drift.mp3'];

let audio: HTMLAudioElement | null = null;
let started = false;
let trackIndex = 0;

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

function playTrack(): void {
  if (!audio) {
    audio = new Audio(TRACKS[trackIndex]);
    audio.volume = 0.3;
    audio.addEventListener('ended', () => {
      trackIndex = (trackIndex + 1) % TRACKS.length;
      audio!.src = TRACKS[trackIndex];
      audio!.play().catch(() => {});
    });
  }
}

export function startMusic(): void {
  if (!isEnabled()) return;
  if (!audio) {
    playTrack();
  }
  if (!started) {
    const tryPlay = () => {
      audio!.play().then(() => {
        started = true;
        document.removeEventListener('click', tryPlay);
        document.removeEventListener('keydown', tryPlay);
      }).catch(() => {
        // Autoplay blocked — listeners will retry on interaction
      });
    };
    tryPlay();
    document.addEventListener('click', tryPlay, { once: false });
    document.addEventListener('keydown', tryPlay, { once: false });
  }
}

export function stopMusic(): void {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    started = false;
  }
}
