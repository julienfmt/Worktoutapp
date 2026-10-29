// ===== Parcours: a Duolingo-style path, extended trophies and quests =====
// Every finished workout moves the player one step along an endless path of
// themed chapters. Chests sit between steps and must be opened by hand
// (+XP), each chapter ends on a "boss" session and a chapter chest.
// Loaded after shell.js (uses gameMetrics built there).
(() => {
    const CHAPTER_THEMES = [
        { title: 'Les fondations', emoji: '🧱', color: '#6366f1', tip: 'Apprends les mouvements, garde de la marge, reviens.' },
        { title: 'Le rythme', emoji: '🥁', color: '#8b5cf6', tip: 'Revenir chaque semaine, c’est 80 % du travail.' },
        { title: 'La technique', emoji: '🎯', color: '#0ea5e9', tip: 'Amplitude complète, tempo contrôlé : la base des gains.' },
        { title: 'Premiers records', emoji: '⚡', color: '#f59e0b', tip: 'Tes charges montent : note tout, le coach suit.' },
        { title: 'La surcharge', emoji: '📈', color: '#22c55e', tip: 'Un peu plus que la dernière fois. Toujours.' },
        { title: 'Le volume', emoji: '🌊', color: '#06b6d4', tip: 'Assez de séries par muscle, ni trop, ni trop peu.' },
        { title: 'Force brute', emoji: '🦍', color: '#ef4444', tip: 'Les gros mouvements deviennent tes alliés.' },
        { title: 'Cœur d’acier', emoji: '❤️‍🔥', color: '#f43f5e', tip: 'Un peu de cardio rend chaque séance plus facile.' },
        { title: 'Discipline', emoji: '🛡️', color: '#14b8a6', tip: 'La motivation va et vient, l’habitude reste.' },
        { title: 'Le sommet', emoji: '🏔️', color: '#3b82f6', tip: 'Tu fais partie de ceux qui ne lâchent pas.' },
        { title: 'Titan', emoji: '🗿', color: '#a855f7', tip: 'Chaque séance renforce une machine déjà rodée.' },
        { title: 'Légende', emoji: '👑', color: '#eab308', tip: 'Peu de gens arrivent ici. Continue d’écrire l’histoire.' }
    ];
    const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    // Horizontal offsets (px) of the zigzag, like the Duolingo path.
    const WAVE = [0, 44, 70, 44, 0, -44, -70, -44];

    const getChapterSize = index => (index < 3 ? 5 + index : index < 8 ? 8 : 10);

    const baseGetPlayerLevel = App.prototype.getPlayerLevel;
    const baseBuildWeeklyQuests = App.prototype.buildWeeklyQuests;
    const baseRenderQuestBoard = App.prototype.renderQuestBoard;

    Object.assign(App.prototype, {
        getJourneyChapter(index) {
            const theme = CHAPTER_THEMES[index % CHAPTER_THEMES.length];
            const season = Math.floor(index / CHAPTER_THEMES.length);
            return {
                index,
                number: index + 1,
                size: getChapterSize(index),
                ...theme,
                title: season > 0 ? `${theme.title} ${ROMAN[Math.min(season, ROMAN.length - 1)] || season + 1}` : theme.title,
                chestXp: 40 + (index * 10),
                bossXp: 100 + (index * 25)
            };
        },

        // Pure position math: which chapter / step a number of workouts reaches.
        getJourneyPosition(totalWorkouts = 0) {
            let remaining = Math.max(0, Math.floor(totalWorkouts));
            let index = 0;
            let start = 0;
            while (remaining >= getChapterSize(index)) {
                remaining -= getChapterSize(index);
                start += getChapterSize(index);
                index += 1;
            }
            return {
                chapterIndex: index,
                stepInChapter: remaining,
                chapterStart: start,
                chaptersDone: index
            };
        },

        getJourneyChestIds(chapter) {
            const middle = Math.ceil(chapter.size / 2);
            return {
                middleAfter: middle,
                middleId: `c${chapter.index}-mid`,
                bossId: `c${chapter.index}-boss`
            };
        },

        async getJourneyClaims() {
            const stored = await db.getSetting('journeyClaims');
            if (Array.isArray(stored)) return stored;
            // First launch of the path: chapters finished before it existed are
            // marked as opened (their XP was already earned through the
            // workouts), only the chapter in progress keeps its chests.
            const total = this.progressContext?.snapshot?.totalWorkouts || 0;
            const position = this.getJourneyPosition(total);
            const claims = [];
            for (let index = 0; index < position.chapterIndex; index += 1) {
                const ids = this.getJourneyChestIds(this.getJourneyChapter(index));
                claims.push(ids.middleId, ids.bossId);
            }
            await db.setSetting('journeyClaims', claims);
            return claims;
        },

        // Chests that are reachable and not opened yet (badge on the tab).
        getJourneyPendingChests(totalWorkouts, claims = []) {
            const position = this.getJourneyPosition(totalWorkouts);
            const pending = [];
            for (let index = 0; index <= position.chapterIndex; index += 1) {
                const chapter = this.getJourneyChapter(index);
                const ids = this.getJourneyChestIds(chapter);
                const done = index < position.chapterIndex ? chapter.size : position.stepInChapter;
                if (done >= ids.middleAfter && !claims.includes(ids.middleId)) pending.push({ id: ids.middleId, xp: chapter.chestXp, chapter });
                if (done >= chapter.size && !claims.includes(ids.bossId)) pending.push({ id: ids.bossId, xp: chapter.bossXp, chapter, isBoss: true });
            }
            return pending;
        },

        async renderJourneyPath({ scrollToCurrent = false } = {}) {
            const container = document.getElementById('journey-path');
            const ctx = this.progressContext;
            if (!container || !ctx) return;
            const totalWorkouts = ctx.snapshot.totalWorkouts || 0;
            const claims = await this.getJourneyClaims();
            this.journeyClaims = claims;
            const position = this.getJourneyPosition(totalWorkouts);
            const pending = this.getJourneyPendingChests(totalWorkouts, claims);
            this.journeyPendingCount = pending.length;
            this.refreshProgressTabDot();

            const showPast = Boolean(this.journeyShowPast);
            const firstShown = showPast ? Math.max(0, position.chapterIndex - 6) : position.chapterIndex;
            const chapters = [];
            for (let index = firstShown; index <= position.chapterIndex + 1; index += 1) {
                chapters.push(this.getJourneyChapter(index));
            }
            const hiddenPast = firstShown;
            const avatar = ctx.player?.title?.emoji || '💪';
            let globalStart = 0;
            for (let index = 0; index < firstShown; index += 1) globalStart += getChapterSize(index);

            const renderChapter = (chapter) => {
                const chapterStart = globalStart;
                globalStart += chapter.size;
                const done = Math.max(0, Math.min(chapter.size, totalWorkouts - chapterStart));
                const isCurrentChapter = chapter.index === position.chapterIndex;
                const isLocked = chapter.index > position.chapterIndex;
                const ids = this.getJourneyChestIds(chapter);
                const nodes = [];
                let wave = 0;
                for (let step = 0; step < chapter.size; step += 1) {
                    const isBoss = step === chapter.size - 1;
                    const state = step < done ? 'done' : (step === done && isCurrentChapter ? 'current' : 'locked');
                    nodes.push({ kind: isBoss ? 'boss' : 'session', state, step, global: chapterStart + step, offset: WAVE[wave++ % WAVE.length] });
                    if (step + 1 === ids.middleAfter) {
                        const reached = done >= ids.middleAfter;
                        const claimed = claims.includes(ids.middleId);
                        nodes.push({ kind: 'chest', id: ids.middleId, xp: chapter.chestXp, state: claimed ? 'claimed' : (reached ? 'ready' : 'locked'), offset: WAVE[wave++ % WAVE.length] });
                    }
                }
                const bossReached = done >= chapter.size;
                const bossClaimed = claims.includes(ids.bossId);
                nodes.push({ kind: 'trophy', id: ids.bossId, xp: chapter.bossXp, state: bossClaimed ? 'claimed' : (bossReached ? 'ready' : 'locked'), offset: 0 });

                return `
                    <section class="journey-chapter ${isLocked ? 'is-locked' : ''} ${isCurrentChapter ? 'is-current' : ''} ${done >= chapter.size ? 'is-done' : ''}" style="--chapter: ${chapter.color}">
                        <header class="journey-banner">
                            <div class="journey-banner-main">
                                <span class="journey-banner-kicker">Chapitre ${chapter.number}</span>
                                <strong>${chapter.emoji} ${this.escapeHtml(chapter.title)}</strong>
                                <small>${this.escapeHtml(isLocked ? 'Termine le chapitre précédent pour l’ouvrir.' : chapter.tip)}</small>
                            </div>
                            <div class="journey-banner-count">
                                <strong>${done}/${chapter.size}</strong>
                                <span>séances</span>
                            </div>
                        </header>
                        <div class="journey-track">
                            ${(isLocked ? nodes.slice(0, 3) : nodes).map(node => this.renderJourneyNode(node, chapter, { avatar })).join('')}
                            ${isLocked ? '<div class="journey-fade" aria-hidden="true"></div>' : ''}
                        </div>
                    </section>
                `;
            };

            container.innerHTML = `
                <div class="journey-head">
                    <div>
                        <span class="pz-kicker">Le chemin</span>
                        <h4>Chapitre ${position.chapterIndex + 1} · étape ${position.stepInChapter + 1}/${getChapterSize(position.chapterIndex)}</h4>
                    </div>
                    ${pending.length ? `<span class="pz-chip is-gold">🎁 ${pending.length} à ouvrir</span>` : `<span class="pz-chip">${position.chaptersDone} chapitre${position.chaptersDone > 1 ? 's' : ''} ✓</span>`}
                </div>
                ${hiddenPast > 0 ? `
                    <button type="button" class="journey-past" data-journey-past>
                        <span class="journey-past-medals" aria-hidden="true">${Array.from({ length: Math.min(hiddenPast, 5) }, (_, i) => `<i style="--chapter: ${this.getJourneyChapter(hiddenPast - 1 - i).color}">${this.getJourneyChapter(hiddenPast - 1 - i).emoji}</i>`).join('')}</span>
                        <span>${hiddenPast} chapitre${hiddenPast > 1 ? 's' : ''} terminé${hiddenPast > 1 ? 's' : ''} · voir</span>
                    </button>
                ` : (showPast && position.chapterIndex > 0 ? '<button type="button" class="journey-past" data-journey-past><span>Masquer les chapitres terminés</span></button>' : '')}
                ${chapters.map(renderChapter).join('')}
            `;

            if (!container.dataset.bound) {
                container.dataset.bound = 'true';
                container.addEventListener('click', event => this.onJourneyClick(event));
            }

            if (scrollToCurrent) {
                const current = container.querySelector('.journey-node.is-current, .journey-node.is-ready');
                const scroller = container.closest('.pane-scroll');
                if (current && scroller) {
                    const top = current.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - (scroller.clientHeight * 0.4);
                    if (top > scroller.scrollTop + 40) scroller.scrollTo({ top, behavior: 'smooth' });
                }
            }
        },

        renderJourneyNode(node, chapter, { avatar }) {
            const style = `--offset: ${node.offset}px`;
            if (node.kind === 'chest' || node.kind === 'trophy') {
                const icon = node.kind === 'trophy'
                    ? (node.state === 'claimed' ? '🏆' : '🏆')
                    : (node.state === 'claimed' ? '📭' : '🎁');
                const label = node.kind === 'trophy'
                    ? (node.state === 'ready' ? `Récompense de chapitre : +${node.xp} XP` : node.state === 'claimed' ? 'Chapitre terminé' : 'Récompense de fin de chapitre')
                    : (node.state === 'ready' ? `Coffre : +${node.xp} XP` : node.state === 'claimed' ? 'Coffre ouvert' : 'Coffre verrouillé');
                return `
                    <div class="journey-row ${node.offset > 0 ? 'is-right' : ''}" style="${style}">
                        <button type="button" class="journey-node journey-${node.kind} is-${node.state}" data-journey-chest="${node.id}" data-journey-xp="${node.xp}" aria-label="${this.escapeHtml(label)}" ${node.state === 'locked' ? 'aria-disabled="true"' : ''}>
                            <span class="journey-node-icon" aria-hidden="true">${icon}</span>
                        </button>
                        ${node.state === 'ready' ? `<span class="journey-bubble is-gold">Ouvrir · +${node.xp} XP</span>` : ''}
                    </div>
                `;
            }

            const isBoss = node.kind === 'boss';
            const icons = {
                done: isBoss ? '👑' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
                current: isBoss ? '👑' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5z"/></svg>',
                locked: isBoss ? '👑' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7.1L22 9.2l-7.2-.6z"/></svg>'
            };
            const label = node.state === 'done'
                ? `Séance ${node.global + 1} validée`
                : node.state === 'current'
                    ? `Séance ${node.global + 1} : démarrer`
                    : `Séance ${node.global + 1}`;
            return `
                <div class="journey-row ${node.offset > 0 ? 'is-right' : ''}" style="${style}">
                    <button type="button" class="journey-node journey-${node.kind} is-${node.state}" data-journey-step="${node.global}" aria-label="${this.escapeHtml(label)}">
                        <span class="journey-node-icon" aria-hidden="true">${icons[node.state]}</span>
                        ${node.state === 'current' ? '<span class="journey-node-ring" aria-hidden="true"></span>' : ''}
                    </button>
                    ${node.state === 'current' ? `
                        <span class="journey-bubble">${isBoss ? 'Séance de boss !' : 'Commencer'}<small>${this.escapeHtml(this.currentSession?.name || 'Ta prochaine séance')}</small></span>
                        <span class="journey-avatar" aria-hidden="true">${avatar}</span>
                    ` : ''}
                </div>
            `;
        },

        async onJourneyClick(event) {
            if (event.target.closest('[data-journey-past]')) {
                this.journeyShowPast = !this.journeyShowPast;
                await this.renderJourneyPath();
                return;
            }
            const chest = event.target.closest('[data-journey-chest]');
            if (chest) {
                if (chest.classList.contains('is-ready')) {
                    await this.claimJourneyChest(chest.dataset.journeyChest, Number(chest.dataset.journeyXp) || 0, chest);
                } else if (chest.classList.contains('is-locked')) {
                    this.hapticTap?.(6);
                    this.showCoachToast('Avance sur le chemin pour ouvrir ce coffre.', 'neutral', '🔒');
                }
                return;
            }
            const stepButton = event.target.closest('[data-journey-step]');
            if (!stepButton) return;
            const step = Number(stepButton.dataset.journeyStep);
            if (stepButton.classList.contains('is-current')) {
                document.getElementById('btn-start-session')?.click();
                return;
            }
            if (stepButton.classList.contains('is-done')) {
                const history = [...(this.homeDataSnapshot?.history || [])]
                    .filter(workout => this.getSafeDate(workout.date))
                    .sort((a, b) => new Date(a.date) - new Date(b.date));
                const workout = history[step];
                if (workout) {
                    const session = (this.homeDataSnapshot?.sessions || []).find(item => item.id === workout.sessionId);
                    const date = new Date(workout.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                    this.showCoachToast(`Séance ${step + 1}${session ? ` · ${session.name}` : ''} — ${date}`, 'hot', '✅');
                }
                return;
            }
            this.showCoachToast(`Encore ${step - (this.progressContext?.snapshot.totalWorkouts || 0)} séance${step - (this.progressContext?.snapshot.totalWorkouts || 0) > 1 ? 's' : ''} pour atteindre cette étape.`, 'neutral', '🗺️');
        },

        async claimJourneyChest(chestId, xpAmount, anchor = null) {
            this.claimingChests = this.claimingChests || new Set();
            if (this.claimingChests.has(chestId)) return;
            this.claimingChests.add(chestId);
            anchor?.setAttribute('aria-disabled', 'true');
            try {
                await this.claimJourneyChestOnce(chestId, xpAmount, anchor);
            } finally {
                this.claimingChests.delete(chestId);
            }
        },

        async claimJourneyChestOnce(chestId, xpAmount, anchor) {
            const claims = await this.getJourneyClaims();
            if (claims.includes(chestId)) return;
            claims.push(chestId);
            await db.setSetting('journeyClaims', claims);
            const xp = ((await db.getSetting('xp')) || 0) + xpAmount;
            await db.setSetting('xp', xp);
            const previousLevel = this.progressContext.player.level;
            this.progressContext.player = this.getPlayerLevel(xp);
            this.hapticTap?.([14, 40, 20, 40, 30]);
            if (anchor) gamification.burstFromElement(anchor, { count: 46, spread: 190, power: 12, shapes: ['star', 'circle', 'rect'] });
            gamification.triggerConfetti(this.progressContext.player.level > previousLevel ? 'heavy' : 'medium');
            const isBoss = chestId.endsWith('-boss');
            if (this.progressContext.player.level > previousLevel) {
                gamification.showAchievement('⬆️', `Niveau ${this.progressContext.player.level} !`, `Tu passes ${this.progressContext.player.title.name}.`, xpAmount);
            } else {
                gamification.showAchievement(isBoss ? '🏆' : '🎁', isBoss ? 'Chapitre terminé !' : 'Coffre ouvert !', `+${xpAmount} XP`, xpAmount);
            }
            this.renderPlayerCard();
            await this.renderJourneyPath();
            await this.renderTrophyCase();
            this.renderJourneyTeaser();
        },

        refreshProgressTabDot() {
            this.updateProgressTabDot(Boolean(this.questsReady) || (this.journeyPendingCount || 0) > 0);
        },

        updateProgressTabDot(hasNews) {
            const dot = document.getElementById('home-tab-progress-dot');
            if (dot) dot.hidden = !hasNews;
        },

        // Small card on the home pane pointing to the next step of the path.
        renderJourneyTeaser() {
            const teaser = document.getElementById('journey-teaser');
            const ctx = this.progressContext;
            if (!teaser || !ctx) return;
            const total = ctx.snapshot.totalWorkouts || 0;
            const position = this.getJourneyPosition(total);
            const chapter = this.getJourneyChapter(position.chapterIndex);
            const pending = this.journeyPendingCount || 0;
            const pct = Math.round((position.stepInChapter / chapter.size) * 100);
            teaser.hidden = false;
            teaser.innerHTML = `
                <span class="journey-teaser-node ${pending ? 'is-chest' : ''}" aria-hidden="true">${pending ? '🎁' : chapter.emoji}</span>
                <span class="journey-teaser-main">
                    <small>Chapitre ${chapter.number} · ${this.escapeHtml(chapter.title)}</small>
                    <strong>${pending ? `${pending} coffre${pending > 1 ? 's' : ''} à ouvrir !` : `Étape ${position.stepInChapter + 1} sur ${chapter.size}`}</strong>
                    <span class="journey-teaser-track"><span style="width: ${pct}%"></span></span>
                </span>
                <svg class="journey-teaser-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            `;
        },

        // ---------- Levels: titles keep coming far beyond level 40 ----------
        getPlayerLevel(xp = 0) {
            const player = baseGetPlayerLevel.call(this, xp);
            const titles = [
                { min: 1, name: 'Recrue', emoji: '🐣' },
                { min: 3, name: 'Apprenti', emoji: '🌱' },
                { min: 5, name: 'Costaud', emoji: '💪' },
                { min: 8, name: 'Bâtisseur', emoji: '🧱' },
                { min: 12, name: 'Colosse', emoji: '🦍' },
                { min: 16, name: 'Titan', emoji: '🗿' },
                { min: 20, name: 'Hercule', emoji: '🦁' },
                { min: 25, name: 'Olympien', emoji: '⚡' },
                { min: 30, name: 'Légende', emoji: '👑' },
                { min: 40, name: 'Mythe vivant', emoji: '🐉' },
                { min: 50, name: 'Demi-dieu', emoji: '🔱' },
                { min: 65, name: 'Immortel', emoji: '☄️' },
                { min: 80, name: 'Divinité', emoji: '🌞' },
                { min: 100, name: 'Panthéon', emoji: '🏛️' }
            ];
            player.title = [...titles].reverse().find(item => player.level >= item.min);
            player.nextTitle = titles.find(item => item.min > player.level) || null;
            return player;
        },

        // ---------- Weekly quests: + cardio and variety ----------
        buildWeeklyQuests() {
            const quests = baseBuildWeeklyQuests.call(this);
            const metrics = this.gameMetrics;
            if (metrics) {
                const target = metrics.cardioMinutes > 0 ? 45 : 20;
                const current = Math.round(metrics.cardioMinutesWeek || 0);
                quests.push({
                    id: 'cardio',
                    icon: '❤️',
                    title: target === 20 ? 'Teste 20 min de cardio' : 'Fais 45 min de cardio',
                    current,
                    target,
                    unit: 'min',
                    xp: 80,
                    done: current >= target,
                    progress: Math.min(1, current / target)
                });
            }
            return quests;
        },

        async renderQuestBoard() {
            await baseRenderQuestBoard.call(this);
            const quests = this.buildWeeklyQuests();
            const claims = await this.getQuestClaims();
            this.questsReady = quests.some(quest => quest.done && !claims.ids.includes(quest.id));
            this.refreshProgressTabDot();
        },

        // ---------- Trophies: ~120 milestones in 6 families ----------
        getTrophyDefinitions() {
            const family = (metric, category, unit, rows) => rows.map(([target, icon, name, desc]) => ({
                id: `${metric}-${target}`, metric, category, target, icon, name, desc, unit
            }));
            return [
                ...family('workouts', 'sessions', 'séances', [
                    [1, '🎬', 'Premier pas', 'Termine ta première séance'],
                    [5, '🖐️', 'Cinq sur cinq', '5 séances terminées'],
                    [10, '🔟', 'Habitué', '10 séances terminées'],
                    [25, '🏅', 'Assidu', '25 séances terminées'],
                    [50, '🎖️', 'Vétéran', '50 séances terminées'],
                    [100, '💯', 'Centurion', '100 séances terminées'],
                    [150, '🦾', 'Bionique', '150 séances terminées'],
                    [200, '🏟️', 'Gladiateur', '200 séances terminées'],
                    [250, '🏛️', 'Pilier de la salle', '250 séances terminées'],
                    [365, '📆', 'Une par jour', '365 séances terminées'],
                    [500, '🌋', 'Volcan', '500 séances terminées'],
                    [750, '🪐', 'Orbite', '750 séances terminées'],
                    [1000, '🏰', 'Mille séances', '1 000 séances terminées']
                ]),
                ...family('hours', 'sessions', 'h', [
                    [10, '⏱️', '10 heures', '10 h d’entraînement'],
                    [25, '⌛', 'Un jour entier', '25 h d’entraînement'],
                    [50, '🕰️', '50 heures', '50 h d’entraînement'],
                    [100, '⏳', 'Centenaire', '100 h d’entraînement'],
                    [250, '🧭', 'Expédition', '250 h d’entraînement'],
                    [500, '🗺️', 'Odyssée', '500 h d’entraînement']
                ]),
                ...family('chapters', 'sessions', 'chap.', [
                    [1, '🧱', 'Fondations posées', 'Termine le chapitre 1 du parcours'],
                    [3, '🎯', 'En chemin', 'Termine 3 chapitres'],
                    [5, '📈', 'Mi-parcours', 'Termine 5 chapitres'],
                    [10, '🏔️', 'Au sommet', 'Termine 10 chapitres'],
                    [15, '👑', 'Légende du parcours', 'Termine 15 chapitres'],
                    [25, '🌌', 'Au-delà', 'Termine 25 chapitres']
                ]),
                ...family('tonnage', 'strength', 't', [
                    [10, '🧱', '10 tonnes', '10 tonnes soulevées au total'],
                    [50, '🚌', '50 tonnes', '50 tonnes soulevées au total'],
                    [150, '🐋', 'Baleine bleue', '150 tonnes soulevées au total'],
                    [300, '🚢', 'Cargo', '300 tonnes soulevées au total'],
                    [500, '🏗️', 'Grue humaine', '500 tonnes soulevées au total'],
                    [1000, '🗼', 'Mille tonnes', '1 000 tonnes soulevées au total'],
                    [2000, '🌉', 'Pont suspendu', '2 000 tonnes soulevées au total'],
                    [5000, '⛰️', 'Montagne', '5 000 tonnes soulevées au total']
                ]),
                ...family('heavy', 'strength', 'kg', [
                    [40, '🪶', 'Club 40 kg', 'Une série à 40 kg ou plus'],
                    [60, '🏋️', 'Club 60 kg', 'Une série à 60 kg ou plus'],
                    [80, '🥉', 'Club 80 kg', 'Une série à 80 kg ou plus'],
                    [100, '💥', 'Club 100 kg', 'Une série à 100 kg ou plus'],
                    [120, '🥈', 'Club 120 kg', 'Une série à 120 kg ou plus'],
                    [140, '🦍', 'Club 140 kg', 'Une série à 140 kg ou plus'],
                    [160, '🥇', 'Club 160 kg', 'Une série à 160 kg ou plus'],
                    [180, '🐻', 'Club 180 kg', 'Une série à 180 kg ou plus'],
                    [200, '🦏', 'Club 200 kg', 'Une série à 200 kg ou plus'],
                    [250, '🐘', 'Club 250 kg', 'Une série à 250 kg ou plus']
                ]),
                ...family('records', 'strength', 'records', [
                    [1, '⚡', 'Premier record', 'Bats ton premier record'],
                    [10, '🔥', 'Chasseur', '10 records battus'],
                    [25, '🎯', 'Tireur d’élite', '25 records battus'],
                    [50, '🏆', 'Collectionneur', '50 records battus'],
                    [100, '💎', 'Centurie de records', '100 records battus'],
                    [250, '🌠', 'Pluie d’étoiles', '250 records battus'],
                    [500, '🧨', 'Inarrêtable', '500 records battus']
                ]),
                ...family('sets', 'strength', 'séries', [
                    [100, '✌️', '100 séries', '100 séries validées'],
                    [500, '🔁', '500 séries', '500 séries validées'],
                    [1000, '🎰', '1 000 séries', '1 000 séries validées'],
                    [2000, '♾️', '2 000 séries', '2 000 séries validées'],
                    [5000, '🌀', '5 000 séries', '5 000 séries validées'],
                    [10000, '🌪️', '10 000 séries', '10 000 séries validées']
                ]),
                ...family('reps', 'strength', 'reps', [
                    [1000, '🔢', '1 000 reps', '1 000 répétitions au total'],
                    [10000, '🧮', '10 000 reps', '10 000 répétitions au total'],
                    [50000, '📟', '50 000 reps', '50 000 répétitions au total'],
                    [100000, '🛰️', '100 000 reps', '100 000 répétitions au total']
                ]),
                ...family('cardioMinutes', 'cardio', 'min', [
                    [30, '👟', 'Premiers pas cardio', '30 min de cardio au total'],
                    [150, '❤️', 'Cœur en forme', '150 min de cardio au total'],
                    [600, '🫀', '10 heures de cardio', '600 min de cardio au total'],
                    [1500, '🚴', 'Rouleur', '25 h de cardio au total'],
                    [3000, '🏃', 'Endurant', '50 h de cardio au total'],
                    [6000, '🦌', 'Infatigable', '100 h de cardio au total']
                ]),
                ...family('cardioKm', 'cardio', 'km', [
                    [5, '🥾', '5 km', '5 km parcourus en cardio'],
                    [21, '🎽', 'Semi-marathon', '21 km parcourus en cardio'],
                    [42, '🏅', 'Marathon', '42 km parcourus en cardio'],
                    [100, '🛣️', '100 km', '100 km parcourus en cardio'],
                    [250, '🚗', 'Paris → Lille', '250 km parcourus en cardio'],
                    [500, '🗺️', 'Paris → Lyon', '500 km parcourus en cardio'],
                    [1000, '🌍', 'Mille bornes', '1 000 km parcourus en cardio']
                ]),
                ...family('cardioWorkouts', 'cardio', 'séances', [
                    [1, '💓', 'Cardio activé', 'Une séance avec du cardio'],
                    [10, '🔋', 'Batterie pleine', '10 séances avec du cardio'],
                    [50, '⚙️', 'Moteur diesel', '50 séances avec du cardio'],
                    [100, '🚀', 'Réacteur', '100 séances avec du cardio']
                ]),
                ...family('streak', 'regularity', 'sem.', [
                    [2, '📅', 'Lancé', '2 semaines validées d’affilée'],
                    [4, '🗓️', 'Un mois carré', '4 semaines validées d’affilée'],
                    [8, '♨️', 'Inarrêtable', '8 semaines validées d’affilée'],
                    [12, '🛡️', 'Trimestre parfait', '12 semaines validées d’affilée'],
                    [26, '☀️', 'Semestre de feu', '26 semaines validées d’affilée'],
                    [39, '🍂', 'Trois saisons', '39 semaines validées d’affilée'],
                    [52, '👑', 'Une année', '52 semaines validées d’affilée'],
                    [78, '🌈', 'Un an et demi', '78 semaines validées d’affilée'],
                    [104, '💠', 'Deux ans', '104 semaines validées d’affilée']
                ]),
                ...family('bestWeek', 'regularity', 'séances', [
                    [4, '4️⃣', 'Semaine chargée', '4 séances dans la même semaine'],
                    [5, '5️⃣', 'Cinq jours', '5 séances dans la même semaine'],
                    [6, '6️⃣', 'Six jours', '6 séances dans la même semaine']
                ]),
                ...family('activeMonths', 'regularity', 'mois', [
                    [3, '🌱', 'Trois mois', 'Actif sur 3 mois différents'],
                    [6, '🌿', 'Six mois', 'Actif sur 6 mois différents'],
                    [12, '🌳', 'Une année d’activité', 'Actif sur 12 mois différents'],
                    [24, '🌲', 'Deux ans d’activité', 'Actif sur 24 mois différents']
                ]),
                ...family('earlyWorkouts', 'regularity', 'séances', [
                    [1, '🌅', 'Lève-tôt', 'Une séance commencée avant 8 h'],
                    [10, '🐓', 'Coq de la salle', '10 séances avant 8 h'],
                    [50, '☀️', 'Aube éternelle', '50 séances avant 8 h']
                ]),
                ...family('lateWorkouts', 'regularity', 'séances', [
                    [1, '🌙', 'Oiseau de nuit', 'Une séance commencée après 20 h'],
                    [10, '🦉', 'Hibou', '10 séances après 20 h'],
                    [50, '🌌', 'Nocturne', '50 séances après 20 h']
                ]),
                ...family('weekendWorkouts', 'regularity', 'séances', [
                    [10, '🛋️', 'Week-end actif', '10 séances le week-end'],
                    [50, '🎉', 'Guerrier du week-end', '50 séances le week-end']
                ]),
                ...family('comebacks', 'regularity', 'retours', [
                    [1, '🔄', 'Le retour', 'Reviens après 2 semaines sans séance'],
                    [5, '🦅', 'Phénix', '5 retours après une pause']
                ]),
                ...family('exercises', 'explore', 'exos', [
                    [5, '🧩', 'Curieux', '5 exercices différents'],
                    [10, '🔍', 'Explorateur', '10 exercices différents'],
                    [25, '🧪', 'Laborantin', '25 exercices différents'],
                    [50, '📚', 'Encyclopédie', '50 exercices différents'],
                    [75, '🧠', 'Érudit de la fonte', '75 exercices différents']
                ]),
                ...family('muscles', 'explore', 'muscles', [
                    [6, '🗺️', 'Cartographe', '6 groupes musculaires travaillés'],
                    [10, '🧬', 'Anatomiste', '10 groupes musculaires travaillés'],
                    [14, '🫀', 'Corps complet', 'Les 14 groupes musculaires travaillés']
                ]),
                ...family('level', 'explore', 'niv.', [
                    [5, '⭐', 'Niveau 5', 'Atteins le niveau 5'],
                    [10, '🌟', 'Niveau 10', 'Atteins le niveau 10'],
                    [20, '💫', 'Niveau 20', 'Atteins le niveau 20'],
                    [30, '✨', 'Niveau 30', 'Atteins le niveau 30'],
                    [40, '🌠', 'Niveau 40', 'Atteins le niveau 40'],
                    [50, '🔱', 'Niveau 50', 'Atteins le niveau 50'],
                    [75, '☄️', 'Niveau 75', 'Atteins le niveau 75'],
                    [100, '🏛️', 'Niveau 100', 'Atteins le niveau 100']
                ])
            ];
        },

        getTrophyCategories() {
            return [
                { id: 'all', label: 'Tout' },
                { id: 'sessions', label: 'Séances' },
                { id: 'strength', label: 'Force' },
                { id: 'cardio', label: 'Cardio' },
                { id: 'regularity', label: 'Régularité' },
                { id: 'explore', label: 'Exploration' }
            ];
        },

        buildTrophies() {
            const { snapshot, player, bestStreak } = this.progressContext;
            const game = this.gameMetrics || {};
            const metrics = {
                workouts: snapshot.totalWorkouts,
                hours: (game.totalMinutes || 0) / 60,
                chapters: this.getJourneyPosition(snapshot.totalWorkouts).chaptersDone,
                tonnage: snapshot.totalLoadedVolume / 1000,
                records: snapshot.prCountTotal || 0,
                streak: bestStreak,
                heavy: snapshot.heaviestSet?.weight || 0,
                sets: snapshot.totalSetsAll,
                reps: game.totalReps || 0,
                level: player.level,
                cardioMinutes: game.cardioMinutes || 0,
                cardioKm: game.cardioDistanceKm || 0,
                cardioWorkouts: game.cardioWorkouts || 0,
                bestWeek: game.bestWeekSessions || 0,
                activeMonths: game.activeMonths || 0,
                earlyWorkouts: game.earlyWorkouts || 0,
                lateWorkouts: game.lateWorkouts || 0,
                weekendWorkouts: game.weekendWorkouts || 0,
                comebacks: game.comebacks || 0,
                exercises: game.exercises || 0,
                muscles: game.muscles || 0
            };
            const definitions = this.getTrophyDefinitions();
            const tierIndex = new Map();
            return definitions.map(trophy => {
                const current = metrics[trophy.metric] || 0;
                const rank = tierIndex.get(trophy.metric) || 0;
                tierIndex.set(trophy.metric, rank + 1);
                const familySize = definitions.filter(item => item.metric === trophy.metric).length;
                const ratio = familySize > 1 ? rank / (familySize - 1) : 0;
                const tier = ratio < 0.25 ? 'bronze' : ratio < 0.5 ? 'silver' : ratio < 0.8 ? 'gold' : 'diamond';
                return {
                    ...trophy,
                    tier,
                    current,
                    unlocked: current >= trophy.target,
                    progress: Math.min(1, current / trophy.target)
                };
            });
        },

        async renderTrophyCase() {
            const container = document.getElementById('trophy-case');
            if (!container || !this.progressContext) return;
            const trophies = this.buildTrophies();
            const unlocked = trophies.filter(trophy => trophy.unlocked);

            // New unlocks are celebrated once; the very first render only records them.
            const seen = await db.getSetting('trophiesSeen');
            const fresh = Array.isArray(seen) ? unlocked.filter(trophy => !seen.includes(trophy.id)) : [];
            if (!Array.isArray(seen) || fresh.length) {
                await db.setSetting('trophiesSeen', unlocked.map(trophy => trophy.id));
            }
            // Trophies added by an update are not "new" for someone who already had them.
            const migrated = await db.getSetting('trophiesSeenV6');
            if (!migrated) {
                await db.setSetting('trophiesSeenV6', true);
            } else if (fresh.length) {
                const best = fresh[fresh.length - 1];
                setTimeout(() => {
                    gamification.triggerConfetti('heavy');
                    gamification.showAchievement(best.icon, 'Trophée débloqué !', fresh.length > 1 ? `${best.name} + ${fresh.length - 1} autre${fresh.length > 2 ? 's' : ''}` : best.name);
                }, 900);
            }

            const category = this.trophyCategory || 'all';
            const inCategory = trophies.filter(trophy => category === 'all' || trophy.category === category);
            const nextUp = trophies
                .filter(trophy => !trophy.unlocked)
                .sort((a, b) => b.progress - a.progress)
                .slice(0, 3);
            const expanded = Boolean(this.trophyCaseExpanded);
            const ordered = [
                ...inCategory.filter(trophy => trophy.unlocked).reverse(),
                ...inCategory.filter(trophy => !trophy.unlocked).sort((a, b) => b.progress - a.progress)
            ];
            const limit = 12;
            const visible = expanded ? ordered : ordered.slice(0, limit);
            const formatCurrent = trophy => {
                const value = trophy.current;
                if (trophy.metric === 'tonnage' || trophy.metric === 'cardioKm' || trophy.metric === 'hours') {
                    return String(Math.round(value * 10) / 10).replace('.', ',');
                }
                return Math.floor(value).toLocaleString('fr-FR');
            };
            const categories = this.getTrophyCategories().map(item => ({
                ...item,
                count: trophies.filter(trophy => item.id === 'all' || trophy.category === item.id).filter(trophy => trophy.unlocked).length,
                total: trophies.filter(trophy => item.id === 'all' || trophy.category === item.id).length
            }));

            container.innerHTML = `
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Salle des trophées</span>
                        <h4>${unlocked.length}/${trophies.length} débloqués</h4>
                    </div>
                    <span class="pz-chip is-gold">🏆 ${unlocked.length}</span>
                </div>
                ${nextUp.length ? `
                    <div class="trophy-next-list">
                        ${nextUp.map(trophy => `
                            <div class="trophy-next">
                                <span class="trophy-next-icon tier-${trophy.tier}" aria-hidden="true">${trophy.icon}</span>
                                <div class="trophy-next-main">
                                    <span><strong>${this.escapeHtml(trophy.name)}</strong></span>
                                    <div class="quest-track"><span style="width: ${Math.round(trophy.progress * 100)}%"></span></div>
                                    <small>${formatCurrent(trophy)} / ${trophy.target.toLocaleString('fr-FR')} ${this.escapeHtml(trophy.unit)} · ${this.escapeHtml(trophy.desc)}</small>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="trophy-filters" role="tablist" aria-label="Familles de trophées">
                    ${categories.map(item => `
                        <button type="button" class="trophy-filter ${item.id === category ? 'active' : ''}" data-trophy-cat="${item.id}" role="tab" aria-selected="${item.id === category}">
                            ${this.escapeHtml(item.label)} <small>${item.count}/${item.total}</small>
                        </button>
                    `).join('')}
                </div>
                <div class="trophy-grid">
                    ${visible.map(trophy => `
                        <button type="button" class="trophy tier-${trophy.tier} ${trophy.unlocked ? 'is-unlocked' : ''}" data-trophy-id="${trophy.id}" aria-label="${this.escapeHtml(`${trophy.name} : ${trophy.desc}`)}">
                            <span class="trophy-medal" aria-hidden="true">${trophy.icon}</span>
                            <span class="trophy-name">${this.escapeHtml(trophy.name)}</span>
                            ${trophy.unlocked ? '' : `<span class="trophy-ring" style="--p: ${Math.round(trophy.progress * 100)}"></span>`}
                        </button>
                    `).join('')}
                </div>
                ${ordered.length > limit ? `
                    <button type="button" class="pz-more" data-trophy-toggle>${expanded ? 'Réduire' : `Voir les ${ordered.length} trophées`}</button>
                ` : ''}
            `;

            if (!container.dataset.catBound) {
                container.dataset.catBound = 'true';
                container.addEventListener('click', async event => {
                    const filter = event.target.closest('[data-trophy-cat]');
                    if (!filter) return;
                    event.stopPropagation();
                    this.trophyCategory = filter.dataset.trophyCat;
                    this.trophyCaseExpanded = false;
                    await this.renderTrophyCase();
                });
            }
        }
    });
})();
