// ===== Exercise database (1 324 exercises, French instructions) =====
// Source: hasaneyldrm/exercises-dataset (data MIT, media © Gym visual).
// The JSON is only fetched the first time it is needed and then lives in the
// service-worker cache; media is streamed on demand, never bundled.
class ExerciseDatabase {
    constructor(url = 'exercises-db.json?v=1') {
        this.url = url;
        this.data = null;
        this.loading = null;
        this.resolveCache = new Map();
    }

    load() {
        if (this.data) return Promise.resolve(this.data);
        if (!this.loading) {
            this.loading = fetch(this.url)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.json();
                })
                .then(payload => {
                    payload.byId = new Map(payload.x.map(entry => [entry.id, entry]));
                    payload.x.forEach(entry => {
                        entry.key = ExerciseDatabase.normalize(`${entry.n} ${entry.en}`);
                    });
                    this.data = payload;
                    return payload;
                })
                .catch(error => {
                    this.loading = null;
                    throw error;
                });
        }
        return this.loading;
    }

    static normalize(text = '') {
        return String(text)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    static tokens(text = '') {
        const stop = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'en', 'et', 'the', 'with', 'on', 'v', '2', '3']);
        return ExerciseDatabase.normalize(text).split(' ').filter(token => token && !stop.has(token));
    }

    getById(id) {
        return this.data?.byId.get(String(id)) || null;
    }

    imageUrl(entry) {
        return entry?.md && this.data ? `${this.data.media}images/${entry.md}.jpg` : '';
    }

    gifUrl(entry) {
        return entry?.md && this.data ? `${this.data.media}videos/${entry.md}.gif` : '';
    }

    get attribution() {
        return this.data?.attribution || '© Gym visual — https://gymvisual.com/';
    }

    /**
     * Find the best matching entry for an exercise of the app.
     * @param {object} options { name, libraryName, muscle, dbId }
     */
    resolve({ name = '', libraryName = '', muscle = '', dbId = null } = {}) {
        if (!this.data) return null;
        if (dbId && this.getById(dbId)) return this.getById(dbId);

        const cacheKey = `${name}|${libraryName}|${muscle}`;
        if (this.resolveCache.has(cacheKey)) return this.resolveCache.get(cacheKey);

        let match = null;
        const linkedId = this.data.lib[libraryName] || this.data.lib[name];
        if (linkedId) match = this.getById(linkedId);

        if (!match) {
            const queryTokens = ExerciseDatabase.tokens(name);
            let best = { score: 0, entry: null };
            if (queryTokens.length) {
                this.data.x.forEach(entry => {
                    const entryTokens = new Set(ExerciseDatabase.tokens(`${entry.n} ${entry.en}`));
                    const hits = queryTokens.filter(token => entryTokens.has(token)).length;
                    if (!hits) return;
                    let score = hits / (queryTokens.length + Math.max(0, entryTokens.size - hits) * 0.25);
                    if (muscle && entry.m === muscle) score += 0.2;
                    if (/\(|v\. \d/.test(entry.en)) score -= 0.08;
                    if (score > best.score) best = { score, entry };
                });
            }
            match = best.score >= 0.6 ? best.entry : null;
        }

        this.resolveCache.set(cacheKey, match);
        return match;
    }

    search(query = '', { muscle = '', limit = 40 } = {}) {
        if (!this.data) return [];
        const queryTokens = ExerciseDatabase.tokens(query);
        if (!queryTokens.length && !muscle) return [];
        return this.data.x
            .map(entry => {
                if (muscle && entry.m !== muscle) return null;
                if (!queryTokens.length) return { entry, score: 1 };
                const hits = queryTokens.filter(token => entry.key.includes(token)).length;
                if (hits < queryTokens.length) return null;
                const startsWith = entry.key.startsWith(queryTokens[0]) ? 0.5 : 0;
                return { entry, score: hits + startsWith - entry.en.length / 200 };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => item.entry);
    }
}

const exerciseDb = new ExerciseDatabase();
