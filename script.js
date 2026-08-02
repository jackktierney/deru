const player = document.getElementById('player');

let playlist = [];
let queue = [];
let lastFile = null;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function refillQueue() {
  queue = shuffle(playlist);
  if (queue.length > 1 && queue[0] === lastFile) {
    [queue[0], queue[1]] = [queue[1], queue[0]];
  }
}

function playNext() {
  if (playlist.length === 0) return;
  if (queue.length === 0) refillQueue();
  const file = queue.shift();
  lastFile = file;
  player.src = `videos/${encodeURIComponent(file)}`;
  player.load();
  player.addEventListener('canplay', () => player.play().catch(() => {}), { once: true });
}

async function fetchPlaylist() {
  const res = await fetch(`videos/manifest.json?t=${Date.now()}`);
  return res.json();
}

async function init() {
  playlist = await fetchPlaylist();
  playNext();
}

player.addEventListener('ended', playNext);

// Browsers only allow audio after a user gesture, so unmute on the
// first interaction anywhere on the page rather than showing a control.
function unmuteOnInteraction() {
  player.muted = false;
  window.removeEventListener('click', unmuteOnInteraction);
  window.removeEventListener('keydown', unmuteOnInteraction);
  window.removeEventListener('touchstart', unmuteOnInteraction);
}
window.addEventListener('click', unmuteOnInteraction);
window.addEventListener('keydown', unmuteOnInteraction);
window.addEventListener('touchstart', unmuteOnInteraction);

// Pick up newly dropped-in videos without needing a page reload.
setInterval(async () => {
  const updated = await fetchPlaylist();
  const changed = JSON.stringify(updated.slice().sort()) !== JSON.stringify(playlist.slice().sort());
  const wasEmpty = playlist.length === 0;
  if (changed) {
    playlist = updated;
    if (wasEmpty && playlist.length > 0) playNext();
  }
}, 15000);

init();
