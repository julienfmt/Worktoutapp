// Social server for the friends feature (social.js, RemoteBackend).
// Cloudflare Worker + one KV namespace bound as SOCIAL.
//
// Deploy:
//   wrangler kv namespace create SOCIAL
//   # wrangler.toml: name = "muscu-social", main = "workers/social-api.js",
//   # [[kv_namespaces]] binding = "SOCIAL", id = "<id>"
//   wrangler deploy
// Then set API_URL in social.js (or the `socialApiUrl` setting) to the
// worker URL. KV is eventually consistent (a few seconds, up to a minute
// across regions): fine for friends and the weekly board; if duo progress
// feels laggy between distant players, move duos to a Durable Object.
//
// Accounts are anonymous: one per install, identified by a bearer token.
// The store app can later attach Sign in with Apple / Google to keep the
// same account across devices.
//
// Friends find each other by @handle or by email. Emails are only kept as a
// SHA-256 hash (lookup key), never returned to anyone.

const DUO_TTL = 60 * 60 * 36;
const MAX_FRIENDS = 200;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
});
const fail = (error, status = 400) => json({ error }, status);

const randomId = (bytes = 16) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
const randomCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const cleanName = name => String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Sportif';
const HANDLE_RE = /^[a-z0-9._]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanHandle = value => String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 20);

async function emailKey(email) {
    const clean = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(clean) || clean.length > 80) return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// A free handle close to the wanted one (julien, julien7, julien42...).
async function freeHandle(env, wanted, ownerId = null) {
    let base = cleanHandle(wanted);
    if (base.length < 3) base = `${base || 'sportif'}${Math.floor(100 + Math.random() * 900)}`;
    base = base.slice(0, 16);
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = attempt === 0 ? base : `${base}${Math.floor(Math.random() * (attempt < 5 ? 100 : 10000))}`;
        const holder = await env.SOCIAL.get(`handle:${candidate}`);
        if (!holder || holder === ownerId) return candidate;
    }
    return `${base}${randomId(2)}`;
}

async function getJson(env, key, fallback = null) {
    const value = await env.SOCIAL.get(key, 'json');
    return value ?? fallback;
}

async function putJson(env, key, value, ttl) {
    await env.SOCIAL.put(key, JSON.stringify(value), ttl ? { expirationTtl: ttl } : undefined);
}

async function authenticate(request, env) {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const userId = await env.SOCIAL.get(`token:${token}`);
    return userId ? getJson(env, `user:${userId}`) : null;
}

const publicFriend = (user, viewer) => ({
    id: user.id,
    name: user.name,
    handle: user.handle || null,
    // Scores from another week count as zero on this week's board.
    weekXp: user.weekKey === viewer.weekKey ? user.weekXp || 0 : 0,
    weekSessions: user.weekKey === viewer.weekKey ? user.weekSessions || 0 : 0,
    inSession: Boolean(user.inSession) && Date.now() - (user.updatedAt || 0) < 3 * 60 * 60 * 1000
});

async function register(request, env) {
    const { installId, name, email, handle } = await request.json().catch(() => ({}));
    if (!installId || String(installId).length > 80) return fail('invalid-install');
    const existing = await env.SOCIAL.get(`install:${installId}`);
    if (existing) {
        const user = await getJson(env, `user:${existing}`);
        return json({ userId: user.id, code: user.code, token: user.token, handle: user.handle || null });
    }
    let code = randomCode();
    while (await env.SOCIAL.get(`code:${code}`)) code = randomCode();
    const user = { id: randomId(8), name: cleanName(name), code, token: randomId(24), createdAt: Date.now(), updatedAt: Date.now() };
    user.handle = await freeHandle(env, handle || String(email || '').split('@')[0] || name, user.id);
    const hashed = await emailKey(email);
    const emailTaken = hashed ? await env.SOCIAL.get(`email:${hashed}`) : null;
    if (hashed && !emailTaken) user.emailKey = hashed;
    await Promise.all([
        putJson(env, `user:${user.id}`, user),
        env.SOCIAL.put(`token:${user.token}`, user.id),
        env.SOCIAL.put(`code:${code}`, user.id),
        env.SOCIAL.put(`handle:${user.handle}`, user.id),
        user.emailKey ? env.SOCIAL.put(`email:${user.emailKey}`, user.id) : null,
        env.SOCIAL.put(`install:${installId}`, user.id)
    ]);
    return json({ userId: user.id, code: user.code, token: user.token, handle: user.handle });
}

async function updateProfile(request, env, me) {
    const body = await request.json().catch(() => ({}));
    if (body.handle !== undefined) {
        const wanted = cleanHandle(body.handle);
        if (!HANDLE_RE.test(wanted)) return fail('invalid-handle');
        if (wanted !== me.handle) {
            const holder = await env.SOCIAL.get(`handle:${wanted}`);
            if (holder && holder !== me.id) return fail('handle-taken', 409);
            if (me.handle) await env.SOCIAL.delete(`handle:${me.handle}`);
            await env.SOCIAL.put(`handle:${wanted}`, me.id);
            me.handle = wanted;
        }
    }
    if (body.email !== undefined) {
        const hashed = await emailKey(body.email);
        if (hashed !== (me.emailKey || null)) {
            const holder = hashed ? await env.SOCIAL.get(`email:${hashed}`) : null;
            if (holder && holder !== me.id) return fail('email-taken', 409);
            if (me.emailKey) await env.SOCIAL.delete(`email:${me.emailKey}`);
            if (hashed) await env.SOCIAL.put(`email:${hashed}`, me.id);
            me.emailKey = hashed || null;
        }
    }
    Object.assign(me, {
        name: cleanName(body.name || me.name),
        weekKey: String(body.weekKey || '').slice(0, 12),
        weekXp: Math.max(0, Math.min(100000, Math.round(Number(body.weekXp) || 0))),
        weekSessions: Math.max(0, Math.min(50, Math.round(Number(body.weekSessions) || 0))),
        inSession: Boolean(body.inSession),
        updatedAt: Date.now()
    });
    await putJson(env, `user:${me.id}`, me);
    return json({ ok: true, handle: me.handle || null });
}

async function listFriends(env, me) {
    const ids = await getJson(env, `friends:${me.id}`, []);
    const users = await Promise.all(ids.map(id => getJson(env, `user:${id}`)));
    return json({ friends: users.filter(Boolean).map(user => publicFriend(user, me)) });
}

// "@julien", "julien", "julien@mail.com" or an old 6-character friend code.
async function resolveFriendQuery(env, query) {
    const raw = String(query || '').trim();
    if (EMAIL_RE.test(raw)) {
        const hashed = await emailKey(raw);
        return hashed ? env.SOCIAL.get(`email:${hashed}`) : null;
    }
    const handle = cleanHandle(raw);
    if (HANDLE_RE.test(handle)) {
        const byHandle = await env.SOCIAL.get(`handle:${handle}`);
        if (byHandle) return byHandle;
    }
    const code = raw.replace(/^@/, '').toUpperCase();
    return /^[A-Z0-9]{6}$/.test(code) ? env.SOCIAL.get(`code:${code}`) : null;
}

async function addFriend(request, env, me) {
    const { query, code } = await request.json().catch(() => ({}));
    const raw = String(query ?? code ?? '').trim();
    if (!raw || raw.length > 80) return fail('invalid-query');
    const friendId = await resolveFriendQuery(env, raw);
    if (!friendId) return fail('not-found', 404);
    if (friendId === me.id) return fail('self');
    const already = await getJson(env, `friends:${me.id}`, []);
    if (already.includes(friendId)) return fail('already-friends', 409);
    const friend = await getJson(env, `user:${friendId}`);
    // A shared code is an explicit invitation: the friendship is mutual.
    for (const [owner, other] of [[me.id, friendId], [friendId, me.id]]) {
        const list = await getJson(env, `friends:${owner}`, []);
        if (!list.includes(other) && list.length < MAX_FRIENDS) await putJson(env, `friends:${owner}`, [...list, other]);
    }
    return json({ friend: { id: friend.id, name: friend.name, handle: friend.handle || null } });
}

async function inbox(env, me) {
    const duoIds = await getJson(env, `inbox:${me.id}`, []);
    const duos = (await Promise.all(duoIds.map(id => getJson(env, `duo:${id}`)))).filter(duo => duo && duo.status === 'pending');
    if (duos.length !== duoIds.length) await putJson(env, `inbox:${me.id}`, duos.map(duo => duo.id), DUO_TTL);
    const hosts = await Promise.all(duos.map(duo => getJson(env, `user:${duo.hostId}`)));
    return json({
        invites: duos.map((duo, index) => ({
            id: duo.id,
            from: { id: duo.hostId, name: hosts[index]?.name || 'Ton pote', handle: hosts[index]?.handle || null },
            session: duo.session,
            createdAt: duo.createdAt
        }))
    });
}

function cleanSession(session) {
    const exercises = Array.isArray(session?.exercises) ? session.exercises.slice(0, 30) : [];
    const number = value => (Number.isFinite(Number(value)) ? Number(value) : null);
    return {
        name: cleanName(session?.name).slice(0, 40),
        exercises: exercises.map(exercise => ({
            name: String(exercise?.name || '').slice(0, 80),
            sets: number(exercise?.sets),
            repsMin: number(exercise?.repsMin),
            repsMax: number(exercise?.repsMax),
            rest: number(exercise?.rest),
            rir: number(exercise?.rir)
        })).filter(exercise => exercise.name)
    };
}

async function createDuo(request, env, me) {
    const { friendId, session } = await request.json().catch(() => ({}));
    const friends = await getJson(env, `friends:${me.id}`, []);
    if (!friends.includes(friendId)) return fail('not-friends', 403);
    const duo = {
        id: randomId(10),
        hostId: me.id,
        guestId: friendId,
        session: cleanSession(session),
        status: 'pending',
        progress: {},
        createdAt: Date.now()
    };
    await putJson(env, `duo:${duo.id}`, duo, DUO_TTL);
    const box = await getJson(env, `inbox:${friendId}`, []);
    await putJson(env, `inbox:${friendId}`, [...box.slice(-9), duo.id], DUO_TTL);
    return json({ id: duo.id });
}

async function loadDuo(env, id, me) {
    const duo = await getJson(env, `duo:${id}`);
    if (!duo || (duo.hostId !== me.id && duo.guestId !== me.id)) return null;
    return duo;
}

async function respondDuo(request, env, me, id) {
    const duo = await loadDuo(env, id, me);
    if (!duo || duo.guestId !== me.id) return fail('not-found', 404);
    const { accept } = await request.json().catch(() => ({}));
    duo.status = accept ? 'active' : 'declined';
    duo.acceptedAt = accept ? Date.now() : null;
    await putJson(env, `duo:${duo.id}`, duo, DUO_TTL);
    return json({ ok: true });
}

async function pushProgress(request, env, me, id) {
    const duo = await loadDuo(env, id, me);
    if (!duo) return fail('not-found', 404);
    const body = await request.json().catch(() => ({}));
    const number = (value, max) => Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
    // Sets per exercise (name → [{ w, r }]) for the set-by-set comparison.
    const exercises = {};
    Object.entries(body.exercises && typeof body.exercises === 'object' ? body.exercises : {}).slice(0, 30).forEach(([name, sets]) => {
        if (!Array.isArray(sets)) return;
        exercises[String(name).slice(0, 80)] = sets.slice(0, 12).map(set => ({
            w: Math.max(0, Math.min(1000, Math.round((Number(set?.w) || 0) * 4) / 4)),
            r: number(set?.r, 200)
        }));
    });
    duo.progress[me.id] = {
        exercises,
        exercisesDone: number(body.exercisesDone, 50),
        exercisesTotal: number(body.exercisesTotal, 50),
        sets: number(body.sets, 500),
        tonnage: number(body.tonnage, 200000),
        durationMs: number(body.durationMs, 6 * 60 * 60 * 1000),
        finished: Boolean(body.finished),
        at: Date.now()
    };
    await putJson(env, `duo:${duo.id}`, duo, DUO_TTL);
    return json({ ok: true });
}

async function getDuo(env, me, id) {
    const duo = await loadDuo(env, id, me);
    if (!duo) return json({ id, status: 'ended', members: [] });
    const otherId = duo.hostId === me.id ? duo.guestId : duo.hostId;
    const other = await getJson(env, `user:${otherId}`);
    return json({
        id: duo.id,
        status: duo.status,
        members: [{
            id: otherId,
            name: other?.name || 'Ton pote',
            handle: other?.handle || null,
            accepted: duo.status === 'active',
            progress: duo.progress[otherId] || null
        }]
    });
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
        const { pathname } = new URL(request.url);
        try {
            if (pathname === '/v1/register' && request.method === 'POST') return register(request, env);
            const me = await authenticate(request, env);
            if (!me) return fail('unauthorized', 401);
            if (pathname === '/v1/profile' && request.method === 'POST') return updateProfile(request, env, me);
            if (pathname === '/v1/friends' && request.method === 'GET') return listFriends(env, me);
            if (pathname === '/v1/friends' && request.method === 'POST') return addFriend(request, env, me);
            if (pathname === '/v1/inbox' && request.method === 'GET') return inbox(env, me);
            if (pathname === '/v1/duos' && request.method === 'POST') return createDuo(request, env, me);
            const match = pathname.match(/^\/v1\/duos\/([a-f0-9]+)(?:\/(respond|progress))?$/);
            if (match) {
                const [, id, action] = match;
                if (!action && request.method === 'GET') return getDuo(env, me, id);
                if (action === 'respond' && request.method === 'POST') return respondDuo(request, env, me, id);
                if (action === 'progress' && request.method === 'POST') return pushProgress(request, env, me, id);
            }
            return fail('not-found', 404);
        } catch (error) {
            return fail('server-error', 500);
        }
    }
};
