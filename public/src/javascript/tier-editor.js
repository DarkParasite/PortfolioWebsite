// Tier list editor (/tiers/edit/).
// This page holds no secrets. It sends your password to the Worker in /worker, which checks it, searches IGDB,
// and commits the tier list to GitHub. Without a valid session the Worker refuses everything, so the page being public is fine.

// The Worker's URL (printed by `npx wrangler deploy` in /worker). On localhost, `npm run dev` there serves it on 8787.
const API_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:8787'
    : 'https://tier-list-api.rishikhanna.workers.dev';

const SESSION_KEY = 'tiers.session';
const COVER_W = 528, COVER_H = 748; // uploaded covers: 2x IGDB's t_cover_big
const IGDB_COVER = id => `https://images.igdb.com/igdb/image/upload/t_cover_big/${id}.jpg`;

const $ = (selector, root = document) => root.querySelector(selector);
const esc = Tiers.esc;

let session = loadSession();
let data = null;            // the tier list being edited
let sha = null;             // git id of tiers.json when loaded; the Worker refuses to save over a newer version
let version = 0;            // bumped on every change; dirty = version !== savedVersion
let savedVersion = 0;
let saving = false;
const uploads = new Map();  // '/assets/tiers/x.jpg' -> { dataUrl, saved } for covers made in this session
let sortables = [];
let search = { query: '', results: [], loading: false, error: '' };

// ---------------------------------------------------------------- session + API

function loadSession() {
    try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY));
        return s && s.expires > Date.now() ? s : null;
    } catch { return null; }
}

function storeSession(s) {
    session = s;
    try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {}
}

class AuthError extends Error {}

async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
        res = await fetch(API_URL + path, {
            method,
            headers: {
                ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body && JSON.stringify(body),
        });
    } catch {
        throw new Error("Can't reach the tier list API. Is API_URL in tier-editor.js right?");
    }

    if (res.status === 401 && path !== '/login') {
        storeSession(null);
        showLogin('Session expired, log in again. Unsaved changes are kept.');
        throw new AuthError('Session expired');
    }

    const isJson = (res.headers.get('Content-Type') || '').includes('json');
    const payload = isJson ? await res.json() : await res.blob();
    if (!res.ok) {
        const err = new Error(payload.error || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return payload;
}

// ---------------------------------------------------------------- views

function show(view) {
    for (const id of ['loading', 'login', 'editor']) $(`#${id}`).classList.toggle('hidden', id !== view);
    if (view === 'editor') layoutSticky();
    if (view === 'login') $('#password').focus();
}

function showLogin(error = '') {
    show('login');
    $('#login-error').textContent = error;
    $('#login-error').classList.toggle('hidden', !error);
}

// The toolbar sticks to the top of the window; the add panel sticks just under it.
function layoutSticky() {
    $('#toolbar').style.top = '0px';
    $('#add-panel').style.top = `${$('#toolbar').offsetHeight + 16}px`;
}

let toastTimer;
function toast(message, error = false) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('error', error);
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), error ? 7000 : 3000);
}

// ---------------------------------------------------------------- data

function defaultTiers() {
    return ['S', 'A', 'B', 'C', 'D', 'F'].map((label, i) => ({
        id: label.toLowerCase(), label, caption: '', color: TIER_COLORS[i < 5 ? i : 7], games: [],
    }));
}

function normalize(d) {
    d = d || {};
    return {
        ...d,
        title: d.title || 'Game Tier List',
        intro: d.intro || '',
        tiers: (d.tiers?.length ? d.tiers : defaultTiers()).map(t => ({ caption: '', ...t, games: t.games || [] })),
        unranked: d.unranked || [],
    };
}

async function loadData() {
    show('loading');
    try {
        const res = await api('/data');
        data = normalize(res.data);
        sha = res.sha;
        version = savedVersion = 0;
        for (const [path, upload] of uploads) if (!upload.saved) uploads.delete(path);
        $('#page-title').value = data.title;
        $('#page-intro').value = data.intro;
        render();
        show('editor');
        updateStatus();
    } catch (err) {
        if (!(err instanceof AuthError)) showLogin(err.message);
    }
}

const listOf = id => (id === 'unranked' ? data.unranked : data.tiers.find(t => t.id === id).games);
const allGames = () => [...data.tiers.flatMap(t => t.games), ...data.unranked];
const listName = id => (id === 'unranked' ? 'Unranked' : `${data.tiers.find(t => t.id === id).label} tier`);

function findGame(id) {
    for (const listId of ['unranked', ...data.tiers.map(t => t.id)]) {
        const list = listOf(listId);
        const index = list.findIndex(g => g.id === id);
        if (index >= 0) return { game: list[index], listId, list, index };
    }
    return null;
}

const randomId = (n = 6) => crypto.randomUUID().replace(/-/g, '').slice(0, n);
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const newGameId = name => `${slug(name) || 'game'}-${randomId(4)}`;

function changed() {
    version++;
    updateStatus();
}

function updateStatus() {
    const dirty = version !== savedVersion;
    $('#status').innerHTML = saving
        ? `<i class="fa-solid fa-circle-notch fa-spin text-gray-400"></i><span class="text-gray-500">saving…</span>`
        : dirty
            ? `<span class="h-2 w-2 rounded-full bg-amber-400"></span><span class="text-amber-700">unsaved<span class="hidden sm:inline"> changes</span></span>`
            : `<span class="h-2 w-2 rounded-full bg-green-500"></span><span class="text-gray-500">saved${data?.updated ? `<span class="hidden sm:inline"> · ${Tiers.formatDate(data.updated)}</span>` : ''}</span>`;
    $('#save').disabled = saving || !dirty;
    $('#revert').disabled = saving || !dirty;
}

// ---------------------------------------------------------------- board

// Shows covers made this session from memory, since they aren't on the live site until the deploy finishes.
const coverSrc = game => uploads.get(game.cover)?.dataUrl || game.cover;

// No whitespace inside .tier-items, so :empty shows the "drop games here" hint.
const tile = game => `<button type="button" class="cover" data-game="${esc(game.id)}" title="${esc(game.name)}">${Tiers.coverInner(game, coverSrc(game))}</button>`;

function render() {
    $('#board').innerHTML = data.tiers.map(tier => `
        <div class="tier-row" data-tier="${esc(tier.id)}">
            <button type="button" class="tier-label" style="${Tiers.labelStyle(tier)}" data-edit-tier="${esc(tier.id)}" title="Edit tier">${Tiers.labelInner(tier)}</button>
            <div class="tier-items editable" data-list="${esc(tier.id)}">${tier.games.map(tile).join('')}</div>
            <div class="tier-handle" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></div>
        </div>`).join('');
    $('#unranked').innerHTML = data.unranked.map(tile).join('');

    renderTargets();
    renderResults();
    bindSortables();
}

function bindSortables() {
    sortables.forEach(s => s.destroy());
    sortables = [...document.querySelectorAll('#editor [data-list]')].map(el => Sortable.create(el, {
        group: 'games',
        draggable: '.cover',
        animation: 150,
        delay: 150, delayOnTouchOnly: true,   // on phones: long-press to drag, so scrolling still works
        ghostClass: 'cover-ghost',
        onEnd: e => {
            if (e.from === e.to && e.oldIndex === e.newIndex) return;
            const [game] = listOf(e.from.dataset.list).splice(e.oldIndex, 1);
            listOf(e.to.dataset.list).splice(e.newIndex, 0, game);
            changed();
        },
    }));
    sortables.push(Sortable.create($('#board'), {
        handle: '.tier-handle',
        draggable: '.tier-row',
        animation: 150,
        ghostClass: 'tier-ghost',
        onEnd: e => {
            if (e.oldIndex === e.newIndex) return;
            const [tier] = data.tiers.splice(e.oldIndex, 1);
            data.tiers.splice(e.newIndex, 0, tier);
            changed();
            renderTargets();
        },
    }));
}

function renderTargets() {
    const select = $('#add-target');
    const current = select.value || 'unranked';
    select.innerHTML = `<option value="unranked">Unranked</option>`
        + data.tiers.map(t => `<option value="${esc(t.id)}">${esc(t.label)} tier${t.caption ? ` · ${esc(t.caption)}` : ''}</option>`).join('');
    select.value = [...select.options].some(o => o.value === current) ? current : 'unranked';
}

function addGame(game) {
    const target = $('#add-target').value;
    listOf(target).push(game);
    changed();
    render();
    toast(`Added ${game.name} → ${listName(target)}`);
}

$('#add-tier').addEventListener('click', () => {
    const used = new Set(data.tiers.map(t => t.color));
    const tier = { id: `t-${randomId(5)}`, label: '?', caption: '', color: TIER_COLORS.find(c => !used.has(c)) || TIER_COLORS.at(-1), games: [] };
    data.tiers.push(tier);
    changed();
    render();
    openTier(tier.id);
});

for (const area of [$('#board'), $('#unranked')]) {
    area.addEventListener('click', e => {
        const game = e.target.closest('[data-game]');
        if (game) return openGame(game.dataset.game);
        const tier = e.target.closest('[data-edit-tier]');
        if (tier) openTier(tier.dataset.editTier);
    });
}

$('#page-title').addEventListener('input', e => { data.title = e.target.value; changed(); });
$('#page-intro').addEventListener('input', e => { data.intro = e.target.value; changed(); });

// ---------------------------------------------------------------- covers (upload / URL)

// Center-crops any image to the cover shape and returns a JPEG data URL.
async function toCoverDataUrl(blob) {
    let bitmap;
    try { bitmap = await createImageBitmap(blob); } catch { throw new Error("Couldn't read that image"); }
    const canvas = document.createElement('canvas');
    canvas.width = COVER_W;
    canvas.height = COVER_H;
    const scale = Math.max(COVER_W / bitmap.width, COVER_H / bitmap.height);
    const w = bitmap.width * scale, h = bitmap.height * scale;
    canvas.getContext('2d').drawImage(bitmap, (COVER_W - w) / 2, (COVER_H - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
}

// Turns a File or an image URL into a cover path that gets committed on the next save.
async function makeCover(source, name) {
    const blob = typeof source === 'string' ? await api(`/image?url=${encodeURIComponent(source)}`) : source;
    const dataUrl = await toCoverDataUrl(blob);
    const path = `/assets/tiers/${slug(name) || 'cover'}-${randomId(5)}.jpg`;
    uploads.set(path, { dataUrl, saved: false });
    return path;
}

// Wires a file input + URL input to makeCover. onCover(path) gets the result.
function coverPicker(fileInput, urlInput, preview, getName, onCover) {
    const run = async source => {
        preview.innerHTML = `<span class="cover-fallback"><i class="fa-solid fa-circle-notch fa-spin"></i></span>`;
        try {
            onCover(await makeCover(source, getName()));
        } catch (err) {
            if (!(err instanceof AuthError)) toast(err.message, true);
            onCover(null);
        }
    };
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) run(fileInput.files[0]);
        fileInput.value = '';
    });
    urlInput.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();   // don't submit the surrounding form
        if (urlInput.value.trim()) run(urlInput.value.trim());
        urlInput.value = '';
    });
    urlInput.addEventListener('paste', () => setTimeout(() => {
        if (/^https?:\/\//.test(urlInput.value.trim())) { run(urlInput.value.trim()); urlInput.value = ''; }
    }));
}

// ---------------------------------------------------------------- add panel: IGDB search + custom game

for (const chip of document.querySelectorAll('[data-tab]')) {
    chip.addEventListener('click', () => {
        for (const c of document.querySelectorAll('[data-tab]')) c.classList.toggle('active', c === chip);
        for (const p of document.querySelectorAll('[data-panel]')) p.classList.toggle('hidden', p.dataset.panel !== chip.dataset.tab);
    });
}

let searchTimer;
$('#search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target.value.trim()), 350);
});
$('#search').addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(e.target.value.trim()); }
});

async function runSearch(query) {
    if (query === search.query && !search.error) return;
    search = { query, results: [], loading: query.length >= 2, error: '' };
    renderResults();
    if (!search.loading) return;
    try {
        const { results } = await api(`/search?q=${encodeURIComponent(query)}`);
        if (search.query === query) search = { ...search, results, loading: false };
    } catch (err) {
        if (search.query === query) search = { ...search, loading: false, error: err.message };
    }
    renderResults();
}

function renderResults() {
    const el = $('#results');
    const hint = text => `<p class="font-mono text-xs text-gray-400 py-2">${text}</p>`;
    if (search.loading) return el.innerHTML = hint('<i class="fa-solid fa-circle-notch fa-spin"></i> searching…');
    if (search.error) return el.innerHTML = `<p class="text-sm text-red-600 py-2">${esc(search.error)}</p>`;
    if (search.query.length < 2) return el.innerHTML = hint('// results from igdb.com, click one to add it');
    if (!search.results.length) return el.innerHTML = hint('// no matches. try another spelling, or the custom tab');

    const games = allGames();
    const addedIds = new Set(games.map(g => g.igdb).filter(Boolean));
    const addedNames = new Set(games.map(g => g.name.toLowerCase()));
    el.innerHTML = `<div class="grid grid-cols-3 gap-x-2 gap-y-3 max-h-[60vh] overflow-y-auto pr-1">${search.results.map((r, i) => {
        const isAdded = addedIds.has(r.igdb) || addedNames.has(r.name.toLowerCase());
        const meta = [r.year, r.platforms.join(', ')].filter(Boolean).join(' · ');
        return `
            <button type="button" class="result" data-result="${i}" ${isAdded ? 'disabled title="Already on your list"' : `title="Add ${esc(r.name)}"`}>
                <div class="cover">${Tiers.coverInner(r, r.cover ? IGDB_COVER(r.cover) : '', { label: false })}${isAdded ? '<span class="added"><i class="fa-solid fa-check"></i></span>' : ''}</div>
                <p class="mt-1 text-xs font-semibold leading-tight line-clamp-2">${esc(r.name)}</p>
                ${meta ? `<p class="font-mono text-[10px] leading-tight text-gray-500 mt-0.5 line-clamp-2">${esc(meta)}</p>` : ''}
            </button>`;
    }).join('')}</div>`;
}

$('#results').addEventListener('click', e => {
    const button = e.target.closest('[data-result]:not(:disabled)');
    if (!button) return;
    const r = search.results[button.dataset.result];
    addGame({ id: newGameId(r.name), name: r.name, ...(r.year ? { year: r.year } : {}), cover: r.cover ? IGDB_COVER(r.cover) : '', igdb: r.igdb });
});

let customCover = null;
const customPreview = () => {
    const name = $('#custom-name').value.trim() || 'no cover';
    $('#custom-preview').innerHTML = Tiers.coverInner({ name }, customCover ? coverSrc({ cover: customCover }) : '', { label: false });
};
coverPicker($('#custom-file'), $('#custom-url'), $('#custom-preview'), () => $('#custom-name').value, path => {
    customCover = path || customCover;
    customPreview();
});
$('#custom-name').addEventListener('input', customPreview);

$('#custom-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#custom-name').value.trim();
    if (!name) return;
    const year = Number($('#custom-year').value);
    addGame({ id: newGameId(name), name, ...(year ? { year } : {}), cover: customCover || '' });
    e.target.reset();
    customCover = null;
    customPreview();
});

// ---------------------------------------------------------------- game dialog

let editingGame = null; // { id, cover } while the dialog is open; applied on Done

function openGame(id) {
    const { game, listId } = findGame(id);
    editingGame = { id, cover: game.cover };
    $('#gd-name').value = game.name;
    $('#gd-year').value = game.year || '';
    $('#gd-note').value = game.note || '';
    $('#gd-tier').innerHTML = `<option value="unranked">Unranked</option>`
        + data.tiers.map(t => `<option value="${esc(t.id)}">${esc(t.label)}${t.caption ? ` · ${esc(t.caption)}` : ''}</option>`).join('');
    $('#gd-tier').value = listId;
    renderGameCover();
    $('#game-dialog').showModal();
}

function renderGameCover() {
    $('#gd-cover').innerHTML = Tiers.coverInner({ name: $('#gd-name').value }, coverSrc({ cover: editingGame.cover }), { label: false });
}

coverPicker($('#gd-file'), $('#gd-url'), $('#gd-cover'), () => $('#gd-name').value, path => {
    if (path) editingGame.cover = path;
    renderGameCover();
});

$('#game-dialog form').addEventListener('submit', () => {
    const found = findGame(editingGame.id);
    if (!found) return;
    const { game, listId, list, index } = found;

    game.name = $('#gd-name').value.trim() || game.name;
    const year = Number($('#gd-year').value);
    if (year) game.year = year; else delete game.year;
    const note = $('#gd-note').value.trim();
    if (note) game.note = note; else delete game.note;
    game.cover = editingGame.cover;

    const target = $('#gd-tier').value;
    if (target !== listId) {
        list.splice(index, 1);
        listOf(target).push(game);
    }
    changed();
    render();
});

$('#gd-delete').addEventListener('click', () => {
    const { game, list, index } = findGame(editingGame.id);
    if (!confirm(`Remove ${game.name}?`)) return;
    list.splice(index, 1);
    $('#game-dialog').close();
    changed();
    render();
});

// ---------------------------------------------------------------- tier dialog (edits apply live)

let editingTier = null;

function openTier(id) {
    editingTier = data.tiers.find(t => t.id === id);
    $('#td-label').value = editingTier.label;
    $('#td-caption').value = editingTier.caption || '';
    renderSwatches();
    $('#tier-dialog').showModal();
}

function renderSwatches() {
    const color = editingTier.color;
    const custom = !TIER_COLORS.includes(color);
    $('#td-swatches').innerHTML = TIER_COLORS.map(c =>
        `<button type="button" class="swatch ${c === color ? 'active' : ''}" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join('')
        + `<label class="swatch relative ${custom ? 'active' : ''}" title="Custom color" style="background:conic-gradient(#f87171,#facc15,#4ade80,#22d3ee,#818cf8,#f472b6,#f87171)">
               <input type="color" value="${color}" class="absolute inset-0 h-full w-full opacity-0 cursor-pointer">
           </label>`;
}

function updateTier() {
    changed();
    render();
}

$('#td-label').addEventListener('input', e => { editingTier.label = e.target.value.trim() || '?'; updateTier(); });
$('#td-caption').addEventListener('input', e => { editingTier.caption = e.target.value.trim(); updateTier(); });
$('#td-swatches').addEventListener('click', e => {
    const swatch = e.target.closest('[data-color]');
    if (!swatch) return;
    editingTier.color = swatch.dataset.color;
    renderSwatches();
    updateTier();
});
$('#td-swatches').addEventListener('input', e => {
    editingTier.color = e.target.value;
    for (const s of document.querySelectorAll('#td-swatches .swatch')) s.classList.toggle('active', s.tagName === 'LABEL');
    updateTier();
});

$('#td-delete').addEventListener('click', () => {
    if (data.tiers.length === 1) return toast('Keep at least one tier', true);
    const count = editingTier.games.length;
    if (!confirm(`Delete the ${editingTier.label} tier?${count ? ` Its ${count} game${count > 1 ? 's' : ''} move to Unranked.` : ''}`)) return;
    data.unranked.push(...editingTier.games);
    data.tiers.splice(data.tiers.indexOf(editingTier), 1);
    $('#tier-dialog').close();
    changed();
    render();
});

for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', e => {
        if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    });
}

// ---------------------------------------------------------------- save / revert / login / logout

async function save() {
    if (saving || version === savedVersion) return;
    saving = true;
    updateStatus();

    const startVersion = version;
    const inUse = new Set(allGames().map(g => g.cover));
    const pending = [...uploads].filter(([path, u]) => !u.saved && inUse.has(path));
    try {
        const res = await api('/save', {
            method: 'POST',
            body: { data, sha, uploads: pending.map(([path, u]) => ({ path, base64: u.dataUrl.split(',')[1] })) },
        });
        sha = res.sha;
        data.updated = res.updated;
        pending.forEach(([, u]) => { u.saved = true; });
        savedVersion = startVersion;
        toast('Saved. The live page updates in about a minute.');
    } catch (err) {
        if (!(err instanceof AuthError)) toast(err.message, true);
    }
    saving = false;
    updateStatus();
}

$('#save').addEventListener('click', save);
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && data) {
        e.preventDefault();
        save();
    }
});

$('#revert').addEventListener('click', () => {
    if (confirm('Throw away your unsaved changes?')) loadData();
});

$('#logout').addEventListener('click', () => {
    if (version !== savedVersion && !confirm('You have unsaved changes. Log out anyway?')) return;
    storeSession(null);
    data = null;
    showLogin();
});

$('#login form').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        storeSession(await api('/login', { method: 'POST', body: { password: $('#password').value } }));
        $('#password').value = '';
        $('#login-error').classList.add('hidden');
        // Logged back in after the session expired mid-edit: keep the unsaved work.
        if (data) { show('editor'); updateStatus(); } else loadData();
    } catch (err) {
        showLogin(err.status === 401 ? 'Wrong password.' : err.message);
    }
    button.disabled = false;
});

window.addEventListener('beforeunload', e => {
    if (data && version !== savedVersion) e.preventDefault();
});
window.addEventListener('resize', () => { if (data) layoutSticky(); });

// ---------------------------------------------------------------- start

session ? loadData() : showLogin();
