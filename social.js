// ===== Friends: invite, train together, weekly board =====
// One entry point (the people button on the home header) opens a sheet with
// the weekly board of friends, pending invitations and two actions: add a
// friend (by @pseudo or email, or a share link) and "Séance à deux" (both
// people do the same session, see each other's sets, compare at the end).
//
// Everyone has a @pseudo, made from their email (or first name) and editable
// in Réglages. Each friend gets a buddy picture drawn at random when the
// friendship starts (a rhino pose + a brand background), revealed with a
// little loot-box animation and kept for good.
//
// Everything goes through a small backend adapter:
// - RemoteBackend: the social server (workers/social-api.js). Set API_URL
//   (or the `socialApiUrl` setting) once it is deployed.
// - DemoBackend: local, simulated friends to preview the whole flow. Turn it
//   on with ?social=demo (off again with ?social=off).
// Without either, the people button stays hidden: no half-working feature.
(() => {
    const API_URL = '';
    const INBOX_POLL_MS = 45000;
    const DUO_POLL_MS = 8000;

    // Buddy pictures: one rhino pose on one generated background.
    const BUDDY_POSES = ['haltere', 'shake-rate', 'corde', 'serviette', 'shake-choco', 'selfie', 'mini-haltere', 'pouces', 'flex'];
    // Vibrant pastels from the brand palette: [light, deep].
    const BUDDY_COLORS = [
        ['#fbcfe8', '#ec4899'], // rose
        ['#fef08a', '#eab308'], // jaune
        ['#fed7aa', '#f97316'], // orange
        ['#bbf7d0', '#22c55e'], // vert
        ['#bae6fd', '#0ea5e9'], // bleu
        ['#ddd6fe', '#8b5cf6'], // mauve
        ['#99f6e4', '#14b8a6'], // turquoise
        ['#fecdd3', '#f43f5e']  // corail
    ];
    const BUDDY_PATTERNS = ['studio', 'starburst', 'dots', 'stripes', 'halo'];
    const PATTERN_LABELS = { studio: 'Studio', starburst: 'Starburst', dots: 'Pois', stripes: 'Rayures', halo: 'Halo' };
    let looks = {};

    const svg = (body, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    const ICONS = {
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
        play: '<path d="M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5z" fill="currentColor" stroke="none"/>',
        back: '<path d="M15 18l-6-6 6-6"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'
    };

    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hash = text => [...String(text)].reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 7);
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const randomLook = () => ({ pose: pick(BUDDY_POSES), color: Math.floor(Math.random() * BUDDY_COLORS.length), pattern: pick(BUDDY_PATTERNS) });
    // Until a look is drawn (or for someone who is not a friend), a stable one.
    const fallbackLook = key => {
        const seed = Math.abs(hash(key || '?'));
        return { pose: BUDDY_POSES[seed % BUDDY_POSES.length], color: seed % BUDDY_COLORS.length, pattern: BUDDY_PATTERNS[seed % BUDDY_PATTERNS.length] };
    };
    const lookFor = person => looks[person?.id] || fallbackLook(person?.id || person?.name);
    const buddyArt = (look, className = '') => {
        const [light, deep] = BUDDY_COLORS[look.color] || BUDDY_COLORS[0];
        return `<span class="buddy-art buddy-bg-${look.pattern} ${className}" style="--b1: ${light}; --b2: ${deep}" aria-hidden="true"><img src="icons/buddies/${look.pose}.webp" alt="" loading="lazy" decoding="async" draggable="false"></span>`;
    };
    const avatar = (person, size = 'md') => buddyArt(lookFor(person), `sf-avatar is-${size}`);

    // @pseudo: lowercase letters, digits, dot and underscore, 3 to 20 chars.
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
    const handleFrom = ({ email, name }) => {
        let base = cleanHandle(String(email || '').split('@')[0]) || cleanHandle(name);
        if (base.length < 3) base = `${base || 'sportif'}${Math.floor(100 + Math.random() * 900)}`;
        return base.slice(0, 20);
    };
    const displayHandle = handle => (handle ? `@${handle}` : '');
    const formatTonnage = kg => kg >= 1000 ? `${String(Math.round(kg / 100) / 10).replace('.', ',')} t` : `${Math.round(kg)} kg`;

    // ---------- Backends ----------
    class RemoteBackend {
        constructor(baseUrl) {
            this.baseUrl = baseUrl.replace(/\/$/, '');
            this.auth = null;
        }

        async request(path, { method = 'GET', body } = {}) {
            const response = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.auth?.token ? { Authorization: `Bearer ${this.auth.token}` } : {})
                },
                body: body ? JSON.stringify(body) : undefined
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { code: data.error });
            return data;
        }

        async connect({ name, email, handle }) {
            this.auth = await db.getSetting('socialAuth');
            if (!this.auth?.token) {
                let installId = await db.getSetting('socialInstallId');
                if (!installId) {
                    installId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    await db.setSetting('socialInstallId', installId);
                }
                this.auth = await this.request('/v1/register', { method: 'POST', body: { installId, name, email, handle } });
                await db.setSetting('socialAuth', this.auth);
            }
            return { id: this.auth.userId, code: this.auth.code, handle: this.auth.handle || handle };
        }

        // Returns the stored @pseudo (the server may adjust it if taken).
        syncProfile(profile) { return this.request('/v1/profile', { method: 'POST', body: profile }); }
        async getFriends() { return (await this.request('/v1/friends')).friends || []; }
        async addFriend(query) { return (await this.request('/v1/friends', { method: 'POST', body: { query } })).friend; }
        async getInbox() { return (await this.request('/v1/inbox')).invites || []; }
        async createDuo(friendId, session) { return this.request('/v1/duos', { method: 'POST', body: { friendId, session } }); }
        respondDuo(duoId, accept) { return this.request(`/v1/duos/${encodeURIComponent(duoId)}/respond`, { method: 'POST', body: { accept } }); }
        pushProgress(duoId, progress) { return this.request(`/v1/duos/${encodeURIComponent(duoId)}/progress`, { method: 'POST', body: progress }); }
        getDuo(duoId) { return this.request(`/v1/duos/${encodeURIComponent(duoId)}`); }
    }

    // Simulated friends, stored locally: lets the whole flow be tried on one
    // phone. A friend accepts a duo after a few seconds, then finishes one
    // exercise every 90 s.
    class DemoBackend {
        async load() {
            let state = await db.getSetting('socialDemoState');
            if (!state) {
                state = {
                    friends: [
                        { id: 'demo-lea', name: 'Léa', handle: 'lea.fit', base: 420 },
                        { id: 'demo-tom', name: 'Tom', handle: 'tom_lift', base: 260 },
                        { id: 'demo-ines', name: 'Inès', handle: 'ines', base: 610 }
                    ],
                    invites: [{
                        id: 'demo-invite-tom',
                        from: { id: 'demo-tom', name: 'Tom', handle: 'tom_lift' },
                        session: {
                            name: 'Full body',
                            exercises: [
                                { name: 'Squat', sets: 3, repsMin: 6, repsMax: 10 },
                                { name: 'Développé couché barre', sets: 3, repsMin: 6, repsMax: 10 },
                                { name: 'Tirage vertical', sets: 3, repsMin: 8, repsMax: 12 },
                                { name: 'Gainage', sets: 3 }
                            ]
                        },
                        createdAt: Date.now()
                    }],
                    duos: {}
                };
                await db.setSetting('socialDemoState', state);
            }
            return state;
        }

        async save(state) { await db.setSetting('socialDemoState', state); }

        async connect({ handle }) {
            await this.load();
            return { id: 'me', handle };
        }

        async syncProfile(profile) {
            const state = await this.load();
            const taken = profile.handle && state.friends.some(friend => friend.handle === profile.handle);
            if (taken) throw Object.assign(new Error('handle-taken'), { code: 'handle-taken' });
            return { handle: profile.handle };
        }

        async getFriends() {
            const state = await this.load();
            const weekKey = app.getWeekKey?.() || '';
            const now = new Date();
            const dayOfWeek = (now.getDay() + 6) % 7;
            const activeDuo = Object.values(state.duos).find(duo => duo.status === 'active');
            return state.friends.map(friend => {
                const seed = Math.abs(hash(`${weekKey}:${friend.id}`));
                const weekSessions = Math.min(5, Math.floor((dayOfWeek + 1) * (0.35 + (seed % 40) / 100)));
                return {
                    id: friend.id,
                    name: friend.name,
                    handle: friend.handle,
                    weekXp: Math.round(weekSessions * (friend.base / 3) + (seed % 90)),
                    weekSessions,
                    inSession: activeDuo?.friendId === friend.id
                };
            });
        }

        async addFriend(query) {
            const raw = String(query || '').trim().toLowerCase();
            const isEmail = EMAIL_RE.test(raw);
            const handle = isEmail ? cleanHandle(raw.split('@')[0]) : cleanHandle(raw);
            if (!isEmail && !HANDLE_RE.test(handle)) throw Object.assign(new Error('invalid-query'), { code: 'invalid-query' });
            const me = app.social?.me;
            if (handle === me?.handle || (isEmail && raw === String(me?.email || '').toLowerCase())) throw Object.assign(new Error('self'), { code: 'self' });
            const state = await this.load();
            const existing = state.friends.find(item => item.handle === handle);
            if (existing) throw Object.assign(new Error('already-friends'), { code: 'already-friends' });
            const first = handle.split(/[._\d]/)[0] || handle;
            const friend = {
                id: `demo-${handle}`,
                name: first.charAt(0).toUpperCase() + first.slice(1),
                handle,
                base: 300 + Math.abs(hash(handle)) % 300
            };
            state.friends.push(friend);
            await this.save(state);
            return { id: friend.id, name: friend.name, handle: friend.handle };
        }

        async getInbox() {
            return (await this.load()).invites;
        }

        async createDuo(friendId, session) {
            const state = await this.load();
            const id = `demo-duo-${Date.now()}`;
            state.duos[id] = { id, friendId, total: session.exercises.length, exercises: session.exercises.map(item => item.name), status: 'pending', createdAt: Date.now() };
            await this.save(state);
            return { id };
        }

        async respondDuo(duoId, accept) {
            const state = await this.load();
            const invite = state.invites.find(item => item.id === duoId);
            state.invites = state.invites.filter(item => item.id !== duoId);
            if (invite && accept) {
                state.duos[duoId] = { id: duoId, friendId: invite.from.id, total: invite.session.exercises.length, exercises: invite.session.exercises.map(item => item.name), status: 'active', createdAt: Date.now(), acceptedAt: Date.now() - 60000 };
            }
            await this.save(state);
            return {};
        }

        async pushProgress() { return {}; }

        async getDuo(duoId) {
            const state = await this.load();
            const duo = state.duos[duoId];
            if (!duo) return { id: duoId, status: 'ended', members: [] };
            const now = Date.now();
            if (duo.status === 'pending' && now - duo.createdAt > 4000) {
                duo.status = 'active';
                duo.acceptedAt = now;
                await this.save(state);
            }
            const friend = state.friends.find(item => item.id === duo.friendId) || { id: duo.friendId, name: 'Ton pote' };
            let progress = null;
            if (duo.acceptedAt) {
                const elapsed = now - duo.acceptedAt;
                const exercisesDone = Math.min(duo.total, Math.floor(elapsed / 90000));
                const sets = Math.min(duo.total * 3, exercisesDone * 3 + Math.floor((elapsed % 90000) / 30000));
                // Three sets per exercise, one every 30 s, loads that look real.
                const exercises = {};
                (duo.exercises || []).forEach((name, index) => {
                    const done = Math.max(0, Math.min(3, sets - index * 3));
                    if (!done) return;
                    const seed = Math.abs(hash(`${duo.friendId}:${name}`));
                    const weight = 10 + (seed % 25) * 2.5;
                    exercises[app.normalizeExerciseText(name)] = Array.from({ length: done }, (_, set) => ({ w: weight, r: 8 + (seed % 4) - set }));
                });
                progress = {
                    exercisesDone,
                    exercisesTotal: duo.total,
                    sets,
                    tonnage: sets * 640,
                    durationMs: elapsed,
                    finished: exercisesDone >= duo.total,
                    exercises
                };
            }
            return {
                id: duoId,
                status: duo.status,
                members: [{ id: friend.id, name: friend.name, accepted: Boolean(duo.acceptedAt), progress }]
            };
        }
    }

    const baseInit = App.prototype.init;
    const baseRenderSlots = App.prototype.renderSlots;
    const baseStartSession = App.prototype.startSession;
    const baseConfirmFinishSession = App.prototype.confirmFinishSession;
    const baseShowStimulusScoreAnimation = App.prototype.showStimulusScoreAnimation;
    const baseRenderSeries = App.prototype.renderSeries;
    const baseShowSettingsSheet = App.prototype.showSettingsSheet;

    Object.assign(App.prototype, {
        // ---------- Setup ----------
        async init(...args) {
            await baseInit.apply(this, args);
            void this.initSocial();
        },

        async resolveSocialBackend() {
            const params = new URLSearchParams(location.search);
            const flag = params.get('social');
            if (flag === 'demo') await db.setSetting('socialMode', 'demo');
            if (flag === 'off') await db.setSetting('socialMode', null);
            const mode = await db.getSetting('socialMode');
            if (mode === 'demo') return new DemoBackend();
            const url = (await db.getSetting('socialApiUrl')) || API_URL;
            return url ? new RemoteBackend(url) : null;
        },

        async initSocial() {
            try {
                this.social = { backend: await this.resolveSocialBackend(), me: null, friends: [], invites: [], view: 'home', pick: {}, reveals: [] };
            } catch (error) {
                this.social = { backend: null };
            }
            looks = (await db.getSetting('socialLooks')) || {};
            const params = new URLSearchParams(location.search);
            const sharedCode = params.get('ami');
            if (sharedCode) {
                await db.setSetting('socialPendingCode', sharedCode);
                params.delete('ami');
                const query = params.toString();
                history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
            }
            const button = document.getElementById('btn-friends');
            if (!this.social.backend || !button) return;
            button.hidden = false;
            button.addEventListener('click', () => void this.openFriends());
            this.duo = (await db.getSetting('socialDuo')) || null;
            await this.connectSocial();
            void this.refreshSocialInbox();
            setInterval(() => {
                if (!document.hidden) void this.refreshSocialInbox();
            }, INBOX_POLL_MS);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) void this.refreshSocialInbox();
            });
            if (this.duo && this.currentWorkout) this.startDuoPolling();
        },

        async getSocialIdentity() {
            const name = String((await db.getSetting('userName')) || '').trim();
            const email = String((await db.getSetting('userEmail')) || '').trim();
            let handle = await db.getSetting('userHandle');
            if (!handle && (name || email)) {
                handle = handleFrom({ email, name });
                await db.setSetting('userHandle', handle);
            }
            return { name, email, handle: handle || '' };
        },

        async connectSocial() {
            const identity = await this.getSocialIdentity();
            if (!identity.name || this.social.me) return Boolean(this.social.me);
            try {
                const account = await this.social.backend.connect(identity);
                this.social.me = { ...identity, ...account, handle: account.handle || identity.handle };
                // Accounts made before pseudos existed: publish the local one.
                if (!account.handle && identity.handle) {
                    const saved = await this.social.backend.syncProfile({ name: identity.name, email: identity.email, handle: identity.handle }).catch(() => null);
                    if (saved?.handle) this.social.me.handle = saved.handle;
                }
                if (this.social.me.handle !== identity.handle) await db.setSetting('userHandle', this.social.me.handle);
                if (!looks.me) await this.saveLook('me', randomLook());
                await this.syncSocialProfile();
                const pending = await db.getSetting('socialPendingCode');
                if (pending) {
                    await db.setSetting('socialPendingCode', null);
                    await this.addFriendByQuery(pending);
                }
                return true;
            } catch (error) {
                console.warn('[Social] connexion impossible', error);
                return false;
            }
        },

        async getMyWeekScore() {
            const xp = Number(await db.getSetting('xp')) || 0;
            const league = this.getLeagueState ? await this.getLeagueState() : null;
            const streak = await streakEngine.getStreakData();
            return {
                weekKey: this.getWeekKey(),
                weekXp: Math.max(0, xp - (league?.startXp ?? xp)),
                weekSessions: streak?.currentWeekSessions || 0
            };
        },

        async syncSocialProfile() {
            if (!this.social?.me) return;
            const score = await this.getMyWeekScore();
            this.social.myScore = score;
            // Pseudo and email only change from Réglages (they can conflict).
            await this.social.backend.syncProfile({ name: this.social.me.name, ...score, inSession: Boolean(this.currentWorkout) }).catch(() => {});
        },

        async refreshSocialInbox() {
            if (!this.social?.backend || !this.social.me) return;
            try {
                const [invites, friends] = await Promise.all([this.social.backend.getInbox(), this.social.backend.getFriends()]);
                this.social.invites = invites;
                this.social.friends = friends;
            } catch (error) {
                return;
            }
            await this.drawLooksForNewFriends(this.social.friends);
            const badge = document.getElementById('friends-badge');
            if (badge) {
                badge.hidden = this.social.invites.length === 0;
                badge.textContent = String(this.social.invites.length);
            }
            if (document.getElementById('sheet-friends')?.classList.contains('active')) this.renderFriendsSheet();
        },

        // ---------- Sheet ----------
        ensureFriendsSheet() {
            let sheet = document.getElementById('sheet-friends');
            if (sheet) return sheet;
            sheet = document.createElement('div');
            sheet.className = 'bottom-sheet';
            sheet.id = 'sheet-friends';
            sheet.innerHTML = '<div class="sheet-backdrop"></div><div class="sheet-content sheet-content-large sf-sheet" role="dialog" aria-label="Amis"></div>';
            document.body.appendChild(sheet);
            sheet.addEventListener('click', event => void this.onFriendsClick(event));
            sheet.addEventListener('submit', event => {
                event.preventDefault();
                void this.onFriendsSubmit(event.target);
            });
            return sheet;
        },

        async openFriends(view = 'home') {
            const sheet = this.ensureFriendsSheet();
            this.social.view = view;
            sheet.classList.add('active');
            this.renderFriendsSheet();
            await this.connectSocial();
            await this.syncSocialProfile();
            await this.refreshSocialInbox();
            this.renderFriendsSheet();
            this.flushBuddyReveals();
        },

        closeFriends() {
            document.getElementById('sheet-friends')?.classList.remove('active');
        },

        renderFriendsSheet() {
            const content = document.querySelector('#sheet-friends .sf-sheet');
            if (!content || !this.social) return;
            const view = this.social.me ? this.social.view : 'setup';
            content.innerHTML = `<div class="sheet-handle"></div>${view === 'setup' ? this.renderFriendsSetupView()
                : view === 'duo' ? this.renderDuoPickView()
                : view === 'add' ? this.renderAddFriendView()
                : this.renderFriendsHomeView()}`;
        },

        renderMascot() {
            return buddyArt({ pose: 'pouces', color: 5, pattern: 'starburst' }, 'sf-mascot');
        },

        renderFriendsSetupView() {
            return `
                <div class="sf-intro">
                    ${this.renderMascot()}
                    <h3>Entraîne-toi avec tes potes</h3>
                    <p>Tes potes te trouvent avec ton @pseudo ou ton email.</p>
                </div>
                <form class="sf-form" data-sf-form="setup">
                    <input class="sf-input" name="name" maxlength="24" autocomplete="given-name" placeholder="Ton prénom" required>
                    <input class="sf-input" name="email" type="email" maxlength="80" autocomplete="email" inputmode="email" placeholder="Ton email (pour être trouvé)">
                    <button type="submit" class="btn btn-primary btn-large">Continuer</button>
                    <small class="sf-note">On crée ton @pseudo à partir de ton email. Tu pourras le changer dans Réglages.</small>
                </form>
            `;
        },

        renderFriendsHomeView() {
            const { friends = [], invites = [], me, myScore } = this.social;
            const board = [
                { id: 'me', name: me.name, handle: me.handle, weekXp: myScore?.weekXp || 0, weekSessions: myScore?.weekSessions || 0, isMe: true },
                ...friends
            ].sort((a, b) => b.weekXp - a.weekXp);

            const invitesHtml = invites.map(invite => `
                <div class="sf-invite">
                    ${avatar(invite.from)}
                    <div class="sf-invite-text">
                        <strong>${escape(invite.from.name)} t’invite</strong>
                        <small>${escape(invite.session.name)} · ${invite.session.exercises.length} exercices</small>
                    </div>
                    <div class="sf-invite-actions">
                        <button type="button" class="sf-btn-ghost" data-sf="decline" data-id="${escape(invite.id)}">Plus tard</button>
                        <button type="button" class="sf-btn-join" data-sf="join" data-id="${escape(invite.id)}">Rejoindre</button>
                    </div>
                </div>
            `).join('');

            const head = `
                <div class="sf-head">
                    <h3>Tes potes</h3>
                    <button type="button" class="sf-icon-btn" data-sf="close" aria-label="Fermer">${svg(ICONS.close, 18)}</button>
                </div>
            `;

            if (!friends.length) {
                return `
                    ${head}
                    ${invitesHtml}
                    <div class="sf-intro">
                        ${this.renderMascot()}
                        <h3>À plusieurs, on lâche rien</h3>
                        <p>Ajoute un pote : vous pourrez faire la même séance, voir vos séries en direct et vous comparer chaque semaine.</p>
                    </div>
                    <div class="sf-actions-col">
                        <button type="button" class="btn btn-primary btn-large sf-main" data-sf="add">${svg(ICONS.userPlus, 18)} Ajouter un pote</button>
                        <button type="button" class="sf-link" data-sf="share">${svg(ICONS.share, 16)} Envoyer un lien d’invitation</button>
                    </div>
                `;
            }

            return `
                ${head}
                ${invitesHtml}
                <div class="sf-actions-row">
                    <button type="button" class="btn btn-primary sf-main" data-sf="duo">${svg(ICONS.play, 16)} Séance à deux</button>
                    <button type="button" class="btn btn-secondary sf-main" data-sf="add">${svg(ICONS.userPlus, 18)} Ajouter</button>
                </div>
                <div class="sf-board">
                    <span class="sf-kicker">Classement de la semaine</span>
                    ${board.map((person, index) => `
                        <div class="sf-row ${person.isMe ? 'is-me' : ''} ${index === 0 ? 'is-first' : ''}">
                            <span class="sf-rank">${index + 1}</span>
                            ${avatar(person)}
                            <div class="sf-row-text">
                                <strong>${person.isMe ? 'Toi' : escape(person.name)}</strong>
                                <small>${person.inSession ? '<span class="sf-live">En séance</span>' : `${escape(displayHandle(person.handle))}${person.handle ? ' · ' : ''}${person.weekSessions} séance${person.weekSessions > 1 ? 's' : ''}`}</small>
                            </div>
                            <span class="sf-xp">${person.weekXp} <small>XP</small></span>
                        </div>
                    `).join('')}
                </div>
                <button type="button" class="sf-link" data-sf="share">${svg(ICONS.share, 16)} Envoyer un lien d’invitation</button>
            `;
        },

        renderAddFriendView() {
            const { me } = this.social;
            return `
                <div class="sf-head">
                    <button type="button" class="sf-icon-btn" data-sf="home" aria-label="Retour">${svg(ICONS.back, 18)}</button>
                    <h3>Ajouter un pote</h3>
                    <span class="sf-head-spacer"></span>
                </div>
                <form class="sf-form" data-sf-form="add">
                    <label class="sf-label" for="sf-add-input">Son @pseudo ou son email</label>
                    <input class="sf-input" id="sf-add-input" name="query" maxlength="80" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="@pseudo ou email" required>
                    <button type="submit" class="btn btn-primary btn-large">Ajouter</button>
                </form>
                <div class="sf-code-card">
                    ${avatar({ id: 'me' }, 'lg')}
                    <span class="sf-kicker">Ton pseudo</span>
                    <strong class="sf-code">${escape(displayHandle(me.handle))}</strong>
                    <div class="sf-code-actions">
                        <button type="button" class="sf-link" data-sf="copy-handle">${svg(ICONS.copy, 16)} Copier</button>
                        <button type="button" class="sf-link" data-sf="share">${svg(ICONS.share, 16)} Partager</button>
                    </div>
                    <small class="sf-note">Modifiable dans Réglages.</small>
                </div>
            `;
        },

        renderDuoPickView() {
            const { friends = [], pick = {} } = this.social;
            const sessions = this.social.sessionsForDuo || [];
            const friendId = pick.friendId || friends[0]?.id;
            const sessionId = pick.sessionId || sessions[0]?.id;
            this.social.pick = { friendId, sessionId };
            return `
                <div class="sf-head">
                    <button type="button" class="sf-icon-btn" data-sf="home" aria-label="Retour">${svg(ICONS.back, 18)}</button>
                    <h3>Séance à deux</h3>
                    <span class="sf-head-spacer"></span>
                </div>
                <span class="sf-kicker">Avec qui ?</span>
                <div class="sf-choices">
                    ${friends.map(friend => `
                        <button type="button" class="sf-choice ${friend.id === friendId ? 'active' : ''}" data-sf="pick-friend" data-id="${escape(friend.id)}" aria-pressed="${friend.id === friendId}">
                            ${avatar(friend, 'sm')}
                            <span>${escape(friend.name)}</span>
                        </button>
                    `).join('')}
                </div>
                <span class="sf-kicker">Quelle séance ?</span>
                <div class="sf-sessions">
                    ${sessions.map((session, index) => `
                        <button type="button" class="sf-session ${session.id === sessionId ? 'active' : ''}" data-sf="pick-session" data-id="${escape(session.id)}" aria-pressed="${session.id === sessionId}">
                            <span class="sf-session-text">
                                <strong>${escape(session.name)}</strong>
                                <small>${session.count} exercice${session.count > 1 ? 's' : ''}${index === 0 ? ' · prévue aujourd’hui' : ''}</small>
                            </span>
                            <span class="sf-radio" aria-hidden="true">${svg(ICONS.check, 14)}</span>
                        </button>
                    `).join('')}
                </div>
                <button type="button" class="btn btn-primary btn-large sf-launch" data-sf="launch-duo" ${friendId && sessionId ? '' : 'disabled'}>Lancer et inviter</button>
                <p class="sf-note">Ton pote reçoit l’invitation et fait la même séance de son côté.</p>
            `;
        },

        async loadSessionsForDuo() {
            const sessions = await db.getSessions();
            const history = await db.getAll('workoutHistory');
            const stored = (await db.getSetting('nextSessionIndex')) ?? 0;
            const nextIndex = this.getSuggestedSessionIndex(sessions, history, stored);
            const ordered = [...sessions.slice(nextIndex), ...sessions.slice(0, nextIndex)];
            const counts = await Promise.all(ordered.map(session => db.getSlotsBySession(session.id).then(slots => slots.length)));
            this.social.sessionsForDuo = ordered.map((session, index) => ({ id: session.id, name: session.name, count: counts[index] })).filter(item => item.count > 0);
        },

        async onFriendsClick(event) {
            if (event.target.classList.contains('sheet-backdrop')) return this.closeFriends();
            const button = event.target.closest('[data-sf]');
            if (!button) return;
            const action = button.dataset.sf;
            const id = button.dataset.id;
            switch (action) {
                case 'close': return this.closeFriends();
                case 'home':
                case 'add':
                    this.social.view = action;
                    this.renderFriendsSheet();
                    if (action === 'add') setTimeout(() => document.getElementById('sf-add-input')?.focus({ preventScroll: true }), 250);
                    return undefined;
                case 'share': return this.shareFriendInvite();
                case 'copy-handle': return this.copyText(displayHandle(this.social.me.handle), 'Pseudo copié');
                case 'duo':
                    await this.loadSessionsForDuo();
                    this.social.view = 'duo';
                    this.social.pick = {};
                    return this.renderFriendsSheet();
                case 'pick-friend':
                    this.social.pick.friendId = id;
                    return this.renderFriendsSheet();
                case 'pick-session':
                    this.social.pick.sessionId = id;
                    return this.renderFriendsSheet();
                case 'launch-duo':
                    button.disabled = true;
                    return this.launchDuo();
                case 'join':
                    button.disabled = true;
                    return this.joinDuoInvite(id);
                case 'decline':
                    await this.social.backend.respondDuo(id, false).catch(() => {});
                    this.social.invites = this.social.invites.filter(item => item.id !== id);
                    return this.refreshSocialInbox();
                default:
            }
            return undefined;
        },

        async onFriendsSubmit(form) {
            if (form.dataset.sfForm === 'setup') {
                const name = String(form.elements.name.value || '').trim().slice(0, 24);
                const email = String(form.elements.email.value || '').trim().slice(0, 80);
                if (!name) return;
                if (email && !EMAIL_RE.test(email)) {
                    this.showCoachToast('Cet email n’a pas l’air valide.', 'warning');
                    return;
                }
                await db.setSetting('userName', name);
                if (email) await db.setSetting('userEmail', email);
                this.social.view = 'home';
                this.renderFriendsSheet();
                await this.connectSocial();
                await this.syncSocialProfile();
                await this.refreshSocialInbox();
                this.renderFriendsSheet();
                void this.renderStreakSystem?.();
                return;
            }
            if (form.dataset.sfForm === 'add') {
                const submit = form.querySelector('[type="submit"]');
                if (submit) submit.disabled = true;
                const added = await this.addFriendByQuery(form.elements.query.value);
                if (submit) submit.disabled = false;
                if (added) {
                    this.social.view = 'home';
                    await this.refreshSocialInbox();
                    this.renderFriendsSheet();
                }
            }
        },

        async addFriendByQuery(query) {
            const raw = String(query || '').trim();
            if (!raw) return null;
            try {
                const friend = await this.social.backend.addFriend(raw);
                if (!looks[friend.id]) {
                    await this.saveLook(friend.id, randomLook());
                    await this.showBuddyReveal(friend);
                } else {
                    this.showCoachToast(`${friend.name} fait partie de tes potes`, 'hot');
                }
                return friend;
            } catch (error) {
                const messages = {
                    'invalid-query': 'Entre un @pseudo ou un email.',
                    'not-found': 'Personne avec ce pseudo ou cet email. Vérifie l’orthographe ou envoie-lui un lien.',
                    'self': 'C’est toi, ça 😄',
                    'already-friends': 'Vous êtes déjà potes.'
                };
                this.showCoachToast(messages[error.code] || 'Impossible d’ajouter ce pote pour le moment.', 'warning');
                return null;
            }
        },

        async shareFriendInvite() {
            const { handle, name } = this.social.me;
            const url = `${location.origin}${location.pathname}?ami=${encodeURIComponent(handle)}`;
            const text = `${name} t’invite à s’entraîner ensemble sur Muscu. Ajoute-moi : @${handle}`;
            const nativeShare = window.Capacitor?.Plugins?.Share;
            try {
                if (nativeShare) return await nativeShare.share({ title: 'Muscu', text, url });
                if (navigator.share) return await navigator.share({ title: 'Muscu', text, url });
            } catch (error) {
                if (error?.name === 'AbortError') return undefined;
            }
            return this.copyText(`${text}\n${url}`, 'Lien d’invitation copié');
        },

        // ---------- Buddy looks + loot-box reveal ----------
        async saveLook(id, look) {
            looks = { ...looks, [id]: look };
            await db.setSetting('socialLooks', looks);
        },

        // Friends who added you (or from before looks existed) get theirs
        // here. The very first time, existing friends are dressed silently.
        async drawLooksForNewFriends(friends) {
            const isFirstDraw = !(await db.getSetting('socialLooksReady'));
            const fresh = friends.filter(friend => !looks[friend.id]);
            if (isFirstDraw) await db.setSetting('socialLooksReady', true);
            if (!fresh.length) return;
            for (const friend of fresh) await this.saveLook(friend.id, randomLook());
            if (isFirstDraw) return;
            this.social.reveals.push(...fresh);
            this.flushBuddyReveals();
        },

        // Never on top of a set: reveals wait for the home screen.
        async flushBuddyReveals() {
            if (this.buddyRevealOpen || !this.social?.reveals?.length) return;
            if (this.currentScreen !== 'home' && !document.getElementById('sheet-friends')?.classList.contains('active')) return;
            const friend = this.social.reveals.shift();
            await this.showBuddyReveal(friend);
            this.flushBuddyReveals();
        },

        showBuddyReveal(friend) {
            const look = lookFor(friend);
            const [, deep] = BUDDY_COLORS[look.color] || BUDDY_COLORS[0];
            this.buddyRevealOpen = true;
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'buddy-reveal';
                overlay.style.setProperty('--reveal', deep);
                overlay.innerHTML = `
                    <div class="buddy-reveal-rays" aria-hidden="true"></div>
                    <div class="buddy-reveal-stage">
                        <p class="buddy-reveal-kicker">Nouveau pote</p>
                        <button type="button" class="buddy-reveal-box" aria-label="Ouvrir">
                            <span class="buddy-reveal-lid"></span>
                            <span class="buddy-reveal-body"><span class="buddy-reveal-q">?</span></span>
                        </button>
                        <div class="buddy-reveal-card">
                            ${buddyArt(look, 'buddy-reveal-art')}
                            <strong>${escape(friend.name)}</strong>
                            <span>${escape(displayHandle(friend.handle))}</span>
                            <em>Fond ${escape(PATTERN_LABELS[look.pattern] || '')}</em>
                        </div>
                        <p class="buddy-reveal-hint">Touche la boîte</p>
                        <button type="button" class="btn btn-primary btn-large buddy-reveal-ok">Trop bien</button>
                    </div>
                `;
                document.body.appendChild(overlay);
                requestAnimationFrame(() => overlay.classList.add('is-in'));
                let opened = false;
                const open = () => {
                    if (opened) return;
                    opened = true;
                    overlay.classList.add('is-shaking');
                    this.hapticTap?.([12, 40, 12, 40, 12]);
                    setTimeout(() => {
                        overlay.classList.remove('is-shaking');
                        overlay.classList.add('is-open');
                        this.hapticTap?.([30, 30, 60]);
                        const art = overlay.querySelector('.buddy-reveal-art');
                        const rect = art?.getBoundingClientRect();
                        if (rect && typeof gamification !== 'undefined') {
                            gamification.burst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, count: 80, spread: 150, power: 14 });
                        }
                    }, 900);
                };
                const close = () => {
                    overlay.classList.add('is-leaving');
                    setTimeout(() => {
                        overlay.remove();
                        this.buddyRevealOpen = false;
                        if (document.getElementById('sheet-friends')?.classList.contains('active')) this.renderFriendsSheet();
                        resolve();
                    }, 260);
                };
                overlay.querySelector('.buddy-reveal-box').addEventListener('click', open);
                overlay.querySelector('.buddy-reveal-ok').addEventListener('click', close);
                // Opens by itself if the box is left alone.
                setTimeout(open, 1600);
            });
        },

        // ---------- Profile (Réglages) ----------
        async showSettingsSheet(...args) {
            const result = await baseShowSettingsSheet.apply(this, args);
            await this.renderProfileSettings();
            return result;
        },

        async renderProfileSettings() {
            const block = document.getElementById('settings-profile-block');
            if (!block) return;
            const identity = await this.getSocialIdentity();
            const hasSocial = Boolean(this.social?.backend);
            block.innerHTML = `
                <form class="settings-card profile-card" data-profile-form>
                    <div class="settings-card-row">
                        ${avatar({ id: 'me', name: identity.name })}
                        <span class="settings-card-main"><strong>Profil</strong><small>${hasSocial ? 'Comment tes potes te voient et te trouvent' : 'Comment l’app t’appelle'}</small></span>
                    </div>
                    <label class="profile-field">
                        <span>Prénom</span>
                        <input class="form-input" name="name" maxlength="24" autocomplete="given-name" value="${escape(identity.name)}" placeholder="Ton prénom">
                    </label>
                    ${hasSocial ? `
                        <label class="profile-field">
                            <span>Pseudo</span>
                            <span class="profile-handle"><b>@</b><input class="form-input" name="handle" maxlength="20" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" value="${escape(identity.handle)}" placeholder="pseudo"></span>
                        </label>
                        <label class="profile-field">
                            <span>Email</span>
                            <input class="form-input" name="email" type="email" inputmode="email" maxlength="80" autocomplete="email" value="${escape(identity.email)}" placeholder="ton@email.com">
                        </label>
                        <small class="profile-note">Tes potes peuvent t’ajouter avec ton @pseudo ou ton email. Ton email n’est jamais affiché.</small>
                    ` : ''}
                    <button type="submit" class="btn btn-secondary profile-save">Enregistrer le profil</button>
                </form>
            `;
            const form = block.querySelector('[data-profile-form]');
            form.onsubmit = (event) => {
                event.preventDefault();
                void this.saveProfileSettings(form);
            };
        },

        async saveProfileSettings(form) {
            const name = String(form.elements.name.value || '').trim().slice(0, 24);
            const email = String(form.elements.email?.value ?? (await db.getSetting('userEmail')) ?? '').trim().slice(0, 80);
            const typedHandle = form.elements.handle ? cleanHandle(form.elements.handle.value) : null;
            if (email && !EMAIL_RE.test(email)) {
                this.showCoachToast('Cet email n’a pas l’air valide.', 'warning');
                return;
            }
            if (typedHandle !== null && !HANDLE_RE.test(typedHandle)) {
                this.showCoachToast('Pseudo : 3 à 20 caractères, lettres, chiffres, point ou _.', 'warning');
                return;
            }
            const previous = await this.getSocialIdentity();
            const handle = typedHandle || previous.handle || handleFrom({ email, name });
            if (this.social?.me && (handle !== previous.handle || email !== previous.email || name !== previous.name)) {
                try {
                    const saved = await this.social.backend.syncProfile({ name, email, handle });
                    if (saved?.handle && saved.handle !== handle) form.elements.handle.value = saved.handle;
                } catch (error) {
                    const messages = {
                        'handle-taken': `@${handle} est déjà pris. Essaie une variante.`,
                        'email-taken': 'Cet email est déjà utilisé par un autre compte.',
                        'invalid-handle': 'Pseudo : 3 à 20 caractères, lettres, chiffres, point ou _.'
                    };
                    this.showCoachToast(messages[error.code] || 'Profil non synchronisé, réessaie plus tard.', 'warning');
                    if (messages[error.code]) return;
                }
                Object.assign(this.social.me, { name, email, handle });
            }
            await db.setSetting('userName', name);
            await db.setSetting('userEmail', email);
            await db.setSetting('userHandle', handle);
            this.showCoachToast('Profil enregistré', 'hot');
            void this.renderStreakSystem?.();
        },

        async copyText(text, message) {
            try {
                await navigator.clipboard.writeText(text);
                this.showCoachToast(message, 'hot');
            } catch (error) {
                this.showCoachToast(text, 'neutral');
            }
        },

        // ---------- Duo session ----------
        async buildDuoSessionPayload(sessionId) {
            const session = await db.get('sessions', sessionId);
            const slots = await db.getSlotsBySession(sessionId);
            return {
                name: session?.name || 'Séance',
                exercises: slots.map(slot => ({
                    name: this.getSlotExerciseName(slot),
                    sets: slot.sets,
                    repsMin: slot.repsMin,
                    repsMax: slot.repsMax,
                    rest: slot.rest,
                    rir: slot.rir
                }))
            };
        },

        async launchDuo() {
            const { friendId, sessionId } = this.social.pick;
            const friend = this.social.friends.find(item => item.id === friendId);
            const session = await db.get('sessions', sessionId);
            if (!friend || !session) return;
            try {
                const payload = await this.buildDuoSessionPayload(sessionId);
                const { id } = await this.social.backend.createDuo(friendId, payload);
                await this.setDuo({ id, friend: { id: friend.id, name: friend.name, handle: friend.handle }, sessionId, total: payload.exercises.length, role: 'host' });
            } catch (error) {
                this.showCoachToast('Invitation impossible pour le moment. Réessaie dans un instant.', 'warning');
                this.renderFriendsSheet();
                return;
            }
            this.closeFriends();
            this.pendingDuoSessionId = sessionId;
            await this.startSession(session);
            this.showCoachToast(`Invitation envoyée à ${friend.name}`, 'hot');
        },

        // The friend's session is matched by name in your program; otherwise
        // it is added as a guest session that stays out of your program.
        async resolveSessionForInvite(invite) {
            const wanted = this.normalizeExerciseText(invite.session.name);
            const sessions = await db.getSessions();
            const match = sessions.find(session => this.normalizeExerciseText(session.name) === wanted);
            if (match && (await db.getSlotsBySession(match.id)).length) return match;
            const sessionId = `guest-${invite.id}`;
            const session = { id: sessionId, name: invite.session.name, order: 999, guest: true, estimatedDuration: invite.session.exercises.length * 9 };
            await db.put('sessions', session);
            for (const [order, exercise] of invite.session.exercises.entries()) {
                const definition = this.findExerciseLibraryEntry(exercise.name) || this.inferCustomExerciseTemplate(exercise.name);
                const slot = this.buildSlotFromExerciseDefinition(definition, sessionId, order);
                slot.id = `${sessionId}-${order}`;
                ['sets', 'repsMin', 'repsMax', 'rest', 'rir'].forEach(field => {
                    if (Number.isFinite(Number(exercise[field])) && exercise[field] !== null) slot[field] = Number(exercise[field]);
                });
                await db.put('slots', slot);
            }
            return session;
        },

        async joinDuoInvite(inviteId) {
            const invite = this.social.invites.find(item => item.id === inviteId);
            if (!invite) return;
            if (this.currentWorkout) {
                this.showCoachToast('Termine d’abord ta séance en cours.', 'warning');
                this.renderFriendsSheet();
                return;
            }
            try {
                await this.social.backend.respondDuo(inviteId, true);
                const session = await this.resolveSessionForInvite(invite);
                await this.setDuo({ id: inviteId, friend: invite.from, sessionId: session.id, total: invite.session.exercises.length, role: 'guest' });
                this.social.invites = this.social.invites.filter(item => item.id !== inviteId);
                this.closeFriends();
                this.pendingDuoSessionId = session.id;
                await this.startSession(session);
            } catch (error) {
                console.warn('[Social] rejoindre impossible', error);
                this.showCoachToast('Impossible de rejoindre la séance pour le moment.', 'warning');
                this.renderFriendsSheet();
            }
        },

        async setDuo(duo) {
            this.duo = duo ? { ...duo, friendState: null } : null;
            await db.setSetting('socialDuo', duo);
            if (duo) this.startDuoPolling();
            else this.stopDuoPolling();
            this.renderDuoStrip();
        },

        async startSession(session, ...rest) {
            // Starting any other session ends a duo that was not for it.
            if (this.duo && this.pendingDuoSessionId !== session?.id && this.duo.sessionId !== session?.id) await this.setDuo(null);
            this.pendingDuoSessionId = null;
            const result = await baseStartSession.call(this, session, ...rest);
            void this.syncSocialProfile?.();
            return result;
        },

        startDuoPolling() {
            this.stopDuoPolling();
            const poll = () => {
                if (!document.hidden) void this.pollDuo();
            };
            poll();
            this.duoTimer = setInterval(poll, DUO_POLL_MS);
        },

        stopDuoPolling() {
            if (this.duoTimer) clearInterval(this.duoTimer);
            this.duoTimer = null;
        },

        async pollDuo() {
            if (!this.duo || !this.social?.backend) return;
            let data;
            try {
                data = await this.social.backend.getDuo(this.duo.id);
            } catch (error) {
                return;
            }
            if (!this.duo) return;
            const member = data.members?.[0] || null;
            const previous = this.duo.friendState;
            this.duo.friendState = { status: data.status, accepted: Boolean(member?.accepted), progress: member?.progress || null };
            const name = this.duo.friend.name;
            if (previous) {
                const before = previous.progress?.exercisesDone || 0;
                const after = member?.progress?.exercisesDone || 0;
                if (!previous.accepted && member?.accepted) this.showCoachToast(`${name} a rejoint la séance`, 'hot');
                else if (member?.progress?.finished && !previous.progress?.finished) this.showCoachToast(`${name} a terminé sa séance`, 'hot');
                else if (after > before) this.showCoachToast(`${name} a fini un exercice (${after}/${member.progress.exercisesTotal})`, 'cold');
                if (data.status === 'declined' && previous.status !== 'declined') this.showCoachToast(`${name} ne peut pas cette fois`, 'neutral');
            }
            this.renderDuoStrip();
            this.renderDuoSetPills();
            this.updateDuoCompare();
        },

        renderDuoStrip() {
            const anchor = document.querySelector('#screen-session .session-progress-container');
            let strip = document.getElementById('duo-strip');
            if (!this.duo || !this.currentWorkout || !anchor) {
                strip?.remove();
                return;
            }
            if (!strip) {
                strip = document.createElement('div');
                strip.id = 'duo-strip';
                strip.className = 'duo-strip';
                anchor.after(strip);
            }
            const { friend, friendState } = this.duo;
            const progress = friendState?.progress;
            let line = 'Invitation envoyée…';
            if (friendState?.status === 'declined') line = 'Ne peut pas cette fois';
            else if (progress?.finished) line = `A terminé · ${progress.sets} séries`;
            else if (progress) line = `${progress.exercisesDone}/${progress.exercisesTotal} exos · ${progress.sets} séries`;
            else if (friendState?.accepted) line = 'Vient de commencer';
            const ratio = progress ? Math.min(1, progress.exercisesDone / Math.max(1, progress.exercisesTotal)) : 0;
            strip.innerHTML = `
                ${avatar(friend, 'sm')}
                <div class="duo-strip-text">
                    <strong>Avec ${escape(friend.name)}</strong>
                    <small>${escape(line)}</small>
                </div>
                <div class="duo-strip-bar" aria-hidden="true"><span style="width: ${Math.round(ratio * 100)}%"></span></div>
            `;
        },

        async renderSlots(...args) {
            const result = await baseRenderSlots.apply(this, args);
            if (this.duo) {
                this.renderDuoStrip();
                this.scheduleDuoProgressPush();
            }
            return result;
        },

        getMyDuoProgress() {
            const workout = this.currentWorkout;
            if (!workout) return null;
            let sets = 0;
            let tonnage = 0;
            // Per exercise, the sets done in order: the friend's set cards
            // show the matching one. Keyed by name, as both programs differ.
            const exercises = {};
            Object.values(workout.slots || {}).forEach(slotData => {
                const done = [];
                let name = slotData?.meta?.activeExercise || slotData?.meta?.exerciseName || '';
                (slotData?.sets || []).forEach(set => {
                    if (!set?.completed) return;
                    sets += 1;
                    if (set.trackingMode === 'cardio' || set.trackingMode === 'timed') return;
                    tonnage += (Number(set.weight) || 0) * (Number(set.reps) || 0);
                    done.push({ w: Number(set.weight) || 0, r: Number(set.reps) || 0 });
                    name = set.exerciseName || name;
                });
                if (name && done.length) exercises[this.normalizeExerciseText(name)] = done.slice(0, 12);
            });
            const total = this.duo?.total || 0;
            const exercisesDone = Math.min(total || Infinity, (workout.completedSlots || []).length);
            return {
                exercisesDone,
                exercisesTotal: total,
                sets,
                tonnage: Math.round(tonnage),
                durationMs: Date.now() - (this.sessionStartTime || Date.now()),
                finished: false,
                exercises
            };
        },

        // ---------- Friend's sets on my set cards ----------
        async renderSeries(...args) {
            const result = await baseRenderSeries.apply(this, args);
            this.renderDuoSetPills();
            return result;
        },

        renderDuoSetPills() {
            const list = document.getElementById('series-list');
            if (!list) return;
            list.querySelectorAll('.duo-set-pill').forEach(pill => pill.remove());
            const theirs = this.duo?.friendState?.progress?.exercises;
            if (!this.duo || !theirs || !this.currentSlot || this.currentScreen !== 'exercise') return;
            const name = this.normalizeExerciseText(this.getSlotExerciseName(this.currentSlot));
            const sets = theirs[name];
            if (!sets?.length) return;
            const friend = this.duo.friend;
            const [, deep] = BUDDY_COLORS[lookFor(friend).color] || BUDDY_COLORS[0];
            list.querySelectorAll('.series-card[data-set-index]').forEach(card => {
                const index = Number(card.dataset.setIndex);
                const theirSet = sets[index];
                if (!theirSet) return;
                const pill = document.createElement('span');
                pill.className = 'duo-set-pill';
                pill.style.setProperty('--pill', deep);
                pill.title = `${friend.name}, série ${index + 1}`;
                pill.innerHTML = `${avatar(friend, 'xs')}<span>${String(theirSet.w).replace('.', ',')} kg × ${theirSet.r}</span>`;
                card.appendChild(pill);
            });
        },

        scheduleDuoProgressPush() {
            clearTimeout(this.duoPushTimer);
            this.duoPushTimer = setTimeout(() => {
                const progress = this.getMyDuoProgress();
                if (this.duo && progress) void this.social.backend.pushProgress(this.duo.id, progress).catch(() => {});
            }, 1500);
        },

        async confirmFinishSession(...args) {
            if (this.duo && this.currentWorkout) {
                const progress = { ...this.getMyDuoProgress(), finished: true };
                this.duoFinal = { mine: progress, duo: { ...this.duo } };
                clearTimeout(this.duoPushTimer);
                await this.social.backend.pushProgress(this.duo.id, progress).catch(() => {});
            }
            return baseConfirmFinishSession.apply(this, args);
        },

        // ---------- End of session comparison ----------
        async showStimulusScoreAnimation(score, recap = null) {
            const pending = baseShowStimulusScoreAnimation.call(this, score, recap);
            if (this.duoFinal) {
                let overlay = null;
                for (let attempt = 0; attempt < 40 && !overlay; attempt += 1) {
                    overlay = [...document.querySelectorAll('.stimulus-score-overlay')].pop() || null;
                    if (!overlay) await new Promise(resolve => setTimeout(resolve, 50));
                }
                const action = overlay?.querySelector('.fin-action');
                if (action) {
                    const section = document.createElement('section');
                    section.className = 'fin-section duo-compare';
                    section.id = 'duo-compare';
                    action.before(section);
                    this.updateDuoCompare();
                }
                void pending.then(() => {
                    this.duoFinal = null;
                    void this.setDuo(null);
                    void this.syncSocialProfile();
                });
            } else {
                void pending.then(() => this.syncSocialProfile());
            }
            return pending;
        },

        updateDuoCompare() {
            const section = document.getElementById('duo-compare');
            if (!section || !this.duoFinal) return;
            const mine = this.duoFinal.mine;
            const friend = this.duoFinal.duo.friend;
            const theirs = this.duo?.friendState?.progress || null;
            const rows = [
                ['Séries', mine.sets, theirs?.sets, value => String(value)],
                ['Volume', mine.tonnage, theirs?.tonnage, formatTonnage],
                ['Exercices', mine.exercisesDone, theirs?.exercisesDone, value => String(value)]
            ];
            const together = mine.tonnage + (theirs?.tonnage || 0);
            section.innerHTML = `
                <h4 class="fin-heading">Toi vs ${escape(friend.name)}</h4>
                <div class="duo-compare-head">
                    <span>Toi</span>
                    <span></span>
                    <span>${escape(friend.name)}</span>
                </div>
                ${rows.map(([label, a, b, format]) => {
                    const hasB = Number.isFinite(b);
                    return `
                        <div class="duo-compare-row">
                            <strong class="${hasB && a >= b ? 'is-best' : ''}">${format(a)}</strong>
                            <span>${label}</span>
                            <strong class="${hasB && b > a ? 'is-best' : ''}">${hasB ? format(b) : '–'}</strong>
                        </div>
                    `;
                }).join('')}
                <p class="duo-compare-note">${theirs && !theirs.finished
                    ? `${escape(friend.name)} est encore en séance : ça se met à jour en direct.`
                    : `Ensemble : ${formatTonnage(together)} soulevés. Belle équipe.`}</p>
            `;
        }
    });

    // Guest sessions (joined from a friend) stay out of the program list.
    const baseGetSessions = Database.prototype.getSessions;
    Database.prototype.getSessions = async function getSessionsWithoutGuests() {
        return (await baseGetSessions.call(this)).filter(session => !session.guest);
    };

    // Exposed for tests.
    if (typeof window !== 'undefined') window.WorktoutSocial = { DemoBackend, RemoteBackend };
})();
