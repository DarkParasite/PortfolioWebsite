// Tier list API (Cloudflare Worker) for the editor at /tiers/edit/.
// It checks the password, searches IGDB for games, and commits the tier list to GitHub.
//
// Secrets live in Cloudflare, never in this repo (`npx wrangler secret put <NAME>`):
//   PASSWORD              what you type on the editor's login screen
//   GITHUB_TOKEN          fine-grained token, this repo only, "Contents: read and write"
//   TWITCH_CLIENT_ID      IGDB uses Twitch developer apps for its API keys
//   TWITCH_CLIENT_SECRET
// Plain settings (repo, branch, file paths, allowed origins) are in wrangler.toml.

const SESSION_DAYS = 7;
const COVERS_URL = '/assets/tiers/';          // where uploaded covers are served on the site
const UPLOAD_PATH = /^\/assets\/tiers\/[a-z0-9][a-z0-9-]*\.(jpg|png|webp)$/;
const MAX_BODY_BYTES = 25e6;

export default {
    async fetch(request, env) {
        const cors = corsHeaders(request, env);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

        let response;
        try {
            response = await route(request, env, new URL(request.url));
        } catch (err) {
            if (!err.status) console.error(err);
            response = json({ error: err.status ? err.message : 'Server error' }, err.status || 500);
        }
        for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
        return response;
    },
};

async function route(request, env, url) {
    const { method } = request;
    const { pathname } = url;

    if (pathname === '/login' && method === 'POST') return login(request, env);

    if (!(await isAuthorized(request, env))) throw httpError(401, 'Not logged in');

    if (pathname === '/data' && method === 'GET') return json(await readData(env));
    if (pathname === '/search' && method === 'GET') return json({ results: await searchGames(env, url.searchParams.get('q') || '') });
    if (pathname === '/image' && method === 'GET') return proxyImage(url.searchParams.get('url'));
    if (pathname === '/save' && method === 'POST') return json(await save(env, await readJson(request)));

    throw httpError(404, 'Not found');
}

// ---- Auth ----
// The session token is "<expiry ms>.<HMAC of expiry>", signed with the password itself,
// so changing the password logs out every device.

async function login(request, env) {
    requireSecret(env, 'PASSWORD');

    if (env.LOGIN_LIMITER) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const { success } = await env.LOGIN_LIMITER.limit({ key: ip });
        if (!success) throw httpError(429, 'Too many attempts. Try again in a minute.');
    }

    const { password } = await readJson(request);
    if (typeof password !== 'string' || !(await sameText(password, env.PASSWORD))) {
        throw httpError(401, 'Wrong password');
    }

    const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    return json({ token: `${expires}.${await sign(env, String(expires))}`, expires });
}

async function isAuthorized(request, env) {
    requireSecret(env, 'PASSWORD');
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const [expires, signature] = token.split('.');
    if (!signature || !(Number(expires) > Date.now())) return false;
    return sameText(signature, await sign(env, expires));
}

async function sign(env, text) {
    const key = await crypto.subtle.importKey('raw', encode(env.PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return base64url(await crypto.subtle.sign('HMAC', key, encode(text)));
}

// Constant-time string compare (hash first so both sides are the same length).
async function sameText(a, b) {
    const [ha, hb] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', encode(s))));
    return crypto.subtle.timingSafeEqual(ha, hb);
}

// ---- Tier list data (stored in the repo, committed through the GitHub API) ----

async function readData(env) {
    const file = await github(env, `/contents/${env.DATA_PATH}?ref=${env.GITHUB_BRANCH}`, { allow404: true });
    if (!file) return { data: null, sha: null };
    return { data: JSON.parse(decodeBase64(file.content)), sha: file.sha };
}

// One commit per save: the tier list JSON, any new cover images, and deletion of covers nothing uses anymore.
// `sha` is the version of tiers.json the editor started from; if the file changed since (another device saved), refuse.
async function save(env, { data, sha, uploads = [] }) {
    const games = validate(data);
    data.updated = new Date().toISOString();
    const text = JSON.stringify(data, null, 2) + '\n';

    const head = (await github(env, `/git/ref/heads/${env.GITHUB_BRANCH}`)).object.sha;
    const current = await github(env, `/contents/${env.DATA_PATH}?ref=${head}`, { allow404: true });
    if ((current?.sha || null) !== (sha || null)) {
        throw httpError(409, 'The tier list was changed somewhere else since you opened it. Reload to get the latest version.');
    }

    const tree = [{ path: env.DATA_PATH, mode: '100644', type: 'blob', content: text }];

    for (const upload of uploads) {
        if (!UPLOAD_PATH.test(upload.path) || typeof upload.base64 !== 'string') throw httpError(400, 'Bad cover upload');
        const blob = await github(env, '/git/blobs', { method: 'POST', body: { content: upload.base64, encoding: 'base64' } });
        tree.push({ path: repoPath(env, upload.path), mode: '100644', type: 'blob', sha: blob.sha });
    }

    const used = new Set(games.map(g => g.cover).filter(c => c && c.startsWith(COVERS_URL)));
    const existing = await github(env, `/contents/${repoPath(env, COVERS_URL).replace(/\/$/, '')}?ref=${head}`, { allow404: true }) || [];
    for (const file of existing) {
        if (file.type === 'file' && !used.has(COVERS_URL + file.name)) {
            tree.push({ path: file.path, mode: '100644', type: 'blob', sha: null });
        }
    }

    const baseTree = (await github(env, `/git/commits/${head}`)).tree.sha;
    const newTree = await github(env, '/git/trees', { method: 'POST', body: { base_tree: baseTree, tree } });
    const message = uploads.length ? `Update game tier list (+${uploads.length} cover${uploads.length > 1 ? 's' : ''})` : 'Update game tier list';
    const commit = await github(env, '/git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [head] } });

    try {
        await github(env, `/git/refs/heads/${env.GITHUB_BRANCH}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    } catch (err) {
        // Not a fast-forward: something was pushed between reading the branch and updating it.
        if (err.status === 422) throw httpError(409, 'The repo changed while saving. Try saving again.');
        throw err;
    }

    return { sha: await gitBlobSha(text), updated: data.updated, commit: commit.sha };
}

function validate(data) {
    const bad = () => { throw httpError(400, 'Bad tier list data'); };
    if (!data || typeof data !== 'object' || !Array.isArray(data.tiers) || !Array.isArray(data.unranked)) bad();

    const games = [...data.tiers.flatMap(t => (Array.isArray(t?.games) ? t.games : bad())), ...data.unranked];
    for (const g of games) {
        if (!g || typeof g.id !== 'string' || typeof g.name !== 'string') bad();
        if (g.cover && !(g.cover.startsWith('https://') || UPLOAD_PATH.test(g.cover))) bad();
    }
    return games;
}

// "/assets/tiers/x.jpg" -> "public/assets/tiers/x.jpg"
const repoPath = (env, sitePath) => env.SITE_DIR + sitePath;

async function github(env, path, { method = 'GET', body, allow404 = false } = {}) {
    requireSecret(env, 'GITHUB_TOKEN');
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'tier-list-api',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body && JSON.stringify(body),
    });

    if (res.status === 404 && allow404) return null;
    if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        console.error(`GitHub ${method} ${path} -> ${res.status}: ${detail}`);
        const hint = res.status === 401 ? 'GITHUB_TOKEN is invalid or expired.'
            : res.status === 403 ? 'GITHUB_TOKEN needs "Contents: Read and write" on this repo.'
            : 'Check GITHUB_TOKEN and GITHUB_REPO.';
        const err = httpError(502, `GitHub error ${res.status}. ${hint}`);
        if (res.status === 409 || res.status === 422) err.status = res.status;
        throw err;
    }
    return res.json();
}

// ---- IGDB ----

let twitchToken = null; // { value, expires }, reused while this Worker instance lives

async function igdbToken(env) {
    requireSecret(env, 'TWITCH_CLIENT_ID');
    requireSecret(env, 'TWITCH_CLIENT_SECRET');
    if (twitchToken && twitchToken.expires > Date.now() + 60_000) return twitchToken.value;

    const params = new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
    });
    const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' });
    if (!res.ok) throw httpError(502, 'Could not log in to IGDB. Check TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.');

    const body = await res.json();
    twitchToken = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return twitchToken.value;
}

async function searchGames(env, query) {
    query = query.replace(/["\\]/g, '').trim().slice(0, 100);
    if (query.length < 2) return [];

    const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
            'Client-ID': env.TWITCH_CLIENT_ID,
            Authorization: `Bearer ${await igdbToken(env)}`,
            Accept: 'application/json',
        },
        // version_parent = null hides "Deluxe Edition" style duplicates
        body: `search "${query}"; fields name,first_release_date,cover.image_id,platforms.abbreviation; where version_parent = null; limit 30;`,
    });
    if (res.status === 401) twitchToken = null;
    if (!res.ok) throw httpError(502, `IGDB search failed (${res.status})`);

    return (await res.json()).map(g => ({
        igdb: g.id,
        name: g.name,
        year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
        cover: g.cover?.image_id || null,
        platforms: (g.platforms || []).map(p => p.abbreviation).filter(Boolean).slice(0, 4),
    }));
}

// ---- Image proxy: lets the editor turn any image URL into an uploaded cover (browsers block most cross-site images) ----

async function proxyImage(target) {
    let url;
    try { url = new URL(target); } catch { throw httpError(400, 'Invalid image URL'); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw httpError(400, 'Invalid image URL');

    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (tier-list-editor)' } });
    const type = res.headers.get('Content-Type') || '';
    if (!res.ok || !type.startsWith('image/')) throw httpError(400, "That URL didn't return an image");

    const body = await res.arrayBuffer();
    if (body.byteLength > 10e6) throw httpError(413, 'Image is too big (10 MB max)');
    return new Response(body, { headers: { 'Content-Type': type } });
}

// ---- Helpers ----

function corsHeaders(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    if (!origin || !allowed.includes(origin)) return {};
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

async function readJson(request) {
    if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw httpError(413, 'Request too large');
    try { return await request.json(); } catch { throw httpError(400, 'Expected JSON'); }
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function httpError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function requireSecret(env, name) {
    if (!env[name]) throw httpError(500, `The ${name} secret is not set on the Worker.`);
}

const encode = text => new TextEncoder().encode(text);

function base64url(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64(b64) {
    return new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
}

// Same id git gives the file, so the editor can detect conflicts on its next save without re-reading it.
async function gitBlobSha(text) {
    const body = encode(text);
    const bytes = new Uint8Array([...encode(`blob ${body.length}\0`), ...body]);
    const hash = await crypto.subtle.digest('SHA-1', bytes);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
