// ===== Weekly leagues (Duolingo-style) =====
// Each week the player races 14 rivals on the XP earned since Monday. Top 5
// move up a league, bottom 5 move down. Until online leagues exist (they
// need a server), rivals are simulated from a seed of the week and league,
// and the card says so plainly.
(() => {
    const LEAGUES = [
        { name: 'Bronze', emoji: '🥉', color: '#c2773a', pace: 260 },
        { name: 'Argent', emoji: '🥈', color: '#94a3b8', pace: 340 },
        { name: 'Or', emoji: '🥇', color: '#eab308', pace: 430 },
        { name: 'Saphir', emoji: '💎', color: '#3b82f6', pace: 520 },
        { name: 'Rubis', emoji: '❤️‍🔥', color: '#e11d48', pace: 610 },
        { name: 'Émeraude', emoji: '💚', color: '#10b981', pace: 700 },
        { name: 'Améthyste', emoji: '🔮', color: '#8b5cf6', pace: 800 },
        { name: 'Perle', emoji: '🦪', color: '#e2e8f0', pace: 900 },
        { name: 'Obsidienne', emoji: '🖤', color: '#334155', pace: 1000 },
        { name: 'Diamant', emoji: '👑', color: '#06b6d4', pace: 1150 }
    ];
    const NAMES = [
        'Léa Squat', 'Tom la Fonte', 'Inès Deadlift', 'Mehdi Pull', 'Camille Gainage', 'Yanis Bench',
        'Sarah Cardio', 'Hugo Presse', 'Nora Kettlebell', 'Lucas Rameur', 'Jade Hip Thrust', 'Rayan Dips',
        'Manon Fentes', 'Enzo Curl', 'Chloé Tapis', 'Adam Tractions', 'Zoé Mollets', 'Noah Rowing',
        'Lina Élévations', 'Malik Front Squat', 'Emma Pompes', 'Sacha Face Pull', 'Ambre Leg Press', 'Ilyes Shrugs'
    ];
    const GROUP_SIZE = 15;
    const PROMOTE = 5;
    const DEMOTE = 5;

    // Small deterministic PRNG so rivals stay the same all week.
    const seeded = seed => {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const hash = text => [...text].reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 7);

    const baseRenderStats = App.prototype.renderStats;

    Object.assign(App.prototype, {
        async getLeagueState() {
            const weekKey = this.getWeekKey();
            const xp = Number(await db.getSetting('xp')) || 0;
            let state = await db.getSetting('leagueState');
            if (!state) {
                state = { weekKey, tier: 0, startXp: xp, history: [] };
                await db.setSetting('leagueState', state);
                return state;
            }
            if (state.weekKey !== weekKey) {
                // Close last week: rank decides the move, then a fresh week.
                const standings = this.buildLeagueStandings(state, xp);
                const me = standings.findIndex(row => row.isMe);
                const rank = me + 1;
                let move = 0;
                const earned = Math.max(0, xp - state.startXp);
                if (rank <= PROMOTE && earned > 0 && state.tier < LEAGUES.length - 1) move = 1;
                else if (rank > GROUP_SIZE - DEMOTE && state.tier > 0) move = -1;
                const history = [...(state.history || []), { weekKey: state.weekKey, tier: state.tier, rank, xp: earned }].slice(-26);
                state = { weekKey, tier: state.tier + move, startXp: xp, history, lastResult: { rank, move, tier: state.tier } };
                await db.setSetting('leagueState', state);
                this.pendingLeagueResult = state.lastResult;
            }
            return state;
        },

        // Rivals' XP grows with the week: a pace per league, a personal
        // rhythm, and a few "big days", all from the week/league seed.
        buildLeagueStandings(state, currentXp, now = new Date()) {
            const league = LEAGUES[state.tier] || LEAGUES[0];
            const random = seeded(hash(`${state.weekKey}:${state.tier}`));
            const { start, end } = streakEngine.getWeekBounds(new Date(state.weekKey + 'T12:00:00'));
            const progress = Math.max(0, Math.min(1, (now - start) / (end - start)));
            const names = [...NAMES].sort(() => random() - 0.5).slice(0, GROUP_SIZE - 1);
            const rivals = names.map((name, index) => {
                const talent = 0.35 + random() * 1.25;
                const curve = 0.7 + random() * 0.6;
                const total = Math.round(league.pace * talent * (index < 2 ? 1.3 : 1));
                const xp = Math.round(total * Math.pow(progress, curve) / 5) * 5;
                return { name, xp, isMe: false, avatar: name.split(' ')[0][0] };
            });
            const myXp = Math.max(0, currentXp - (state.startXp || 0));
            return [...rivals, { name: 'Toi', xp: myXp, isMe: true, avatar: '💪' }]
                .sort((a, b) => b.xp - a.xp || (a.isMe ? -1 : 1));
        },

        async renderLeagueCard() {
            const card = document.getElementById('league-card');
            if (!card) return;
            const state = await this.getLeagueState();
            const xp = Number(await db.getSetting('xp')) || 0;
            const league = LEAGUES[state.tier] || LEAGUES[0];
            const standings = this.buildLeagueStandings(state, xp);
            const myIndex = standings.findIndex(row => row.isMe);
            const { end } = streakEngine.getWeekBounds();
            const daysLeft = Math.max(0, Math.ceil((end - new Date()) / 86400000));
            const expanded = Boolean(this.leagueExpanded);
            const around = expanded
                ? standings.map((row, index) => ({ row, index }))
                : standings.map((row, index) => ({ row, index })).filter(({ index }) => index < 3 || Math.abs(index - myIndex) <= 1);
            const zone = index => (index < PROMOTE && state.tier < LEAGUES.length - 1) ? 'up' : (index >= GROUP_SIZE - DEMOTE && state.tier > 0 ? 'down' : '');
            let lastIndex = -1;

            card.style.setProperty('--league', league.color);
            card.innerHTML = `
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Ligue de la semaine</span>
                        <h4>${league.emoji} Ligue ${this.escapeHtml(league.name)} · ${myIndex + 1}<sup>${myIndex === 0 ? 're' : 'e'}</sup></h4>
                    </div>
                    <span class="pz-chip">${daysLeft <= 1 ? 'Dernier jour' : `${daysLeft} j`}</span>
                </div>
                <p class="league-rule">${state.tier < LEAGUES.length - 1 ? `Top ${PROMOTE} : montée en ${LEAGUES[state.tier + 1].name}.` : 'Ligue maximale.'}${state.tier > 0 ? ` Les ${DEMOTE} derniers redescendent.` : ''}</p>
                <ol class="league-list">
                    ${around.map(({ row, index }) => {
                        const gap = lastIndex >= 0 && index - lastIndex > 1 ? '<li class="league-gap" aria-hidden="true">⋯</li>' : '';
                        lastIndex = index;
                        return `${gap}
                            <li class="league-row ${row.isMe ? 'is-me' : ''} zone-${zone(index)}">
                                <span class="league-rank">${index + 1}</span>
                                <span class="league-avatar" aria-hidden="true">${this.escapeHtml(row.avatar)}</span>
                                <span class="league-name">${this.escapeHtml(row.name)}</span>
                                <span class="league-xp">${row.xp.toLocaleString('fr-FR')} XP</span>
                            </li>`;
                    }).join('')}
                </ol>
                <button type="button" class="pz-more" data-league-toggle>${expanded ? 'Réduire' : 'Voir tout le classement'}</button>
                <small class="league-note">Rivaux simulés pour l’instant. Score : XP gagnée depuis lundi.</small>
            `;
            card.querySelector('[data-league-toggle]')?.addEventListener('click', () => {
                this.leagueExpanded = !this.leagueExpanded;
                void this.renderLeagueCard();
            });

            const result = this.pendingLeagueResult;
            if (result) {
                this.pendingLeagueResult = null;
                const from = LEAGUES[result.tier];
                const to = LEAGUES[result.tier + result.move] || from;
                setTimeout(() => {
                    if (result.move > 0) {
                        gamification.triggerConfetti?.('heavy');
                        gamification.showAchievement?.(to.emoji, `Promotion en ligue ${to.name} !`, `${result.rank}e la semaine dernière.`);
                    } else if (result.move < 0) {
                        gamification.showAchievement?.(to.emoji, `Retour en ligue ${to.name}`, 'Une bonne semaine et tu remontes.');
                    } else {
                        gamification.showAchievement?.(from.emoji, `Maintien en ligue ${from.name}`, `${result.rank}e la semaine dernière.`);
                    }
                }, 1200);
            }
        },

        async renderStats(homeData = null) {
            await baseRenderStats.call(this, homeData);
            await this.renderLeagueCard();
        }
    });
})();
