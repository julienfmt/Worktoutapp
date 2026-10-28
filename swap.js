// ===== Exercise swap =====
// "The machine is taken": pick why you need another exercise, choose whether
// it is just for today or for good, and get ranked alternatives that hit the
// same muscles — from your own pool first, then the whole library. A
// today-only swap is reverted on the program when the workout ends (or is
// abandoned); the sets you logged keep the real exercise name.
(() => {
    const REASONS = [
        { id: 'busy', emoji: '🚧', label: 'Machine prise' },
        { id: 'equipment', emoji: '🧰', label: 'Pas le matériel' },
        { id: 'pain', emoji: '🤕', label: 'Gêne / douleur' },
        { id: 'variety', emoji: '🔀', label: 'Envie de varier' }
    ];
    const SNAPSHOT_FIELDS = [
        'name', 'activeExercise', 'type', 'muscleGroup', 'trackingMode', 'trackingModeSource', 'durationUnit',
        'cardioMetric', 'timedLoad', 'exerciseStableId', 'exerciseFamilyId', 'instructions', 'pool',
        'sets', 'repsMin', 'repsMax', 'rest', 'rir', 'progressionMode', 'loadingProfile', 'incrementKg',
        'minIncrementKg', 'maxSelectableLoadKg', 'machineStepKg', 'bodyweightMode', 'bodyweightProfile',
        'progressionState', 'capDetection', 'unilateralMode'
    ];

    const baseConfirmFinishSession = App.prototype.confirmFinishSession;
    const baseConfirmQuitSession = App.prototype.confirmQuitSession;
    const baseDiscardSession = App.prototype.discardSession;
    const baseInit = App.prototype.init;
    const baseOpenExercise = App.prototype.openExercise;
    const baseShowStimulusScoreAnimation = App.prototype.showStimulusScoreAnimation;
    const baseShowCoachingAdvice = App.prototype.showCoachingAdvice;

    // Load transfer between equipment families, used only to suggest a
    // careful first set on an exercise never done before (then × 0.9).
    const LOAD_TRANSFER = {
        barbell: { barbell: 0.95, machine: 0.9, dumbbell: 0.4, cable: 0.6 },
        machine: { barbell: 1, machine: 0.9, dumbbell: 0.45, cable: 0.75 },
        dumbbell: { barbell: 2.1, machine: 2, dumbbell: 0.95, cable: 1.3 },
        cable: { barbell: 1.4, machine: 1.25, dumbbell: 0.7, cable: 0.95 }
    };

    const clone = value => (value == null ? value : JSON.parse(JSON.stringify(value)));

    Object.assign(App.prototype, {
        async init() {
            await baseInit.call(this);
            // A today-only swap left behind by a crash or a force-quit.
            if (!this.currentWorkout) await this.restoreTemporarySwaps();
        },

        async confirmFinishSession() {
            const hadWorkout = Boolean(this.currentWorkout);
            await baseConfirmFinishSession.call(this);
            if (hadWorkout && !this.currentWorkout) await this.restoreTemporarySwaps({ refresh: true });
        },

        // Runs once the workout is saved and cleared, before the recap waits
        // for the player: the program is back to normal right away.
        async showStimulusScoreAnimation(...args) {
            if (!this.currentWorkout) await this.restoreTemporarySwaps();
            return baseShowStimulusScoreAnimation.apply(this, args);
        },

        async confirmQuitSession() {
            await this.restoreTemporarySwaps();
            await baseConfirmQuitSession.call(this);
        },

        async discardSession() {
            await baseDiscardSession.call(this);
            await this.restoreTemporarySwaps({ refresh: true });
        },

        async openExercise(slotId) {
            this.swapStartEstimate = null;
            try {
                const slot = await db.get('slots', slotId);
                const estimate = slot ? await this.estimateSwapStartLoad(slot) : null;
                if (estimate) this.swapStartEstimate = { slotId, ...estimate };
            } catch (error) {
                this.swapStartEstimate = null;
            }
            await baseOpenExercise.call(this, slotId);
            const swapButton = document.getElementById('btn-exercise-swap');
            if (swapButton) swapButton.hidden = !this.currentSlot || this.isReviewMode;
        },

        async showCoachingAdvice(...args) {
            await baseShowCoachingAdvice.apply(this, args);
            const estimate = this.swapStartEstimate;
            const advice = this.currentCoachingAdvice;
            if (!estimate || estimate.slotId !== this.currentSlot?.id || !advice) return;
            if (Number(advice.suggestedWeight) > 0) return;
            const weightEl = document.getElementById('coaching-suggested-weight');
            const referenceEl = document.getElementById('coaching-suggested-weight-reference');
            if (weightEl) weightEl.textContent = `~${this.formatOneDecimal(estimate.weight)} kg`;
            if (referenceEl) {
                referenceEl.textContent = `Départ estimé depuis ${estimate.from} · ajuste dès la 1re série`;
                referenceEl.style.display = 'block';
            }
            const slotData = this.currentWorkout?.slots?.[this.currentSlot.id];
            if (!(slotData?.sets || []).some(set => set?.completed)) {
                this.nextSetSuggestedWeight = estimate.weight;
            }
        },

        // First set on a substitute never done before: start from what the
        // replaced exercise was moved with, converted between equipment and
        // trimmed by 10 % so the first set calibrates rather than fails.
        async estimateSwapStartLoad(slot) {
            if (!this.currentWorkout || this.isTimedSlot(slot)) return null;
            const active = slot.activeExercise || slot.name || '';
            const changes = this.currentWorkout.slots?.[slot.id]?.exerciseChanges || [];
            const lastChange = [...changes].reverse().find(change => this.normalizeExerciseText(change.to) === this.normalizeExerciseText(active));
            const from = lastChange?.from || slot.temporarySwap?.snapshot?.activeExercise;
            if (!from || this.normalizeExerciseText(from) === this.normalizeExerciseText(active)) return null;
            const ownHistory = await this.getSetHistoryForExercise(this.getBaseExerciseHistoryName(active));
            if ((ownHistory || []).some(set => Number(set.weight) > 0)) return null;
            const fromHistory = (await this.getSetHistoryForExercise(this.getBaseExerciseHistoryName(from)) || [])
                .filter(set => Number(set.weight) > 0 && Number(set.reps) > 0 && !set.isDeload)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            if (!fromHistory.length) return null;
            const lastDate = fromHistory[0].date;
            const reference = Math.max(...fromHistory.filter(set => set.date === lastDate).map(set => Number(set.weight)));
            const fromEquipment = this.getSemanticExerciseProfile(from, null).equipmentCategory;
            const toEquipment = this.getSemanticExerciseProfile(active, slot).equipmentCategory;
            const ratio = LOAD_TRANSFER[fromEquipment]?.[toEquipment];
            const equivalence = this.getExerciseSubstitutionEquivalence(from, active, { fallbackSlot: slot });
            if (!ratio || equivalence.percent < 60) return null;
            const step = toEquipment === 'dumbbell' ? 1 : 2.5;
            const weight = Math.max(step, Math.round((reference * ratio * 0.9) / step) * step);
            return { weight, from, reference };
        },

        async restoreTemporarySwaps({ refresh = false } = {}) {
            const slots = await db.getAll('slots');
            const swapped = slots.filter(slot => slot?.temporarySwap?.snapshot);
            for (const slot of swapped) {
                const { snapshot } = slot.temporarySwap;
                SNAPSHOT_FIELDS.forEach(field => {
                    if (snapshot[field] === undefined) delete slot[field];
                    else slot[field] = clone(snapshot[field]);
                });
                delete slot.temporarySwap;
                await db.put('slots', slot);
            }
            if (swapped.length && refresh && this.currentScreen === 'home') {
                await this.renderHome();
            }
            return swapped.length;
        },

        takeSlotSnapshot(slot) {
            const snapshot = {};
            SNAPSHOT_FIELDS.forEach(field => {
                if (slot[field] !== undefined) snapshot[field] = clone(slot[field]);
            });
            return snapshot;
        },

        // Alternatives ranked for the chosen reason: same tracking mode, a
        // real overlap of target muscles, and a nudge on the equipment.
        buildSwapCandidates(slot, reason = 'busy') {
            const activeName = slot.activeExercise || slot.name || '';
            const originalName = slot.temporarySwap?.snapshot?.activeExercise || null;
            const activeProfile = this.getSemanticExerciseProfile(slot, slot);
            const activeTracking = this.getTrackingMode(slot);
            const activeNorm = this.normalizeExerciseText(activeName);
            const poolNames = new Set([...(slot.pool || []), ...(slot.temporarySwap?.snapshot?.pool || [])]
                .map(name => this.normalizeExerciseText(name)));
            const library = this.getExerciseLibraryIndex().library || [];
            const seen = new Set();
            const candidates = [];

            const consider = (name, source) => {
                const norm = this.normalizeExerciseText(name);
                if (!norm || norm === activeNorm || seen.has(norm)) return;
                seen.add(norm);
                const tracking = this.getTrackingMode(name);
                if (tracking !== activeTracking) return;
                const equivalence = this.getExerciseSubstitutionEquivalence(slot, name, { fallbackSlot: slot });
                const profile = this.getSemanticExerciseProfile(name, null);
                const sharesMuscle = profile.primaryMuscles.some(muscle => activeProfile.primaryMuscles.includes(muscle));
                if (!sharesMuscle && source !== 'pool') return;
                let score = equivalence.percent;
                const sameEquipment = profile.equipmentCategory === activeProfile.equipmentCategory;
                if (reason === 'busy') score += sameEquipment ? -8 : 4;
                if (reason === 'equipment') {
                    if (sameEquipment) score -= 30;
                    if (['dumbbell', 'bodyweight', 'cable'].includes(profile.equipmentCategory)) score += 10;
                }
                if (reason === 'pain') {
                    if (['machine', 'cable'].includes(profile.equipmentCategory)) score += 10;
                    if (profile.equipmentCategory === 'barbell') score -= 12;
                    if (profile.type === 'isolation') score += 4;
                }
                if (reason === 'variety') {
                    if (equivalence.percent >= 95) score -= 10;
                    if (!sameEquipment) score += 6;
                }
                if (source === 'pool') score += 6;
                if (originalName && norm === this.normalizeExerciseText(originalName)) score += 1000;
                candidates.push({
                    name,
                    source: poolNames.has(norm) ? 'pool' : source,
                    score,
                    equivalence,
                    equipment: profile.equipmentCategory,
                    isOriginal: Boolean(originalName && norm === this.normalizeExerciseText(originalName))
                });
            };

            if (originalName) consider(originalName, 'pool');
            (slot.pool || []).forEach(name => consider(name, 'pool'));
            (slot.temporarySwap?.snapshot?.pool || []).forEach(name => consider(name, 'pool'));
            library.forEach(entry => consider(entry.name, 'library'));
            return candidates.sort((a, b) => b.score - a.score);
        },

        getEquipmentLabel(category) {
            return {
                barbell: 'Barre', dumbbell: 'Haltères', machine: 'Machine', cable: 'Poulie',
                bodyweight: 'Poids du corps', band: 'Élastique', cardio: 'Cardio', other: 'Autre'
            }[category] || 'Autre';
        },

        async showPoolSheet(slotId) {
            const slot = await db.get('slots', slotId);
            if (!slot) return;
            this.poolSlotId = slotId;
            const inWorkout = Boolean(this.currentWorkout) && slot.sessionId === this.currentWorkout.sessionId;
            this.swapState = {
                slotId,
                reason: this.swapState?.slotId === slotId ? this.swapState.reason : 'busy',
                scope: inWorkout ? (this.swapState?.slotId === slotId ? this.swapState.scope : 'today') : 'program',
                inWorkout,
                query: ''
            };
            this.renderSwapSheet(slot);
            document.getElementById('sheet-pool').classList.add('active');
        },

        renderSwapSheet(slot) {
            const state = this.swapState;
            const header = document.getElementById('pool-header');
            const title = document.getElementById('pool-title');
            const subtitle = document.getElementById('pool-subtitle');
            const list = document.getElementById('pool-list');
            if (!header || !list) return;
            // Title first, then the reason / scope controls, then the list.
            if (subtitle && header.previousElementSibling !== subtitle) subtitle.after(header);
            const activeName = slot.activeExercise || slot.name || 'Exercice';
            const original = slot.temporarySwap?.snapshot?.activeExercise;
            if (title) title.textContent = 'Changer d’exercice';
            if (subtitle) {
                subtitle.textContent = original
                    ? `${activeName} remplace ${original} aujourd’hui`
                    : `Remplacer ${activeName}`;
            }

            header.innerHTML = `
                <div class="swap-reasons" role="radiogroup" aria-label="Pourquoi changer ?">
                    ${REASONS.map(reason => `
                        <button type="button" class="swap-reason ${state.reason === reason.id ? 'active' : ''}" data-swap-reason="${reason.id}" role="radio" aria-checked="${state.reason === reason.id}">
                            <span aria-hidden="true">${reason.emoji}</span>${reason.label}
                        </button>
                    `).join('')}
                </div>
                ${state.inWorkout ? `
                    <div class="swap-scope" role="radiogroup" aria-label="Durée du changement">
                        <button type="button" class="swap-scope-btn ${state.scope === 'today' ? 'active' : ''}" data-swap-scope="today" role="radio" aria-checked="${state.scope === 'today'}">
                            <strong>Juste aujourd’hui</strong><small>Ton programme ne bouge pas</small>
                        </button>
                        <button type="button" class="swap-scope-btn ${state.scope === 'program' ? 'active' : ''}" data-swap-scope="program" role="radio" aria-checked="${state.scope === 'program'}">
                            <strong>Pour de bon</strong><small>Remplace dans le programme</small>
                        </button>
                    </div>
                ` : ''}
                <label class="swap-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input type="search" id="swap-search-input" placeholder="Chercher un autre exercice" value="${this.escapeHtml(state.query)}" autocomplete="off">
                </label>
            `;
            this.renderSwapList(slot);

            if (!header.dataset.swapBound) {
                header.dataset.swapBound = 'true';
                header.addEventListener('click', async event => {
                    const reason = event.target.closest('[data-swap-reason]');
                    const scope = event.target.closest('[data-swap-scope]');
                    if (!reason && !scope) return;
                    if (reason) this.swapState.reason = reason.dataset.swapReason;
                    if (scope) this.swapState.scope = scope.dataset.swapScope;
                    this.hapticTap?.(6);
                    const current = await db.get('slots', this.swapState.slotId);
                    if (current) this.renderSwapSheet(current);
                });
                header.addEventListener('input', async event => {
                    if (event.target.id !== 'swap-search-input') return;
                    this.swapState.query = event.target.value;
                    const current = await db.get('slots', this.swapState.slotId);
                    if (current) this.renderSwapList(current);
                });
                list.addEventListener('click', async event => {
                    const option = event.target.closest('[data-swap-to]');
                    if (!option || !this.swapState) return;
                    option.disabled = true;
                    await this.applySwap(this.swapState.slotId, option.dataset.swapTo, this.swapState.scope);
                });
            }
        },

        renderSwapList(slot) {
            const list = document.getElementById('pool-list');
            if (!list) return;
            const state = this.swapState;
            const query = this.normalizeExerciseText(state.query || '');
            let candidates = this.buildSwapCandidates(slot, state.reason);
            if (query) {
                const library = this.getExerciseLibraryIndex().library || [];
                const matches = library
                    .filter(entry => this.getExerciseSearchBlob(entry).includes(query))
                    .map(entry => entry.name);
                const known = new Set(candidates.map(item => this.normalizeExerciseText(item.name)));
                candidates = candidates.filter(item => this.normalizeExerciseText(item.name).includes(query) || this.getExerciseSearchBlob(this.findExerciseLibraryEntry(item.name) || { name: item.name }).includes(query));
                matches.forEach(name => {
                    if (known.has(this.normalizeExerciseText(name)) || this.normalizeExerciseText(name) === this.normalizeExerciseText(slot.activeExercise || slot.name)) return;
                    candidates.push({
                        name,
                        source: 'search',
                        score: 0,
                        equivalence: this.getExerciseSubstitutionEquivalence(slot, name, { fallbackSlot: slot }),
                        equipment: this.getSemanticExerciseProfile(name, null).equipmentCategory
                    });
                });
            }
            const top = query ? candidates.slice(0, 20) : candidates.slice(0, 8);
            const reasonHint = {
                busy: 'Mêmes muscles, de préférence sur un autre poste.',
                equipment: 'Des options avec un autre matériel (haltères, poulie, poids du corps).',
                pain: 'Des options plus guidées et douces pour les articulations. Si ça fait mal, arrête.',
                variety: 'Même travail, une autre sensation.'
            }[state.reason];

            list.innerHTML = `
                <p class="swap-hint">${this.escapeHtml(query ? `${top.length} résultat${top.length > 1 ? 's' : ''}` : reasonHint)}</p>
                ${top.length ? top.map(item => {
                    const level = item.equivalence.percent >= 85 ? 'high' : item.equivalence.percent >= 70 ? 'good' : item.equivalence.percent >= 50 ? 'partial' : 'low';
                    return `
                        <button type="button" class="swap-option ${item.isOriginal ? 'is-original' : ''}" data-swap-to="${this.escapeHtml(item.name)}">
                            <span class="swap-option-main">
                                <strong>${this.escapeHtml(item.name)}</strong>
                                <span class="swap-option-meta">
                                    ${item.isOriginal ? '<span class="swap-chip is-original">↩︎ Exercice prévu</span>' : ''}
                                    ${item.source === 'pool' && !item.isOriginal ? '<span class="swap-chip is-pool">Dans ton programme</span>' : ''}
                                    <span class="swap-chip">${this.escapeHtml(this.getEquipmentLabel(item.equipment))}</span>
                                    <span class="swap-chip level-${level}">${item.equivalence.percent}% · ${this.escapeHtml(item.equivalence.label)}</span>
                                </span>
                                <small class="swap-option-last" data-swap-last="${this.escapeHtml(item.name)}"></small>
                            </span>
                            <span class="swap-option-go" aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                            </span>
                        </button>
                    `;
                }).join('') : '<div class="pz-empty">Aucun exercice trouvé. Essaie un autre mot.</div>'}
            `;
            void this.fillSwapLastPerformances(top.map(item => item.name));
        },

        // "Last time: 40 kg × 10" under each option, so the swap is concrete.
        async fillSwapLastPerformances(names) {
            const token = Symbol('swap');
            this.swapFillToken = token;
            for (const name of names) {
                try {
                    const sets = await this.getSetHistoryForExercise(this.getBaseExerciseHistoryName(name));
                    if (this.swapFillToken !== token) return;
                    const usable = (sets || [])
                        .filter(set => Number(set.reps) > 0 && !set.isDeload)
                        .sort((a, b) => new Date(b.date) - new Date(a.date));
                    const el = [...document.querySelectorAll('[data-swap-last]')].find(item => item.dataset.swapLast === name);
                    if (!el) continue;
                    if (!usable.length) {
                        el.textContent = 'Jamais fait : le coach te fera partir léger.';
                        continue;
                    }
                    const lastDate = usable[0].date;
                    const lastSession = usable.filter(set => set.date === lastDate);
                    const best = lastSession.reduce((top, set) => (Number(set.weight) > Number(top.weight) ? set : top), lastSession[0]);
                    const days = Math.max(0, Math.round((Date.now() - new Date(lastDate)) / 86400000));
                    const when = days === 0 ? 'aujourd’hui' : days === 1 ? 'hier' : `il y a ${days} j`;
                    el.textContent = `Dernière fois (${when}) : ${this.formatSetResult(best, this.findExerciseLibraryEntry(name) || name)}`;
                    el.classList.add('has-history');
                } catch (error) {
                    // History is a hint only.
                }
            }
        },

        async applySwap(slotId, exerciseName, scope = 'program') {
            const slot = await db.get('slots', slotId);
            if (!slot || !exerciseName) return;
            const previousName = slot.activeExercise || slot.name || '';
            const original = slot.temporarySwap?.snapshot || null;
            const definition = this.findExerciseLibraryEntry(exerciseName) || this.inferCustomExerciseTemplate(exerciseName);
            const isBackToOriginal = original && this.normalizeExerciseText(original.activeExercise) === this.normalizeExerciseText(exerciseName);

            if (scope === 'today' && !original) {
                slot.temporarySwap = { snapshot: this.takeSlotSnapshot(slot), at: new Date().toISOString(), workoutStart: this.currentWorkout?.startTime || null };
            }
            if (scope === 'program' && original) {
                // Making it permanent: drop the restore point.
                delete slot.temporarySwap;
            }
            // A different kind of exercise (e.g. a hold) needs its own defaults.
            const nextTracking = definition?.trackingMode || this.getTrackingMode(exerciseName);
            if (nextTracking !== this.getTrackingMode(slot) && definition) {
                slot.sets = definition.sets ?? slot.sets;
                slot.repsMin = definition.repsMin ?? slot.repsMin;
                slot.repsMax = definition.repsMax ?? slot.repsMax;
                slot.rest = definition.rest ?? slot.rest;
            }
            // A today-only swap must not grow the program's pool.
            const poolBefore = Array.isArray(slot.pool) ? [...slot.pool] : null;

            this.hidePoolSheet();
            if (isBackToOriginal && scope === 'today') {
                // Back to the planned exercise: restore everything as it was.
                const workoutSlotData = this.currentWorkout?.slots?.[slotId];
                if (workoutSlotData && (workoutSlotData.sets || []).some(set => set?.completed)) {
                    const archived = this.captureExerciseSegment(slot, workoutSlotData);
                    if (archived) workoutSlotData.sets = [];
                }
                const snapshot = slot.temporarySwap.snapshot;
                SNAPSHOT_FIELDS.forEach(field => {
                    if (snapshot[field] === undefined) delete slot[field];
                    else slot[field] = clone(snapshot[field]);
                });
                delete slot.temporarySwap;
                const pausedChallenge = this.currentWorkout?.challenge;
                if (pausedChallenge?.status === 'paused' && String(pausedChallenge.slotId) === String(slotId)) {
                    pausedChallenge.status = 'active';
                }
                if (workoutSlotData) {
                    workoutSlotData.meta = this.buildSlotCoachMeta(slot);
                    await db.saveCurrentWorkout(this.currentWorkout);
                }
                await db.put('slots', slot);
                this.showCoachToast(`Retour à ${exerciseName}.`, 'hot', '↩️');
                if (this.currentScreen === 'session') await this.renderSlots();
                else if (this.currentScreen === 'exercise' && this.currentSlot?.id === slotId) await this.openExercise(slotId);
                return;
            }

            // The session challenge was written for the planned exercise:
            // put it on hold, it comes back if the player returns to it.
            const challenge = this.currentWorkout?.challenge;
            let challengePaused = false;
            if (challenge?.status === 'active' && String(challenge.slotId) === String(slotId)) {
                challenge.status = 'paused';
                challengePaused = true;
                await db.saveCurrentWorkout(this.currentWorkout);
            }

            await this.applyExerciseChange(slot, exerciseName, false);
            if (scope === 'today' && poolBefore) {
                const stored = await db.get('slots', slotId);
                if (stored) {
                    stored.pool = poolBefore;
                    await db.put('slots', stored);
                }
            }
            if (this.currentWorkout?.slots?.[slotId]?.exerciseChanges?.length) {
                const changes = this.currentWorkout.slots[slotId].exerciseChanges;
                const last = changes[changes.length - 1];
                last.reason = this.swapState?.reason || null;
                last.scope = scope;
                await db.saveCurrentWorkout(this.currentWorkout);
            }
            this.hapticTap?.([10, 30, 14]);
            this.showCoachToast(
                scope === 'today'
                    ? `${exerciseName} pour aujourd’hui. Ton programme garde ${original?.activeExercise || previousName}.`
                    : `${exerciseName} remplace ${previousName} dans ton programme.`,
                'hot',
                '🔁'
            );
            if (challengePaused) {
                setTimeout(() => this.showCoachToast('Défi de séance en pause : il revient si tu reprends l’exercice prévu.', 'neutral', '⏸️'), 2600);
            }
        },

        bindExerciseSwapButton() {
            const button = document.getElementById('btn-exercise-swap');
            if (!button || button.dataset.bound) return;
            button.dataset.bound = 'true';
            button.addEventListener('click', () => {
                if (this.currentSlot?.id) void this.showPoolSheet(this.currentSlot.id);
            });
        }
    });

    const baseBindEvents = App.prototype.bindEvents;
    App.prototype.bindEvents = function bindEventsWithSwap() {
        baseBindEvents.call(this);
        this.bindExerciseSwapButton();
    };
})();
