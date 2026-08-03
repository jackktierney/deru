(function () {
  'use strict';

  const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v', '.ogg'];

  // -------------------------------------------------------------------
  // tiny DOM helper
  // -------------------------------------------------------------------
  function h(tag, props, children) {
    const el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach((key) => {
      const val = props[key];
      if (val === null || val === undefined) return;
      if (key === 'class') {
        el.className = val;
      } else if (key === 'style') {
        el.setAttribute('style', val);
      } else if (key.slice(0, 2) === 'on' && typeof val === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key in el) {
        try { el[key] = val; } catch (e) { el.setAttribute(key, val); }
      } else {
        el.setAttribute(key, val);
      }
    });
    (children || []).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function stripExt(name) { return name.replace(/\.[^.]+$/, ''); }
  function targetNameFor(rawName) { return stripExt(rawName) + '.mp4'; }
  function isVideoFile(name) {
    const lower = name.toLowerCase();
    return VIDEO_EXTS.some((ext) => lower.endsWith(ext));
  }

  // -------------------------------------------------------------------
  // filesystem helpers
  // -------------------------------------------------------------------
  async function writeTextFile(dirHandle, name, text) {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async function writeBlobFile(dirHandle, name, blob) {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  async function readTextFile(dirHandle, name, fallback) {
    try {
      const fh = await dirHandle.getFileHandle(name, { create: false });
      const file = await fh.getFile();
      return await file.text();
    } catch (e) {
      return fallback;
    }
  }

  async function readJSON(dirHandle, name, fallback) {
    const text = await readTextFile(dirHandle, name, null);
    if (text === null) return fallback;
    try { return JSON.parse(text); } catch (e) { return fallback; }
  }

  async function listFileNames(dirHandle, filterFn) {
    const names = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file' && (!filterFn || filterFn(name))) names.push(name);
    }
    return names;
  }

  async function getOrCreateDir(rootHandle, name) {
    return rootHandle.getDirectoryHandle(name, { create: true });
  }

  // -------------------------------------------------------------------
  // state
  // -------------------------------------------------------------------
  const state = {
    rootHandle: null,
    videosDir: null,
    rawDir: null,
    words: {},       // targetFilename -> { word, definition }
    liveFiles: [],   // filenames already in videos/
    rawFiles: [],    // filenames waiting in videos-raw/
    dirty: false,
  };

  const app = document.getElementById('app');
  let topbarEl, mainEl, statusEl;

  // ---- theme (light/dark) ----
  function currentTheme() {
    const stored = localStorage.getItem('videoGalleryEditor_theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('videoGalleryEditor_theme', next);
    renderTopbar();
  }

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  // -------------------------------------------------------------------
  // load / save
  // -------------------------------------------------------------------
  async function openFolder() {
    if (!window.showDirectoryPicker) {
      alert('This browser can\'t save files, so the editor won\'t work here.\n\nOpen this page in Chrome, Edge, Brave, or Helium instead (Safari and Firefox don\'t support it).');
      return;
    }
    let handle;
    try {
      handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (e) {
      if (e.name !== 'AbortError') alert('Could not open the folder picker: ' + e.message);
      return; // user cancelled, or picker unsupported/blocked
    }
    setStatus('Loading…', '');
    try {
      await handle.getFileHandle('index.html', { create: false });
      const videosDir = await handle.getDirectoryHandle('videos', { create: true });
      const rawDir = await getOrCreateDir(handle, 'videos-raw');

      state.rootHandle = handle;
      state.videosDir = videosDir;
      state.rawDir = rawDir;
      state.words = await readJSON(videosDir, 'words.json', {});
      state.liveFiles = await listFileNames(videosDir, isVideoFile);
      state.rawFiles = await listFileNames(rawDir, (n) => n !== '.gitkeep');
      state.dirty = false;

      setStatus('Loaded', 'saved');
      renderAll();
    } catch (e) {
      alert('Could not open that folder as a video gallery.\n\nPick the folder that directly contains index.html and the videos/ folder.\n\n(' + e.message + ')');
      setStatus('', '');
    }
  }

  async function regenerateManifest() {
    const files = state.liveFiles.slice().sort();
    await writeTextFile(state.videosDir, 'manifest.json', JSON.stringify(files));
  }

  async function saveWords() {
    if (!state.videosDir) return;
    setStatus('Saving…', '');
    try {
      await writeTextFile(state.videosDir, 'words.json', JSON.stringify(state.words, null, 2));
      state.dirty = false;
      setStatus('Saved ✓', 'saved');
      renderTopbar();
    } catch (e) {
      console.error(e);
      setStatus('Save failed: ' + e.message, 'error');
    }
  }

  function markDirty() {
    state.dirty = true;
    setStatus('Unsaved changes', 'dirty');
    renderTopbar();
  }

  // -------------------------------------------------------------------
  // adding / removing videos
  // -------------------------------------------------------------------
  async function addVideoFiles(files) {
    for (const file of files) {
      if (!isVideoFile(file.name)) continue;
      await writeBlobFile(state.rawDir, file.name, file);
      if (!state.rawFiles.includes(file.name)) state.rawFiles.push(file.name);
      const key = targetNameFor(file.name);
      if (!state.words[key]) state.words[key] = { word: '', definition: '', source: '' };
    }
    await saveWords();
    renderMain();
  }

  async function removeEntry(entry) {
    const label = entry.status === 'pending' ? entry.rawName : entry.key;
    if (!confirm(`Remove "${label}"? This deletes the video file from disk.`)) return;
    try {
      if (entry.status === 'pending') {
        await state.rawDir.removeEntry(entry.rawName);
        state.rawFiles = state.rawFiles.filter((n) => n !== entry.rawName);
      } else if (entry.status === 'live') {
        await state.videosDir.removeEntry(entry.key);
        state.liveFiles = state.liveFiles.filter((n) => n !== entry.key);
        await regenerateManifest();
      }
      delete state.words[entry.key];
      await saveWords();
      renderMain();
    } catch (e) {
      alert('Could not remove file: ' + e.message);
    }
  }

  // -------------------------------------------------------------------
  // building the unified entry list
  // -------------------------------------------------------------------
  function buildEntries() {
    const byKey = new Map();

    state.liveFiles.forEach((name) => {
      byKey.set(name, { key: name, status: 'live' });
    });
    state.rawFiles.forEach((rawName) => {
      const key = targetNameFor(rawName);
      if (!byKey.has(key)) byKey.set(key, { key, status: 'pending', rawName });
    });
    Object.keys(state.words).forEach((key) => {
      if (!byKey.has(key)) byKey.set(key, { key, status: 'missing' });
    });

    return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  async function getPreviewURL(entry) {
    try {
      if (entry.status === 'live') {
        const fh = await state.videosDir.getFileHandle(entry.key, { create: false });
        return URL.createObjectURL(await fh.getFile());
      }
      if (entry.status === 'pending') {
        const fh = await state.rawDir.getFileHandle(entry.rawName, { create: false });
        return URL.createObjectURL(await fh.getFile());
      }
    } catch (e) { /* file vanished — ignore, card shows placeholder */ }
    return null;
  }

  // -------------------------------------------------------------------
  // rendering
  // -------------------------------------------------------------------
  function renderTopbar() {
    clear(topbarEl);
    topbarEl.appendChild(h('h1', {}, ['Deru']));
    topbarEl.appendChild(h('div', { class: 'spacer' }));
    topbarEl.appendChild(statusEl);
    if (state.rootHandle) {
      topbarEl.appendChild(h('button', {
        class: state.dirty ? 'primary' : '',
        onclick: saveWords,
      }, [state.dirty ? 'Save' : 'Saved']));
    }
    topbarEl.appendChild(h('a', {
      class: 'ghost small',
      href: '/',
      target: '_blank',
      rel: 'noopener',
    }, ['View site']));
    topbarEl.appendChild(h('button', {
      class: 'ghost small',
      onclick: toggleTheme,
    }, [currentTheme() === 'dark' ? 'Light mode' : 'Dark mode']));
    topbarEl.appendChild(h('button', { onclick: openFolder }, ['Open gallery folder…']));
  }

  function fileField(label, entry, key, placeholder) {
    const input = h('input', {
      type: 'text',
      placeholder: placeholder || '',
      value: (state.words[entry.key] && state.words[entry.key][key]) || '',
      oninput: (e) => {
        if (!state.words[entry.key]) state.words[entry.key] = { word: '', definition: '', source: '' };
        state.words[entry.key][key] = e.target.value;
        markDirty();
      },
    });
    return h('div', { class: 'field' }, [h('label', {}, [label]), input]);
  }

  function definitionField(entry) {
    const textarea = h('textarea', {
      rows: 2,
      value: (state.words[entry.key] && state.words[entry.key].definition) || '',
      oninput: (e) => {
        if (!state.words[entry.key]) state.words[entry.key] = { word: '', definition: '', source: '' };
        state.words[entry.key].definition = e.target.value;
        markDirty();
      },
    });
    return h('div', { class: 'field' }, [h('label', {}, ['Definition']), textarea]);
  }

  function renderCard(entry) {
    const badge = h('span', { class: 'badge ' + entry.status }, [
      entry.status === 'live' ? 'Live' : entry.status === 'pending' ? 'Compressing…' : 'File missing',
    ]);

    const previewBox = h('div', {}, []);
    if (entry.status === 'missing') {
      previewBox.appendChild(h('div', { style: 'aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;color:var(--fg-dim);font-size:12px;background:#000;border-radius:6px;' }, ['no video file on disk']));
    } else {
      const video = h('video', { controls: true, muted: true, preload: 'metadata' }, []);
      previewBox.appendChild(video);
      getPreviewURL(entry).then((url) => { if (url) video.src = url; });
    }

    const card = h('div', { class: 'card' }, [
      previewBox,
      h('div', { class: 'card-header' }, [
        h('span', { class: 'filename', title: entry.key }, [entry.key]),
        badge,
      ]),
      fileField('Word', entry, 'word'),
      definitionField(entry),
      fileField('Source', entry, 'source', 'e.g. a book, website, or dialect dictionary'),
      h('div', { class: 'card-footer' }, [
        h('button', { class: 'danger', onclick: () => removeEntry(entry) }, ['Remove']),
      ]),
    ]);
    return card;
  }

  function renderDropzone() {
    const dz = h('div', { class: 'dropzone' }, ['Drop video files here, or click to choose']);
    const fileInput = h('input', {
      type: 'file', accept: 'video/*', multiple: true, style: 'display:none',
      onchange: (e) => { addVideoFiles(Array.from(e.target.files)); e.target.value = ''; },
    });
    dz.appendChild(fileInput);
    dz.addEventListener('click', () => fileInput.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      addVideoFiles(Array.from(e.dataTransfer.files));
    });
    return dz;
  }

  function renderMain() {
    clear(mainEl);
    if (!state.rootHandle) {
      mainEl.appendChild(h('div', { class: 'empty-state' }, [
        h('p', {}, ['Click "Open gallery folder…" above and pick the video-gallery folder (the one with index.html and videos/ in it).']),
      ]));
      return;
    }

    mainEl.appendChild(renderDropzone());

    const entries = buildEntries();
    if (entries.length === 0) {
      mainEl.appendChild(h('div', { class: 'empty-state' }, ['No videos yet — drop one in above.']));
      return;
    }

    const grid = h('div', { class: 'grid' }, entries.map(renderCard));
    mainEl.appendChild(grid);
  }

  function renderAll() {
    renderTopbar();
    renderMain();
  }

  // -------------------------------------------------------------------
  // init
  // -------------------------------------------------------------------
  const storedTheme = localStorage.getItem('videoGalleryEditor_theme');
  if (storedTheme === 'light' || storedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', storedTheme);
  }

  topbarEl = h('div', { class: 'topbar' }, []);
  mainEl = h('div', { class: 'main' }, []);
  statusEl = h('span', { class: 'status' }, ['']);
  app.appendChild(topbarEl);
  app.appendChild(mainEl);
  renderAll();

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
