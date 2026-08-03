const player = document.getElementById('player');
const captionEl = document.getElementById('caption');
const wordEl = document.getElementById('word');
const definitionEl = document.getElementById('definition');

const FADE_MS = 2000;

let playlist = [];
let queue = [];
let lastFile = null;
let words = {};

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

function swapMedia(file) {
  player.src = `videos/${encodeURIComponent(file)}`;
  player.load();
  player.addEventListener('canplay', () => {
    player.play().catch(() => {});
    player.style.opacity = 1;
    captionEl.style.opacity = 1;
  }, { once: true });

  const entry = words[file];
  wordEl.textContent = entry ? entry.word : '';
  definitionEl.textContent = entry ? entry.definition : '';
}

function playNext(fade = true) {
  if (playlist.length === 0) return;
  if (queue.length === 0) refillQueue();
  const file = queue.shift();
  lastFile = file;

  if (fade) {
    player.style.opacity = 0;
    captionEl.style.opacity = 0;
    setTimeout(() => swapMedia(file), FADE_MS);
  } else {
    swapMedia(file);
  }
}

async function fetchPlaylist() {
  const res = await fetch(`videos/manifest.json?t=${Date.now()}`);
  return res.json();
}

async function fetchWords() {
  try {
    const res = await fetch(`videos/words.json?t=${Date.now()}`);
    return res.json();
  } catch {
    return {};
  }
}

async function init() {
  playlist = await fetchPlaylist();
  words = await fetchWords();
  playNext(false);
}

player.addEventListener('ended', () => playNext(true));

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
    words = await fetchWords();
    if (wasEmpty && playlist.length > 0) playNext(false);
  }
}, 15000);

init();
