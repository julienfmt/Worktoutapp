// ===== Fiche perso d'un exercice (onglet Parcours) =====
// Mixin applied to App.prototype in app.js: exercise search card, personal
// stat sheet (records, mastery, progression curve, history) and per-exercise
// medals. Reads setHistory only, never writes training data.

const EXO_MASTERY_TIERS = [
    { id: 'bronze', min: 1, name: 'Bronze', icon: '🥉' },
    { id: 'silver', min: 5, name: 'Argent', icon: '🥈' },
    { id: 'gold', min: 12, name: 'Or', icon: '🥇' },
    { id: 'platinum', min: 25, name: 'Platine', icon: '💠' },
    { id: 'diamond', min: 50, name: 'Diamant', icon: '💎' },
    { id: 'legend', min: 100, name: 'Légende', icon: '👑' }
];

const ExoProfileMixin = {
    // ---------- Data ----------
    getExoGroupKey(set) {
        if (!this.exoKeyCache) this.exoKeyCache = new Map();
        const rawName = String(set?.exerciseName || set?.exerciseId || '').trim();
        const cacheKey = `${set?.exerciseStableId || ''}|${rawName}`;
        if (this.exoKeyCache.has(cacheKey)) return this.exoKeyCache.get(cacheKey);
        const baseName = this.getBaseExerciseHistoryName(rawName);
        const stable = set?.exerciseStableId
            ? String(set.exerciseStableId).replace(/:(left|right)$/i, '')
            : (baseName ? this.getStableExerciseId(baseName) : '');
        const value = { key: stable || this.normalizeExerciseText(baseName), name: baseName };
        this.exoKeyCache.set(cacheKey, value);
        return value;
    },

    getExoSetMode(set, name) {
        if (set?.trackingMode === 'cardio' || set?.trackingMode === 'timed') return set.trackingMode;
        if (Number(set?.durationSeconds) > 0) return 'timed';
        return this.getTrackingMode(name) === 'strength' ? 'strength' : this.getTrackingMode(name);
    },

    buildExoCatalog(setHistory = [], slots = []) {
        const catalog = new Map();
        for (const set of setHistory || []) {
            if (!set?.date) continue;
            const { key, name } = this.getExoGroupKey(set);
            if (!key || !name) continue;
            if (!catalog.has(key)) {
                catalog.set(key, { key, name, sets: [], lastDate: null, workouts: new Set() });
            }
            const entry = catalog.get(key);
            entry.sets.push(set);
            const date = this.getSafeDate(set.date);
            if (date && (!entry.lastDate || date > entry.lastDate)) {
                entry.lastDate = date;
                // The most recent spelling wins (renames keep the same identity).
                entry.name = name;
            }
            entry.workouts.add(set.workoutId || this.getLocalDateKey(set.date));
        }

        for (const slot of slots || []) {
            const name = this.getBaseExerciseHistoryName(this.getSlotExerciseName(slot));
            if (!name) continue;
            const key = this.getStableExerciseId(name) || this.normalizeExerciseText(name);
            if (!catalog.has(key)) {
                catalog.set(key, { key, name, sets: [], lastDate: null, workouts: new Set(), inProgram: true });
            } else {
                catalog.get(key).inProgram = true;
            }
        }

        return Array.from(catalog.values()).map(entry => {
            const sessions = entry.workouts.size;
            const descriptor = this.getExerciseDescriptor(entry.name);
            return {
                key: entry.key,
                name: entry.name,
                sets: entry.sets,
                sessions,
                lastDate: entry.lastDate,
                inProgram: Boolean(entry.inProgram),
                muscleId: descriptor.primaryMuscles?.[0] || descriptor.muscleGroup || '',
                mastery: this.getExoMastery(sessions),
                searchBlob: this.normalizeExerciseText([
                    entry.name,
                    this.getMuscleGroupLabel(descriptor.muscleGroup || ''),
                    descriptor.equipment || ''
                ].join(' '))
            };
        });
    },

    getExoMastery(sessions = 0) {
        const tier = [...EXO_MASTERY_TIERS].reverse().find(item => sessions >= item.min) || null;
        const next = EXO_MASTERY_TIERS.find(item => item.min > sessions) || null;
        const floor = tier?.min || 0;
        return {
            tier,
            next,
            sessions,
            toNext: next ? next.min - sessions : 0,
            progress: next ? Math.min(1, (sessions - floor) / Math.max(1, next.min - floor)) : 1
        };
    },

    getExoCatalog() {
        const source = this.homeChartData || {};
        const signature = `${(source.setHistory || []).length}|${(source.slots || []).length}|${source.setHistory?.[source.setHistory.length - 1]?.id || ''}`;
        if (!this.exoCatalogCache || this.exoCatalogCache.signature !== signature) {
            this.exoCatalogCache = {
                signature,
                items: this.buildExoCatalog(source.setHistory || [], source.slots || [])
            };
        }
        return this.exoCatalogCache.items;
    },

    buildExoProfile(entry) {
        const name = entry.name;
        const sets = [...entry.sets]
            .filter(set => this.getSafeDate(set.date))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const modeVotes = { strength: 0, cardio: 0, timed: 0 };
        sets.forEach(set => { modeVotes[this.getExoSetMode(set, name)] += 1; });
        let mode = sets.length
            ? Object.entries(modeVotes).sort((a, b) => b[1] - a[1])[0][0]
            : (this.getTrackingMode(name) || 'strength');
        const strengthSets = sets.filter(set => this.getExoSetMode(set, name) === 'strength');
        if (mode === 'strength' && strengthSets.length && strengthSets.every(set => !(Number(set.weight) > 0))) {
            mode = 'bodyweight';
        }

        const sessionsMap = new Map();
        for (const set of sets) {
            const id = set.workoutId || this.getLocalDateKey(set.date);
            if (!sessionsMap.has(id)) {
                sessionsMap.set(id, {
                    id,
                    date: set.date,
                    sets: 0,
                    volume: 0,
                    bestE1RM: 0,
                    topSet: null,
                    bestReps: 0,
                    duration: 0,
                    bestDuration: 0,
                    bestMetric: 0,
                    distance: 0,
                    metricKey: set.cardioMetric || null,
                    sides: { left: 0, right: 0 }
                });
            }
            const session = sessionsMap.get(id);
            const weight = Number(set.weight || 0);
            const reps = Number(set.reps || 0);
            const eligible = !this.isSetExcludedFromProgression(set);
            session.sets += 1;

            if (mode === 'cardio' || mode === 'timed') {
                const seconds = this.getSetDurationSeconds(set, name);
                session.duration += seconds;
                if (eligible) session.bestDuration = Math.max(session.bestDuration, seconds);
                const metric = Number(set.cardioMetricValue ?? (mode === 'cardio' ? set.weight : 0) ?? 0);
                if (eligible && metric > 0) session.bestMetric = Math.max(session.bestMetric, metric);
                const distance = Number(set.distanceMeters || 0)
                    || (set.cardioMetric === 'distance-m' ? Number(set.cardioMetricValue || 0) : 0);
                if (distance > 0) session.distance += distance;
                if (mode === 'timed' && weight > 0) session.volume += weight * Math.max(1, seconds / 60);
                continue;
            }

            if (reps <= 0) continue;
            session.volume += weight > 0 ? weight * reps : 0;
            if (!eligible) continue;
            session.bestReps = Math.max(session.bestReps, reps);
            if (weight > 0) {
                const rpe = this.getStatsRpe(set, null) || 8;
                const e1rm = this.calculateE1RM(weight, reps, rpe);
                if (e1rm > session.bestE1RM) {
                    session.bestE1RM = e1rm;
                    session.topSet = { weight, reps, date: set.date };
                }
                const side = this.getHistorySetSide(set);
                if (side) session.sides[side] = Math.max(session.sides[side], e1rm);
            } else if (!session.topSet || reps > session.topSet.reps) {
                session.topSet = { weight: 0, reps, date: set.date };
            }
        }

        const valueOf = session => {
            if (mode === 'strength') return session.bestE1RM;
            if (mode === 'bodyweight') return session.bestReps;
            if (mode === 'cardio') return session.duration;
            return session.bestDuration;
        };
        const sessions = Array.from(sessionsMap.values())
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        let best = 0;
        let recordCount = 0;
        sessions.forEach((session, index) => {
            session.value = valueOf(session);
            session.isRecord = session.value > 0 && (index === 0 ? true : session.value > best * 1.002);
            if (session.isRecord && index > 0) recordCount += 1;
            if (session.value > best) best = session.value;
        });

        const valued = sessions.filter(session => session.value > 0);
        const bestSession = valued.reduce((acc, session) => (!acc || session.value > acc.value ? session : acc), null);
        const heaviest = sessions.reduce((acc, session) => (session.topSet && session.topSet.weight > (acc?.weight || 0) ? session.topSet : acc), null);
        const totalVolume = sessions.reduce((sum, session) => sum + session.volume, 0);
        const totalDuration = sessions.reduce((sum, session) => sum + session.duration, 0);
        const totalDistance = sessions.reduce((sum, session) => sum + session.distance, 0);
        const totalSets = sessions.reduce((sum, session) => sum + session.sets, 0);
        const last = sessions[sessions.length - 1] || null;
        const lastSides = [...sessions].reverse().find(session => session.sides.left > 0 && session.sides.right > 0) || null;

        return {
            name,
            mode,
            sessions,
            valued,
            best: bestSession,
            heaviest,
            recordCount,
            totalVolume,
            totalDuration,
            totalDistance,
            totalSets,
            last,
            lastSides,
            mastery: this.getExoMastery(sessions.length),
            muscleId: entry.muscleId,
            nextGoal: this.buildExoNextGoal(mode, sessions, bestSession, name),
            daysSinceLast: last ? Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000) : null
        };
    },

    buildExoNextGoal(mode, sessions, bestSession, name) {
        if (!bestSession || !sessions.length) return null;
        const last = sessions[sessions.length - 1];
        if (mode === 'strength') {
            const target = bestSession.value * 1.002;
            const baseWeight = last.topSet?.weight || bestSession.topSet?.weight || 0;
            if (!(baseWeight > 0)) return null;
            const increment = this.getExoWeightIncrement(name);
            const lastReps = last.topSet?.reps || 8;
            const options = [0, 1, 2].map(step => {
                const weight = Math.round((baseWeight + increment * step) * 100) / 100;
                for (let reps = 1; reps <= 20; reps += 1) {
                    if (this.calculateE1RM(weight, reps, 8) > target) return { weight, reps };
                }
                return null;
            }).filter(Boolean);
            const pick = options.find(option => option.reps <= Math.max(lastReps + 2, 5)) || options[0];
            if (!pick) return null;
            return {
                label: `${this.formatOneDecimal(pick.weight).replace('.', ',')} kg × ${pick.reps}`,
                hint: 'Avec 2 reps en réserve, ça bat ton record estimé.'
            };
        }
        if (mode === 'bodyweight') {
            return {
                label: `${bestSession.value + 1} reps`,
                hint: 'Une rep de plus que ton meilleur, propre et contrôlée.'
            };
        }
        if (mode === 'timed') {
            const seconds = Math.round(bestSession.value * 1.08 / 5) * 5 || bestSession.value + 5;
            return {
                label: this.formatDurationLabel(Math.max(seconds, bestSession.value + 5)),
                hint: 'Tiens quelques secondes de plus, sans perdre la position.'
            };
        }
        const minutes = Math.round(bestSession.value / 60);
        return {
            label: `${minutes + Math.max(1, Math.round(minutes * 0.1))} min`,
            hint: 'Allonge d’environ 10 % : la régularité compte plus que l’intensité.'
        };
    },

    getExoWeightIncrement(name) {
        const equipment = this.normalizeExerciseText(this.getExerciseDescriptor(name).equipment || name);
        if (/haltere|dumbbell|kettlebell/.test(equipment)) return 2;
        if (/machine|poulie|cable/.test(equipment)) return 2.5;
        return 2.5;
    },

    buildExoMedals(profile) {
        const isLoad = profile.mode === 'strength';
        const medals = [
            { id: 'first', icon: '🎬', name: 'Première fois', target: 1, current: profile.sessions.length, unit: 'séance' },
            { id: 'regular', icon: '📅', name: 'Habitué', target: 10, current: profile.sessions.length, unit: 'séances' },
            { id: 'record', icon: '⚡', name: 'Premier record', target: 1, current: profile.recordCount, unit: 'record' },
            { id: 'hunter', icon: '🎯', name: 'Chasseur', target: 5, current: profile.recordCount, unit: 'records' },
            isLoad
                ? { id: 'tonnage', icon: '🏗️', name: '10 tonnes', target: 10000, current: profile.totalVolume, unit: 'kg', format: value => this.formatTonnage(value) }
                : { id: 'sets', icon: '🔁', name: '100 séries', target: 100, current: profile.totalSets, unit: 'séries' },
            { id: 'veteran', icon: '🛡️', name: 'Vétéran', target: 50, current: profile.sessions.length, unit: 'séances' }
        ];
        return medals.map(medal => ({
            ...medal,
            unlocked: medal.current >= medal.target,
            progress: Math.min(1, medal.current / medal.target)
        }));
    },

    // ---------- Formatting ----------
    formatExoValue(profile, value) {
        if (profile.mode === 'strength') return `${this.formatOneDecimal(value).replace('.', ',')} kg`;
        if (profile.mode === 'bodyweight') return `${Math.round(value)} reps`;
        return this.formatDurationLabel(value, { compact: true });
    },

    formatExoSessionSummary(profile, session) {
        const unit = profile.mode === 'cardio' ? 'bloc' : 'série';
        const count = `${session.sets} ${unit}${session.sets > 1 ? 's' : ''}`;
        if (profile.mode === 'strength' && session.topSet) {
            return `${count} · top ${this.formatOneDecimal(session.topSet.weight).replace('.', ',')} kg × ${session.topSet.reps}`;
        }
        if (profile.mode === 'bodyweight') return `${count} · max ${session.bestReps} reps`;
        if (profile.mode === 'timed') return `${count} · max ${this.formatDurationLabel(session.bestDuration)}`;
        const parts = [this.formatDurationLabel(session.duration)];
        if (session.distance > 0) parts.push(this.formatExoDistance(session.distance));
        if (session.bestMetric > 0) {
            const metric = this.getCardioMetricConfig(profile.name, session.metricKey);
            if (metric.key !== 'distance-m') parts.push(`${metric.label.toLowerCase()} ${this.formatOneDecimal(session.bestMetric)}${metric.unit ? ` ${metric.unit}` : ''}`);
        }
        return parts.join(' · ');
    },

    formatExoDistance(meters) {
        return meters >= 1000
            ? `${(Math.round(meters / 10) / 100).toString().replace('.', ',')} km`
            : `${Math.round(meters)} m`;
    },

    formatExoRelativeDate(date) {
        if (!date) return 'Jamais';
        const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
        if (days <= 0) return "Aujourd'hui";
        if (days === 1) return 'Hier';
        if (days < 7) return `Il y a ${days} j`;
        if (days < 30) return `Il y a ${Math.round(days / 7)} sem.`;
        return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(date));
    },

    // ---------- Search card ----------
    renderExoSearchCard() {
        const container = document.getElementById('exo-search-card');
        if (!container) return;
        if (!container.dataset.ready) {
            container.dataset.ready = '1';
            container.innerHTML = `
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Tes exos</span>
                        <h4>Fiches perso</h4>
                    </div>
                    <span class="pz-chip" id="exo-search-count"></span>
                </div>
                <label class="exo-search-field">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input type="search" id="exo-search-input" placeholder="Cherche un exo : squat, tapis, curl…" autocomplete="off" enterkeyhint="search" aria-label="Chercher un exercice">
                </label>
                <div class="exo-search-results" id="exo-search-results" aria-live="polite"></div>
            `;
            container.querySelector('#exo-search-input').addEventListener('input', event => {
                this.exoSearchQuery = event.target.value;
                this.renderExoSearchResults();
            });
        }
        this.renderExoSearchResults();
    },

    renderExoSearchResults() {
        const list = document.getElementById('exo-search-results');
        if (!list) return;
        const catalog = this.getExoCatalog();
        const count = document.getElementById('exo-search-count');
        const practiced = catalog.filter(item => item.sessions > 0);
        if (count) count.textContent = `${practiced.length} exo${practiced.length > 1 ? 's' : ''}`;

        const query = this.normalizeExerciseText(this.exoSearchQuery || '');
        let items;
        let label = '';
        if (query) {
            const words = query.split(/\s+/).filter(Boolean);
            items = catalog
                .filter(item => words.every(word => item.searchBlob.includes(word)))
                .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
                .slice(0, 20);
        } else {
            items = [...practiced]
                .sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0))
                .slice(0, 5);
            label = items.length ? 'Récemment' : '';
        }

        if (!items.length) {
            list.innerHTML = `<div class="pz-empty">${query
                ? 'Aucun exo trouvé dans ton historique ou ton programme.'
                : 'Termine ta première séance : chaque exo aura sa fiche avec records, maîtrise et progression.'}</div>`;
            return;
        }

        list.innerHTML = `
            ${label ? `<div class="lift-section-label">${label}</div>` : ''}
            ${items.map(item => {
                const tier = item.mastery.tier;
                return `
                    <button type="button" class="exo-row" data-exo-open="${this.escapeHtml(item.key)}">
                        ${item.muscleId ? this.renderMuscleBadge(item.muscleId, { label: '', size: 'md' }) : '<span class="exo-row-icon" aria-hidden="true">🏋️</span>'}
                        <span class="exo-row-main">
                            <strong>${this.escapeHtml(item.name)}</strong>
                            <small>${item.sessions
                                ? `${item.sessions} séance${item.sessions > 1 ? 's' : ''} · ${this.formatExoRelativeDate(item.lastDate)}`
                                : 'Pas encore pratiqué'}</small>
                        </span>
                        <span class="exo-tier ${tier ? `tier-${tier.id}` : 'tier-none'}" title="${tier ? `Maîtrise ${tier.name}` : 'À débloquer'}">${tier ? tier.icon : '🔒'}</span>
                        <svg class="exo-row-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                `;
            }).join('')}
        `;
    },

    findExoCatalogEntry(keyOrName) {
        const catalog = this.getExoCatalog();
        const direct = catalog.find(item => item.key === keyOrName);
        if (direct) return direct;
        const normalized = this.normalizeExerciseText(this.getBaseExerciseHistoryName(keyOrName));
        const stable = this.getStableExerciseId(this.getBaseExerciseHistoryName(keyOrName));
        return catalog.find(item => item.key === stable)
            || catalog.find(item => this.normalizeExerciseText(item.name) === normalized)
            || null;
    },

    // ---------- Sheet ----------
    openExoProfile(keyOrName) {
        const entry = this.findExoCatalogEntry(keyOrName);
        const sheet = document.getElementById('sheet-exo-profile');
        if (!entry || !sheet) return;
        this.exoProfileEntry = entry;
        sheet.classList.add('active');
        this.renderExoProfile();
        const content = sheet.querySelector('.sheet-content');
        if (content) content.scrollTop = 0;
    },

    closeExoProfile() {
        document.getElementById('sheet-exo-profile')?.classList.remove('active');
        this.exoProfileEntry = null;
    },

    renderExoProfile() {
        const body = document.getElementById('exo-profile-body');
        const entry = this.exoProfileEntry;
        if (!body || !entry) return;
        const profile = this.buildExoProfile(entry);
        const tier = profile.mastery.tier;
        const next = profile.mastery.next;
        const modeLabels = {
            strength: 'Charge & reps',
            bodyweight: 'Poids du corps',
            cardio: 'Cardio',
            timed: 'Chrono'
        };

        if (!profile.sessions.length) {
            body.innerHTML = `
                ${this.renderExoHero(profile, modeLabels)}
                <div class="pz-card exo-card">
                    <div class="pz-empty">Pas encore de séries sur cet exo. Fais-le une fois pour débloquer la maîtrise 🥉 Bronze et ta première courbe.</div>
                </div>
                ${this.renderExoTechniqueButton(profile)}
            `;
            return;
        }

        const tiles = this.buildExoTiles(profile);
        const medals = this.buildExoMedals(profile);
        const comeback = profile.daysSinceLast != null && profile.daysSinceLast >= 14
            ? `<div class="exo-comeback"><span aria-hidden="true">👋</span><p>Ça fait ${profile.daysSinceLast >= 28 ? `${Math.round(profile.daysSinceLast / 7)} semaines` : `${profile.daysSinceLast} jours`}. Reprends un cran en dessous de ton record : ton corps se souvient vite.</p></div>`
            : '';

        body.innerHTML = `
            ${this.renderExoHero(profile, modeLabels, { tier, next })}
            ${comeback}
            <div class="exo-tiles">
                ${tiles.map(tile => `
                    <div class="exo-tile ${tile.gold ? 'is-gold' : ''}">
                        <span>${tile.label}</span>
                        <strong>${tile.value}</strong>
                        ${tile.sub ? `<small>${tile.sub}</small>` : ''}
                    </div>
                `).join('')}
            </div>
            ${profile.nextGoal ? `
                <div class="exo-quest">
                    <span class="exo-quest-icon" aria-hidden="true">🎯</span>
                    <div>
                        <span class="exo-quest-kicker">Prochain record</span>
                        <strong>${this.escapeHtml(profile.nextGoal.label)}</strong>
                        <small>${this.escapeHtml(profile.nextGoal.hint)}</small>
                    </div>
                </div>
            ` : ''}
            ${this.renderExoChart(profile)}
            ${this.renderExoBalance(profile)}
            <div class="pz-card exo-card">
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Médailles de l'exo</span>
                        <h4>${medals.filter(medal => medal.unlocked).length}/${medals.length} débloquées</h4>
                    </div>
                </div>
                <div class="exo-medals">
                    ${medals.map(medal => `
                        <div class="exo-medal ${medal.unlocked ? 'is-unlocked' : ''}" title="${this.escapeHtml(`${medal.name} : ${medal.format ? medal.format(medal.target) : `${medal.target} ${medal.unit}`}`)}">
                            <span class="exo-medal-icon" aria-hidden="true">${medal.icon}</span>
                            <strong>${this.escapeHtml(medal.name)}</strong>
                            ${medal.unlocked ? '<small>Débloquée</small>' : `
                                <div class="quest-track"><span style="width: ${Math.round(medal.progress * 100)}%"></span></div>
                                <small>${medal.format ? medal.format(medal.current) : Math.floor(medal.current)} / ${medal.format ? medal.format(medal.target) : medal.target}</small>
                            `}
                        </div>
                    `).join('')}
                </div>
            </div>
            ${this.renderExoHistory(profile)}
            ${this.renderExoTechniqueButton(profile)}
        `;
    },

    renderExoHero(profile, modeLabels, { tier = profile.mastery.tier, next = profile.mastery.next } = {}) {
        return `
            <div class="exo-hero">
                <div class="exo-hero-top">
                    <span class="exo-hero-tier ${tier ? `tier-${tier.id}` : 'tier-none'}" aria-hidden="true">${tier ? tier.icon : '🔒'}</span>
                    <div class="exo-hero-identity">
                        <span class="exo-hero-kicker">${modeLabels[profile.mode] || 'Exercice'}${tier ? ` · Maîtrise ${tier.name}` : ''}</span>
                        <h2>${this.escapeHtml(profile.name)}</h2>
                        ${profile.muscleId ? this.renderMuscleBadge(profile.muscleId) : ''}
                    </div>
                </div>
                <div class="exo-mastery">
                    <div class="player-xp-row">
                        <span>${next ? `Prochain palier : ${next.icon} ${next.name}` : 'Maîtrise maximale atteinte'}</span>
                        <strong>${next ? `${profile.mastery.toNext} séance${profile.mastery.toNext > 1 ? 's' : ''}` : '👑'}</strong>
                    </div>
                    <div class="player-xp-track"><span style="width: ${Math.round(profile.mastery.progress * 100)}%"></span></div>
                </div>
            </div>
        `;
    },

    buildExoTiles(profile) {
        const best = profile.best;
        const bestDate = best ? this.formatExoRelativeDate(best.date) : '';
        if (profile.mode === 'strength') {
            return [
                { label: 'Record e1RM', value: best ? this.formatExoValue(profile, best.value) : '--', sub: bestDate, gold: true },
                { label: 'Plus lourd', value: profile.heaviest ? `${this.formatOneDecimal(profile.heaviest.weight).replace('.', ',')} kg` : '--', sub: profile.heaviest ? `× ${profile.heaviest.reps} reps` : '' },
                { label: 'Tonnage', value: this.formatTonnage(profile.totalVolume), sub: `${profile.sessions.length} séance${profile.sessions.length > 1 ? 's' : ''}` }
            ];
        }
        if (profile.mode === 'bodyweight') {
            return [
                { label: 'Record', value: best ? this.formatExoValue(profile, best.value) : '--', sub: bestDate, gold: true },
                { label: 'Séries', value: String(profile.totalSets), sub: 'au total' },
                { label: 'Séances', value: String(profile.sessions.length), sub: this.formatExoRelativeDate(profile.last?.date) }
            ];
        }
        if (profile.mode === 'timed') {
            return [
                { label: 'Plus long', value: best ? this.formatExoValue(profile, best.value) : '--', sub: bestDate, gold: true },
                { label: 'Temps cumulé', value: this.formatDurationLabel(profile.totalDuration, { compact: true }), sub: `${profile.totalSets} séries` },
                { label: 'Séances', value: String(profile.sessions.length), sub: this.formatExoRelativeDate(profile.last?.date) }
            ];
        }
        return [
            { label: 'Plus long', value: best ? this.formatExoValue(profile, best.value) : '--', sub: bestDate, gold: true },
            profile.totalDistance > 0
                ? { label: 'Distance', value: this.formatExoDistance(profile.totalDistance), sub: 'au total' }
                : { label: 'Temps cumulé', value: `${Math.round(profile.totalDuration / 60)} min`, sub: 'au total' },
            { label: 'Séances', value: String(profile.sessions.length), sub: this.formatExoRelativeDate(profile.last?.date) }
        ];
    },

    renderExoChart(profile) {
        const points = profile.valued.slice(-12);
        const titles = {
            strength: 'e1RM estimé',
            bodyweight: 'Meilleure série (reps)',
            timed: 'Meilleur maintien',
            cardio: 'Durée par séance'
        };
        if (points.length < 2) {
            return `
                <div class="pz-card exo-card">
                    <div class="pz-card-head"><div><span class="pz-kicker">Progression</span><h4>${titles[profile.mode]}</h4></div></div>
                    <div class="pz-empty">Encore ${2 - points.length} séance pour tracer ta courbe.</div>
                </div>
            `;
        }
        const width = 320;
        const height = 120;
        const pad = { top: 14, right: 12, bottom: 8, left: 12 };
        const values = points.map(point => point.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = Math.max(max - min, max * 0.04, 0.5);
        const lo = min - span * 0.15;
        const hi = max + span * 0.15;
        const coords = points.map((point, index) => ({
            x: pad.left + (index / (points.length - 1)) * (width - pad.left - pad.right),
            y: pad.top + (1 - (point.value - lo) / (hi - lo)) * (height - pad.top - pad.bottom),
            point
        }));
        const line = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
        const area = `${pad.left},${height} ${line} ${(width - pad.right).toFixed(1)},${height}`;
        const first = points[0].value;
        const lastValue = points[points.length - 1].value;
        const delta = lastValue - first;
        const deltaText = profile.mode === 'strength'
            ? `${delta >= 0 ? '+' : ''}${this.formatOneDecimal(delta).replace('.', ',')} kg`
            : profile.mode === 'bodyweight'
                ? `${delta >= 0 ? '+' : ''}${Math.round(delta)} reps`
                : `${delta >= 0 ? '+' : '−'}${this.formatDurationLabel(Math.abs(delta), { compact: true })}`;
        const dateFmt = date => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(date));

        return `
            <div class="pz-card exo-card">
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Progression · ${points.length} séances</span>
                        <h4>${titles[profile.mode]}</h4>
                    </div>
                    <span class="pz-chip ${delta >= 0 ? 'is-up' : 'is-down'}">${deltaText}</span>
                </div>
                <svg class="exo-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${this.escapeHtml(`${titles[profile.mode]} : de ${this.formatExoValue(profile, first)} à ${this.formatExoValue(profile, lastValue)}`)}">
                    <defs>
                        <linearGradient id="exoChartFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.28"/>
                            <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <polygon points="${area}" fill="url(#exoChartFill)"/>
                    <polyline points="${line}" fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
                </svg>
                <div class="exo-chart-dots">
                    ${coords.map(c => `<i class="${c.point.isRecord ? 'is-record' : ''}" style="left: ${(c.x / width * 100).toFixed(2)}%; top: ${(c.y / height * 100).toFixed(2)}%" title="${this.escapeHtml(`${dateFmt(c.point.date)} : ${this.formatExoValue(profile, c.point.value)}`)}"></i>`).join('')}
                </div>
                <div class="xstats-axis exo-chart-axis">
                    <span>${dateFmt(points[0].date)}</span>
                    <span><i class="exo-legend-record"></i> record</span>
                    <span>${dateFmt(points[points.length - 1].date)}</span>
                </div>
            </div>
        `;
    },

    renderExoBalance(profile) {
        const session = profile.lastSides;
        if (!session) return '';
        const { left, right } = session.sides;
        const strongest = Math.max(left, right);
        const gap = strongest > 0 ? Math.abs(left - right) / strongest * 100 : 0;
        const verdict = gap <= 5 ? 'Équilibré 👌' : gap <= 10 ? 'Léger écart' : 'Écart à travailler';
        return `
            <div class="pz-card exo-card">
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Gauche / droite · dernière séance</span>
                        <h4>${verdict}</h4>
                    </div>
                    <span class="pz-chip ${gap <= 5 ? 'is-up' : 'is-down'}">${Math.round(gap)} %</span>
                </div>
                <div class="exo-balance">
                    <div class="exo-balance-side side-left"><span>G</span><div class="exo-balance-track"><i style="width: ${Math.round(left / strongest * 100)}%"></i></div><strong>${Math.round(left)} kg</strong></div>
                    <div class="exo-balance-side side-right"><span>D</span><div class="exo-balance-track"><i style="width: ${Math.round(right / strongest * 100)}%"></i></div><strong>${Math.round(right)} kg</strong></div>
                </div>
            </div>
        `;
    },

    renderExoHistory(profile) {
        const rows = [...profile.sessions].reverse().slice(0, 10);
        const dateFmt = date => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(date));
        return `
            <div class="pz-card exo-card">
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Historique</span>
                        <h4>${profile.sessions.length} séance${profile.sessions.length > 1 ? 's' : ''}</h4>
                    </div>
                    ${profile.recordCount ? `<span class="pz-chip is-gold">⚡ ${profile.recordCount} record${profile.recordCount > 1 ? 's' : ''}</span>` : ''}
                </div>
                <div class="lift-list">
                    ${rows.map((session, index) => {
                        const previous = rows[index + 1];
                        let delta = '';
                        if (previous && previous.value > 0 && session.value > 0) {
                            const diff = session.value - previous.value;
                            const pct = diff / previous.value * 100;
                            if (Math.abs(pct) >= 0.5) {
                                delta = `<span class="lift-delta ${diff > 0 ? 'is-up' : 'is-down'}">${this.formatPercentDelta(pct)}</span>`;
                            } else {
                                delta = '<span class="lift-delta is-flat">=</span>';
                            }
                        }
                        return `
                            <div class="lift-row exo-history-row">
                                <div class="lift-row-main">
                                    <strong>${this.escapeHtml(dateFmt(session.date))}${session.isRecord && index < rows.length - 1 ? ' <span class="exo-pr" title="Record">⚡</span>' : ''}</strong>
                                    <small>${this.escapeHtml(this.formatExoSessionSummary(profile, session))}</small>
                                </div>
                                ${delta}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    renderExoTechniqueButton(profile) {
        return `
            <button type="button" class="btn btn-secondary exo-technique-btn" data-exo-technique="${this.escapeHtml(profile.name)}">
                <span aria-hidden="true">📖</span> Voir la fiche technique
            </button>
        `;
    },

    async openTechniqueForExercise(name) {
        const sheet = document.getElementById('sheet-technique');
        if (!sheet || !name) return;
        const pseudoSlot = { name, activeExercise: name };
        this.techniqueState = { slots: [pseudoSlot], index: 0, searching: false, query: '' };
        sheet.classList.add('active');
        await this.renderTechniqueSheet();
    },

    bindExoProfileEvents() {
        document.getElementById('stats-section')?.addEventListener('click', event => {
            const opener = event.target.closest('[data-exo-open]');
            if (opener) this.openExoProfile(opener.dataset.exoOpen);
        });
        const sheet = document.getElementById('sheet-exo-profile');
        sheet?.addEventListener('click', event => {
            if (event.target.classList.contains('sheet-backdrop') || event.target.closest('#btn-close-exo-profile')) {
                this.closeExoProfile();
                return;
            }
            const technique = event.target.closest('[data-exo-technique]');
            if (technique) this.openTechniqueForExercise(technique.dataset.exoTechnique);
        });
    }
};
