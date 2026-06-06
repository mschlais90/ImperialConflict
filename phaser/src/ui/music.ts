const MUSIC_ENABLED_KEY = 'ic_music_enabled';

let audio: HTMLAudioElement | null = null;
let started = false;

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

export function startMusic(): void {
  if (!isEnabled()) return;
  if (!audio) {
    audio = new Audio('orbit-wardens.mp3');
    audio.loop = true;
    audio.volume = 0.3;
  }
  if (!started) {
    // Browsers block autoplay — attempt to play, and if it fails,
    // wait for the next user interaction to retry.
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
