import './styles.css';

const root = document.querySelector<HTMLDivElement>('#ui-root');
if (!root) {
  throw new Error('Missing #ui-root');
}

root.innerHTML = '<main class="boot"><div class="boot-card">Imperial Conflict Phaser MVP</div></main>';
