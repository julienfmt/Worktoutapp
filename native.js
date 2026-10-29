// ===== Native readiness: health sync and reminders =====
// Everything the store app will need, behind small adapters:
// - HealthBridge: Apple Health (HealthKit) / Health Connect through a
//   Capacitor health plugin. Writes each finished workout, reads body weight.
// - Reminders: the rhino's notifications (planned session, weekly goal,
//   friends, comeback, chest waiting). The copy and the planning rules live in
//   rhino-notifications.js (loaded before this file); here we gather the real
//   data, keep the sent/followed log and schedule with Capacitor
//   LocalNotifications natively. In the PWA nothing can fire while the app is
//   closed, so the plan is kept and shown as a preview in the settings.
(() => {
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
                    extra: { kind: item.kind, trigger: item.trigger, msgId: item.msgId }
                }))
            });
            return true;
        }
    };

    window.HealthBridge = HealthBridge;
    window.NotificationBridge = NotificationBridge;

    const RN = () => window.RhinoNotifications;

    // Tiny local strings (hint under Rappels), fr / en.
    const HINT = {
        fr: { next: 'Prochain', today: 'aujourd’hui', tomorrow: 'demain', none: 'Rien de prévu, le rhino se repose', mobile: 'dans l’app mobile' },
        en: { next: 'Next', today: 'today', tomorrow: 'tomorrow', none: 'Nothing planned, the rhino is resting', mobile: 'in the mobile app' }
    };

    Object.assign(App.prototype, {
        async getReminderPreferences() {
            const stored = (await db.getSetting('reminders')) || {};
            return {
                enabled: stored.enabled === true,
                time: /^\d{2}:\d{2}$/.test(stored.time || '') ? stored.time : '18:30',
                streak: stored.streak !== false,
                comeback: stored.comeback !== false,
                rewards: stored.rewards !== false,
                friends: stored.friends !== false
            };
        },

        getRhinoLocale() {
            return RN().getLocale();
        },

        // Serialises every read-modify-write of the stored notification state.
        async withRhinoState(mutate) {
            const run = async () => {
                const state = RN().normalizeState(await db.getSetting('rhinoNotifications'));
                const result = await mutate(state);
                await db.setSetting('rhinoNotifications', state);
                return result;
            };
            this.rhinoStateQueue = (this.rhinoStateQueue || Promise.resolve()).then(run, run);
            return this.rhinoStateQueue;
        },

        hasFriendData() {
            return Array.isArray(this.social?.friends) && this.social.friends.length > 0;
        },

        // Real data the planner needs: history, goal, next session, friends.
        async collectRhinoInput() {
            const [history, streak, sessions, storedIndex] = await Promise.all([
                db.getAll('workoutHistory'),
                streakEngine.getStreakData(),
                db.getSessions().catch(() => []),
                db.getSetting('nextSessionIndex')
            ]);
            const workouts = history.map(item => new Date(item.date)).filter(date => !Number.isNaN(date.getTime()));
            let nextSession = null;
            if (sessions.length) {
                const session = sessions[this.getSuggestedSessionIndex(sessions, history, storedIndex ?? 0)] || sessions[0];
                const slots = await db.getSlotsBySession(session.id).catch(() => []);
                nextSession = { name: session.name, muscles: [...new Set(slots.map(slot => slot.muscleGroup).filter(Boolean))] };
            }
            let friends = null;
            if (this.hasFriendData()) {
                const score = this.social.myScore || (await this.getMyWeekScore?.().catch(() => null)) || {};
                friends = {
                    weekKey: score.weekKey || this.getWeekKey?.() || '',
                    me: { xp: Number(score.weekXp) || 0, sessions: Number(score.weekSessions) || 0 },
                    list: this.social.friends.map(friend => ({ id: friend.id || friend.handle, name: friend.name, weekXp: friend.weekXp, weekSessions: friend.weekSessions }))
                };
            }
            return {
                workouts,
                goal: Math.max(1, Number(streak.weeklyGoal) || 3),
                streak: Number(streak.displayStreakCount ?? streak.streakCount) || 0,
                nextSession,
                friends,
                rewardsPending: (this.journeyPendingCount || 0) > 0 || Boolean(this.questsReady)
            };
        },

        // Next reminders (not persisted): used by the settings hint and the
        // dev preview. syncReminders() is the one that schedules and records.
        async buildReminderPlan(now = new Date()) {
            const prefs = await this.getReminderPreferences();
            if (!prefs.enabled) return [];
            const input = await this.collectRhinoInput();
            const state = RN().resolveLog(await db.getSetting('rhinoNotifications'), input.workouts, now);
            return RN().buildPlan({ ...input, now, prefs, locale: this.getRhinoLocale(), state });
        },

        async syncReminders() {
            const now = new Date();
            const prefs = await this.getReminderPreferences();
            let plan = [];
            if (prefs.enabled) {
                if (!this.hasFriendData() && this.social?.backend && this.social.me) await this.refreshSocialInbox?.().catch(() => {});
                const input = await this.collectRhinoInput();
                plan = await this.withRhinoState(state => {
                    Object.assign(state, RN().resolveLog(state, input.workouts, now));
                    if (!state.startedAt) state.startedAt = now.toISOString();
                    if (input.friends) {
                        const snap = RN().buildSocialSnapshot(input.friends.weekKey, input.friends.me, input.friends.list);
                        const fresh = RN().detectFriendEvents(state.socialSnap, snap, now);
                        state.socialSnap = snap;
                        state.friendEvents = [...fresh, ...state.friendEvents.filter(event => now - Date.parse(event.at) < 6 * 3600 * 1000)].slice(0, 5);
                    }
                    const next = RN().buildPlan({ ...input, now, prefs, locale: this.getRhinoLocale(), state });
                    // Only the phone really fires them: only there do we track them.
                    state.pending = NotificationBridge.isNative() ? next.map(item => ({ id: item.msgId, trigger: item.trigger, at: item.at })) : [];
                    return next;
                });
            }
            this.reminderPlan = plan;
            if (NotificationBridge.isNative()) await NotificationBridge.schedule(plan).catch(() => {});
            return plan;
        },

        // "Prochain : jeudi 18:30" (the next real reminder).
        formatNextReminder(plan, now = new Date()) {
            const locale = this.getRhinoLocale();
            const text = HINT[locale] || HINT.fr;
            if (!plan.length) return text.none;
            const at = new Date(plan[0].at);
            const diff = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
            const tag = locale === 'en' ? 'en-US' : 'fr-FR';
            const dayLabel = diff === 0 ? text.today : diff === 1 ? text.tomorrow : at.toLocaleDateString(tag, { weekday: 'long' });
            const time = at.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit', hour12: locale === 'en' });
            return `${text.next} : ${dayLabel} ${time}`;
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
            const calories = typeof this.estimateSessionCalories === 'function'
                ? (await this.estimateSessionCalories({ sets, durationMinutes: (Number(workout.duration) || 0) / 60000 })).total
                : sets.reduce((sum, set) => sum + (Number(set.calories) || Number(set.cardio?.calories) || 0), 0);
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

        // ---------- Settings rows (Muscu+, theme, reminders, health) ----------
        // Rendered inside the "App" group of the Réglages sheet.
        async renderAppSettingsBlock() {
            const block = document.getElementById('settings-app-block');
            if (!block) return;
            const prefs = await this.getReminderPreferences();
            const health = (await db.getSetting('healthSync')) || {};
            const plan = prefs.enabled ? await this.buildReminderPlan() : [];
            const isPlus = Boolean(this.entitlements?.plus);
            const offer = this.getPremiumOffer?.();
            const theme = this.themeChoice || 'auto';
            const locale = await this.getLocaleChoice();
            const reminderHint = !prefs.enabled
                ? ''
                : `${this.formatNextReminder(plan)}${NotificationBridge.isNative() ? '' : ` · ${(HINT[this.getRhinoLocale()] || HINT.fr).mobile}`}`;
            const toggle = (id, checked, disabled = false) => `
                <span class="toggle-switch">
                    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                    <span class="toggle-slider"></span>
                </span>`;
            block.innerHTML = `
                <button type="button" class="set-row set-link" data-app-setting="paywall">
                    <span class="set-label"><span class="set-plus">Muscu+</span><small>${isPlus ? 'Actif' : (offer?.enabled ? `Essai gratuit ${offer.trialDays} jours` : 'Offert pendant la bêta')}</small></span>
                    <span class="set-chevron" aria-hidden="true">›</span>
                </button>
                <div class="set-row">
                    <span class="set-label">Apparence</span>
                    <span class="set-segmented" role="radiogroup" aria-label="Apparence">
                        ${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([value, label]) => `
                            <button type="button" class="${theme === value ? 'active' : ''}" data-theme-choice="${value}" role="radio" aria-checked="${theme === value}">${label}</button>
                        `).join('')}
                    </span>
                </div>
                <div class="set-row">
                    <span class="set-label">Langue</span>
                    <span class="set-segmented" role="radiogroup" aria-label="Langue">
                        ${[['auto', 'Auto'], ['fr', 'Français'], ['en', 'English']].map(([value, label]) => `
                            <button type="button" class="${locale === value ? 'active' : ''}" data-locale-choice="${value}" role="radio" aria-checked="${locale === value}">${label}</button>
                        `).join('')}
                    </span>
                </div>
                <label class="set-row">
                    <span class="set-label">Rappels${reminderHint ? `<small>${this.escapeHtml(reminderHint)}</small>` : ''}</span>
                    ${toggle('setting-reminders-enabled', prefs.enabled)}
                </label>
                ${prefs.enabled ? `
                    <label class="set-row set-row-sub">
                        <span class="set-label">Heure</span>
                        <input type="time" id="setting-reminders-time" class="set-time" value="${prefs.time}">
                    </label>
                    <div class="set-row set-row-sub set-chips">
                        ${[['streak', '🔥 Séances'], ['comeback', '👀 Retour'], ['rewards', '🎁 Récompenses'], ...(this.hasFriendData() ? [['friends', '🦏 Potes']] : [])].map(([key, label]) => `
                            <label class="set-chip"><input type="checkbox" data-reminder-kind="${key}" ${prefs[key] ? 'checked' : ''}><span>${label}</span></label>
                        `).join('')}
                    </div>
                ` : ''}
                <label class="set-row">
                    <span class="set-label">${HealthBridge.platformLabel()}<small>${HealthBridge.isAvailable() ? '' : 'Dans l’app iOS / Android'}</small></span>
                    ${toggle('setting-health-enabled', health.enabled, !HealthBridge.isAvailable())}
                </label>
            `;
            if (!block.dataset.bound) {
                block.dataset.bound = 'true';
                block.addEventListener('click', async event => {
                    if (event.target.closest('[data-app-setting="paywall"]')) this.showPaywall?.();
                    const localeButton = event.target.closest('[data-locale-choice]');
                    if (localeButton) {
                        await this.setLocaleChoice(localeButton.dataset.localeChoice);
                        await this.renderAppSettingsBlock();
                        return;
                    }
                    const theme = event.target.closest('[data-theme-choice]');
                    if (theme) {
                        await this.setThemeChoice(theme.dataset.themeChoice);
                        await this.renderAppSettingsBlock();
                    }
                });
                block.addEventListener('change', event => void this.onAppSettingChange(event));
            }
        },

        // Language: 'auto' | 'fr' | 'en'. Uses the i18n layer when it is
        // loaded (it persists and reloads), else just stores the choice.
        async getLocaleChoice() {
            const valid = value => (['auto', 'fr', 'en'].includes(value) ? value : null);
            if (window.i18n?.getChoice) return valid(window.i18n.getChoice()) || 'auto';
            let stored = null;
            try { stored = localStorage.getItem('locale'); } catch (error) {}
            return valid(stored) || valid(await db.getSetting('locale').catch(() => null)) || 'auto';
        },

        async setLocaleChoice(choice) {
            if (!['auto', 'fr', 'en'].includes(choice)) return;
            if (window.i18n?.setLocale) {
                await window.i18n.setLocale(choice);
                return;
            }
            try { localStorage.setItem('locale', choice); } catch (error) {}
            await db.setSetting('locale', choice);
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
                this.flashSettingSaved?.(target);
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

    // Dev helper: logs the next reminders, the stored log and its stats.
    window.previewRhinoNotifications = async function previewRhinoNotifications() {
        const plan = await app.buildReminderPlan();
        const state = RN().normalizeState(await db.getSetting('rhinoNotifications'));
        console.table(plan.map(item => ({ quand: new Date(item.at).toLocaleString(), trigger: item.trigger, titre: item.title, texte: item.body })));
        console.info('Stats rappels', RN().getStats(state));
        return plan;
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
