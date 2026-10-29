// Cloudflare Worker for the in-app AI coach (coach-chat.js, "Serveur Muscu").
// Holds the Anthropic key and applies a weekly quota per install.
//
// Deploy:
//   wrangler kv namespace create COACH_QUOTA
//   wrangler secret put ANTHROPIC_API_KEY
//   wrangler deploy workers/coach-proxy.js --name muscu-coach
// wrangler.toml needs: kv_namespaces = [{ binding = "COACH_QUOTA", id = "…" }]
// and optionally ALLOWED_ORIGIN (the PWA origin) in [vars].
//
// The "plus" flag sent by the app is ignored: Muscu+ installs are marked
// server-side (RevenueCat webhook writes plus:<installId> = 1 in KV).

const MODEL = 'claude-sonnet-5-5';
const FREE_PER_WEEK = 3;
const PLUS_PER_WEEK = 200;
const MAX_SYSTEM_CHARS = 60000;
const MAX_TURNS = 16;

const weekKey = () => {
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
    return monday.toISOString().slice(0, 10);
};

export default {
    async fetch(request, env) {
        const cors = {
            'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'content-type'
        };
        const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
        if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
        if (request.method !== 'POST') return json({ error: 'method' }, 405);

        let payload;
        try {
            payload = await request.json();
        } catch {
            return json({ error: 'bad_json' }, 400);
        }
        const { installId, system, messages } = payload || {};
        if (typeof installId !== 'string' || installId.length > 64 || typeof system !== 'string' || !Array.isArray(messages)) {
            return json({ error: 'bad_request' }, 400);
        }
        const turns = messages.slice(-MAX_TURNS)
            .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }));
        if (!turns.length || turns[turns.length - 1].role !== 'user') return json({ error: 'bad_request' }, 400);

        const plus = (await env.COACH_QUOTA.get(`plus:${installId}`)) === '1';
        const quotaKey = `q:${weekKey()}:${installId}`;
        const used = Number(await env.COACH_QUOTA.get(quotaKey)) || 0;
        if (used >= (plus ? PLUS_PER_WEEK : FREE_PER_WEEK)) return json({ error: 'quota' }, 429);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: system.slice(0, MAX_SYSTEM_CHARS), messages: turns })
        });
        if (!response.ok) return json({ error: 'upstream', status: response.status }, 502);
        const data = await response.json();
        await env.COACH_QUOTA.put(quotaKey, String(used + 1), { expirationTtl: 60 * 60 * 24 * 8 });
        const reply = (data.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
        return json({ reply, remaining: (plus ? PLUS_PER_WEEK : FREE_PER_WEEK) - used - 1 });
    }
};
