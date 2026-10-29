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
    // Scores from another week count as zero on this week's board.
    weekXp: user.weekKey === viewer.weekKey ? user.weekXp || 0 : 0,
    weekSessions: user.weekKey === viewer.weekKey ? user.weekSessions || 0 : 0,
    inSession: Boolean(user.inSession) && Date.now() - (user.updatedAt || 0) < 3 * 60 * 60 * 1000
});

async function register(request, env) {
    const { installId, name } = await request.json().catch(() => ({}));
    if (!installId || String(installId).length > 80) return fail('invalid-install');
    const existing = await env.SOCIAL.get(`install:${installId}`);
    if (existing) {
        const user = await getJson(env, `user:${existing}`);
        return json({ userId: user.id, code: user.code, token: user.token });
    }
    let code = randomCode();
    while (await env.SOCIAL.get(`code:${code}`)) code = randomCode();
    const user = { id: randomId(8), name: cleanName(name), code, token: randomId(24), createdAt: Date.now(), updatedAt: Date.now() };
    await Promise.all([
        putJson(env, `user:${user.id}`, user),
        env.SOCIAL.put(`token:${user.token}`, user.id),
        env.SOCIAL.put(`code:${code}`, user.id),
        env.SOCIAL.put(`install:${installId}`, user.id)
    ]);
    return json({ userId: user.id, code: user.code, token: user.token });
}

async function updateProfile(request, env, me) {
    const body = await request.json().catch(() => ({}));
    Object.assign(me, {
        name: cleanName(body.name || me.name),
        weekKey: String(body.weekKey || '').slice(0, 12),
        weekXp: Math.max(0, Math.min(100000, Math.round(Number(body.weekXp) || 0))),
        weekSessions: Math.max(0, Math.min(50, Math.round(Number(body.weekSessions) || 0))),
        inSession: Boolean(body.inSession),
        updatedAt: Date.now()
    });
    await putJson(env, `user:${me.id}`, me);
    return json({ ok: true });
}

async function listFriends(env, me) {
    const ids = await getJson(env, `friends:${me.id}`, []);
    const users = await Promise.all(ids.map(id => getJson(env, `user:${id}`)));
    return json({ friends: users.filter(Boolean).map(user => publicFriend(user, me)) });
}

async function addFriend(request, env, me) {
    const { code } = await request.json().catch(() => ({}));
    const clean = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(clean)) return fail('invalid-code');
    const friendId = await env.SOCIAL.get(`code:${clean}`);
    if (!friendId) return fail('not-found', 404);
    if (friendId === me.id) return fail('own-code');
    const friend = await getJson(env, `user:${friendId}`);
    // A shared code is an explicit invitation: the friendship is mutual.
    for (const [owner, other] of [[me.id, friendId], [friendId, me.id]]) {
        const list = await getJson(env, `friends:${owner}`, []);
        if (!list.includes(other) && list.length < MAX_FRIENDS) await putJson(env, `friends:${owner}`, [...list, other]);
    }
    return json({ friend: { id: friend.id, name: friend.name } });
}

async function inbox(env, me) {
    const duoIds = await getJson(env, `inbox:${me.id}`, []);
    const duos = (await Promise.all(duoIds.map(id => getJson(env, `duo:${id}`)))).filter(duo => duo && duo.status === 'pending');
    if (duos.length !== duoIds.length) await putJson(env, `inbox:${me.id}`, duos.map(duo => duo.id), DUO_TTL);
    const hosts = await Promise.all(duos.map(duo => getJson(env, `user:${duo.hostId}`)));
    return json({
        invites: duos.map((duo, index) => ({
            id: duo.id,
            from: { id: duo.hostId, name: hosts[index]?.name || 'Ton pote' },
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
    duo.progress[me.id] = {
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
