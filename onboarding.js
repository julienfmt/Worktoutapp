// ===== Onboarding =====
// Full-screen first-launch flow: one question per screen, big tap targets,
// sliders, auto-advance, then a program is built from the answers and
// imported through the regular program pipeline. Mixed into App so it can
// reuse the import, toast, haptic and confetti helpers.
(function () {
    'use strict';

    const ARROW_LEFT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    const SHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11"/><path d="M8 7l4-4 4 4"/><path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8"/></svg>';
    const DOTS_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

    // Titles and descriptions come from locales (onboarding.<field>.<id>.title / .desc).
    // `objective` is stored in the program profile: it stays as data.
    const GOALS = [
        { id: 'muscle', emoji: '💪', objective: 'Prise de masse' },
        { id: 'fat', emoji: '🔥', objective: 'Perte de gras' },
        { id: 'recomp', emoji: '⚖️', objective: 'Recomposition' },
        { id: 'strength', emoji: '🏋️', objective: 'Force' },
        { id: 'restart', emoji: '🌱', objective: 'Reprise' }
    ];

    const LEVELS = [
        { id: 'beginner', emoji: '🐣' },
        { id: 'intermediate', emoji: '🚀' },
        { id: 'advanced', emoji: '🦾' }
    ];

    const EQUIPMENT = [
        { id: 'gym', emoji: '🏢' },
        { id: 'home', emoji: '🏠' },
        { id: 'bodyweight', emoji: '🤸' }
    ];

    const withCopy = (field, item) => ({
        ...item,
        title: t(`onboarding.${field}.${item.id}.title`),
        desc: t(`onboarding.${field}.${item.id}.desc`)
    });

    const FOCUS = [
        { id: 'pecs', icon: 'pectoraux', muscles: ['pectoraux'] },
        { id: 'back', icon: 'dos', muscles: ['dos'] },
        { id: 'shoulders', icon: 'epaules', muscles: ['epaules'] },
        { id: 'arms', icon: 'biceps', muscles: ['biceps', 'triceps'] },
        { id: 'legs', icon: 'quadriceps', muscles: ['quadriceps', 'ischio-jambiers', 'mollets'] },
        { id: 'glutes', icon: 'fessiers', muscles: ['fessiers'] },
        { id: 'abs', icon: 'abdominaux', muscles: ['abdominaux'] }
    ];

    // Caption under the days slider: onboarding.days.caption<N>.
    const DAY_EMOJIS = ['🌤️', '🙂', '😎', '🔥', '⚡', '🦾', '📅'];

    // When N sessions a week, which days light up (Mon → Sun).
    const WEEK_PATTERNS = {
        1: [0, 0, 1, 0, 0, 0, 0],
        2: [1, 0, 0, 1, 0, 0, 0],
        3: [1, 0, 1, 0, 1, 0, 0],
        4: [1, 1, 0, 1, 1, 0, 0],
        5: [1, 1, 1, 0, 1, 1, 0],
        6: [1, 1, 1, 1, 1, 1, 0],
        7: [1, 1, 1, 1, 1, 1, 1]
    };

    // Movement → exercise per equipment (null = skipped for that equipment).
    const MOVES = {
        squat: { muscle: 'quadriceps', type: 'compound', gym: 'Squat', home: 'Goblet squat', bodyweight: 'Split squat bulgare' },
        legPress: { muscle: 'quadriceps', type: 'compound', gym: 'Presse à cuisses', home: 'Fentes arrière', bodyweight: 'Fentes marchées' },
        hinge: { muscle: 'ischio-jambiers', type: 'compound', gym: 'Soulevé de terre roumain', home: 'Soulevé de terre roumain', bodyweight: 'Glute bridge' },
        hipThrust: { muscle: 'fessiers', type: 'compound', gym: 'Hip thrust', home: 'Glute bridge', bodyweight: 'Step-up' },
        legCurl: { muscle: 'ischio-jambiers', type: 'isolation', gym: 'Leg curl assis', home: null, bodyweight: null },
        legExt: { muscle: 'quadriceps', type: 'isolation', gym: 'Leg extension', home: 'Step-up', bodyweight: 'Sissy squat' },
        calves: { muscle: 'mollets', type: 'isolation', gym: 'Mollets debout machine', home: 'Donkey calf raise', bodyweight: 'Donkey calf raise' },
        chestPress: { muscle: 'pectoraux', type: 'compound', gym: 'Développé couché barre', home: 'Développé couché haltères', bodyweight: 'Pompes' },
        inclinePress: { muscle: 'pectoraux', type: 'compound', gym: 'Développé incliné haltères', home: 'Développé incliné haltères', bodyweight: 'Pompes inclinées' },
        chestFly: { muscle: 'pectoraux', type: 'isolation', gym: 'Pec deck', home: 'Écarté haltères', bodyweight: null },
        verticalPull: { muscle: 'dos', type: 'compound', gym: 'Tirage vertical prise large', home: 'Pullover haltère', bodyweight: 'Tractions' },
        row: { muscle: 'dos', type: 'compound', gym: 'Rowing poulie assise', home: 'Rowing haltère unilatéral', bodyweight: 'Tractions prise neutre' },
        row2: { muscle: 'dos', type: 'compound', gym: 'Rowing barre', home: null, bodyweight: null },
        shoulderPress: { muscle: 'epaules', type: 'compound', gym: 'Développé haltères épaules', home: 'Développé haltères épaules', bodyweight: null },
        lateralRaise: { muscle: 'epaules', type: 'isolation', gym: 'Élévation latérale', home: 'Élévation latérale', bodyweight: null },
        rearDelt: { muscle: 'epaules', type: 'isolation', gym: 'Face pull', home: 'Oiseau haltères', bodyweight: null },
        biceps: { muscle: 'biceps', type: 'isolation', gym: 'Curl barre EZ', home: 'Curl haltères', bodyweight: null },
        biceps2: { muscle: 'biceps', type: 'isolation', gym: 'Curl marteau', home: 'Curl marteau', bodyweight: null },
        triceps: { muscle: 'triceps', type: 'isolation', gym: 'Pushdown corde', home: 'Extension haltère deux mains', bodyweight: 'Dips entre bancs' },
        triceps2: { muscle: 'triceps', type: 'isolation', gym: 'Extension corde au-dessus de la tête', home: 'Kickback haltère', bodyweight: 'Pompes diamant' },
        abs: { muscle: 'abdominaux', type: 'isolation', gym: 'Cable crunch', home: 'Crunch inversé', bodyweight: 'Crunch inversé' }
    };

    const SESSION_TEMPLATES = {
        fullA: { moves: ['squat', 'chestPress', 'row', 'hinge', 'lateralRaise', 'biceps', 'triceps', 'abs', 'calves'] },
        fullB: { moves: ['legPress', 'verticalPull', 'inclinePress', 'legCurl', 'rearDelt', 'triceps2', 'biceps2', 'calves', 'abs'] },
        fullC: { moves: ['hipThrust', 'shoulderPress', 'row', 'squat', 'chestFly', 'biceps', 'triceps', 'abs', 'legCurl'] },
        upperA: { moves: ['chestPress', 'row', 'shoulderPress', 'verticalPull', 'lateralRaise', 'biceps', 'triceps', 'rearDelt', 'chestFly'] },
        lowerA: { moves: ['squat', 'hinge', 'legCurl', 'legExt', 'calves', 'abs', 'hipThrust'] },
        upperB: { moves: ['inclinePress', 'verticalPull', 'row2', 'chestFly', 'lateralRaise', 'triceps2', 'biceps2', 'rearDelt', 'row'] },
        lowerB: { moves: ['legPress', 'hipThrust', 'legCurl', 'legExt', 'calves', 'abs', 'hinge'] },
        push: { moves: ['chestPress', 'shoulderPress', 'inclinePress', 'lateralRaise', 'chestFly', 'triceps', 'triceps2'] },
        pull: { moves: ['verticalPull', 'row', 'row2', 'rearDelt', 'biceps', 'biceps2', 'abs'] },
        legs: { moves: ['squat', 'hinge', 'legPress', 'legCurl', 'legExt', 'calves', 'abs', 'hipThrust'] }
    };

    const SPLITS = {
        // label: onboarding.split.<label>
        1: { label: 'full', sessions: ['fullA'] },
        2: { label: 'full', sessions: ['fullA', 'fullB'] },
        3: { label: 'full', sessions: ['fullA', 'fullB', 'fullC'] },
        '3plus': { label: 'ppl', sessions: ['push', 'pull', 'legs'] },
        4: { label: 'upperLower', sessions: ['upperA', 'lowerA', 'upperB', 'lowerB'] },
        5: { label: 'pplUpperLower', sessions: ['push', 'pull', 'legs', 'upperA', 'lowerA'] },
        6: { label: 'ppl2', sessions: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] }
    };

    // Text: onboarding.build.step<N>.
    const BUILD_STEPS = ['🎯', '🗓️', '🏋️', '⏱️', '🧠'];

    const QUESTION_STEPS = ['name', 'goal', 'level', 'how', 'days', 'duration', 'equipment', 'focus'];

    const esc = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const exerciseCountForDuration = (minutes) => {
        if (minutes <= 30) return 4;
        if (minutes <= 45) return 5;
        if (minutes <= 60) return 6;
        if (minutes <= 75) return 7;
        return 8;
    };

    // Sets / reps / rest / RIR for a movement, from goal and level.
    const prescribe = ({ goal, level }, type, position) => {
        const isMain = type === 'compound' && position < 2;
        let scheme;
        if (goal === 'strength') {
            scheme = isMain
                ? { sets: 4, repsMin: 4, repsMax: 6, rest: 180, rir: 2 }
                : type === 'compound'
                    ? { sets: 3, repsMin: 6, repsMax: 8, rest: 150, rir: 2 }
                    : { sets: 3, repsMin: 10, repsMax: 12, rest: 75, rir: 2 };
        } else if (goal === 'fat') {
            scheme = type === 'compound'
                ? { sets: 3, repsMin: 8, repsMax: 12, rest: 90, rir: 2 }
                : { sets: 3, repsMin: 12, repsMax: 15, rest: 60, rir: 2 };
        } else if (goal === 'restart') {
            scheme = type === 'compound'
                ? { sets: 3, repsMin: 10, repsMax: 12, rest: 90, rir: 3 }
                : { sets: 2, repsMin: 12, repsMax: 15, rest: 60, rir: 3 };
        } else {
            scheme = isMain
                ? { sets: 4, repsMin: 6, repsMax: 10, rest: 150, rir: 2 }
                : type === 'compound'
                    ? { sets: 3, repsMin: 8, repsMax: 12, rest: 120, rir: 2 }
                    : { sets: 3, repsMin: 10, repsMax: 15, rest: 75, rir: 2 };
        }

        if (level === 'beginner') {
            scheme.sets = Math.min(scheme.sets, 3);
            scheme.rir = Math.max(scheme.rir, 3);
        } else if (level === 'advanced' && isMain && goal !== 'restart') {
            scheme.sets += 1;
            scheme.rir = Math.max(1, scheme.rir - 1);
        }
        return scheme;
    };

    const buildProgramFromAnswers = (answers) => {
        const days = Math.max(1, Math.min(7, answers.days || 3));
        const equipment = answers.equipment || 'gym';
        let splitKey = Math.min(days, 6);
        if (days === 3 && answers.level !== 'beginner' && answers.goal !== 'restart') splitKey = '3plus';
        const split = SPLITS[splitKey];
        const exerciseCount = exerciseCountForDuration(answers.duration || 60);
        const focusMuscles = new Set(
            FOCUS.filter(item => answers.focus?.has(item.id)).flatMap(item => item.muscles)
        );

        const sessions = split.sessions.map((templateId, index) => {
            const template = { ...SESSION_TEMPLATES[templateId], name: t(`onboarding.session.${templateId}`) };
            const available = template.moves
                .map(moveId => ({ moveId, ...MOVES[moveId] }))
                .filter(move => move[equipment]);

            // Prioritised muscles move up right after the two main lifts so they
            // survive the cut to the session length.
            const head = available.slice(0, 2);
            const rest = available.slice(2);
            const prioritized = [
                ...rest.filter(move => focusMuscles.has(move.muscle)),
                ...rest.filter(move => !focusMuscles.has(move.muscle))
            ];
            const seen = new Set();
            const picked = [...head, ...prioritized].filter((move) => {
                const name = move[equipment];
                if (seen.has(name)) return false;
                seen.add(name);
                return true;
            }).slice(0, exerciseCount);

            // Compounds first, then isolation, keeping the relative order.
            picked.sort((a, b) => (a.type === b.type ? 0 : a.type === 'compound' ? -1 : 1));

            // Two identical templates (6-day split) get a suffix to stay distinct.
            const duplicateIndex = split.sessions.slice(0, index).filter(id => id === templateId).length;
            const name = duplicateIndex > 0 ? `${template.name} (2)` : template.name;

            return {
                name,
                estimatedDuration: answers.duration || 60,
                slots: picked.map((move, position) => ({
                    name: move[equipment],
                    type: move.type,
                    muscleGroup: move.muscle,
                    ...prescribe(answers, move.type, position)
                }))
            };
        });

        const goal = GOALS.find(item => item.id === answers.goal);
        return {
            format: 'worktout-program-v1',
            profile: {
                objective: goal?.objective || 'Prise de masse',
                weeklyGoal: days
            },
            splitLabel: t(`onboarding.split.${split.label}`),
            sessions
        };
    };

    const OnboardingFlow = {
        // ---------- lifecycle ----------
        async showOnboarding() {
            const savedGoal = (await db.getSetting('weeklyGoal')) ?? 3;
            this.onboarding = {
                step: 'welcome',
                history: [],
                answers: {
                    name: '',
                    goal: null,
                    level: null,
                    days: Math.max(1, Math.min(7, parseInt(savedGoal, 10) || 3)),
                    duration: 60,
                    equipment: null,
                    focus: new Set(),
                    demoFace: null
                },
                program: null,
                busy: false
            };
            this.onboardingVisible = true;

            const root = this.ensureOnboardingRoot();
            root.hidden = false;
            document.body.classList.add('ob-open');
            requestAnimationFrame(() => root.classList.add('is-open'));
            this.renderOnboardingScreen('none');
        },

        hideOnboarding() {
            this.onboardingVisible = false;
            const root = document.getElementById('onboarding-root');
            document.body.classList.remove('ob-open');
            if (!root) return;
            root.classList.remove('is-open');
            setTimeout(() => {
                if (!this.onboardingVisible) root.hidden = true;
            }, 380);
        },

        async completeOnboarding({ refreshHome = true } = {}) {
            await db.setSetting('onboardingCompleted', true);
            this.hideOnboarding();
            if (refreshHome) {
                await this.renderHome();
            }
        },

        // Used by the ChatGPT prompt builder when called without a profile.
        getOnboardingProfileValues() {
            const answers = this.onboarding?.answers || {};
            const goal = GOALS.find(item => item.id === answers.goal);
            return {
                objective: goal?.objective || '',
                weeklyGoal: answers.days || 3
            };
        },

        ensureOnboardingRoot() {
            let root = document.getElementById('onboarding-root');
            if (root) return root;

            root = document.createElement('div');
            root.id = 'onboarding-root';
            root.className = 'ob-root';
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', t('onboarding.aria'));
            root.innerHTML = `
                <div class="ob-bg" aria-hidden="true"><span></span><span></span><span></span></div>
                <header class="ob-top">
                    <button type="button" class="ob-back" data-ob-action="back" aria-label="${t('common.back')}">${ARROW_LEFT_SVG}</button>
                    <div class="ob-progress" aria-hidden="true"><div class="ob-progress-fill"></div></div>
                    <span class="ob-top-spacer"></span>
                </header>
                <div class="ob-stage"></div>
                <footer class="ob-footer"></footer>
            `;
            document.body.appendChild(root);

            root.addEventListener('click', (event) => this.handleOnboardingClick(event));
            root.addEventListener('input', (event) => this.handleOnboardingInput(event));
            root.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && event.target.matches('.ob-input')) {
                    event.preventDefault();
                    this.goOnboardingNext();
                }
            });
            return root;
        },

        // ---------- navigation ----------
        getOnboardingNextStep(step) {
            const order = ['welcome', ...QUESTION_STEPS, 'building', 'plan'];
            if (step === 'plan') return this.isAppInstalled() ? null : 'install';
            if (step === 'install') return null;
            if (step === 'own') return null;
            const index = order.indexOf(step);
            return index >= 0 ? order[index + 1] : null;
        },

        goOnboardingTo(step, direction = 'forward') {
            const state = this.onboarding;
            if (!state || state.step === step) return;
            if (direction === 'forward') state.history.push(state.step);
            state.step = step;
            this.renderOnboardingScreen(direction);
        },

        goOnboardingNext() {
            const state = this.onboarding;
            if (!state || state.busy) return;
            if (!this.isOnboardingStepValid(state.step)) return;
            const next = this.getOnboardingNextStep(state.step);
            if (!next) {
                this.finishOnboarding();
                return;
            }
            this.hapticTap(10);
            this.goOnboardingTo(next, 'forward');
        },

        goOnboardingBack() {
            const state = this.onboarding;
            if (!state || state.busy || !state.history.length) return;
            const previous = state.history.pop();
            // Never land back on the loading screen.
            state.step = previous === 'building' ? (state.history.pop() || 'focus') : previous;
            this.renderOnboardingScreen('back');
        },

        isOnboardingStepValid(step) {
            const answers = this.onboarding?.answers || {};
            if (step === 'goal') return Boolean(answers.goal);
            if (step === 'level') return Boolean(answers.level);
            if (step === 'equipment') return Boolean(answers.equipment);
            return true;
        },

        // ---------- rendering ----------
        renderOnboardingScreen(direction = 'forward') {
            const root = this.ensureOnboardingRoot();
            const state = this.onboarding;
            const stage = root.querySelector('.ob-stage');
            const footer = root.querySelector('.ob-footer');
            const step = state.step;

            root.dataset.step = step;
            const questionIndex = QUESTION_STEPS.indexOf(step);
            const showTop = questionIndex >= 0 || step === 'own';
            root.querySelector('.ob-top').classList.toggle('is-hidden', !showTop);
            root.querySelector('.ob-progress-fill').style.transform = `scaleX(${questionIndex >= 0 ? (questionIndex + 1) / QUESTION_STEPS.length : 0})`;

            const screen = document.createElement('section');
            screen.className = `ob-screen ob-screen-${step}`;
            screen.innerHTML = this.getOnboardingScreenHtml(step);

            const previous = stage.querySelector('.ob-screen:not(.is-leaving)');
            if (previous && direction !== 'none') {
                previous.classList.add('is-leaving', direction === 'back' ? 'to-right' : 'to-left');
                setTimeout(() => previous.remove(), 420);
                screen.classList.add('is-entering', direction === 'back' ? 'from-left' : 'from-right');
            } else {
                stage.innerHTML = '';
                screen.classList.add('is-entering', 'from-fade');
            }
            stage.appendChild(screen);
            stage.scrollTop = 0;

            footer.innerHTML = this.getOnboardingFooterHtml(step);
            this.refreshOnboardingFooter();

            requestAnimationFrame(() => {
                screen.classList.remove('is-entering');
                this.afterOnboardingScreenRender(step, screen);
            });
        },

        getOnboardingFooterHtml(step) {
            const labels = {
                welcome: t('onboarding.cta.start'),
                name: t('common.continue'),
                goal: t('common.continue'),
                level: t('common.continue'),
                how: t('common.continue'),
                days: t('common.continue'),
                duration: t('common.continue'),
                equipment: t('common.continue'),
                focus: t('onboarding.cta.create'),
                plan: t('common.continue'),
                install: t('onboarding.cta.done')
            };
            if (!labels[step]) return '';

            let secondary = '';
            if (step === 'welcome') {
                secondary = `<button type="button" class="ob-link" data-ob-action="own">${t('onboarding.cta.own')}</button>`;
            } else if (step === 'name') {
                secondary = `<button type="button" class="ob-link" data-ob-action="skip-name">${t('onboarding.cta.skip')}</button>`;
            } else if (step === 'install') {
                secondary = `<button type="button" class="ob-link" data-ob-action="finish">${t('onboarding.cta.later')}</button>`;
            }

            return `
                <button type="button" class="ob-cta" data-ob-action="next">
                    <span>${labels[step]}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </button>
                ${secondary}
            `;
        },

        refreshOnboardingFooter() {
            const root = document.getElementById('onboarding-root');
            const cta = root?.querySelector('.ob-cta');
            if (!cta) return;
            const valid = this.isOnboardingStepValid(this.onboarding.step);
            cta.disabled = !valid;

            if (this.onboarding.step === 'focus') {
                const count = this.onboarding.answers.focus.size;
                cta.querySelector('span').textContent = count ? t('onboarding.cta.create') : t('onboarding.cta.createBalanced');
            }
        },

        getOnboardingScreenHtml(step) {
            const answers = this.onboarding.answers;

            switch (step) {
                case 'welcome':
                    return `
                        <div class="ob-welcome">
                            <div class="ob-hero-orb" aria-hidden="true">
                                <span class="ob-hero-ring"></span>
                                <span class="ob-hero-ring ob-hero-ring-2"></span>
                                <span class="ob-hero-emoji">🏋️</span>
                                <span class="ob-float ob-float-1">💪</span>
                                <span class="ob-float ob-float-2">🔥</span>
                                <span class="ob-float ob-float-3">📈</span>
                            </div>
                            <h1 class="ob-title ob-title-xl">${t('onboarding.welcome.title')}<br><span class="ob-grad">${t('onboarding.welcome.titleAccent')}</span></h1>
                            <p class="ob-sub">${t('onboarding.welcome.sub')}</p>
                            <ul class="ob-perks">
                                <li><span>🎯</span>${t('onboarding.welcome.perk1')}</li>
                                <li><span>🧠</span>${t('onboarding.welcome.perk2')}</li>
                                <li><span>🏆</span>${t('onboarding.welcome.perk3')}</li>
                            </ul>
                        </div>
                    `;

                case 'name':
                    return `
                        ${this.getOnboardingHeadHtml('👋', t('onboarding.name.title'), '')}
                        <input type="text" class="ob-input" id="ob-name" maxlength="24" autocomplete="given-name" autocapitalize="words" placeholder="${esc(t('onboarding.name.placeholder'))}" aria-label="${esc(t('onboarding.name.placeholder'))}" value="${esc(answers.name)}">
                    `;

                case 'goal':
                    return `
                        ${this.getOnboardingHeadHtml('🎯', answers.name ? t('onboarding.goal.titleName', { name: esc(answers.name) }) : t('onboarding.goal.title'), '')}
                        <div class="ob-options">
                            ${GOALS.map((goal, index) => this.getOnboardingOptionHtml('goal', withCopy('goal', goal), answers.goal === goal.id, index)).join('')}
                        </div>
                    `;

                case 'level':
                    return `
                        ${this.getOnboardingHeadHtml('📊', t('onboarding.level.title'), t('onboarding.level.sub'))}
                        <div class="ob-options">
                            ${LEVELS.map((level, index) => this.getOnboardingOptionHtml('level', withCopy('level', level), answers.level === level.id, index)).join('')}
                        </div>
                    `;

                case 'how':
                    return this.getOnboardingHowHtml();

                case 'days':
                    return `
                        ${this.getOnboardingHeadHtml('🗓️', t('onboarding.days.title'), t('onboarding.days.sub'))}
                        <div class="ob-slider-card" id="ob-days-card">
                            <div class="ob-big-value"><span class="ob-big-number" id="ob-days-value">${answers.days}</span><span class="ob-big-unit" id="ob-days-unit">${t('onboarding.days.unit', { count: answers.days })}</span></div>
                            <div class="ob-week" id="ob-week">
                                ${t('common.weekdayInitials').split(',').map((day, index) => `<span class="ob-day" data-day="${index}">${day}</span>`).join('')}
                            </div>
                            <input type="range" class="ob-range" id="ob-days" min="1" max="7" step="1" value="${answers.days}" aria-label="${t('onboarding.days.aria')}">
                            <div class="ob-range-scale"><span>1</span><span>7</span></div>
                            <p class="ob-caption" id="ob-days-caption"></p>
                        </div>
                    `;

                case 'duration':
                    return `
                        ${this.getOnboardingHeadHtml('⏱️', t('onboarding.duration.title'), t('onboarding.duration.sub'))}
                        <div class="ob-slider-card" id="ob-duration-card">
                            <div class="ob-clock" aria-hidden="true">
                                <svg viewBox="0 0 120 120"><circle class="ob-clock-bg" cx="60" cy="60" r="52"/><circle class="ob-clock-fill" id="ob-clock-fill" cx="60" cy="60" r="52"/></svg>
                                <div class="ob-clock-center"><span class="ob-big-number" id="ob-duration-value">${answers.duration}</span><span class="ob-big-unit">min</span></div>
                            </div>
                            <input type="range" class="ob-range" id="ob-duration" min="30" max="120" step="15" value="${answers.duration}" aria-label="${t('onboarding.duration.aria')}">
                            <div class="ob-range-scale"><span>30 min</span><span>2 h</span></div>
                            <p class="ob-caption" id="ob-duration-caption"></p>
                        </div>
                    `;

                case 'equipment':
                    return `
                        ${this.getOnboardingHeadHtml('🏠', t('onboarding.equipment.title'), t('onboarding.equipment.sub'))}
                        <div class="ob-options">
                            ${EQUIPMENT.map((item, index) => this.getOnboardingOptionHtml('equipment', withCopy('equipment', item), answers.equipment === item.id, index)).join('')}
                        </div>
                    `;

                case 'focus':
                    return `
                        ${this.getOnboardingHeadHtml('✨', t('onboarding.focus.title'), t('onboarding.focus.sub'))}
                        <div class="ob-chips">
                            ${FOCUS.map((item, index) => `
                                <button type="button" class="ob-chip ${answers.focus.has(item.id) ? 'is-selected' : ''}" data-ob-focus="${item.id}" style="--i:${index}" aria-pressed="${answers.focus.has(item.id)}">
                                    <img class="ob-chip-icon" src="icons/muscles/${item.icon}.png" alt="">${t(`onboarding.focus.${item.id}`)}
                                </button>
                            `).join('')}
                        </div>
                    `;

                case 'building':
                    return `
                        <div class="ob-building">
                            <div class="ob-meter" id="ob-meter" style="--p:0">
                                <div class="ob-meter-inner"><span id="ob-meter-value">0</span><small>%</small></div>
                            </div>
                            <h2 class="ob-title">${t('onboarding.build.title')}</h2>
                            <ul class="ob-build-list" id="ob-build-list">
                                ${BUILD_STEPS.map((emoji, index) => `
                                    <li data-build="${index}"><span class="ob-build-icon">${emoji}</span><span class="ob-build-text">${t(`onboarding.build.step${index + 1}`)}</span><span class="ob-build-check">${CHECK_SVG}</span></li>
                                `).join('')}
                            </ul>
                        </div>
                    `;

                case 'plan':
                    return this.getOnboardingPlanHtml();

                case 'install':
                    return this.getOnboardingInstallHtml();

                case 'own':
                    return `
                        ${this.getOnboardingHeadHtml('📂', t('onboarding.own.title'), t('onboarding.own.sub'))}
                        <div class="ob-options">
                            <button type="button" class="ob-option" data-ob-action="own-import" style="--i:0">
                                <span class="ob-option-emoji">📥</span>
                                <span class="ob-option-copy"><strong>${t('onboarding.own.import.title')}</strong><small>${t('onboarding.own.import.desc')}</small></span>
                            </button>
                            <button type="button" class="ob-option" data-ob-action="own-manual" style="--i:1">
                                <span class="ob-option-emoji">✍️</span>
                                <span class="ob-option-copy"><strong>${t('onboarding.own.manual.title')}</strong><small>${t('onboarding.own.manual.desc')}</small></span>
                            </button>
                            <button type="button" class="ob-option" data-ob-action="own-chat" style="--i:2">
                                <span class="ob-option-emoji">🤖</span>
                                <span class="ob-option-copy"><strong>${t('onboarding.own.chat.title')}</strong><small>${t('onboarding.own.chat.desc')}</small></span>
                            </button>
                        </div>
                    `;

                default:
                    return '';
            }
        },

        getOnboardingHeadHtml(emoji, title, subtitle) {
            return `
                <div class="ob-head">
                    <span class="ob-head-emoji" aria-hidden="true">${emoji}</span>
                    <h2 class="ob-title">${title}</h2>
                    ${subtitle ? `<p class="ob-sub">${subtitle}</p>` : ''}
                </div>
            `;
        },

        getOnboardingOptionHtml(field, item, selected, index) {
            return `
                <button type="button" class="ob-option ${selected ? 'is-selected' : ''}" data-ob-field="${field}" data-ob-value="${item.id}" style="--i:${index}" aria-pressed="${selected}">
                    <span class="ob-option-emoji">${item.emoji}</span>
                    <span class="ob-option-copy"><strong>${item.title}</strong><small>${item.desc}</small></span>
                    <span class="ob-option-check">${CHECK_SVG}</span>
                </button>
            `;
        },

        getOnboardingHowHtml() {
            const faces = [6, 7, 8, 9, 10].map(rpe => ({ rpe, ...this.getRpeFace(rpe) }));
            return `
                ${this.getOnboardingHeadHtml('🧠', t('onboarding.how.title'), t('onboarding.how.sub'))}
                <div class="ob-demo">
                    <div class="ob-demo-set">
                        <span class="ob-demo-badge">${CHECK_SVG}</span>
                        <div class="ob-demo-set-copy">
                            <small>${t('onboarding.how.demoSet')}</small>
                            <strong>60 kg × 8</strong>
                        </div>
                        <span class="ob-demo-xp">+10 XP</span>
                    </div>
                    <div class="ob-demo-faces" role="group" aria-label="${t('onboarding.how.facesAria')}">
                        ${faces.map(face => `
                            <button type="button" class="ob-face" data-ob-face="${face.rpe}" aria-pressed="false">
                                <span class="ob-face-emoji">${face.emoji}</span>
                                <span class="ob-face-label">${face.label}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div class="ob-demo-coach" id="ob-demo-coach">
                        <span class="ob-demo-avatar">🤖</span>
                        <p id="ob-demo-coach-text">${t('onboarding.how.prompt')}</p>
                    </div>
                    <ol class="ob-demo-steps">
                        <li><span>1</span>${t('onboarding.how.step1')}</li>
                        <li><span>2</span>${t('onboarding.how.step2')}</li>
                        <li><span>3</span>${t('onboarding.how.step3')}</li>
                    </ol>
                </div>
            `;
        },

        getOnboardingPlanHtml() {
            const program = this.onboarding.program;
            const answers = this.onboarding.answers;
            if (!program) return '';
            const totalExercises = program.sessions.reduce((sum, session) => sum + session.slots.length, 0);
            const muscleLabel = (id) => (typeof MUSCLE_GROUPS !== 'undefined' ? MUSCLE_GROUPS.find(group => group.id === id)?.name : '') || id;
            const muscleIcon = (id) => `icons/muscles/${String(id).normalize('NFD').replace(/[̀-ͯ]/g, '')}.png`;
            const title = answers.name ? t('onboarding.plan.titleName', { name: esc(answers.name) }) : t('onboarding.plan.title');
            const goalTitle = answers.goal ? t(`onboarding.goal.${answers.goal}.title`) : '';

            return `
                <div class="ob-plan">
                    <div class="ob-plan-badge" aria-hidden="true">🎉</div>
                    <h2 class="ob-title">${title}</h2>
                    <p class="ob-sub">${esc(program.splitLabel)}${goalTitle ? ` · ${esc(goalTitle)}` : ''}</p>

                    <div class="ob-plan-stats">
                        <div style="--i:0"><strong data-ob-count="${answers.days}">0</strong><span>${t('onboarding.plan.perWeek')}</span></div>
                        <div style="--i:1"><strong data-ob-count="${totalExercises}">0</strong><span>${t('onboarding.plan.exercises')}</span></div>
                        <div style="--i:2"><strong>~<b data-ob-count="${answers.duration}">0</b></strong><span>${t('onboarding.plan.minutes')}</span></div>
                    </div>

                    <div class="ob-plan-sessions">
                        ${program.sessions.map((session, index) => {
                            const muscles = Array.from(new Set(session.slots.map(slot => slot.muscleGroup))).slice(0, 4);
                            return `
                                <details class="ob-plan-session" style="--i:${index}" ${index === 0 ? 'open' : ''}>
                                    <summary>
                                        <span class="ob-plan-session-index">${index + 1}</span>
                                        <span class="ob-plan-session-copy">
                                            <strong>${esc(session.name)}</strong>
                                            <small>${t('common.exercises', { count: session.slots.length })} · ${muscles.map(muscleLabel).join(', ')}</small>
                                        </span>
                                        <span class="ob-plan-session-icons" aria-hidden="true">
                                            ${muscles.slice(0, 3).map(id => `<img src="${muscleIcon(id)}" alt="" loading="lazy">`).join('')}
                                        </span>
                                    </summary>
                                    <ul>
                                        ${session.slots.map(slot => `
                                            <li><span>${esc(slot.name)}</span><em>${slot.sets} × ${slot.repsMin}-${slot.repsMax}</em></li>
                                        `).join('')}
                                    </ul>
                                </details>
                            `;
                        }).join('')}
                    </div>

                    <p class="ob-plan-note">✏️ ${t('onboarding.plan.note')}</p>
                </div>
            `;
        },

        getOnboardingInstallHtml() {
            const platform = this.getInstallPlatform();
            const steps = platform === 'ios'
                ? [
                    { icon: SHARE_SVG, text: t('onboarding.install.ios1') },
                    { icon: '<b>＋</b>', text: t('onboarding.install.ios2') },
                    { icon: CHECK_SVG, text: t('onboarding.install.ios3') }
                ]
                : [
                    { icon: DOTS_SVG, text: t('onboarding.install.android1') },
                    { icon: '<b>＋</b>', text: t('onboarding.install.android2') },
                    { icon: CHECK_SVG, text: t('onboarding.install.android3') }
                ];

            return `
                ${this.getOnboardingHeadHtml('📲', t('onboarding.install.title'), t('onboarding.install.sub'))}
                <div class="ob-install-phone" aria-hidden="true">
                    <div class="ob-install-screen">
                        <span class="ob-install-app"><img src="icons/icon-192.png" alt=""></span>
                        <span class="ob-install-app is-ghost"></span>
                        <span class="ob-install-app is-ghost"></span>
                        <span class="ob-install-app is-ghost"></span>
                    </div>
                </div>
                <ol class="ob-install-steps">
                    ${steps.map((item, index) => `<li style="--i:${index}"><span class="ob-install-icon">${item.icon}</span><span>${item.text}</span></li>`).join('')}
                </ol>
            `;
        },

        afterOnboardingScreenRender(step, screen) {
            if (step === 'name') {
                // Keyboards popping instantly feel aggressive; give the slide time to land.
                setTimeout(() => screen.querySelector('#ob-name')?.focus({ preventScroll: true }), 420);
            } else if (step === 'days') {
                this.updateOnboardingDaysUI(false);
            } else if (step === 'duration') {
                this.updateOnboardingDurationUI(false);
            } else if (step === 'building') {
                this.runOnboardingBuild();
            } else if (step === 'plan') {
                this.animateOnboardingCounts(screen);
                const badge = screen.querySelector('.ob-plan-badge');
                if (badge) {
                    const rect = badge.getBoundingClientRect();
                    gamification.burst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, count: 90, spread: 160, power: 15 });
                }
                this.hapticTap([30, 40, 60]);
            }
        },

        updateOnboardingDaysUI(withFeedback = true) {
            const answers = this.onboarding.answers;
            const days = answers.days;
            const valueEl = document.getElementById('ob-days-value');
            const unitEl = document.getElementById('ob-days-unit');
            const caption = document.getElementById('ob-days-caption');
            if (valueEl) {
                valueEl.textContent = days;
                if (withFeedback) this.popOnboardingElement(valueEl);
            }
            if (unitEl) unitEl.textContent = t('onboarding.days.unit', { count: days });
            if (caption) caption.innerHTML = `<span>${DAY_EMOJIS[days - 1]}</span> ${t(`onboarding.days.caption${days}`)}`;
            const pattern = WEEK_PATTERNS[days];
            document.querySelectorAll('#ob-week .ob-day').forEach((dayEl, index) => {
                dayEl.classList.toggle('is-on', pattern[index] === 1);
            });
            const range = document.getElementById('ob-days');
            if (range) range.style.setProperty('--fill', `${((days - 1) / 6) * 100}%`);
        },

        updateOnboardingDurationUI(withFeedback = true) {
            const minutes = this.onboarding.answers.duration;
            const valueEl = document.getElementById('ob-duration-value');
            const caption = document.getElementById('ob-duration-caption');
            const fill = document.getElementById('ob-clock-fill');
            if (valueEl) {
                valueEl.textContent = minutes;
                if (withFeedback) this.popOnboardingElement(valueEl);
            }
            const count = exerciseCountForDuration(minutes);
            if (caption) caption.innerHTML = `<span>🏋️</span> ${t('onboarding.duration.caption', { count })}`;
            if (fill) {
                const circumference = 2 * Math.PI * 52;
                fill.style.strokeDasharray = `${circumference}`;
                fill.style.strokeDashoffset = `${circumference * (1 - minutes / 120)}`;
            }
            const range = document.getElementById('ob-duration');
            if (range) range.style.setProperty('--fill', `${((minutes - 30) / 90) * 100}%`);
        },

        popOnboardingElement(element) {
            element.classList.remove('is-pop');
            void element.offsetWidth;
            element.classList.add('is-pop');
        },

        animateOnboardingCounts(screen) {
            screen.querySelectorAll('[data-ob-count]').forEach((element) => {
                const target = parseInt(element.dataset.obCount, 10) || 0;
                const start = performance.now();
                const duration = 900;
                const tick = (now) => {
                    const progress = Math.min(1, (now - start) / duration);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    element.textContent = Math.round(target * eased);
                    if (progress < 1) requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            });
        },

        // ---------- interactions ----------
        handleOnboardingClick(event) {
            const state = this.onboarding;
            if (!state) return;

            const option = event.target.closest('[data-ob-field]');
            if (option) {
                this.selectOnboardingOption(option);
                return;
            }

            const focusChip = event.target.closest('[data-ob-focus]');
            if (focusChip) {
                const id = focusChip.dataset.obFocus;
                if (state.answers.focus.has(id)) state.answers.focus.delete(id);
                else state.answers.focus.add(id);
                const selected = state.answers.focus.has(id);
                focusChip.classList.toggle('is-selected', selected);
                focusChip.setAttribute('aria-pressed', String(selected));
                this.popOnboardingElement(focusChip);
                this.hapticTap(8);
                this.refreshOnboardingFooter();
                return;
            }

            const face = event.target.closest('[data-ob-face]');
            if (face) {
                this.reactOnboardingDemo(parseInt(face.dataset.obFace, 10));
                return;
            }

            const actionEl = event.target.closest('[data-ob-action]');
            if (!actionEl || actionEl.disabled) return;
            const action = actionEl.dataset.obAction;

            if (action === 'next') this.goOnboardingNext();
            else if (action === 'back') this.goOnboardingBack();
            else if (action === 'skip-name') {
                state.answers.name = '';
                this.goOnboardingTo('goal', 'forward');
            } else if (action === 'own') this.goOnboardingTo('own', 'forward');
            else if (action === 'own-import') this.startOnboardingImport();
            else if (action === 'own-manual') this.startOnboardingManualCreation();
            else if (action === 'own-chat') this.copyOnboardingPrompt();
            else if (action === 'finish') this.finishOnboarding();
        },

        handleOnboardingInput(event) {
            const state = this.onboarding;
            if (!state) return;
            const target = event.target;

            if (target.id === 'ob-name') {
                state.answers.name = target.value.trim().slice(0, 24);
            } else if (target.id === 'ob-days') {
                const value = parseInt(target.value, 10) || 3;
                if (value !== state.answers.days) {
                    state.answers.days = value;
                    this.hapticTap(6);
                    this.updateOnboardingDaysUI(true);
                }
            } else if (target.id === 'ob-duration') {
                const value = parseInt(target.value, 10) || 60;
                if (value !== state.answers.duration) {
                    state.answers.duration = value;
                    this.hapticTap(6);
                    this.updateOnboardingDurationUI(true);
                }
            }
        },

        selectOnboardingOption(option) {
            const state = this.onboarding;
            if (state.busy) return;
            const field = option.dataset.obField;
            state.answers[field] = option.dataset.obValue;

            option.parentElement.querySelectorAll('[data-ob-field]').forEach((element) => {
                const selected = element === option;
                element.classList.toggle('is-selected', selected);
                element.setAttribute('aria-pressed', String(selected));
            });
            this.popOnboardingElement(option);
            this.hapticTap(12);
            this.refreshOnboardingFooter();

            // Single-choice questions move on by themselves once the tap registered.
            state.busy = true;
            const step = state.step;
            setTimeout(() => {
                state.busy = false;
                if (this.onboarding?.step === step) this.goOnboardingNext();
            }, 420);
        },

        reactOnboardingDemo(rpe) {
            const replies = {
                6: t('onboarding.how.reply6'),
                7: t('onboarding.how.reply7'),
                8: t('onboarding.how.reply8'),
                9: t('onboarding.how.reply9'),
                10: t('onboarding.how.reply10')
            };
            this.onboarding.answers.demoFace = rpe;
            document.querySelectorAll('.ob-face').forEach((face) => {
                const selected = parseInt(face.dataset.obFace, 10) === rpe;
                face.classList.toggle('is-selected', selected);
                face.setAttribute('aria-pressed', String(selected));
                if (selected) this.popOnboardingElement(face);
            });
            const bubble = document.getElementById('ob-demo-coach');
            const text = document.getElementById('ob-demo-coach-text');
            if (bubble && text) {
                text.innerHTML = replies[rpe];
                bubble.classList.add('is-answered');
                this.popOnboardingElement(bubble);
            }
            this.hapticTap(10);
        },

        // ---------- build ----------
        async runOnboardingBuild() {
            const state = this.onboarding;
            state.busy = true;
            const meter = document.getElementById('ob-meter');
            const meterValue = document.getElementById('ob-meter-value');
            const items = Array.from(document.querySelectorAll('#ob-build-list li'));
            const totalDuration = 4200;
            const start = performance.now();

            const importPromise = this.saveOnboardingProgram().catch((error) => {
                console.error('Création du programme impossible:', error);
                return error;
            });

            await new Promise((resolve) => {
                const tick = (now) => {
                    const progress = Math.min(1, (now - start) / totalDuration);
                    // Ease that slows down near the end, like a real computation.
                    const eased = progress < 0.85 ? progress * 1.05 : 0.8925 + (progress - 0.85) * 0.716;
                    const percent = Math.min(100, Math.round(eased * 100));
                    if (meter) meter.style.setProperty('--p', percent);
                    if (meterValue) meterValue.textContent = percent;
                    items.forEach((item, index) => {
                        const threshold = (index + 1) / (items.length + 0.4);
                        if (progress >= threshold && !item.classList.contains('is-done')) {
                            item.classList.add('is-done');
                            this.hapticTap(8);
                        } else if (progress >= threshold - 0.2) {
                            item.classList.add('is-active');
                        }
                    });
                    if (progress < 1) requestAnimationFrame(tick);
                    else resolve();
                };
                requestAnimationFrame(tick);
            });

            const result = await importPromise;
            items.forEach(item => item.classList.add('is-done'));
            await wait(350);
            state.busy = false;

            if (result instanceof Error) {
                this.showCoachToast(t('onboarding.toast.buildFailed'), 'warning', '⚠️');
                state.step = 'focus';
                state.history.pop();
                this.renderOnboardingScreen('back');
                return;
            }
            this.goOnboardingTo('plan', 'forward');
        },

        async saveOnboardingProgram() {
            const answers = this.onboarding.answers;
            const program = buildProgramFromAnswers(answers);
            this.onboarding.program = program;

            await this.importProgramData(program);
            await this.migrateExerciseIdentityMetadata({ force: true });
            await Promise.all([
                db.setSetting('userName', answers.name || ''),
                db.setSetting('trainingLevel', answers.level || ''),
                db.setSetting('trainingEquipment', answers.equipment || ''),
                db.setSetting('sessionDurationTarget', answers.duration || 60),
                db.setSetting('trainingFocus', Array.from(answers.focus))
            ]);
            // importProgramData marks onboarding complete; keep the flow open
            // until the user leaves the plan screen. The flag is already saved,
            // so a reload from here simply lands on the new home.
            this.invalidateExerciseHistoryCaches?.();
        },

        async finishOnboarding() {
            if (!this.onboarding) return;
            const hadProgram = Boolean(this.onboarding.program);
            const name = this.onboarding.answers.name;
            await this.completeOnboarding({ refreshHome: true });
            if (hadProgram) {
                const button = document.getElementById('btn-start-session');
                if (button) {
                    gamification.burstFromElement(button, { count: 60, spread: 160, power: 13 });
                }
                this.showCoachToast(t('onboarding.toast.ready'), 'hot', '✅');
            }
            this.onboarding = null;
        },

        // ---------- "I already have a program" ----------
        startOnboardingImport() {
            this.pendingImportContext = 'onboarding';
            document.getElementById('import-file')?.click();
        },

        async startOnboardingManualCreation() {
            const answers = this.onboarding?.answers;
            await db.setSetting('weeklyGoal', answers?.days || 3);
            await this.completeOnboarding({ refreshHome: true });
            this.onboarding = null;
            await this.showEditSessionsSheet();
            this.showNewSessionView();
        },

        async copyOnboardingPrompt() {
            const profile = this.getOnboardingProfileValues();
            const prompt = this.buildChatProgramPrompt(profile);
            const copied = await this.copyTextToClipboard(prompt);
            if (copied) {
                this.showCoachToast(t('onboarding.toast.promptCopied'), 'hot', '📋');
            } else {
                this.showCoachToast(t('onboarding.toast.copyFailed'), 'warning', '📋');
            }
        }
    };

    // ===== Help bubbles =====
    // Any element with data-help="key" opens a short plain-language explanation.
    // Text lives in locales: help.<key>.title and help.<key>.body1…bodyN.
    const HELP_TOPICS = {
        deload: { emoji: '🔋', lines: 3 },
        cycle: { emoji: '🔁', lines: 3 },
        ressenti: { emoji: '😤', lines: 4 },
        exercise: { lines: 4 },
        targets: { lines: 3 },
        e1rm: { emoji: '👑', lines: 3 }
    };

    const getHelpTopic = (key) => {
        const topic = HELP_TOPICS[key];
        if (!topic) return null;
        return {
            ...topic,
            title: t(`help.${key}.title`),
            body: Array.from({ length: topic.lines }, (_, index) => t(`help.${key}.body${index + 1}`))
        };
    };

    const HelpBubbles = {
        showHelpTopic(key) {
            const topic = getHelpTopic(key);
            if (!topic) return;
            let sheet = document.getElementById('help-sheet');
            if (!sheet) {
                sheet = document.createElement('div');
                sheet.id = 'help-sheet';
                sheet.className = 'help-sheet';
                sheet.setAttribute('role', 'dialog');
                sheet.setAttribute('aria-modal', 'true');
                sheet.innerHTML = `<div class="help-sheet-backdrop" data-help-close></div><div class="help-sheet-card"><div class="help-sheet-body"></div><button type="button" class="help-sheet-ok" data-help-close>${t('help.ok')}</button></div>`;
                document.body.appendChild(sheet);
                sheet.addEventListener('click', (event) => {
                    if (event.target.closest('[data-help-close]')) this.hideHelpTopic();
                });
            }
            sheet.querySelector('.help-sheet-body').innerHTML = `
                <h3>${topic.title}</h3>
                ${topic.body.map(line => `<p>${line}</p>`).join('')}
            `;
            sheet.setAttribute('aria-label', topic.title.replace(/<[^>]+>/g, ''));
            sheet.hidden = false;
            requestAnimationFrame(() => sheet.classList.add('is-open'));
            this.hapticTap?.(8);
            setTimeout(() => sheet.querySelector('.help-sheet-ok')?.focus({ preventScroll: true }), 60);
        },

        hideHelpTopic() {
            const sheet = document.getElementById('help-sheet');
            if (!sheet) return;
            sheet.classList.remove('is-open');
            setTimeout(() => {
                if (!sheet.classList.contains('is-open')) sheet.hidden = true;
            }, 260);
        }
    };

    Object.assign(App.prototype, HelpBubbles);

    if (typeof document !== 'undefined') {
        // Capture phase: help dots sit inside clickable cards, they must not
        // trigger the card behind them.
        document.addEventListener('click', (event) => {
            const trigger = event.target.closest?.('[data-help]');
            if (!trigger || typeof app === 'undefined') return;
            event.preventDefault();
            event.stopPropagation();
            app.showHelpTopic(trigger.dataset.help);
        }, true);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && typeof app !== 'undefined') app.hideHelpTopic();
        });
    }

    Object.assign(App.prototype, OnboardingFlow);

    // Exposed for tests.
    if (typeof window !== 'undefined') {
        window.WorktoutOnboarding = { buildProgramFromAnswers, exerciseCountForDuration, HELP_TOPICS };
    }
})();
