// ===== App shell: three swipeable home panes (Accueil / Parcours / Stats) =====
// The panes live side by side in a horizontal scroll-snap container, so the
// swipe is native (momentum, rubber band, axis locking) and the tab bar only
// mirrors the scroll position. Loaded after app.js and before journey.js.
(() => {
    const HOME_TABS = ['session', 'progress', 'stats'];

    const baseShowScreen = App.prototype.showScreen;
    const baseBindEvents = App.prototype.bindEvents;
    const baseRenderStats = App.prototype.renderStats;

    Object.assign(App.prototype, {
        bindEvents() {
            baseBindEvents.call(this);
            this.initHomePager();
        },

        showScreen(screenId) {
            baseShowScreen.call(this, screenId);
            // A hidden pager loses its scroll offset: put the active pane back.
            if (screenId === 'home') {
                requestAnimationFrame(() => this.alignHomePager());
            }
        },

        initHomePager() {
            const pager = document.getElementById('home-pager');
            if (!pager || this.homePagerReady) return;
            this.homePagerReady = true;
            this.activeHomeTab = this.activeHomeTab || 'session';

            let settleTimer = null;
            pager.addEventListener('scroll', () => {
                const width = pager.clientWidth || 1;
                const position = pager.scrollLeft / width;
                document.querySelector('#screen-home .tabbar')?.style.setProperty('--tab-pos', position.toFixed(3));
                const tab = HOME_TABS[Math.max(0, Math.min(HOME_TABS.length - 1, Math.round(position)))];
                if (tab !== this.visibleHomeTab) {
                    this.visibleHomeTab = tab;
                    this.syncHomeTabbar(tab);
                }
                clearTimeout(settleTimer);
                settleTimer = setTimeout(() => this.onHomePaneSettled(tab), 140);
            }, { passive: true });

            window.addEventListener('resize', () => this.alignHomePager());
            this.syncHomeTabbar(this.activeHomeTab);
        },

        alignHomePager() {
            const pager = document.getElementById('home-pager');
            if (!pager) return;
            const index = Math.max(0, HOME_TABS.indexOf(this.activeHomeTab || 'session'));
            pager.scrollTo({ left: index * pager.clientWidth, behavior: 'auto' });
            this.syncHomeTabbar(this.activeHomeTab || 'session');
        },

        setHomeTab(tab = 'session') {
            const nextTab = HOME_TABS.includes(tab) ? tab : 'session';
            const pager = document.getElementById('home-pager');
            const pane = pager?.children[HOME_TABS.indexOf(nextTab)];
            // Tapping the tab you are on scrolls it back to the top.
            if (nextTab === this.activeHomeTab && this.visibleHomeTab === nextTab) {
                pane?.querySelector('.pane-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            if (!pager) return;
            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            pager.scrollTo({ left: HOME_TABS.indexOf(nextTab) * pager.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
            this.syncHomeTabbar(nextTab);
        },

        syncHomeTabbar(tab) {
            const index = HOME_TABS.indexOf(tab);
            const tabbar = document.querySelector('#screen-home .tabbar');
            tabbar?.style.setProperty('--tab-index', String(index));
            document.querySelectorAll('.tabbar [data-home-tab]').forEach(button => {
                const active = button.dataset.homeTab === tab;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', String(active));
            });
            document.querySelectorAll('#home-pager .home-pane').forEach((pane, paneIndex) => {
                pane.toggleAttribute('inert', paneIndex !== index && this.homePaneSettledOnce === true);
                pane.setAttribute('aria-hidden', String(paneIndex !== index));
            });
        },

        onHomePaneSettled(tab) {
            const changed = tab !== this.activeHomeTab;
            this.activeHomeTab = tab;
            this.homePaneSettledOnce = true;
            this.syncHomeTabbar(tab);
            if (!changed) return;
            this.hapticTap?.(8);
            // Bars and gauges replay their fill animation when a pane opens.
            if (tab === 'progress' && this.progressContext) {
                this.renderPlayerCard();
                this.renderJourneyPath?.({ scrollToCurrent: true });
            } else if (tab === 'stats' && this.progressContext) {
                this.renderActivityCard();
                this.renderCardioStatsCard();
            } else if (tab === 'session' && this.progressContext) {
                this.renderPhysiqueCard();
            }
        },

        async renderStats(homeData = null) {
            await baseRenderStats.call(this, homeData);
            const snapshotData = await this.resolveHomeDataSnapshot(homeData);
            this.gameMetrics = this.buildGameMetrics(snapshotData);
            this.renderStatsOverview();
            this.renderCardioStatsCard();
            this.renderJourneyPath?.();
            this.renderJourneyTeaser?.();
        },

        // ---------- Long-term metrics shared by stats, trophies and the path ----------
        getSetCardioDetails(set, slot = null) {
            const isCardio = set?.trackingMode === 'cardio' || (!set?.trackingMode && slot && this.isCardioSlot(slot));
            if (!isCardio) return null;
            const seconds = this.getSetDurationSeconds(set, slot || { trackingMode: 'cardio' });
            const details = set.cardio || {};
            let distanceKm = Number(details.distanceKm) || 0;
            const metric = set.cardioMetric || slot?.cardioMetric;
            const value = Number(set.cardioMetricValue ?? 0);
            if (!distanceKm && metric === 'speed' && value > 0) distanceKm = value * (seconds / 3600);
            if (!distanceKm && metric === 'distance-m' && value > 0) distanceKm = value / 1000;
            return {
                seconds,
                distanceKm,
                calories: Number(details.calories) || 0,
                warmup: details.role === 'warmup'
            };
        },

        buildGameMetrics(snapshotData) {
            const { history = [], setHistory = [], slots = [] } = snapshotData || {};
            const slotMap = new Map(slots.map(slot => [String(slot.id), slot]));
            const now = new Date();
            const weekStart = this.getWeekStart(now);
            const metrics = {
                totalMinutes: 0,
                cardioMinutes: 0,
                cardioDistanceKm: 0,
                cardioCalories: 0,
                cardioBlocks: 0,
                cardioWorkouts: 0,
                cardioMinutesWeek: 0,
                totalReps: 0,
                exercises: 0,
                muscles: 0,
                earlyWorkouts: 0,
                lateWorkouts: 0,
                weekendWorkouts: 0,
                bestWeekSessions: 0,
                activeMonths: 0,
                comebacks: 0,
                longestSessionMinutes: 0,
                cardioWeekly: []
            };
            const exerciseIds = new Set();
            const muscleIds = new Set();
            const cardioWorkoutIds = new Set();
            const cardioByWeek = new Map();

            for (const set of setHistory) {
                const slot = slotMap.get(String(set.slotId)) || null;
                const cardio = this.getSetCardioDetails(set, slot);
                if (cardio) {
                    const minutes = cardio.seconds / 60;
                    metrics.cardioMinutes += minutes;
                    metrics.cardioDistanceKm += cardio.distanceKm;
                    metrics.cardioCalories += cardio.calories;
                    metrics.cardioBlocks += 1;
                    if (set.workoutId != null) cardioWorkoutIds.add(set.workoutId);
                    const date = this.getSafeDate(set.date);
                    if (date) {
                        const key = this.getLocalDateKey(this.getWeekStart(date));
                        cardioByWeek.set(key, (cardioByWeek.get(key) || 0) + minutes);
                        if (date >= weekStart) metrics.cardioMinutesWeek += minutes;
                    }
                    continue;
                }
                if (Number(set.reps) > 0 && set.trackingMode !== 'timed') metrics.totalReps += Number(set.reps);
                const name = String(set.exerciseFamilyId || set.exerciseStableId || set.exerciseId || '').trim();
                if (name) exerciseIds.add(name);
                if (slot?.muscleGroup) muscleIds.add(slot.muscleGroup);
            }
            metrics.cardioWorkouts = cardioWorkoutIds.size;
            metrics.exercises = exerciseIds.size;
            metrics.muscles = muscleIds.size;

            const sorted = [...history]
                .map(workout => ({ workout, date: this.getSafeDate(workout.date) }))
                .filter(item => item.date)
                .sort((a, b) => a.date - b.date);
            const weekCounts = new Map();
            const months = new Set();
            let previous = null;
            for (const { workout, date } of sorted) {
                const minutes = Math.max(0, Number(workout.duration) || 0) / 60000;
                // Sessions left open for hours would inflate the total: cap them.
                const capped = Math.min(minutes, 180);
                metrics.totalMinutes += capped;
                metrics.longestSessionMinutes = Math.max(metrics.longestSessionMinutes, capped);
                const startHour = new Date(date.getTime() - (minutes * 60000)).getHours();
                if (startHour < 8) metrics.earlyWorkouts += 1;
                if (startHour >= 20) metrics.lateWorkouts += 1;
                if (date.getDay() === 0 || date.getDay() === 6) metrics.weekendWorkouts += 1;
                const weekKey = this.getLocalDateKey(this.getWeekStart(date));
                weekCounts.set(weekKey, (weekCounts.get(weekKey) || 0) + 1);
                months.add(`${date.getFullYear()}-${date.getMonth()}`);
                if (previous && (date - previous) >= 14 * 86400000) metrics.comebacks += 1;
                previous = date;
            }
            metrics.bestWeekSessions = Math.max(0, ...weekCounts.values());
            metrics.activeMonths = months.size;
            metrics.cardioWeekly = this.getRecentWeeklyBuckets(8, start => cardioByWeek.get(this.getLocalDateKey(start)) || 0);
            return metrics;
        },

        formatHoursMinutes(totalMinutes) {
            const minutes = Math.max(0, Math.round(totalMinutes || 0));
            if (minutes < 60) return `${minutes} min`;
            const hours = Math.floor(minutes / 60);
            const rest = minutes % 60;
            return hours >= 100 || !rest ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
        },

        formatKm(km) {
            const value = Number(km) || 0;
            const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
            return `${String(rounded).replace('.', ',')} km`;
        },

        renderStatsOverview() {
            const container = document.getElementById('stats-overview');
            const ctx = this.progressContext;
            const metrics = this.gameMetrics;
            if (!container || !ctx || !metrics) return;
            const { snapshot, bestStreak } = ctx;
            const tiles = [
                { icon: '🏋️', value: snapshot.totalWorkouts, label: 'séances' },
                { icon: '⏱️', value: this.formatHoursMinutes(metrics.totalMinutes), label: 'à t’entraîner' },
                { icon: '🧱', value: this.formatTonnage(snapshot.totalLoadedVolume), label: 'soulevés' },
                { icon: '🏆', value: snapshot.prCountTotal || 0, label: 'records', tone: 'gold' },
                { icon: '🔥', value: `${bestStreak || 0} sem.`, label: 'meilleure série' },
                { icon: '🏃', value: this.formatHoursMinutes(metrics.cardioMinutes), label: 'de cardio' }
            ];
            container.innerHTML = `
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Depuis le début</span>
                        <h4>Ton total</h4>
                    </div>
                    <span class="pz-chip">${snapshot.thisMonthWorkouts} ce mois</span>
                </div>
                <div class="overview-grid">
                    ${tiles.map(tile => `
                        <div class="overview-tile ${tile.tone ? `is-${tile.tone}` : ''}">
                            <span class="overview-icon" aria-hidden="true">${tile.icon}</span>
                            <strong>${this.escapeHtml(String(tile.value))}</strong>
                            <span>${this.escapeHtml(tile.label)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        },

        // Home version of the muscle map: one tile per muscle with its weekly
        // growth zone (MEV → MAV), so the target range is visible at a glance.
        renderPhysiqueCard() {
            const container = document.getElementById('physique-card');
            if (!container || !this.progressContext) return;
            const { muscles } = this.progressContext;
            const head = (title, chip = '') => `
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Muscles · cette semaine</span>
                        <h4>${title}</h4>
                    </div>
                    ${chip}
                </div>
            `;

            if (!muscles.length) {
                container.innerHTML = `${head('Ta carte musculaire')}
                    <div class="pz-empty">Ajoute des exercices avec un groupe musculaire pour suivre combien de séries chaque muscle reçoit.</div>`;
                return;
            }

            const growing = muscles.filter(row => ['grow', 'intense'].includes(row.zone.id)).length;
            const expanded = Boolean(this.physiqueExpanded);
            const limit = 6;
            const visible = expanded ? muscles : muscles.slice(0, limit);
            container.innerHTML = `
                ${head(`${growing}/${muscles.length} en zone de croissance`, '<span class="pz-chip">séries efficaces</span>')}
                <div class="physique-grid">
                    ${visible.map(row => {
                        const scale = row.landmarks.MRV * 1.1;
                        const pct = value => Math.min(100, (value / scale) * 100);
                        const target = `${row.landmarks.MEV}-${row.landmarks.MAV}`;
                        return `
                            <div class="physique-tile zone-${row.zone.id}" style="--muscle: ${getMuscleTheme(row.muscleId).color}">
                                <div class="physique-tile-top">
                                    ${this.renderMuscleBadge(row.muscleId, { label: '', size: 'md' })}
                                    <span class="physique-tile-name">${this.escapeHtml(row.name)}</span>
                                    <span class="physique-tile-value">${String(row.volume).replace('.', ',')}<small>/${target}</small></span>
                                </div>
                                <div class="physique-meter" aria-label="${this.escapeHtml(`${row.name} : ${row.volume} séries sur ${target} visées, ${row.zone.label}`)}">
                                    <span class="physique-zone" style="left: ${pct(row.landmarks.MEV)}%; width: ${pct(row.landmarks.MAV) - pct(row.landmarks.MEV)}%"></span>
                                    <span class="physique-fill" style="width: ${pct(row.volume)}%"></span>
                                </div>
                                <span class="physique-tile-zone">${this.escapeHtml(row.zone.label)}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${muscles.length > limit ? `<button type="button" class="pz-more physique-more" data-physique-toggle>${expanded ? 'Réduire' : `Voir les ${muscles.length} muscles`}</button>` : ''}
                <div class="physique-legend"><i></i>Zone de croissance visée par semaine</div>
            `;
            container.querySelector('[data-physique-toggle]')?.addEventListener('click', () => {
                this.physiqueExpanded = !this.physiqueExpanded;
                this.renderPhysiqueCard();
            });
        },

        renderCardioStatsCard() {
            const container = document.getElementById('cardio-card');
            const metrics = this.gameMetrics;
            if (!container || !metrics) return;
            const weekly = metrics.cardioWeekly || [];
            const max = Math.max(1, ...weekly.map(week => week.value));
            const target = 150; // OMS : 150 min d'activité modérée par semaine
            const weekMinutes = Math.round(metrics.cardioMinutesWeek);
            const weekPct = Math.min(100, Math.round((weekMinutes / target) * 100));

            if (!metrics.cardioBlocks) {
                container.innerHTML = `
                    <div class="pz-card-head">
                        <div>
                            <span class="pz-kicker">Cardio</span>
                            <h4>Le cœur aussi se muscle</h4>
                        </div>
                        <span class="pz-chip">❤️</span>
                    </div>
                    <div class="pz-empty">Ajoute un bloc de tapis, vélo ou rameur à une séance : minutes, distance et calories apparaîtront ici.</div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="pz-card-head">
                    <div>
                        <span class="pz-kicker">Cardio · cette semaine</span>
                        <h4>${weekMinutes} / ${target} min</h4>
                    </div>
                    <span class="pz-chip ${weekPct >= 100 ? 'is-up' : ''}">${weekPct >= 100 ? 'Objectif santé ✓' : `${weekPct} %`}</span>
                </div>
                <div class="cardio-week-track" aria-hidden="true"><span style="width: ${weekPct}%"></span></div>
                <div class="cardio-bars" role="img" aria-label="Minutes de cardio des 8 dernières semaines">
                    ${weekly.map((week, index) => {
                        const height = week.value > 0 ? Math.max(8, Math.round((week.value / max) * 100)) : 0;
                        const isCurrent = index === weekly.length - 1;
                        return `
                            <div class="cardio-bar-col ${isCurrent ? 'is-current' : ''}">
                                <span class="cardio-bar-value">${week.value > 0 ? Math.round(week.value) : ''}</span>
                                <div class="cardio-bar"><span style="height: ${height}%"></span></div>
                                <span class="cardio-bar-label">${isCurrent ? 'Actu.' : `${week.start.getDate()}/${week.start.getMonth() + 1}`}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="kpi-grid">
                    <div class="kpi"><strong>${this.formatHoursMinutes(metrics.cardioMinutes)}</strong><span>au total</span></div>
                    <div class="kpi"><strong>${this.formatKm(metrics.cardioDistanceKm)}</strong><span>parcourus</span></div>
                    <div class="kpi"><strong>${Math.round(metrics.cardioCalories).toLocaleString('fr-FR')}</strong><span>kcal estimées</span></div>
                    <div class="kpi"><strong>${metrics.cardioBlocks}</strong><span>blocs cardio</span></div>
                </div>
            `;
        }
    });
})();
