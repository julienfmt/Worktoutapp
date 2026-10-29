// ===== Friends: invite, train together, weekly board =====
// One entry point (the people button on the home header) opens a sheet with
// the weekly board of friends, pending invitations and two actions: invite a
// friend (share link with a friend code) and "Séance à deux" (both people do
// the same session, see each other's progress, compare at the end).
//
// Everything goes through a small backend adapter:
// - RemoteBackend: the social server (workers/social-api.js). Set API_URL
//   (or the `socialApiUrl` setting) once it is deployed.
// - DemoBackend: local, simulated friends to preview the whole flow. Turn it
//   on with ?social=demo (off again with ?social=off).
// Without either, the people button stays hidden: no half-working feature.
(() => {
    const API_URL = '';
    // Swap for the friends illustration (rhinos high-fiving) once delivered.
    const MASCOT_SRC = 'icons/icon-192.png';
    const INBOX_POLL_MS = 45000;
    const DUO_POLL_MS = 8000;
    const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9'];

    const svg = (body, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    const ICONS = {
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
        play: '<path d="M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5z" fill="currentColor" stroke="none"/>',
        back: '<path d="M15 18l-6-6 6-6"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
    };

    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hash = text => [...String(text)].reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 7);
    const avatarColor = id => AVATAR_COLORS[Math.abs(hash(id)) % AVATAR_COLORS.length];
    const initial = name => (String(name || '?').trim()[0] || '?').toUpperCase();
    const avatar = (person, size = 'md') => `<span class="sf-avatar is-${size}" style="--avatar: ${avatarColor(person?.id || person?.name)}" aria-hidden="true">${escape(initial(person?.name))}</span>`;
    const randomCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
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

        async connect(name) {
            this.auth = await db.getSetting('socialAuth');
            if (!this.auth?.token) {
                let installId = await db.getSetting('socialInstallId');
                if (!installId) {
                    installId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    await db.setSetting('socialInstallId', installId);
                }
                this.auth = await this.request('/v1/register', { method: 'POST', body: { installId, name } });
                await db.setSetting('socialAuth', this.auth);
            }
            return { id: this.auth.userId, code: this.auth.code };
        }

        syncProfile(profile) { return this.request('/v1/profile', { method: 'POST', body: profile }); }
        async getFriends() { return (await this.request('/v1/friends')).friends || []; }
        async addFriend(code) { return (await this.request('/v1/friends', { method: 'POST', body: { code } })).friend; }
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
                    code: randomCode(),
                    friends: [
                        { id: 'demo-lea', name: 'Léa', base: 420 },
                        { id: 'demo-tom', name: 'Tom', base: 260 },
                        { id: 'demo-ines', name: 'Inès', base: 610 }
                    ],
                    invites: [{
                        id: 'demo-invite-tom',
                        from: { id: 'demo-tom', name: 'Tom' },
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

        async connect() {
            const state = await this.load();
            return { id: 'me', code: state.code };
        }

        async syncProfile() { return {}; }

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
                    weekXp: Math.round(weekSessions * (friend.base / 3) + (seed % 90)),
                    weekSessions,
                    inSession: activeDuo?.friendId === friend.id
                };
            });
        }

        async addFriend(code) {
            const clean = String(code || '').trim().toUpperCase();
            if (!/^[A-Z0-9]{6}$/.test(clean)) throw Object.assign(new Error('invalid-code'), { code: 'invalid-code' });
            const state = await this.load();
            if (clean === state.code) throw Object.assign(new Error('own-code'), { code: 'own-code' });
            const names = ['Sam', 'Nora', 'Yanis', 'Jade', 'Hugo', 'Lina'];
            const friend = { id: `demo-${clean.toLowerCase()}`, name: names[Math.abs(hash(clean)) % names.length], base: 300 + Math.abs(hash(clean)) % 300 };
            if (!state.friends.some(item => item.id === friend.id)) state.friends.push(friend);
            await this.save(state);
            return { id: friend.id, name: friend.name };
        }

        async getInbox() {
            return (await this.load()).invites;
        }

        async createDuo(friendId, session) {
            const state = await this.load();
            const id = `demo-duo-${Date.now()}`;
            state.duos[id] = { id, friendId, total: session.exercises.length, status: 'pending', createdAt: Date.now() };
            await this.save(state);
            return { id };
        }

        async respondDuo(duoId, accept) {
            const state = await this.load();
            const invite = state.invites.find(item => item.id === duoId);
            state.invites = state.invites.filter(item => item.id !== duoId);
            if (invite && accept) {
                state.duos[duoId] = { id: duoId, friendId: invite.from.id, total: invite.session.exercises.length, status: 'active', createdAt: Date.now(), acceptedAt: Date.now() - 60000 };
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
                progress = {
                    exercisesDone,
                    exercisesTotal: duo.total,
                    sets,
                    tonnage: sets * 640,
                    durationMs: elapsed,
                    finished: exercisesDone >= duo.total
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
                this.social = { backend: await this.resolveSocialBackend(), me: null, friends: [], invites: [], view: 'home', pick: {} };
            } catch (error) {
                this.social = { backend: null };
            }
            const params = new URLSearchParams(location.search);
            const sharedCode = params.get('ami');
            if (sharedCode) {
                await db.setSetting('socialPendingCode', sharedCode.toUpperCase());
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

        async connectSocial() {
            const name = (await db.getSetting('userName')) || '';
            if (!name || this.social.me) return Boolean(this.social.me);
            try {
                this.social.me = { ...(await this.social.backend.connect(name)), name };
                await this.syncSocialProfile();
                const pending = await db.getSetting('socialPendingCode');
                if (pending) {
                    await db.setSetting('socialPendingCode', null);
                    await this.addFriendByCode(pending, { quiet: false });
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
        },

        closeFriends() {
            document.getElementById('sheet-friends')?.classList.remove('active');
        },

        renderFriendsSheet() {
            const content = document.querySelector('#sheet-friends .sf-sheet');
            if (!content || !this.social) return;
            const view = this.social.me ? this.social.view : 'name';
            content.innerHTML = `<div class="sheet-handle"></div>${view === 'name' ? this.renderFriendsNameView()
                : view === 'duo' ? this.renderDuoPickView()
                : view === 'code' ? this.renderFriendCodeView()
                : this.renderFriendsHomeView()}`;
        },

        renderMascot() {
            return `<img class="sf-mascot" src="${MASCOT_SRC}" alt="" onerror="this.remove()">`;
        },

        renderFriendsNameView() {
            return `
                <div class="sf-intro">
                    ${this.renderMascot()}
                    <h3>Entraîne-toi avec tes potes</h3>
                    <p>Comment tes amis t’appellent ?</p>
                </div>
                <form class="sf-form" data-sf-form="name">
                    <input class="sf-input" name="name" maxlength="24" autocomplete="given-name" placeholder="Ton prénom" required>
                    <button type="submit" class="btn btn-primary btn-large">Continuer</button>
                </form>
            `;
        },

        renderFriendsHomeView() {
            const { friends = [], invites = [], me, myScore } = this.social;
            const board = [
                { id: me.id, name: me.name, weekXp: myScore?.weekXp || 0, weekSessions: myScore?.weekSessions || 0, isMe: true },
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

            if (!friends.length) {
                return `
                    <div class="sf-head">
                        <h3>Tes potes</h3>
                        <button type="button" class="sf-icon-btn" data-sf="close" aria-label="Fermer">${svg(ICONS.close, 18)}</button>
                    </div>
                    ${invitesHtml}
                    <div class="sf-intro">
                        ${this.renderMascot()}
                        <h3>À plusieurs, on lâche rien</h3>
                        <p>Invite un pote : vous pourrez faire la même séance, suivre vos progrès et vous comparer chaque semaine.</p>
                    </div>
                    <div class="sf-actions-col">
                        <button type="button" class="btn btn-primary btn-large sf-main" data-sf="share">${svg(ICONS.share, 18)} Inviter un pote</button>
                        <button type="button" class="sf-link" data-sf="code">J’ai un code d’ami</button>
                    </div>
                `;
            }

            return `
                <div class="sf-head">
                    <h3>Tes potes</h3>
                    <button type="button" class="sf-icon-btn" data-sf="close" aria-label="Fermer">${svg(ICONS.close, 18)}</button>
                </div>
                ${invitesHtml}
                <div class="sf-actions-row">
                    <button type="button" class="btn btn-primary sf-main" data-sf="duo">${svg(ICONS.play, 16)} Séance à deux</button>
                    <button type="button" class="btn btn-secondary sf-main" data-sf="share">${svg(ICONS.share, 18)} Inviter</button>
                </div>
                <div class="sf-board">
                    <span class="sf-kicker">Cette semaine</span>
                    ${board.map((person, index) => `
                        <div class="sf-row ${person.isMe ? 'is-me' : ''}">
                            <span class="sf-rank">${index + 1}</span>
                            ${avatar(person)}
                            <div class="sf-row-text">
                                <strong>${person.isMe ? 'Toi' : escape(person.name)}</strong>
                                <small>${person.inSession ? '<span class="sf-live">En séance</span>' : `${person.weekSessions} séance${person.weekSessions > 1 ? 's' : ''}`}</small>
                            </div>
                            <span class="sf-xp">${person.weekXp} <small>XP</small></span>
                        </div>
                    `).join('')}
                </div>
                <button type="button" class="sf-link" data-sf="code">Ajouter avec un code</button>
            `;
        },

        renderFriendCodeView() {
            const { me } = this.social;
            return `
                <div class="sf-head">
                    <button type="button" class="sf-icon-btn" data-sf="home" aria-label="Retour">${svg(ICONS.back, 18)}</button>
                    <h3>Code d’ami</h3>
                    <span class="sf-head-spacer"></span>
                </div>
                <div class="sf-code-card">
                    <span class="sf-kicker">Ton code</span>
                    <strong class="sf-code">${escape(me.code)}</strong>
                    <button type="button" class="sf-link" data-sf="copy-code">${svg(ICONS.copy, 16)} Copier</button>
                </div>
                <form class="sf-form" data-sf-form="code">
                    <label class="sf-label" for="sf-code-input">Le code de ton pote</label>
                    <input class="sf-input sf-input-code" id="sf-code-input" name="code" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="ABC123" required>
                    <button type="submit" class="btn btn-primary btn-large">Ajouter</button>
                </form>
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
                case 'code':
                    this.social.view = action;
                    return this.renderFriendsSheet();
                case 'share': return this.shareFriendInvite();
                case 'copy-code': return this.copyText(this.social.me.code, 'Code copié');
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
        },

        async onFriendsSubmit(form) {
            if (form.dataset.sfForm === 'name') {
                const name = String(form.elements.name.value || '').trim().slice(0, 24);
                if (!name) return;
                await db.setSetting('userName', name);
                this.social.view = 'home';
                this.renderFriendsSheet();
                await this.connectSocial();
                await this.syncSocialProfile();
                await this.refreshSocialInbox();
                this.renderFriendsSheet();
                return;
            }
            if (form.dataset.sfForm === 'code') {
                const added = await this.addFriendByCode(form.elements.code.value);
                if (added) {
                    this.social.view = 'home';
                    await this.refreshSocialInbox();
                    this.renderFriendsSheet();
                }
            }
        },

        async addFriendByCode(code, { quiet = false } = {}) {
            try {
                const friend = await this.social.backend.addFriend(String(code || '').trim().toUpperCase());
                if (!quiet) this.showCoachToast(`${friend.name} fait partie de tes potes`, 'hot');
                return friend;
            } catch (error) {
                const messages = {
                    'invalid-code': 'Ce code ne correspond à personne.',
                    'own-code': 'C’est ton propre code.',
                    'not-found': 'Ce code ne correspond à personne.'
                };
                this.showCoachToast(messages[error.code] || 'Impossible d’ajouter ce pote pour le moment.', 'warning');
                return null;
            }
        },

        async shareFriendInvite() {
            const url = `${location.origin}${location.pathname}?ami=${encodeURIComponent(this.social.me.code)}`;
            const text = `${this.social.me.name} t’invite à s’entraîner ensemble sur Muscu. Code ami : ${this.social.me.code}`;
            const nativeShare = window.Capacitor?.Plugins?.Share;
            try {
                if (nativeShare) return await nativeShare.share({ title: 'Muscu', text, url });
                if (navigator.share) return await navigator.share({ title: 'Muscu', text, url });
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
            await this.copyText(`${text}\n${url}`, 'Lien d’invitation copié');
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
                await this.setDuo({ id, friend: { id: friend.id, name: friend.name }, sessionId, total: payload.exercises.length, role: 'host' });
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
            Object.values(workout.slots || {}).forEach(slotData => {
                (slotData?.sets || []).forEach(set => {
                    if (!set?.completed) return;
                    sets += 1;
                    if (set.trackingMode !== 'cardio' && set.trackingMode !== 'timed') tonnage += (Number(set.weight) || 0) * (Number(set.reps) || 0);
                });
            });
            const total = this.duo?.total || 0;
            const exercisesDone = Math.min(total || Infinity, (workout.completedSlots || []).length);
            return {
                exercisesDone,
                exercisesTotal: total,
                sets,
                tonnage: Math.round(tonnage),
                durationMs: Date.now() - (this.sessionStartTime || Date.now()),
                finished: false
            };
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
