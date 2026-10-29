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
            this.initSheetChrome();
            this.initHaptics();
            db.getSetting('themeChoice').then(choice => this.applyTheme(choice || 'auto')).catch(() => {});
            window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
                if ((this.themeChoice || 'auto') === 'auto') this.applyTheme('auto');
            });
        },

        showScreen(screenId) {
            baseShowScreen.call(this, screenId);
            // A hidden pager loses its scroll offset: put the active pane back.
            if (screenId === 'home') {
                requestAnimationFrame(() => this.alignHomePager());
            }
        },

        // Every bottom sheet gets the same way out: a close button that stays
        // in view while the content scrolls, a swipe down from the top, and
        // Escape. They all go through the sheet's own backdrop handler so each
        // sheet keeps its cleanup (settled promises, saved state...).
        initSheetChrome() {
            if (this.sheetChromeReady) return;
            this.sheetChromeReady = true;
            const OWN_CLOSE = '.sheet-close, .exercise-insights-close, [data-sf="close"], [data-tools="close"], [data-paywall="close"]';
            const closeSheet = (sheet) => sheet?.querySelector(':scope > .sheet-backdrop')?.click();
            const topSheet = () => [...document.querySelectorAll('.bottom-sheet.active')].pop();

            const decorate = () => {
                document.querySelectorAll('.bottom-sheet.active > .sheet-content').forEach((content) => {
                    if (content.querySelector(OWN_CLOSE)) return;
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'sheet-close';
                    button.setAttribute('aria-label', 'Fermer');
                    button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
                    content.prepend(button);
                });
            };
            // Sheets are opened from many modules and some re-render their
            // content: re-check whenever a sheet opens or its content changes.
            let queued = false;
            new MutationObserver(() => {
                if (queued) return;
                queued = true;
                requestAnimationFrame(() => {
                    queued = false;
                    decorate();
                });
            }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

            document.addEventListener('click', (event) => {
                const button = event.target.closest('.sheet-close');
                if (button) closeSheet(button.closest('.bottom-sheet'));
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') closeSheet(topSheet());
            });

            // Swipe down to close, only when the content is scrolled to the top.
            let drag = null;
            document.addEventListener('touchstart', (event) => {
                const content = event.target.closest?.('.bottom-sheet.active > .sheet-content');
                if (!content || content.scrollTop > 0 || event.target.closest('input, textarea, select')) return;
                drag = { content, startY: event.touches[0].clientY, dy: 0 };
            }, { passive: true });
            document.addEventListener('touchmove', (event) => {
                if (!drag) return;
                const dy = event.touches[0].clientY - drag.startY;
                if (dy <= 0 || drag.content.scrollTop > 0) {
                    if (drag.dy) drag.content.style.transform = '';
                    drag.dy = 0;
                    return;
                }
                if ((dy > 110) !== (drag.dy > 110)) this.haptic('light');
                drag.dy = dy;
                drag.content.style.transition = 'none';
                drag.content.style.transform = `translateY(${dy}px)`;
            }, { passive: true });
            const endDrag = () => {
                if (!drag) return;
                const { content, dy } = drag;
                drag = null;
                content.style.transition = 'transform 0.22s ease';
                if (dy > 110) {
                    content.style.transform = 'translateY(100%)';
                    setTimeout(() => {
                        closeSheet(content.closest('.bottom-sheet'));
                        content.style.transform = '';
                        content.style.transition = '';
                    }, 180);
                } else {
                    content.style.transform = '';
                    setTimeout(() => { content.style.transition = ''; }, 220);
                }
            };
            document.addEventListener('touchend', endDrag);
            document.addEventListener('touchcancel', endDrag);
        },

        // A light tap under the finger on everything pressable, a firmer one
        // on the main actions. Moments that matter (set done, record, rest
        // over, wheels) call this.haptic() with their own kind.
        initHaptics() {
            if (this.hapticsReady) return;
            this.hapticsReady = true;
            db.getSetting('hapticsEnabled').then((enabled) => { this.hapticsDisabled = enabled === false; }).catch(() => {});
            const PRESSABLE = 'button, .btn, [role="button"], [role="tab"], [role="radio"], summary, a[href], .toggle-switch, .ob-option, .ob-chip, .slot-card, .exo-action';
            const STRONG = '.btn-primary, .btn-large, .btn-launch, .btn-launch-superset, .ob-cta, .next-quest-start';
            document.addEventListener('pointerdown', (event) => {
                if (event.button > 0) return;
                const target = event.target.closest?.(PRESSABLE);
                if (!target || target.disabled || target.closest('.set-wheel, [data-no-haptic]')) return;
                this.haptic(target.matches(STRONG) ? 'medium' : 'light');
            }, { passive: true });
            // Sliders tick like a wheel.
            document.addEventListener('input', (event) => {
                if (event.target.matches?.('input[type="range"]')) this.haptic('selection');
            }, { passive: true });
            // Switches and choices clicked through their label.
            document.addEventListener('change', (event) => {
                if (event.target.matches?.('input[type="checkbox"], input[type="radio"]')) this.haptic('light');
            }, { passive: true });
        },

        // Theme: 'auto' follows the phone, or a forced light/dark choice.
        applyTheme(choice = 'auto') {
            const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
            const theme = choice === 'dark' || (choice === 'auto' && prefersDark) ? 'dark' : 'light';
            document.documentElement.dataset.theme = theme;
            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#120f24' : '#f8fafc');
            try { localStorage.setItem('themeChoice', choice); } catch (error) {}
            this.themeChoice = choice;
        },

        async setThemeChoice(choice) {
            await db.setSetting('themeChoice', choice);
            this.applyTheme(choice);
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
                    if (this.visibleHomeTab) this.haptic('selection');
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
                pane.toggleAttribute('inert', paneIndex !== index);
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
            // Trophies and quests rendered by the base read these metrics.
            const snapshotData = await this.resolveHomeDataSnapshot(homeData);
            this.gameMetrics = this.buildGameMetrics(snapshotData);
            await baseRenderStats.call(this, homeData);
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
            let distanceKm = Number(details.distanceKm) || (Number(set.distanceMeters) > 0 ? Number(set.distanceMeters) / 1000 : 0);
            const metric = set.cardioMetric || slot?.cardioMetric;
            const value = Number(set.cardioMetricValue ?? 0);
            if (!distanceKm && metric === 'speed' && value > 0) distanceKm = value * (seconds / 3600);
            if (!distanceKm && metric === 'distance-m' && value > 0) distanceKm = value / 1000;
            return {
                seconds,
                distanceKm,
                calories: Number(details.calories) || Number(set.calories) || 0,
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
                { icon: '⏱️', value: this.formatHoursMinutes(metrics.totalMinutes), label: 'd’entraînement' },
                { icon: '🧱', value: this.formatTonnage(snapshot.totalLoadedVolume), label: 'soulevés' },
                { icon: '🏆', value: snapshot.prCountTotal || 0, label: 'records', tone: 'gold' },
                { icon: '🔥', value: `${bestStreak || 0} sem.`, label: 'meilleure série' },
                { icon: '🏃', value: this.formatHoursMinutes(metrics.cardioMinutes), label: 'de cardio' }
            ];
            container.innerHTML = `
                <div class="pz-card-head">
                    <div>
                        <h4>Depuis le début</h4>
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
                        <span class="pz-kicker">${t('home.muscles.kicker')}</span>
                        <h4>${title}</h4>
                    </div>
                    ${chip}
                </div>
            `;

            if (!muscles.length) {
                container.innerHTML = `${head(t('home.muscles.emptyTitle'))}
                    <div class="pz-empty">${t('home.muscles.empty')}</div>`;
                return;
            }

            const growing = muscles.filter(row => ['grow', 'intense'].includes(row.zone.id)).length;
            const expanded = Boolean(this.physiqueExpanded);
            const limit = 6;
            const visible = expanded ? muscles : muscles.slice(0, limit);
            container.innerHTML = `
                ${head(t('home.muscles.title', { growing, count: muscles.length }), `<span class="pz-chip">${t('home.muscles.chip')}</span>`)}
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
                                <div class="physique-meter" aria-label="${this.escapeHtml(t('home.muscles.aria', { name: row.name, volume: row.volume, target, zone: t(`home.muscles.zone.${row.zone.id}`) }))}">
                                    <span class="physique-zone" style="left: ${pct(row.landmarks.MEV)}%; width: ${pct(row.landmarks.MAV) - pct(row.landmarks.MEV)}%"></span>
                                    <span class="physique-fill" style="width: ${pct(row.volume)}%"></span>
                                </div>
                                <span class="physique-tile-zone">${this.escapeHtml(t(`home.muscles.zone.${row.zone.id}`))}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${muscles.length > limit ? `<button type="button" class="pz-more physique-more" data-physique-toggle>${expanded ? t('common.showLess') : t('home.muscles.showAll', { count: muscles.length })}</button>` : ''}
                <div class="physique-legend"><i></i>${t('home.muscles.legend')}</div>
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
                            <h4>Cardio</h4>
                        </div>
                    </div>
                    <div class="pz-empty">Aucun cardio enregistré. Ajoute un bloc tapis, vélo ou rameur à une séance.</div>
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
