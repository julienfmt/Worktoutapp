// ===== Native readiness: health sync and reminders =====
// Everything the store app will need, behind small adapters:
// - HealthBridge: Apple Health (HealthKit) / Health Connect through a
//   Capacitor health plugin. Writes each finished workout, reads body weight.
// - Reminders: Duolingo-style local notifications (training day, streak at
//   risk, comeback, chest waiting, monthly challenge). Planned here from the
//   player's data; scheduled with Capacitor LocalNotifications natively. In
//   the PWA nothing can fire while the app is closed, so the plan is kept
//   and shown as a preview in the settings.
(() => {
    const MASCOT = '💪';

    const HealthBridge = {
        get plugin() {
            const plugins = window.Capacitor?.Plugins || {};
            return plugins.Health || plugins.CapacitorHealthkit || plugins.HealthConnect || null;
        },
        isAvailable() {
            return Boolean(this.plugin);
        },
        platformLabel() {
            return /iphone|ipad|ipod/i.test(navigator.userAgent || '') ? 'Apple Santé' : 'Health Connect';
        },
        async requestAuthorization() {
            if (!this.plugin) return false;
            try {
                await this.plugin.requestAuthorization({
                    read: ['weight', 'steps', 'heartRate'],
                    write: ['workouts', 'calories', 'distance', 'weight']
                });
                return true;
            } catch (error) {
                return false;
            }
        },
        async writeWorkout(workout) {
            if (!this.plugin?.saveWorkout) return false;
            try {
                await this.plugin.saveWorkout(workout);
                return true;
            } catch (error) {
                console.info('Santé : écriture impossible', error?.message || error);
                return false;
            }
        },
        async readLatestBodyWeight() {
            if (!this.plugin?.queryLatestSample) return null;
            try {
                const sample = await this.plugin.queryLatestSample({ dataType: 'weight' });
                const value = Number(sample?.value);
                return Number.isFinite(value) && value > 0 ? value : null;
            } catch (error) {
                return null;
            }
        }
    };

    const NotificationBridge = {
        get plugin() {
            return window.Capacitor?.Plugins?.LocalNotifications || null;
        },
        isNative() {
            return Boolean(this.plugin);
        },
        async requestPermission() {
            if (this.plugin) {
                const result = await this.plugin.requestPermissions().catch(() => null);
                return result?.display === 'granted';
            }
            if (typeof Notification === 'undefined') return false;
            if (Notification.permission === 'granted') return true;
            return (await Notification.requestPermission().catch(() => 'denied')) === 'granted';
        },
        async schedule(plan) {
            if (!this.plugin) return false;
            const pending = await this.plugin.getPending().catch(() => ({ notifications: [] }));
            const ours = (pending.notifications || []).filter(item => item.id >= 7000 && item.id < 8000);
            if (ours.length) await this.plugin.cancel({ notifications: ours.map(item => ({ id: item.id })) }).catch(() => {});
            if (!plan.length) return true;
            await this.plugin.schedule({
                notifications: plan.map((item, index) => ({
                    id: 7000 + index,
                    title: item.title,
                    body: item.body,
                    schedule: { at: new Date(item.at), allowWhileIdle: true },
                    extra: { kind: item.kind }
                }))
            });
            return true;
        }
    };

    window.HealthBridge = HealthBridge;
    window.NotificationBridge = NotificationBridge;

    const pick = (list, seed) => list[Math.abs(seed) % list.length];

    Object.assign(App.prototype, {
        async getReminderPreferences() {
            const stored = (await db.getSetting('reminders')) || {};
            return {
                enabled: stored.enabled === true,
                time: /^\d{2}:\d{2}$/.test(stored.time || '') ? stored.time : '18:30',
                streak: stored.streak !== false,
                comeback: stored.comeback !== false,
                rewards: stored.rewards !== false
            };
        },

        // Builds the next 7 days of reminders from the real state: training
        // days follow the weekly goal, streak rescue on the last day, etc.
        async buildReminderPlan(now = new Date()) {
            const prefs = await this.getReminderPreferences();
            if (!prefs.enabled) return [];
            const [history, streak] = await Promise.all([db.getAll('workoutHistory'), streakEngine.getStreakData()]);
            const weeklyGoal = Math.max(1, Number(streak.weeklyGoal) || 3);
            const [hour, minute] = prefs.time.split(':').map(Number);
            const lastWorkout = history.map(item => new Date(item.date)).filter(date => !Number.isNaN(date)).sort((a, b) => b - a)[0] || null;
            const doneThisWeek = Number(streak.currentWeekSessions) || 0;
            const streakCount = Number(streak.displayStreakCount ?? streak.streakCount) || 0;
            const trainingDays = {
                1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6]
            }[Math.min(7, weeklyGoal)];
            const plan = [];
            const at = (date, h = hour, m = minute) => {
                const copy = new Date(date);
                copy.setHours(h, m, 0, 0);
                return copy;
            };

            for (let offset = 0; offset < 7; offset += 1) {
                const day = new Date(now);
                day.setDate(now.getDate() + offset);
                const when = at(day);
                if (when <= now) continue;
                const weekday = day.getDay();
                const trainedThatDay = lastWorkout && this.getLocalDateKey(lastWorkout) === this.getLocalDateKey(day);
                if (trainedThatDay) continue;

                // Sunday evening, week not validated: the streak is at risk.
                // Only this week's Sunday: next weeks start from zero sessions.
                if (prefs.streak && weekday === 0 && offset === (7 - now.getDay()) % 7 && doneThisWeek < weeklyGoal && streakCount > 0) {
                    plan.push({
                        kind: 'streak',
                        at: at(day, 17, 0).toISOString(),
                        title: `🔥 Ta série de ${streakCount} semaine${streakCount > 1 ? 's' : ''} est en danger`,
                        body: pick([
                            `Encore ${weeklyGoal - doneThisWeek} séance${weeklyGoal - doneThisWeek > 1 ? 's' : ''} pour valider la semaine. Tu y vas ?`,
                            'Dernier jour pour valider ta semaine. Même une séance courte compte !',
                            'Un bouclier ne te sauvera pas à chaque fois. Allez, on y va.'
                        ], streakCount + offset)
                    });
                    continue;
                }

                if (trainingDays.includes(weekday)) {
                    plan.push({
                        kind: 'training',
                        at: when.toISOString(),
                        title: pick([`${MASCOT} C'est jour de séance !`, '🏋️ La salle t’attend', '⚡ Prêt pour ta séance ?', '🗺️ Ton parcours continue'], weekday + offset),
                        body: pick([
                            'Le coach a préparé tes charges. 45 minutes et c’est validé.',
                            'Une séance de plus et tu avances d’une étape sur le chemin.',
                            'Tes muscles se reposent depuis assez longtemps. Go !',
                            'Petite séance ou grosse séance, l’important c’est d’y aller.'
                        ], weekday * 3 + offset)
                    });
                }
            }

            // Comeback after 3 days without training (once).
            if (prefs.comeback && lastWorkout) {
                const comeback = new Date(lastWorkout);
                comeback.setDate(comeback.getDate() + 3);
                const when = at(comeback, 12, 30);
                if (when > now && !plan.some(item => this.getLocalDateKey(new Date(item.at)) === this.getLocalDateKey(when))) {
                    plan.push({
                        kind: 'comeback',
                        at: when.toISOString(),
                        title: '👀 On ne t’a pas vu depuis 3 jours',
                        body: 'Ton coach garde tes charges au chaud. Une séance et tu repars !'
                    });
                }
            }

            // Rewards waiting (chests, quests, monthly challenge).
            if (prefs.rewards && ((this.journeyPendingCount || 0) > 0 || this.questsReady)) {
                const tomorrow = new Date(now);
                tomorrow.setDate(now.getDate() + 1);
                plan.push({
                    kind: 'reward',
                    at: at(tomorrow, 9, 0).toISOString(),
                    title: '🎁 Une récompense t’attend',
                    body: 'Ouvre l’app pour récupérer ton XP avant la fin de la semaine.'
                });
            }

            return plan.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 12);
        },

        async syncReminders() {
            const plan = await this.buildReminderPlan();
            this.reminderPlan = plan;
            if (NotificationBridge.isNative()) await NotificationBridge.schedule(plan).catch(() => {});
            return plan;
        },

        // After each saved workout: health sync + refreshed reminders.
        async onWorkoutSavedNative() {
            await this.syncReminders().catch(() => {});
            const settings = (await db.getSetting('healthSync')) || {};
            if (!settings.enabled || !HealthBridge.isAvailable()) return;
            const history = await db.getAll('workoutHistory');
            const workout = history.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            if (!workout) return;
            const sets = await db.getByIndex('setHistory', 'workoutId', workout.id);
            const calories = sets.reduce((sum, set) => sum + (Number(set.calories) || Number(set.cardio?.calories) || 0), 0);
            const distance = sets.reduce((sum, set) => sum + (Number(set.distanceMeters) || 0), 0);
            const end = new Date(workout.date);
            const start = new Date(end.getTime() - (Number(workout.duration) || 0));
            await HealthBridge.writeWorkout({
                activityType: 'traditionalStrengthTraining',
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                calories: Math.round(calories) || undefined,
                distance: Math.round(distance) || undefined
            });
        },

        // ---------- Settings block (Muscu+, reminders, health) ----------
        async renderAppSettingsBlock() {
            const block = document.getElementById('settings-app-block');
            if (!block) return;
            const prefs = await this.getReminderPreferences();
            const health = (await db.getSetting('healthSync')) || {};
            const plan = prefs.enabled ? await this.buildReminderPlan() : [];
            const isPlus = Boolean(this.entitlements?.plus);
            const offer = this.getPremiumOffer?.();
            const formatWhen = iso => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
            block.innerHTML = `
                <button type="button" class="settings-plus-card" data-app-setting="paywall">
                    <span class="settings-plus-crown" aria-hidden="true">👑</span>
                    <span class="settings-plus-main">
                        <strong>${isPlus ? 'Muscu+ actif' : 'Muscu+'}</strong>
                        <small>${isPlus ? 'Merci de soutenir l’app 💜' : (offer?.enabled ? `Essai gratuit ${offer.trialDays} jours` : 'Tout est offert pendant la bêta')}</small>
                    </span>
                    <span class="settings-plus-go" aria-hidden="true">›</span>
                </button>

                <div class="settings-card">
                    <div class="settings-card-row">
                        <span class="settings-card-icon" aria-hidden="true">🌗</span>
                        <span class="settings-card-main"><strong>Apparence</strong><small>Suit ton téléphone ou forcé</small></span>
                    </div>
                    <div class="theme-switch" role="radiogroup" aria-label="Apparence">
                        ${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([value, label]) => `
                            <button type="button" class="${(this.themeChoice || 'auto') === value ? 'active' : ''}" data-theme-choice="${value}" role="radio" aria-checked="${(this.themeChoice || 'auto') === value}">${label}</button>
                        `).join('')}
                    </div>
                </div>

                <div class="settings-card">
                    <div class="settings-card-row">
                        <span class="settings-card-icon" aria-hidden="true">🔔</span>
                        <span class="settings-card-main">
                            <strong>Rappels</strong>
                            <small>Jour de séance, série en danger, retour après une pause</small>
                        </span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-reminders-enabled" ${prefs.enabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    ${prefs.enabled ? `
                        <div class="settings-card-row">
                            <span class="settings-card-main"><strong>Heure</strong><small>Les jours d’entraînement</small></span>
                            <input type="time" id="setting-reminders-time" class="form-input settings-time" value="${prefs.time}">
                        </div>
                        <div class="settings-chips">
                            ${[['streak', '🔥 Série en danger'], ['comeback', '👀 Retour'], ['rewards', '🎁 Récompenses']].map(([key, label]) => `
                                <label class="settings-chip"><input type="checkbox" data-reminder-kind="${key}" ${prefs[key] ? 'checked' : ''}><span>${label}</span></label>
                            `).join('')}
                        </div>
                        <div class="settings-preview">
                            <span class="pz-kicker">Prochains rappels</span>
                            ${plan.length ? plan.slice(0, 4).map(item => `
                                <div class="settings-preview-item"><strong>${this.escapeHtml(item.title)}</strong><small>${formatWhen(item.at)} · ${this.escapeHtml(item.body)}</small></div>
                            `).join('') : '<small>Rien de prévu pour l’instant : tu es à jour 💪</small>'}
                            ${NotificationBridge.isNative() ? '' : '<small class="settings-note">Dans la version web, les rappels ne peuvent pas sonner quand l’app est fermée. Ils seront actifs dans l’app iOS / Android.</small>'}
                        </div>
                    ` : ''}
                </div>

                <div class="settings-card">
                    <div class="settings-card-row">
                        <span class="settings-card-icon" aria-hidden="true">⌚</span>
                        <span class="settings-card-main">
                            <strong>${HealthBridge.platformLabel()}</strong>
                            <small>${HealthBridge.isAvailable() ? 'Envoie tes séances, calories et distance' : 'Disponible dans l’app iOS / Android'}</small>
                        </span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-health-enabled" ${health.enabled ? 'checked' : ''} ${HealthBridge.isAvailable() ? '' : 'disabled'}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            `;
            if (!block.dataset.bound) {
                block.dataset.bound = 'true';
                block.addEventListener('click', async event => {
                    if (event.target.closest('[data-app-setting="paywall"]')) this.showPaywall?.();
                    const theme = event.target.closest('[data-theme-choice]');
                    if (theme) {
                        await this.setThemeChoice(theme.dataset.themeChoice);
                        await this.renderAppSettingsBlock();
                    }
                });
                block.addEventListener('change', event => void this.onAppSettingChange(event));
            }
        },

        async onAppSettingChange(event) {
            const target = event.target;
            const prefs = await this.getReminderPreferences();
            if (target.id === 'setting-reminders-enabled') {
                if (target.checked) {
                    const granted = await NotificationBridge.requestPermission();
                    if (!granted && NotificationBridge.isNative()) {
                        target.checked = false;
                        this.showCoachToast('Autorise les notifications dans les réglages du téléphone.', 'warning', '🔔');
                        return;
                    }
                }
                prefs.enabled = target.checked;
            } else if (target.id === 'setting-reminders-time') {
                prefs.time = target.value || prefs.time;
            } else if (target.dataset.reminderKind) {
                prefs[target.dataset.reminderKind] = target.checked;
            } else if (target.id === 'setting-health-enabled') {
                const allowed = target.checked ? await HealthBridge.requestAuthorization() : true;
                await db.setSetting('healthSync', { enabled: target.checked && allowed });
                if (target.checked && !allowed) target.checked = false;
                return;
            } else {
                return;
            }
            await db.setSetting('reminders', prefs);
            await this.syncReminders();
            await this.renderAppSettingsBlock();
        }
    });

    const baseShowSettingsSheet = App.prototype.showSettingsSheet;
    App.prototype.showSettingsSheet = async function showSettingsSheetWithApp(...args) {
        const result = await baseShowSettingsSheet.apply(this, args);
        await this.renderAppSettingsBlock();
        return result;
    };

    const baseShowStimulusScoreAnimation = App.prototype.showStimulusScoreAnimation;
    App.prototype.showStimulusScoreAnimation = function showRecapThenSync(...args) {
        // The workout is saved at this point; run native follow-ups in the background.
        void this.onWorkoutSavedNative?.();
        return baseShowStimulusScoreAnimation.apply(this, args);
    };

    const baseInit = App.prototype.init;
    App.prototype.init = async function initWithNative() {
        await baseInit.call(this);
        // Health first: a weight logged in the Health app feeds cardio calories.
        if (HealthBridge.isAvailable() && ((await db.getSetting('healthSync')) || {}).enabled) {
            const weight = await HealthBridge.readLatestBodyWeight();
            if (weight) await db.setSetting('bodyWeight', Math.round(weight));
        }
        this.runWhenIdle?.(() => this.syncReminders());
    };
})();
