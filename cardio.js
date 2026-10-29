// ===== Cardio console =====
// Cardio blocks (treadmill, bike, rower, stairs, rope…) get their own screen
// instead of the weight × reps cards: a live chronometer that survives the
// app going to the background, the machine settings you can nudge while you
// run, intervals with audio/vibration cues, live distance and calories, and
// a coach target built from the last time. A validated block is stored as a
// regular cardio set (durationSeconds, cardioMetric/Value) plus a `cardio`
// object with the details, so history, stats and trophies keep working.
(() => {
    const PROFILES = {
        treadmill: {
            emoji: '🏃', label: 'Tapis', color: '#f43f5e', met: null,
            primary: { key: 'speed', label: 'Vitesse', unit: 'km/h', step: 0.5, min: 1, max: 25, decimals: 1, fallback: 8, bump: 0.5 },
            secondary: { key: 'incline', label: 'Pente', unit: '%', step: 0.5, min: 0, max: 15, decimals: 1, fallback: 1 }
        },
        bike: {
            emoji: '🚴', label: 'Vélo', color: '#f97316', met: null,
            primary: { key: 'resistance', label: 'Résistance', unit: 'niv.', step: 1, min: 1, max: 30, decimals: 0, fallback: 8, bump: 1 },
            secondary: { key: 'cadence', label: 'Cadence', unit: 'tr/min', step: 5, min: 30, max: 140, decimals: 0, fallback: 80 }
        },
        elliptical: {
            emoji: '🌀', label: 'Elliptique', color: '#8b5cf6', met: null,
            primary: { key: 'resistance', label: 'Résistance', unit: 'niv.', step: 1, min: 1, max: 30, decimals: 0, fallback: 8, bump: 1 },
            secondary: { key: 'cadence', label: 'Cadence', unit: 'pas/min', step: 5, min: 30, max: 200, decimals: 0, fallback: 120 }
        },
        rower: {
            emoji: '🚣', label: 'Rameur', color: '#0ea5e9', met: null,
            primary: { key: 'power', label: 'Puissance', unit: 'W', step: 5, min: 20, max: 600, decimals: 0, fallback: 120, bump: 5 },
            secondary: { key: 'cadence', label: 'Cadence', unit: 'cps/min', step: 1, min: 14, max: 40, decimals: 0, fallback: 24 }
        },
        stairs: {
            emoji: '🪜', label: 'Escalier', color: '#14b8a6', met: null,
            primary: { key: 'level', label: 'Niveau', unit: '', step: 1, min: 1, max: 20, decimals: 0, fallback: 6, bump: 1 },
            secondary: null
        },
        rope: {
            emoji: '🪢', label: 'Corde', color: '#eab308', met: 11,
            primary: { key: 'cadence', label: 'Cadence', unit: 'tours/min', step: 5, min: 40, max: 220, decimals: 0, fallback: 110, bump: 5 },
            secondary: null
        },
        swim: {
            emoji: '🏊', label: 'Natation', color: '#06b6d4', met: 7,
            primary: { key: 'distance-m', label: 'Distance', unit: 'm', step: 25, min: 0, max: 10000, decimals: 0, fallback: 0, bump: 50 },
            secondary: null
        },
        generic: {
            emoji: '❤️', label: 'Cardio', color: '#ef4444', met: 6,
            primary: { key: 'level', label: 'Niveau', unit: '', step: 1, min: 1, max: 30, decimals: 0, fallback: 5, bump: 1 },
            secondary: null
        }
    };

    const FEELINGS = [
        { id: 'easy', emoji: '😌', label: 'Facile', rpe: 5 },
        { id: 'steady', emoji: '🙂', label: 'Modéré', rpe: 7 },
        { id: 'hard', emoji: '😤', label: 'Dur', rpe: 8.5 },
        { id: 'max', emoji: '🥵', label: 'À fond', rpe: 10 }
    ];

    const INTERVAL_PRESETS = [
        { id: 'tabata', label: 'Tabata', work: 20, rest: 10, rounds: 8 },
        { id: '30-30', label: '30/30', work: 30, rest: 30, rounds: 10 },
        { id: '1-1', label: '1 min / 1 min', work: 60, rest: 60, rounds: 8 },
        { id: '4x4', label: '4 × 4 min', work: 240, rest: 180, rounds: 4 }
    ];

    const baseRenderSeries = App.prototype.renderSeries;
    const baseOpenExercise = App.prototype.openExercise;
    const baseShowScreen = App.prototype.showScreen;
    const baseRenderSlots = App.prototype.renderSlots;
    const baseConfirmFinishSession = App.prototype.confirmFinishSession;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const pad = value => String(value).padStart(2, '0');

    Object.assign(App.prototype, {
        isCardioConsoleSlot(slot = this.currentSlot) {
            return Boolean(slot) && this.isCardioSlot(slot) && !this.isSupersetMode && !this.isUnilateralMode;
        },

        renderSeries() {
            if (this.isCardioConsoleSlot()) {
                this.renderCardioConsole();
                return;
            }
            document.getElementById('screen-exercise')?.classList.remove('is-cardio-console');
            this.stopCardioTicker();
            baseRenderSeries.apply(this, arguments);
        },

        async openExercise(slotId) {
            this.stopCardioTicker();
            this.cardioHistoryCache = null;
            this.cachedBodyWeight = await db.getSetting('bodyWeight');
            await baseOpenExercise.call(this, slotId);
            if (this.isCardioConsoleSlot()) {
                document.getElementById('logbook-card')?.style.setProperty('display', 'none');
                const history = await this.loadCardioHistory(this.currentSlot);
                if (this.currentSlot?.id !== slotId) return;
                this.cardioHistoryCache = { slotId, history };
                this.renderCardioConsole();
            }
        },

        showScreen(screenId) {
            baseShowScreen.call(this, screenId);
            if (screenId !== 'exercise') this.stopCardioTicker();
            else if (this.isCardioConsoleSlot() && this.getCardioLive()?.status === 'running') this.startCardioTicker();
        },

        getCardioProfileKey(slot = this.currentSlot) {
            const name = this.normalizeExerciseText(this.getSlotExerciseName(slot) || '');
            const has = words => words.some(word => new RegExp(`(^|[^a-z0-9])${this.normalizeExerciseText(word)}($|[^a-z0-9])`).test(name));
            if (has(['tapis', 'treadmill', 'course', 'running', 'jogging', 'marche', 'walking', 'walk', 'run'])) return 'treadmill';
            if (has(['elliptique', 'elliptical', 'cross trainer'])) return 'elliptical';
            if (has(['rameur', 'rower', 'rowing', 'ski erg', 'skierg', 'erg', 'air bike', 'assault bike', 'airbike'])) return 'rower';
            if (has(['velo', 'vélo', 'bike', 'spinning', 'cycling', 'bicycle'])) return 'bike';
            if (has(['stair', 'stairmaster', 'escalier', 'stepper', 'stepmill'])) return 'stairs';
            if (has(['corde', 'rope', 'jump rope'])) return 'rope';
            if (has(['natation', 'swim', 'swimming', 'nage'])) return 'swim';
            const metric = this.getCardioMetricConfig(slot).key;
            if (metric === 'speed') return 'treadmill';
            if (metric === 'power') return 'rower';
            if (metric === 'resistance') return 'bike';
            if (metric === 'distance-m') return 'swim';
            if (metric === 'cadence') return 'rope';
            return 'generic';
        },

        getCardioProfile(slot = this.currentSlot) {
            const key = this.getCardioProfileKey(slot);
            const profile = PROFILES[key];
            const name = this.getSlotExerciseName(slot);
            return { key, ...profile, label: name || profile.label };
        },

        getCardioBodyWeight() {
            const stored = Number(this.cachedBodyWeight);
            return Number.isFinite(stored) && stored > 30 ? stored : 75;
        },

        // kcal per minute for the profile at the given settings (rough but
        // standard: ACSM equations for walking/running, METs elsewhere,
        // Concept2's watts formula for ergometers).
        estimateCardioKcalPerMinute(profileKey, primary, secondary) {
            const kg = this.getCardioBodyWeight();
            const perMinFromMet = met => (met * 3.5 * kg) / 200;
            switch (profileKey) {
                case 'treadmill': {
                    const speed = Math.max(0, Number(primary) || 0);
                    const grade = Math.max(0, Number(secondary) || 0) / 100;
                    const metersPerMin = (speed * 1000) / 60;
                    const vo2 = speed < 7.5
                        ? 3.5 + (0.1 * metersPerMin) + (1.8 * metersPerMin * grade)
                        : 3.5 + (0.2 * metersPerMin) + (0.9 * metersPerMin * grade);
                    return (vo2 * kg) / 1000 * 5;
                }
                case 'bike':
                case 'elliptical':
                    return perMinFromMet(clamp(3.5 + (Number(primary) || 0) * 0.35, 3.5, 12));
                case 'rower':
                    return ((3.4416 * Math.max(0, Number(primary) || 0)) + 300) / 60;
                case 'stairs':
                    return perMinFromMet(clamp(4 + (Number(primary) || 0) * 0.5, 4, 12));
                default:
                    return perMinFromMet(PROFILES[profileKey]?.met || 6);
            }
        },

        async loadCardioHistory(slot) {
            try {
                const exerciseId = this.getBaseExerciseHistoryName(this.getSlotExerciseName(slot));
                const sets = await this.getSetHistoryForExercise(exerciseId);
                const byWorkout = new Map();
                for (const set of sets || []) {
                    const seconds = this.getSetDurationSeconds(set, slot);
                    if (!(seconds > 0)) continue;
                    const key = set.workoutId ?? set.date;
                    if (!byWorkout.has(key)) byWorkout.set(key, { date: set.date, sets: [] });
                    byWorkout.get(key).sets.push(set);
                }
                return [...byWorkout.values()]
                    .map(entry => this.summarizeCardioSets(entry.sets, slot, entry.date))
                    .sort((a, b) => new Date(b.date) - new Date(a.date));
            } catch (error) {
                console.warn('Historique cardio indisponible:', error);
                return [];
            }
        },

        summarizeCardioSets(sets, slot, date = null) {
            let seconds = 0;
            let primaryWeighted = 0;
            let secondaryWeighted = 0;
            let distanceKm = 0;
            let calories = 0;
            let mode = 'steady';
            let intervals = null;
            for (const set of sets) {
                const duration = this.getSetDurationSeconds(set, slot);
                seconds += duration;
                primaryWeighted += Number(set.cardioMetricValue ?? set.weight ?? 0) * duration;
                secondaryWeighted += Number(set.cardio?.secondary ?? 0) * duration;
                const details = this.getSetCardioDetails ? this.getSetCardioDetails(set, slot) : null;
                distanceKm += details?.distanceKm || Number(set.cardio?.distanceKm) || 0;
                calories += Number(set.cardio?.calories) || 0;
                if (set.cardio?.mode) mode = set.cardio.mode;
                if (set.cardio?.intervals) intervals = set.cardio.intervals;
            }
            return {
                date: date || sets[0]?.date || null,
                seconds,
                primary: seconds > 0 ? primaryWeighted / seconds : 0,
                secondary: seconds > 0 ? secondaryWeighted / seconds : 0,
                distanceKm,
                calories,
                mode,
                intervals
            };
        },

        // Coach target for today: a little longer until the top of the
        // programmed range, then the same duration one notch more intense.
        buildCardioPlan(slot = this.currentSlot) {
            const profile = this.getCardioProfile(slot);
            const history = this.cardioHistoryCache?.slotId === slot?.id ? this.cardioHistoryCache.history : [];
            const last = history[0] || null;
            const minMinutes = Math.max(1, Number(slot.repsMin) || 10);
            const maxMinutes = Math.max(minMinutes, Number(slot.repsMax) || minMinutes);
            const primaryFallback = profile.primary.fallback;
            const isWarmup = slot.role === 'warmup';

            if (!last || !(last.seconds > 0)) {
                return {
                    last: null,
                    targetMinutes: isWarmup ? minMinutes : Math.round((minMinutes + maxMinutes) / 2),
                    primary: primaryFallback,
                    secondary: profile.secondary?.fallback ?? null,
                    headline: isWarmup ? 'Échauffement tranquille' : 'Première fois : trouve ton rythme',
                    detail: isWarmup
                        ? 'Monte doucement en intensité, tu dois pouvoir parler.'
                        : 'Choisis une allure que tu peux tenir en parlant par phrases courtes.'
                };
            }

            const lastMinutes = Math.max(1, Math.round(last.seconds / 60));
            const lastPrimary = last.primary > 0 ? last.primary : primaryFallback;
            const roundTo = (value, step) => Math.round(value / step) * step;
            if (isWarmup) {
                return {
                    last,
                    targetMinutes: clamp(lastMinutes, minMinutes, maxMinutes),
                    primary: roundTo(lastPrimary, profile.primary.step),
                    secondary: last.secondary || profile.secondary?.fallback || null,
                    headline: 'Même échauffement que la dernière fois',
                    detail: 'Le but est d’arriver chaud, pas fatigué.'
                };
            }
            if (lastMinutes < maxMinutes) {
                const add = lastMinutes < 15 ? 1 : 2;
                const target = clamp(lastMinutes + add, minMinutes, maxMinutes);
                return {
                    last,
                    targetMinutes: target,
                    primary: roundTo(lastPrimary, profile.primary.step),
                    secondary: last.secondary || profile.secondary?.fallback || null,
                    headline: target > lastMinutes ? `+${target - lastMinutes} min vs la dernière fois` : 'Même durée que la dernière fois',
                    detail: `Même ${profile.primary.label.toLowerCase()}, un peu plus longtemps.`
                };
            }
            const bumped = clamp(roundTo(lastPrimary + profile.primary.bump, profile.primary.step), profile.primary.min, profile.primary.max);
            return {
                last,
                targetMinutes: maxMinutes,
                primary: bumped,
                secondary: last.secondary || profile.secondary?.fallback || null,
                headline: `${profile.primary.label} +${this.formatCardioValue(profile.primary.bump, profile.primary)}`,
                detail: `Tu as tenu ${lastMinutes} min : même durée, un cran plus intense.`
            };
        },

        formatCardioValue(value, spec) {
            const number = Number(value) || 0;
            const decimals = spec?.decimals ?? 0;
            const text = decimals > 0 ? (Math.round(number * 10) / 10).toFixed(Number.isInteger(Math.round(number * 10) / 10) ? 0 : 1) : String(Math.round(number));
            return text.replace('.', ',');
        },

        formatClock(totalSeconds) {
            const seconds = Math.max(0, Math.floor(totalSeconds));
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const rest = seconds % 60;
            return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
        },

        getCardioSlotData() {
            return this.currentWorkout?.slots?.[this.currentSlot?.id] || null;
        },

        getCardioLive() {
            return this.getCardioSlotData()?.cardioLive || null;
        },

        ensureCardioLive() {
            const slotData = this.getCardioSlotData();
            if (!slotData) return null;
            const historyReady = this.cardioHistoryCache?.slotId === this.currentSlot?.id;
            if (!slotData.cardioLive && !historyReady) {
                // History still loading: show the defaults without storing
                // them, the coach target replaces them a moment later.
                const plan = this.buildCardioPlan(this.currentSlot);
                return {
                    status: 'idle', mode: 'steady', accumulatedMs: 0, startedAt: null, lastSampleAt: null,
                    primary: plan.primary, secondary: plan.secondary, primarySum: 0, secondarySum: 0,
                    targetMinutes: plan.targetMinutes, intervals: { work: 30, rest: 30, rounds: 10 }
                };
            }
            if (!slotData.cardioLive) {
                const plan = this.buildCardioPlan(this.currentSlot);
                const lastIntervals = plan.last?.intervals;
                slotData.cardioLive = {
                    status: 'idle',
                    mode: plan.last?.mode === 'intervals' ? 'intervals' : 'steady',
                    accumulatedMs: 0,
                    startedAt: null,
                    lastSampleAt: null,
                    primary: plan.primary,
                    secondary: plan.secondary,
                    primarySum: 0,
                    secondarySum: 0,
                    targetMinutes: plan.targetMinutes,
                    intervals: lastIntervals
                        ? { work: lastIntervals.work, rest: lastIntervals.rest, rounds: lastIntervals.rounds }
                        : { work: 30, rest: 30, rounds: 10 },
                    goalCelebrated: false,
                    lastPhaseKey: null
                };
            }
            return slotData.cardioLive;
        },

        getCardioElapsedSeconds(live = this.getCardioLive()) {
            if (!live) return 0;
            const running = live.status === 'running' && live.startedAt ? Date.now() - live.startedAt : 0;
            return (live.accumulatedMs + running) / 1000;
        },

        getCardioIntervalState(live, elapsed) {
            const { work, rest, rounds } = live.intervals;
            const cycle = work + rest;
            const totalSeconds = (rounds * cycle) - rest;
            const clamped = Math.min(elapsed, totalSeconds);
            const round = Math.min(rounds, Math.floor(clamped / cycle) + 1);
            const inCycle = clamped - ((round - 1) * cycle);
            const isWork = inCycle < work || round === rounds && inCycle >= work;
            const phaseRemaining = isWork ? Math.max(0, work - inCycle) : Math.max(0, cycle - inCycle);
            return {
                round,
                rounds,
                phase: elapsed >= totalSeconds ? 'done' : (isWork ? 'work' : 'rest'),
                phaseRemaining,
                phaseLength: isWork ? work : rest,
                totalSeconds,
                key: `${round}-${isWork ? 'w' : 'r'}`
            };
        },

        // Time-weighted averages of the settings: they change mid-run.
        sampleCardioSettings(live) {
            if (!live || live.status !== 'running' || !live.lastSampleAt) return;
            const now = Date.now();
            const seconds = Math.max(0, (now - live.lastSampleAt) / 1000);
            live.primarySum += (Number(live.primary) || 0) * seconds;
            live.secondarySum += (Number(live.secondary) || 0) * seconds;
            live.lastSampleAt = now;
        },

        getCardioAverages(live) {
            const elapsed = this.getCardioElapsedSeconds(live);
            const pendingSeconds = live.status === 'running' && live.lastSampleAt ? (Date.now() - live.lastSampleAt) / 1000 : 0;
            const primarySum = live.primarySum + (Number(live.primary) || 0) * pendingSeconds;
            const secondarySum = live.secondarySum + (Number(live.secondary) || 0) * pendingSeconds;
            return {
                primary: elapsed > 0 ? primarySum / elapsed : Number(live.primary) || 0,
                secondary: elapsed > 0 ? secondarySum / elapsed : Number(live.secondary) || 0
            };
        },

        getCardioLiveTotals(live, profile) {
            const elapsed = this.getCardioElapsedSeconds(live);
            const averages = this.getCardioAverages(live);
            const kcal = this.estimateCardioKcalPerMinute(profile.key, averages.primary, averages.secondary) * (elapsed / 60);
            let distanceKm = null;
            if (profile.key === 'treadmill') distanceKm = averages.primary * (elapsed / 3600);
            if (profile.key === 'swim') distanceKm = (Number(live.primary) || 0) / 1000;
            return { elapsed, averages, kcal, distanceKm };
        },

        // ---------- Rendering ----------
        renderCardioConsole() {
            const container = document.getElementById('series-list');
            const slot = this.currentSlot;
            const slotData = this.getCardioSlotData();
            if (!container || !slot || !slotData) return;
            document.getElementById('screen-exercise')?.classList.add('is-cardio-console');
            document.getElementById('logbook-card')?.style.setProperty('display', 'none');

            const profile = this.getCardioProfile(slot);
            const plan = this.buildCardioPlan(slot);
            const completed = (slotData.sets || []).filter(set => set?.completed);
            const targetBlocks = Math.max(1, this.getActiveTargetSets(slot, slotData));
            const allDone = completed.length >= targetBlocks;
            const live = allDone ? null : this.ensureCardioLive();
            const isWarmup = slot.role === 'warmup';
            this.currentActiveTargetSets = targetBlocks;

            const blocksHtml = completed.length ? `
                <div class="cc-done-list">
                    ${completed.map((set, index) => `
                        <div class="cc-done-row">
                            <span class="cc-done-check" aria-hidden="true">✓</span>
                            <div class="cc-done-main">
                                <strong>${targetBlocks > 1 ? `Bloc ${index + 1} · ` : ''}${this.formatDurationLabel(this.getSetDurationSeconds(set, slot))}</strong>
                                <small>${this.escapeHtml(this.describeCardioSet(set, profile))}</small>
                            </div>
                            <button type="button" class="cc-done-undo" data-cc-action="undo-block" data-index="${slotData.sets.indexOf(set)}" aria-label="Supprimer ce bloc">↺</button>
                        </div>
                    `).join('')}
                </div>
            ` : '';

            if (allDone) {
                container.innerHTML = `
                    <div class="cardio-console is-complete" style="--cardio: ${profile.color}">
                        <div class="cc-hero">
                            <div class="hero-bg" aria-hidden="true"><span class="hero-blob blob-a"></span><span class="hero-grid"></span></div>
                            <div class="cc-complete">
                                <span class="cc-complete-emoji" aria-hidden="true">${profile.emoji}</span>
                                <strong>${isWarmup ? 'Échauffement terminé' : 'Cardio validé'}</strong>
                                <span>Bien joué, passe à la suite.</span>
                            </div>
                        </div>
                        ${blocksHtml}
                    </div>
                `;
                this.bindCardioConsole(container);
                this.renderExerciseControlBar?.(slot, slotData);
                return;
            }

            const blockLabel = targetBlocks > 1 ? `Bloc ${completed.length + 1}/${targetBlocks}` : (isWarmup ? 'Échauffement' : 'Bloc cardio');
            const status = live.status;
            const isIntervals = live.mode === 'intervals';
            const lockedMode = status !== 'idle';
            const primary = profile.primary;
            const secondary = profile.secondary;
            const showFinish = status === 'finishing';

            const stepper = (spec, value, field) => spec ? `
                <div class="cc-stepper">
                    <span class="cc-stepper-label">${this.escapeHtml(spec.label)}</span>
                    <div class="cc-stepper-row">
                        <button type="button" class="cc-step" data-cc-action="step" data-field="${field}" data-dir="-1" aria-label="Baisser ${this.escapeHtml(spec.label)}">−</button>
                        <label class="cc-step-value">
                            <input type="number" inputmode="decimal" step="${spec.step}" min="${spec.min}" max="${spec.max}" value="${this.formatCardioValue(value, spec).replace(',', '.')}" data-cc-input="${field}" aria-label="${this.escapeHtml(spec.label)}">
                            <small>${this.escapeHtml(spec.unit)}</small>
                        </label>
                        <button type="button" class="cc-step" data-cc-action="step" data-field="${field}" data-dir="1" aria-label="Augmenter ${this.escapeHtml(spec.label)}">+</button>
                    </div>
                </div>
            ` : '';

            const lastLine = plan.last
                ? `Dernière fois : ${this.formatDurationLabel(plan.last.seconds)}${plan.last.primary > 0 ? ` · ${this.formatCardioValue(plan.last.primary, primary)} ${primary.unit}` : ''}${plan.last.distanceKm > 0 ? ` · ${this.formatKm(plan.last.distanceKm)}` : ''}`
                : 'Première fois sur cette machine';

            const intervalConfig = isIntervals && status === 'idle' ? `
                <div class="cc-intervals-config">
                    <div class="cc-presets">
                        ${INTERVAL_PRESETS.map(preset => {
                            const active = preset.work === live.intervals.work && preset.rest === live.intervals.rest && preset.rounds === live.intervals.rounds;
                            return `<button type="button" class="cc-preset ${active ? 'active' : ''}" data-cc-action="preset" data-preset="${preset.id}">${this.escapeHtml(preset.label)}</button>`;
                        }).join('')}
                    </div>
                    <div class="cc-interval-steppers">
                        ${[['work', 'Effort', 's', 5], ['rest', 'Récup', 's', 5], ['rounds', 'Tours', '', 1]].map(([field, label, unit]) => `
                            <div class="cc-mini-stepper">
                                <span>${label}</span>
                                <div>
                                    <button type="button" data-cc-action="interval" data-field="${field}" data-dir="-1" aria-label="Moins">−</button>
                                    <strong>${field === 'rounds' ? live.intervals[field] : this.formatRestShort(live.intervals[field])}</strong>
                                    <button type="button" data-cc-action="interval" data-field="${field}" data-dir="1" aria-label="Plus">+</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '';

            const targetStepper = !isIntervals && live.mode === 'steady' && status === 'idle' ? `
                <div class="cc-target-row">
                    <span>Durée visée</span>
                    <div class="cc-mini-stepper is-inline">
                        <div>
                            <button type="button" data-cc-action="target" data-dir="-1" aria-label="Réduire la durée">−</button>
                            <strong>${live.targetMinutes} min</strong>
                            <button type="button" data-cc-action="target" data-dir="1" aria-label="Allonger la durée">+</button>
                        </div>
                    </div>
                </div>
            ` : '';

            const actions = {
                idle: `
                    <button type="button" class="btn cc-btn-start" data-cc-action="start">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5z"/></svg>
                        Démarrer
                    </button>
                    <button type="button" class="cc-link" data-cc-action="manual">Saisir sans chrono</button>
                `,
                running: `
                    <div class="cc-actions-row">
                        <button type="button" class="btn cc-btn-pause" data-cc-action="pause">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>
                            Pause
                        </button>
                        <button type="button" class="btn cc-btn-stop" data-cc-action="stop">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                            Terminer
                        </button>
                    </div>
                `,
                paused: `
                    <div class="cc-actions-row">
                        <button type="button" class="btn cc-btn-start" data-cc-action="resume">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5z"/></svg>
                            Reprendre
                        </button>
                        <button type="button" class="btn cc-btn-stop" data-cc-action="stop">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                            Terminer
                        </button>
                    </div>
                    <button type="button" class="cc-link" data-cc-action="reset">Recommencer à zéro</button>
                `
            };

            container.innerHTML = `
                <div class="cardio-console is-${status} mode-${live.mode} ${isWarmup ? 'is-warmup' : ''}" style="--cardio: ${profile.color}">
                    <div class="cc-hero">
                        <div class="hero-bg" aria-hidden="true">
                            <span class="hero-blob blob-a"></span>
                            <span class="hero-blob blob-b"></span>
                            <span class="hero-grid"></span>
                        </div>
                        <div class="cc-top">
                            <span class="cc-machine"><span aria-hidden="true">${profile.emoji}</span>${this.escapeHtml(blockLabel)}</span>
                            ${isWarmup ? '<span class="cc-chip is-warmup">🔥 Échauffement</span>' : `<span class="cc-chip">${Math.round(this.estimateCardioKcalPerMinute(profile.key, live.primary, live.secondary) * 10) / 10} kcal/min</span>`}
                        </div>
                        ${showFinish ? '' : `
                            <div class="cc-modes" role="tablist" aria-label="Type de bloc">
                                ${[['steady', 'Continu'], ['intervals', 'Fractionné'], ['free', 'Libre']].map(([mode, label]) => `
                                    <button type="button" class="cc-mode ${live.mode === mode ? 'active' : ''}" data-cc-action="mode" data-mode="${mode}" role="tab" aria-selected="${live.mode === mode}" ${lockedMode ? 'disabled' : ''}>${label}</button>
                                `).join('')}
                            </div>
                        `}
                        <div class="cc-dial" aria-live="off">
                            <svg class="cc-ring" viewBox="0 0 120 120" aria-hidden="true">
                                <circle class="cc-ring-track" cx="60" cy="60" r="52"/>
                                <circle class="cc-ring-fill" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
                            </svg>
                            <div class="cc-dial-center">
                                <span class="cc-phase" data-cc="phase">Prêt</span>
                                <strong class="cc-time" data-cc="time">00:00</strong>
                                <span class="cc-target" data-cc="target"></span>
                            </div>
                        </div>
                        ${isIntervals ? `<div class="cc-rounds" data-cc="rounds">${Array.from({ length: live.intervals.rounds }, () => '<i></i>').join('')}</div>` : ''}
                        <div class="cc-live">
                            <div class="cc-live-tile"><strong data-cc="distance">--</strong><span>${profile.key === 'swim' ? 'nagés' : 'distance'}</span></div>
                            <div class="cc-live-tile"><strong data-cc="kcal">0</strong><span>kcal</span></div>
                            <div class="cc-live-tile"><strong data-cc="avg">--</strong><span>moy. ${this.escapeHtml(primary.unit || primary.label.toLowerCase())}</span></div>
                        </div>
                        ${showFinish ? this.renderCardioFinishPanel(live, profile) : `
                            <div class="cc-controls ${secondary ? '' : 'is-single'}">
                                ${stepper(primary, live.primary, 'primary')}
                                ${stepper(secondary, live.secondary, 'secondary')}
                            </div>
                            ${intervalConfig}
                            ${targetStepper}
                            <div class="cc-actions">${actions[status] || actions.idle}</div>
                        `}
                    </div>
                    <div class="cc-plan">
                        <span class="cc-plan-icon" aria-hidden="true">🎯</span>
                        <div class="cc-plan-main">
                            <span class="pz-kicker">Objectif du coach</span>
                            <strong>${this.escapeHtml(plan.headline)}</strong>
                            <small>${this.escapeHtml(plan.detail)}</small>
                            <small class="cc-plan-last">${this.escapeHtml(lastLine)}</small>
                        </div>
                    </div>
                    ${blocksHtml}
                </div>
            `;

            this.bindCardioConsole(container);
            this.updateCardioConsoleLive();
            this.renderExerciseControlBar?.(slot, slotData);
            if (status === 'running') this.startCardioTicker();
            else this.stopCardioTicker();
        },

        renderCardioFinishPanel(live, profile) {
            const totals = this.getCardioLiveTotals(live, profile);
            const draft = live.finishDraft || {};
            const minutes = draft.minutes ?? Math.max(0, Math.round((totals.elapsed / 60) * 10) / 10);
            const distance = draft.distanceKm ?? (totals.distanceKm != null ? Math.round(totals.distanceKm * 100) / 100 : '');
            const kcal = draft.calories ?? Math.round(totals.kcal);
            const feeling = draft.feeling || 'steady';
            return `
                <div class="cc-finish">
                    <strong class="cc-finish-title">${live.manual ? 'Saisis ton bloc' : 'Bloc terminé !'}</strong>
                    <div class="cc-finish-grid">
                        <label class="cc-field">
                            <span>Durée</span>
                            <span class="cc-field-input"><input type="number" inputmode="decimal" step="0.5" min="0" value="${minutes || ''}" placeholder="20" data-cc-finish="minutes"><small>min</small></span>
                        </label>
                        <label class="cc-field">
                            <span>Distance</span>
                            <span class="cc-field-input"><input type="number" inputmode="decimal" step="0.01" min="0" value="${distance === '' ? '' : distance}" placeholder="optionnel" data-cc-finish="distanceKm"><small>km</small></span>
                        </label>
                        <label class="cc-field">
                            <span>Calories</span>
                            <span class="cc-field-input"><input type="number" inputmode="numeric" step="1" min="0" value="${kcal || ''}" placeholder="auto" data-cc-finish="calories"><small>kcal</small></span>
                        </label>
                        ${live.manual ? `
                            <label class="cc-field">
                                <span>${this.escapeHtml(profile.primary.label)} moy.</span>
                                <span class="cc-field-input"><input type="number" inputmode="decimal" step="${profile.primary.step}" min="0" value="${this.formatCardioValue(live.primary, profile.primary).replace(',', '.')}" data-cc-finish="primary"><small>${this.escapeHtml(profile.primary.unit)}</small></span>
                            </label>
                        ` : ''}
                    </div>
                    <span class="cc-finish-label">Ressenti</span>
                    <div class="cc-feelings" role="radiogroup" aria-label="Ressenti">
                        ${FEELINGS.map(item => `
                            <button type="button" class="cc-feeling ${feeling === item.id ? 'active' : ''}" data-cc-action="feeling" data-feeling="${item.id}" role="radio" aria-checked="${feeling === item.id}">
                                <span aria-hidden="true">${item.emoji}</span>${item.label}
                            </button>
                        `).join('')}
                    </div>
                    <button type="button" class="btn cc-btn-start cc-validate" data-cc-action="validate">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg>
                        Valider le bloc
                    </button>
                    ${live.manual
                        ? '<button type="button" class="cc-link" data-cc-action="cancel-manual">Annuler</button>'
                        : (live.mode === 'intervals' ? '' : '<button type="button" class="cc-link" data-cc-action="resume">Reprendre le chrono</button>')}
                </div>
            `;
        },

        describeCardioSet(set, profile) {
            const parts = [];
            const value = Number(set.cardioMetricValue ?? 0);
            if (value > 0 && profile.primary.key !== 'distance-m') parts.push(`${this.formatCardioValue(value, profile.primary)} ${profile.primary.unit}`.trim());
            if (Number(set.cardio?.secondary) > 0 && profile.secondary) parts.push(`${profile.secondary.label.toLowerCase()} ${this.formatCardioValue(set.cardio.secondary, profile.secondary)} ${profile.secondary.unit}`.trim());
            if (Number(set.cardio?.distanceKm) > 0) parts.push(this.formatKm(set.cardio.distanceKm));
            if (Number(set.cardio?.calories) > 0) parts.push(`${Math.round(set.cardio.calories)} kcal`);
            if (set.cardio?.mode === 'intervals' && set.cardio.intervals) parts.push(`${set.cardio.intervals.rounds} × ${set.cardio.intervals.work}/${set.cardio.intervals.rest} s`);
            return parts.join(' · ') || 'Bloc validé';
        },

        bindCardioConsole(container) {
            if (container.dataset.cardioBound === 'true') return;
            container.dataset.cardioBound = 'true';
            container.addEventListener('click', event => {
                if (!this.isCardioConsoleSlot()) return;
                const button = event.target.closest('[data-cc-action]');
                if (!button || button.disabled) return;
                void this.handleCardioAction(button.dataset.ccAction, button);
            });
            container.addEventListener('change', event => {
                if (!this.isCardioConsoleSlot()) return;
                const input = event.target.closest('[data-cc-input]');
                if (input) {
                    void this.setCardioSetting(input.dataset.ccInput, parseFloat(String(input.value).replace(',', '.')));
                    return;
                }
                const finishInput = event.target.closest('[data-cc-finish]');
                if (finishInput) {
                    const live = this.getCardioLive();
                    if (!live) return;
                    live.finishDraft = live.finishDraft || {};
                    const raw = parseFloat(String(finishInput.value).replace(',', '.'));
                    live.finishDraft[finishInput.dataset.ccFinish] = Number.isFinite(raw) ? raw : '';
                    if (finishInput.dataset.ccFinish === 'primary' && Number.isFinite(raw)) live.primary = raw;
                    void db.saveCurrentWorkout(this.currentWorkout);
                }
            });
        },

        async setCardioSetting(field, value) {
            const live = this.getCardioLive();
            const profile = this.getCardioProfile();
            const spec = field === 'secondary' ? profile.secondary : profile.primary;
            if (!live || !spec || !Number.isFinite(value)) {
                this.renderCardioConsole();
                return;
            }
            this.sampleCardioSettings(live);
            live[field] = clamp(Math.round(value / spec.step) * spec.step, spec.min, spec.max);
            live[field] = Math.round(live[field] * 100) / 100;
            await db.saveCurrentWorkout(this.currentWorkout);
            const input = document.querySelector(`[data-cc-input="${field}"]`);
            if (input && document.activeElement !== input) input.value = this.formatCardioValue(live[field], spec).replace(',', '.');
            const chip = document.querySelector('.cardio-console .cc-chip:not(.is-warmup)');
            if (chip) chip.textContent = `${Math.round(this.estimateCardioKcalPerMinute(profile.key, live.primary, live.secondary) * 10) / 10} kcal/min`;
            this.updateCardioConsoleLive();
        },

        async handleCardioAction(action, button) {
            const live = this.getCardioLive();
            const profile = this.getCardioProfile();
            switch (action) {
                case 'mode': {
                    if (!live || live.status !== 'idle') return;
                    live.mode = button.dataset.mode;
                    this.hapticTap?.(8);
                    break;
                }
                case 'preset': {
                    const preset = INTERVAL_PRESETS.find(item => item.id === button.dataset.preset);
                    if (!live || !preset) return;
                    live.intervals = { work: preset.work, rest: preset.rest, rounds: preset.rounds };
                    break;
                }
                case 'interval': {
                    if (!live) return;
                    const field = button.dataset.field;
                    const dir = Number(button.dataset.dir) || 0;
                    const limits = { work: [5, 900], rest: [5, 600], rounds: [1, 40] };
                    const step = field === 'rounds' ? 1 : (live.intervals[field] >= 120 ? 30 : live.intervals[field] >= 60 ? 15 : 5);
                    live.intervals[field] = clamp(live.intervals[field] + (dir * step), ...limits[field]);
                    break;
                }
                case 'target': {
                    if (!live) return;
                    const dir = Number(button.dataset.dir) || 0;
                    const step = live.targetMinutes >= 20 ? 5 : 1;
                    live.targetMinutes = clamp(live.targetMinutes + (dir * step), 1, 240);
                    break;
                }
                case 'step': {
                    const spec = button.dataset.field === 'secondary' ? profile.secondary : profile.primary;
                    if (!live || !spec) return;
                    const dir = Number(button.dataset.dir) || 0;
                    this.hapticTap?.(6);
                    await this.setCardioSetting(button.dataset.field, (Number(live[button.dataset.field]) || spec.fallback) + (dir * spec.step));
                    return;
                }
                case 'start':
                case 'resume': {
                    if (!live) {
                        this.showCoachToast('Une seconde, le coach prépare ton bloc…', 'neutral', '⏳');
                        return;
                    }
                    this.unlockCardioAudio();
                    if (live.status === 'idle') live.accumulatedMs = 0;
                    if (live.status === 'finishing' && live.manual) return;
                    live.status = 'running';
                    live.startedAt = Date.now();
                    live.lastSampleAt = Date.now();
                    live.finishDraft = null;
                    this.hapticTap?.([12, 30, 12]);
                    if (action === 'start') this.playCardioBeep('start');
                    break;
                }
                case 'pause': {
                    if (!live || live.status !== 'running') return;
                    this.sampleCardioSettings(live);
                    live.accumulatedMs += Date.now() - live.startedAt;
                    live.startedAt = null;
                    live.lastSampleAt = null;
                    live.status = 'paused';
                    this.hapticTap?.(10);
                    break;
                }
                case 'stop': {
                    if (!live) return;
                    this.freezeCardioLive(live);
                    if (this.getCardioElapsedSeconds(live) < 5) {
                        this.showCoachToast('Moins de 5 secondes : rien à enregistrer. Démarre quand tu es prêt.', 'neutral', '⏱️');
                        live.status = 'idle';
                        live.accumulatedMs = 0;
                        break;
                    }
                    live.status = 'finishing';
                    live.manual = false;
                    this.hapticTap?.([18, 40, 18]);
                    break;
                }
                case 'manual': {
                    if (!live) return;
                    live.status = 'finishing';
                    live.manual = true;
                    live.finishDraft = { minutes: live.targetMinutes };
                    break;
                }
                case 'cancel-manual': {
                    if (!live) return;
                    live.status = 'idle';
                    live.manual = false;
                    live.finishDraft = null;
                    break;
                }
                case 'reset': {
                    const confirmed = await this.showAppConfirm('Le chrono repart de zéro.', {
                        title: 'Recommencer le bloc ?',
                        variant: 'warning',
                        confirmText: 'Recommencer'
                    });
                    if (!confirmed) return;
                    const slotData = this.getCardioSlotData();
                    if (slotData) delete slotData.cardioLive;
                    break;
                }
                case 'feeling': {
                    if (!live) return;
                    live.finishDraft = { ...(live.finishDraft || {}), feeling: button.dataset.feeling };
                    document.querySelectorAll('.cc-feeling').forEach(item => {
                        const active = item === button;
                        item.classList.toggle('active', active);
                        item.setAttribute('aria-checked', String(active));
                    });
                    await db.saveCurrentWorkout(this.currentWorkout);
                    return;
                }
                case 'validate': {
                    await this.validateCardioBlock();
                    return;
                }
                case 'undo-block': {
                    await this.undoCardioBlock(Number(button.dataset.index));
                    return;
                }
                default:
                    return;
            }
            await db.saveCurrentWorkout(this.currentWorkout);
            this.renderCardioConsole();
        },

        freezeCardioLive(live) {
            if (live.status === 'running' && live.startedAt) {
                this.sampleCardioSettings(live);
                live.accumulatedMs += Date.now() - live.startedAt;
            }
            live.startedAt = null;
            live.lastSampleAt = null;
        },

        // Turns a live (or manually entered) block into a cardio set. Pure:
        // no DOM, so it can also save a block left running at workout end.
        buildCardioSetFromLive(slot, live) {
            const profile = this.getCardioProfile(slot);
            const draft = live.finishDraft || {};
            if (live.manual && Number.isFinite(draft.primary)) live.primary = draft.primary;
            const totals = this.getCardioLiveTotals(live, profile);
            const minutes = Number(draft.minutes);
            const seconds = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : Math.round(totals.elapsed);
            if (!(seconds > 0)) return null;
            const averages = live.manual ? { primary: Number(live.primary) || 0, secondary: Number(live.secondary) || 0 } : totals.averages;
            const autoKcal = this.estimateCardioKcalPerMinute(profile.key, averages.primary, averages.secondary) * (seconds / 60);
            const autoDistance = profile.key === 'treadmill' ? averages.primary * (seconds / 3600) : (profile.key === 'swim' ? (Number(live.primary) || 0) / 1000 : 0);
            const distanceKm = Number.isFinite(Number(draft.distanceKm)) && draft.distanceKm !== '' ? Number(draft.distanceKm) : autoDistance;
            const calories = Number.isFinite(Number(draft.calories)) && draft.calories !== '' && Number(draft.calories) > 0 ? Number(draft.calories) : autoKcal;
            const feeling = FEELINGS.find(item => item.id === (draft.feeling || 'steady')) || FEELINGS[1];
            // Distance-like metrics are cumulative: keep the final value, not a time average.
            const isCumulative = profile.primary.key === 'distance-m';
            const primaryValue = Math.round((isCumulative ? (Number(live.primary) || 0) : averages.primary) * 10) / 10;
            return {
                weight: primaryValue,
                reps: Math.round((seconds / 60) * 10) / 10,
                trackingMode: 'cardio',
                durationSeconds: seconds,
                cardioMetric: profile.primary.key,
                cardioMetricValue: primaryValue,
                cardio: {
                    machine: profile.key,
                    role: slot.role === 'warmup' ? 'warmup' : 'work',
                    mode: live.manual ? 'manual' : live.mode,
                    intervals: live.mode === 'intervals' ? { ...live.intervals } : null,
                    secondary: profile.secondary ? Math.round(averages.secondary * 10) / 10 : null,
                    secondaryMetric: profile.secondary?.key || null,
                    distanceKm: Math.round((Number(distanceKm) || 0) * 100) / 100,
                    calories: Math.round(Number(calories) || 0),
                    feeling: feeling.id,
                    targetMinutes: live.targetMinutes
                },
                // Standard fields read by stats and exercise profiles (v5.7.0).
                ...(Number(distanceKm) > 0 ? { distanceMeters: Math.round(Number(distanceKm) * 1000) } : {}),
                ...(profile.secondary?.key === 'incline' && averages.secondary > 0 ? { inclinePct: Math.round(averages.secondary * 10) / 10 } : {}),
                ...(Number(calories) > 0 ? { calories: Math.round(Number(calories)) } : {}),
                xpAwarded: 10 + Math.min(30, Math.floor(seconds / 60)),
                targetReps: live.targetMinutes,
                completed: true,
                exerciseName: slot.activeExercise || slot.name,
                timestamp: Date.now(),
                qualityTags: [],
                excludeFromProgression: false,
                rpe: feeling.rpe,
                rpeSource: 'user'
            };
        },

        async validateCardioBlock() {
            const live = this.getCardioLive();
            const slot = this.currentSlot;
            const slotData = this.getCardioSlotData();
            if (!live || !slot || !slotData) return;
            const profile = this.getCardioProfile(slot);
            // Read the fields directly: a change event may not have fired yet.
            document.querySelectorAll('[data-cc-finish]').forEach(input => {
                const raw = parseFloat(String(input.value).replace(',', '.'));
                live.finishDraft = live.finishDraft || {};
                live.finishDraft[input.dataset.ccFinish] = Number.isFinite(raw) ? raw : '';
            });
            const built = this.buildCardioSetFromLive(slot, live);
            if (!built) {
                document.querySelector('[data-cc-finish="minutes"]')?.focus();
                this.showCoachToast('Indique la durée du bloc.', 'warning', '⏱️');
                return;
            }
            const seconds = built.durationSeconds;
            const index = (slotData.sets || []).findIndex(set => !set?.completed);
            const setIndex = index >= 0 ? index : (slotData.sets || []).length;
            slotData.sets = slotData.sets || [];
            slotData.sets[setIndex] = built;
            delete slotData.cardioLive;

            this.lastCompletedSetIndex = setIndex;
            this.lastCompletedSetSide = null;
            this.lastCompletedSetSlotId = slot.id;
            await db.saveCurrentWorkout(this.currentWorkout);

            // 10 XP per block like any set, +1 per minute (capped) for the effort.
            const xpGain = slotData.sets[setIndex].xpAwarded;
            const xp = ((await db.getSetting('xp')) ?? 0) + xpGain;
            await db.setSetting('xp', xp);

            const completedCount = slotData.sets.filter(set => set?.completed).length;
            const targetBlocks = Math.max(1, this.getActiveTargetSets(slot, slotData));
            this.renderCardioConsole();
            const anchor = document.querySelector('.cc-done-list .cc-done-row:last-child') || document.querySelector('.cardio-console');
            this.hapticTap?.([10, 40, 18]);
            gamification.sparkle?.(anchor);
            this.spawnXpFloat?.(anchor, `+${xpGain} XP`);
            this.playCardioBeep('done');

            if (completedCount >= targetBlocks) {
                setTimeout(() => this.showExerciseSummary(), 450);
            } else if (Number(slot.rest) > 0) {
                this.resetRpeSlider?.();
                this.startRestTimer(Number(slot.rest));
            }
        },

        async undoCardioBlock(index) {
            const slotData = this.getCardioSlotData();
            const set = slotData?.sets?.[index];
            if (!set) return;
            const confirmed = await this.showAppConfirm(`${this.formatDurationLabel(this.getSetDurationSeconds(set, this.currentSlot))} seront retirées de la séance.`, {
                title: 'Supprimer ce bloc ?',
                variant: 'warning',
                confirmText: 'Supprimer',
                cancelText: 'Garder'
            });
            if (!confirmed) return;
            slotData.sets.splice(index, 1);
            const refund = Number(set.xpAwarded) || 0;
            if (refund > 0) {
                const xp = Math.max(0, ((await db.getSetting('xp')) ?? 0) - refund);
                await db.setSetting('xp', xp);
            }
            if (this.currentWorkout.completedSlots?.includes(this.currentSlot.id)) {
                this.currentWorkout.completedSlots = this.currentWorkout.completedSlots.filter(id => id !== this.currentSlot.id);
            }
            await db.saveCurrentWorkout(this.currentWorkout);
            this.renderCardioConsole();
        },

        // ---------- Live updates ----------
        startCardioTicker() {
            if (this.cardioTicker) return;
            this.cardioTicker = setInterval(() => this.tickCardioConsole(), 250);
        },

        stopCardioTicker() {
            if (this.cardioTicker) {
                clearInterval(this.cardioTicker);
                this.cardioTicker = null;
            }
        },

        tickCardioConsole() {
            const live = this.getCardioLive();
            if (!live || live.status !== 'running' || !this.isCardioConsoleSlot() || this.currentScreen !== 'exercise') {
                this.stopCardioTicker();
                return;
            }
            const elapsed = this.getCardioElapsedSeconds(live);
            if (live.mode === 'intervals') {
                const state = this.getCardioIntervalState(live, elapsed);
                if (state.key !== live.lastPhaseKey) {
                    if (live.lastPhaseKey) {
                        this.hapticTap?.(state.phase === 'work' ? [30, 60, 30] : [60]);
                        this.playCardioBeep(state.phase === 'work' ? 'work' : 'rest');
                    }
                    live.lastPhaseKey = state.key;
                }
                if (state.phase !== 'done' && state.phaseRemaining <= 3.05 && state.phaseRemaining > 0) {
                    const second = Math.ceil(state.phaseRemaining);
                    if (live.lastCountdownBeep !== `${state.key}-${second}`) {
                        live.lastCountdownBeep = `${state.key}-${second}`;
                        this.playCardioBeep('tick');
                    }
                }
                if (state.phase === 'done') {
                    this.freezeCardioLive(live);
                    // Came back late (background, reload): the settings were
                    // sampled past the end, scale them back to the real block.
                    const actual = live.accumulatedMs / 1000;
                    if (actual > state.totalSeconds && actual > 0) {
                        const ratio = state.totalSeconds / actual;
                        live.primarySum *= ratio;
                        live.secondarySum *= ratio;
                    }
                    live.accumulatedMs = state.totalSeconds * 1000;
                    live.status = 'finishing';
                    live.manual = false;
                    this.hapticTap?.([30, 60, 30, 60, 60]);
                    this.playCardioBeep('done');
                    gamification.triggerConfetti?.('medium');
                    void db.saveCurrentWorkout(this.currentWorkout);
                    this.renderCardioConsole();
                    return;
                }
            } else if (live.mode === 'steady' && !live.goalCelebrated && elapsed >= live.targetMinutes * 60) {
                live.goalCelebrated = true;
                this.hapticTap?.([30, 60, 30, 60, 40]);
                this.playCardioBeep('done');
                gamification.triggerConfetti?.('medium');
                this.showCoachToast('Objectif atteint ! Continue ou termine quand tu veux.', 'hot', '🎯');
                void db.saveCurrentWorkout(this.currentWorkout);
            }
            this.updateCardioConsoleLive();
        },

        updateCardioConsoleLive() {
            const live = this.getCardioLive();
            const consoleEl = document.querySelector('#series-list .cardio-console');
            if (!live || !consoleEl) return;
            const profile = this.getCardioProfile();
            const totals = this.getCardioLiveTotals(live, profile);
            const elapsed = totals.elapsed;
            const set = (key, text) => {
                const el = consoleEl.querySelector(`[data-cc="${key}"]`);
                if (el && el.textContent !== text) el.textContent = text;
            };
            let ratio = 0;
            let phaseText = { idle: 'Prêt', running: 'En cours', paused: 'En pause', finishing: 'Terminé' }[live.status] || '';
            let timeText = this.formatClock(elapsed);
            let targetText = '';
            consoleEl.classList.remove('phase-work', 'phase-rest');

            if (live.mode === 'intervals') {
                const state = this.getCardioIntervalState(live, elapsed);
                if (live.status === 'idle') {
                    timeText = this.formatClock(state.totalSeconds);
                    targetText = `${live.intervals.rounds} tours · ${live.intervals.work}/${live.intervals.rest} s`;
                } else if (live.status !== 'finishing') {
                    phaseText = state.phase === 'work' ? `Effort · tour ${state.round}/${state.rounds}` : `Récup · tour ${state.round}/${state.rounds}`;
                    timeText = this.formatClock(Math.ceil(state.phaseRemaining));
                    targetText = `total ${this.formatClock(elapsed)} / ${this.formatClock(state.totalSeconds)}`;
                    ratio = 1 - (state.phaseRemaining / Math.max(1, state.phaseLength));
                    consoleEl.classList.add(state.phase === 'work' ? 'phase-work' : 'phase-rest');
                } else {
                    targetText = `${live.intervals.rounds} tours bouclés`;
                    ratio = 1;
                }
                consoleEl.querySelectorAll('[data-cc="rounds"] i').forEach((dot, index) => {
                    dot.className = index + 1 < state.round || live.status === 'finishing' ? 'on' : (index + 1 === state.round && live.status !== 'idle' ? `now ${state.phase}` : '');
                });
            } else if (live.mode === 'steady') {
                const goal = live.targetMinutes * 60;
                ratio = goal > 0 ? Math.min(1, elapsed / goal) : 0;
                targetText = elapsed >= goal && goal > 0 ? `objectif ${live.targetMinutes} min ✓` : `objectif ${live.targetMinutes} min`;
                consoleEl.classList.toggle('goal-reached', elapsed >= goal && goal > 0);
            } else {
                ratio = (elapsed % 60) / 60;
                targetText = 'chrono libre';
            }

            set('phase', phaseText);
            set('time', timeText);
            set('target', targetText);
            set('kcal', String(Math.round(totals.kcal)));
            set('distance', totals.distanceKm != null && totals.distanceKm > 0 ? this.formatKm(totals.distanceKm) : '--');
            const avgValue = live.status === 'idle' ? live.primary : totals.averages.primary;
            set('avg', avgValue > 0 ? this.formatCardioValue(avgValue, profile.primary) : '--');
            const ring = consoleEl.querySelector('.cc-ring-fill');
            if (ring) {
                ring.setAttribute('stroke-dashoffset', String(Math.round((1 - ratio) * 1000) / 10));
                ring.style.opacity = ratio > 0.001 ? '1' : '0';
            }
        },


        // A block left running (or paused) when the workout ends is saved
        // rather than silently dropped; under 30 s it is just discarded.
        async confirmFinishSession(...args) {
            const workout = this.currentWorkout;
            if (workout && !this.isFinishingSession) {
                let saved = 0;
                for (const [slotId, slotData] of Object.entries(workout.slots || {})) {
                    const live = slotData?.cardioLive;
                    if (!live || live.status === 'idle') continue;
                    this.freezeCardioLive(live);
                    const slot = await this.getSlotRecord(slotId);
                    const built = slot && this.getCardioElapsedSeconds(live) >= 30 ? this.buildCardioSetFromLive(slot, live) : null;
                    if (built) {
                        slotData.sets = slotData.sets || [];
                        const index = slotData.sets.findIndex(set => !set?.completed);
                        slotData.sets[index >= 0 ? index : slotData.sets.length] = built;
                        saved += 1;
                        const xp = ((await db.getSetting('xp')) ?? 0) + built.xpAwarded;
                        await db.setSetting('xp', xp);
                    }
                    delete slotData.cardioLive;
                }
                if (saved) {
                    this.stopCardioTicker();
                    await db.saveCurrentWorkout(workout);
                    this.showCoachToast(`Bloc cardio en cours enregistré (${saved}).`, 'hot', '❤️');
                }
            }
            return baseConfirmFinishSession.apply(this, args);
        },

        // ---------- Warm-up shortcut at the top of a session ----------
        async renderSlots() {
            await baseRenderSlots.apply(this, arguments);
            await this.renderWarmupShortcut();
        },

        async renderWarmupShortcut() {
            const list = document.getElementById('slots-list');
            const session = this.currentSession;
            if (!list || !session || !this.currentWorkout) return;
            const token = (this.warmupShortcutToken || 0) + 1;
            this.warmupShortcutToken = token;
            const slots = await db.getSlotsBySession(session.id);
            const hasWarmup = slots.some(slot => slot.role === 'warmup');
            const started = Object.values(this.currentWorkout.slots || {}).some(data => (data?.sets || []).some(set => set?.completed));
            const dismissed = (await db.getSetting('warmupShortcutDismissed')) || [];
            // A newer render started while we were reading: let it decide.
            if (token !== this.warmupShortcutToken) return;
            list.querySelectorAll('.session-warmup-cta').forEach(item => item.remove());
            if (hasWarmup || started || dismissed.includes(session.id) || slots.every(slot => this.isCardioSlot(slot))) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'session-warmup-cta';
            wrapper.innerHTML = `
                <button type="button" class="session-warmup-cta-main">
                    <span class="session-warmup-cta-icon" aria-hidden="true">🔥</span>
                    <span>
                        <strong>Ajouter un échauffement</strong>
                        <small>5 min de vélo léger avant de charger</small>
                    </span>
                </button>
                <button type="button" class="session-warmup-cta-close" aria-label="Ne plus proposer pour cette séance">×</button>
            `;
            wrapper.querySelector('.session-warmup-cta-close').addEventListener('click', async () => {
                wrapper.remove();
                await db.setSetting('warmupShortcutDismissed', [...dismissed, session.id]);
            });
            wrapper.querySelector('.session-warmup-cta-main').addEventListener('click', async event => {
                if (this.addingWarmup) return;
                this.addingWarmup = true;
                event.currentTarget.disabled = true;
                try {
                    await this.addWarmupSlot(session.id);
                } finally {
                    this.addingWarmup = false;
                }
            });
            list.prepend(wrapper);
        },

        async addWarmupSlot(sessionId) {
            const slots = await db.getSlotsBySession(sessionId);
            const definition = this.findExerciseLibraryEntry('Vélo assis') || this.inferCustomExerciseTemplate('Vélo assis', { allowCardioInference: true });
            const minOrder = Math.min(0, ...slots.map(slot => Number(slot.order) || 0));
            const slot = this.buildSlotFromExerciseDefinition(definition, sessionId, 0);
            slot.id = `${sessionId}-warmup-${Date.now().toString(36)}`;
            slot.order = minOrder - 1;
            slot.slotId = 'W';
            slot.role = 'warmup';
            slot.sets = 1;
            slot.repsMin = 5;
            slot.repsMax = 8;
            slot.rest = 0;
            await db.put('slots', slot);
            this.hapticTap?.(10);
            this.showCoachToast('Échauffement ajouté en tête de séance (modifiable dans « Mes séances »).', 'hot', '🔥');
            await this.renderSlots();
        },

        // ---------- Sound cues (WebAudio, unlocked on the first tap) ----------
        unlockCardioAudio() {
            try {
                if (!this.cardioAudio) {
                    const Context = window.AudioContext || window.webkitAudioContext;
                    if (!Context) return;
                    this.cardioAudio = new Context();
                }
                if (this.cardioAudio.state === 'suspended') void this.cardioAudio.resume();
            } catch (error) {
                this.cardioAudio = null;
            }
        },

        playCardioBeep(kind = 'tick') {
            const ctx = this.cardioAudio;
            if (!ctx || ctx.state !== 'running') return;
            const tones = {
                tick: [[880, 0.08]],
                start: [[660, 0.1], [990, 0.14]],
                work: [[990, 0.12], [1320, 0.18]],
                rest: [[660, 0.18], [440, 0.2]],
                done: [[784, 0.12], [988, 0.12], [1318, 0.24]]
            }[kind] || [[880, 0.1]];
            let at = ctx.currentTime;
            for (const [frequency, duration] of tones) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = frequency;
                gain.gain.setValueAtTime(0.0001, at);
                gain.gain.exponentialRampToValueAtTime(0.25, at + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
                osc.connect(gain).connect(ctx.destination);
                osc.start(at);
                osc.stop(at + duration + 0.02);
                at += duration * 0.9;
            }
        }
    });
})();
