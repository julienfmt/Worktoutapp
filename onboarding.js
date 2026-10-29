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

    const GOALS = [
        { id: 'muscle', emoji: '💪', title: 'Prendre du muscle', desc: 'Plus de volume, des muscles qui se voient', objective: 'Prise de masse' },
        { id: 'fat', emoji: '🔥', title: 'Perdre du gras', desc: 'Garder ses muscles et s\'affiner', objective: 'Perte de gras' },
        { id: 'recomp', emoji: '⚖️', title: 'Un peu des deux', desc: 'Se muscler et s\'affiner en même temps', objective: 'Recomposition' },
        { id: 'strength', emoji: '🏋️', title: 'Devenir plus fort', desc: 'Soulever plus lourd sur les gros mouvements', objective: 'Force' },
        { id: 'restart', emoji: '🌱', title: 'Reprendre en douceur', desc: 'Retrouver la forme sans se blesser', objective: 'Reprise' }
    ];

    const LEVELS = [
        { id: 'beginner', emoji: '🐣', title: 'Je débute', desc: 'Moins de 6 mois de muscu' },
        { id: 'intermediate', emoji: '🚀', title: 'J\'ai les bases', desc: '6 mois à 2 ans de pratique' },
        { id: 'advanced', emoji: '🦾', title: 'Confirmé', desc: 'Plus de 2 ans, je connais les mouvements' }
    ];

    const EQUIPMENT = [
        { id: 'gym', emoji: '🏢', title: 'En salle', desc: 'Machines, poulies, barres et haltères' },
        { id: 'home', emoji: '🏠', title: 'À la maison', desc: 'Des haltères et un banc' },
        { id: 'bodyweight', emoji: '🤸', title: 'Sans matériel', desc: 'Poids du corps, une barre de traction au mieux' }
    ];

    const FOCUS = [
        { id: 'pecs', icon: 'pectoraux', label: 'Pecs', muscles: ['pectoraux'] },
        { id: 'back', icon: 'dos', label: 'Dos', muscles: ['dos'] },
        { id: 'shoulders', icon: 'epaules', label: 'Épaules', muscles: ['epaules'] },
        { id: 'arms', icon: 'biceps', label: 'Bras', muscles: ['biceps', 'triceps'] },
        { id: 'legs', icon: 'quadriceps', label: 'Jambes', muscles: ['quadriceps', 'ischio-jambiers', 'mollets'] },
        { id: 'glutes', icon: 'fessiers', label: 'Fessiers', muscles: ['fessiers'] },
        { id: 'abs', icon: 'abdominaux', label: 'Abdos', muscles: ['abdominaux'] }
    ];

    const DAY_CAPTIONS = [
        { emoji: '🌤️', text: 'Une séance, c\'est déjà un vrai départ' },
        { emoji: '🙂', text: 'Tranquille, facile à tenir' },
        { emoji: '😎', text: 'Le rythme parfait pour progresser' },
        { emoji: '🔥', text: 'Très solide, ça va payer' },
        { emoji: '⚡', text: 'Gros rythme, pense à bien dormir' },
        { emoji: '🦾', text: 'Mode machine activé' },
        { emoji: '🤯', text: 'Tous les jours ? Respect.' }
    ];

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
        fullA: { name: 'Corps complet A', moves: ['squat', 'chestPress', 'row', 'hinge', 'lateralRaise', 'biceps', 'triceps', 'abs', 'calves'] },
        fullB: { name: 'Corps complet B', moves: ['legPress', 'verticalPull', 'inclinePress', 'legCurl', 'rearDelt', 'triceps2', 'biceps2', 'calves', 'abs'] },
        fullC: { name: 'Corps complet C', moves: ['hipThrust', 'shoulderPress', 'row', 'squat', 'chestFly', 'biceps', 'triceps', 'abs', 'legCurl'] },
        upperA: { name: 'Haut du corps A', moves: ['chestPress', 'row', 'shoulderPress', 'verticalPull', 'lateralRaise', 'biceps', 'triceps', 'rearDelt', 'chestFly'] },
        lowerA: { name: 'Bas du corps A', moves: ['squat', 'hinge', 'legCurl', 'legExt', 'calves', 'abs', 'hipThrust'] },
        upperB: { name: 'Haut du corps B', moves: ['inclinePress', 'verticalPull', 'row2', 'chestFly', 'lateralRaise', 'triceps2', 'biceps2', 'rearDelt', 'row'] },
        lowerB: { name: 'Bas du corps B', moves: ['legPress', 'hipThrust', 'legCurl', 'legExt', 'calves', 'abs', 'hinge'] },
        push: { name: 'Poussée · pecs, épaules, triceps', moves: ['chestPress', 'shoulderPress', 'inclinePress', 'lateralRaise', 'chestFly', 'triceps', 'triceps2'] },
        pull: { name: 'Tirage · dos, biceps', moves: ['verticalPull', 'row', 'row2', 'rearDelt', 'biceps', 'biceps2', 'abs'] },
        legs: { name: 'Jambes · cuisses, fessiers', moves: ['squat', 'hinge', 'legPress', 'legCurl', 'legExt', 'calves', 'abs', 'hipThrust'] }
    };

    const SPLITS = {
        1: { label: 'Corps complet', sessions: ['fullA'] },
        2: { label: 'Corps complet', sessions: ['fullA', 'fullB'] },
        3: { label: 'Corps complet', sessions: ['fullA', 'fullB', 'fullC'] },
        '3plus': { label: 'Poussée / Tirage / Jambes', sessions: ['push', 'pull', 'legs'] },
        4: { label: 'Haut / Bas', sessions: ['upperA', 'lowerA', 'upperB', 'lowerB'] },
        5: { label: 'Poussée / Tirage / Jambes + Haut / Bas', sessions: ['push', 'pull', 'legs', 'upperA', 'lowerA'] },
        6: { label: 'Poussée / Tirage / Jambes ×2', sessions: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] }
    };

    const BUILD_STEPS = [
        { emoji: '🎯', text: 'Analyse de ton objectif' },
        { emoji: '🗓️', text: 'Organisation de ta semaine' },
        { emoji: '🏋️', text: 'Choix des exercices' },
        { emoji: '⏱️', text: 'Réglage des séries et des repos' },
        { emoji: '🧠', text: 'Activation de ton coach' }
    ];

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
            const template = SESSION_TEMPLATES[templateId];
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
            splitLabel: split.label,
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
            root.setAttribute('aria-label', 'Bienvenue');
            root.innerHTML = `
                <div class="ob-bg" aria-hidden="true"><span></span><span></span><span></span></div>
                <header class="ob-top">
                    <button type="button" class="ob-back" data-ob-action="back" aria-label="Retour">${ARROW_LEFT_SVG}</button>
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
                welcome: 'C\'est parti',
                name: 'Continuer',
                goal: 'Continuer',
                level: 'Continuer',
                how: 'Compris !',
                days: 'Continuer',
                duration: 'Continuer',
                equipment: 'Continuer',
                focus: 'Créer mon programme',
                plan: 'Commencer',
                install: 'C\'est fait'
            };
            if (!labels[step]) return '';

            let secondary = '';
            if (step === 'welcome') {
                secondary = '<button type="button" class="ob-link" data-ob-action="own">J\'ai déjà un programme</button>';
            } else if (step === 'name') {
                secondary = '<button type="button" class="ob-link" data-ob-action="skip-name">Passer</button>';
            } else if (step === 'install') {
                secondary = '<button type="button" class="ob-link" data-ob-action="finish">Plus tard</button>';
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
                cta.querySelector('span').textContent = count ? 'Créer mon programme' : 'Équilibré, créer mon programme';
            }
        },

        getOnboardingScreenHtml(step) {
            const answers = this.onboarding.answers;
            const firstName = answers.name ? `, ${esc(answers.name)}` : '';

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
                            <h1 class="ob-title ob-title-xl">Ton coach muscu,<br><span class="ob-grad">dans ta poche.</span></h1>
                            <p class="ob-sub">Un programme fait pour toi en 1 minute. Ensuite, l'app te dit quoi soulever à chaque série.</p>
                            <ul class="ob-perks">
                                <li><span>🎯</span>Programme adapté à ton objectif</li>
                                <li><span>🧠</span>Charges calculées pour progresser</li>
                                <li><span>🔥</span>Séries, records et trophées</li>
                            </ul>
                        </div>
                    `;

                case 'name':
                    return `
                        ${this.getOnboardingHeadHtml('👋', 'Comment on t\'appelle ?', 'Juste pour te parler comme un vrai coach.')}
                        <input type="text" class="ob-input" id="ob-name" maxlength="24" autocomplete="given-name" autocapitalize="words" placeholder="Ton prénom" value="${esc(answers.name)}">
                    `;

                case 'goal':
                    return `
                        ${this.getOnboardingHeadHtml('🎯', `Ton objectif principal${firstName} ?`, 'On construit ton programme autour.')}
                        <div class="ob-options">
                            ${GOALS.map((goal, index) => this.getOnboardingOptionHtml('goal', goal, answers.goal === goal.id, index)).join('')}
                        </div>
                    `;

                case 'level':
                    return `
                        ${this.getOnboardingHeadHtml('📊', 'Tu en es où en muscu ?', 'Pas de jugement, ça règle juste la difficulté.')}
                        <div class="ob-options">
                            ${LEVELS.map((level, index) => this.getOnboardingOptionHtml('level', level, answers.level === level.id, index)).join('')}
                        </div>
                    `;

                case 'how':
                    return this.getOnboardingHowHtml();

                case 'days':
                    return `
                        ${this.getOnboardingHeadHtml('🗓️', 'Combien de séances par semaine ?', 'Mieux vaut un rythme tenable qu\'un rythme parfait.')}
                        <div class="ob-slider-card" id="ob-days-card">
                            <div class="ob-big-value"><span class="ob-big-number" id="ob-days-value">${answers.days}</span><span class="ob-big-unit" id="ob-days-unit">${answers.days > 1 ? 'séances' : 'séance'}</span></div>
                            <div class="ob-week" id="ob-week">
                                ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => `<span class="ob-day" data-day="${index}">${day}</span>`).join('')}
                            </div>
                            <input type="range" class="ob-range" id="ob-days" min="1" max="7" step="1" value="${answers.days}" aria-label="Séances par semaine">
                            <div class="ob-range-scale"><span>1</span><span>7</span></div>
                            <p class="ob-caption" id="ob-days-caption"></p>
                        </div>
                    `;

                case 'duration':
                    return `
                        ${this.getOnboardingHeadHtml('⏱️', 'Combien de temps par séance ?', 'Échauffement et repos compris.')}
                        <div class="ob-slider-card" id="ob-duration-card">
                            <div class="ob-clock" aria-hidden="true">
                                <svg viewBox="0 0 120 120"><circle class="ob-clock-bg" cx="60" cy="60" r="52"/><circle class="ob-clock-fill" id="ob-clock-fill" cx="60" cy="60" r="52"/></svg>
                                <div class="ob-clock-center"><span class="ob-big-number" id="ob-duration-value">${answers.duration}</span><span class="ob-big-unit">min</span></div>
                            </div>
                            <input type="range" class="ob-range" id="ob-duration" min="30" max="120" step="15" value="${answers.duration}" aria-label="Durée d'une séance">
                            <div class="ob-range-scale"><span>30 min</span><span>2 h</span></div>
                            <p class="ob-caption" id="ob-duration-caption"></p>
                        </div>
                    `;

                case 'equipment':
                    return `
                        ${this.getOnboardingHeadHtml('🏠', 'Tu t\'entraînes où ?', 'On choisit les exercices avec le matériel que tu as.')}
                        <div class="ob-options">
                            ${EQUIPMENT.map((item, index) => this.getOnboardingOptionHtml('equipment', item, answers.equipment === item.id, index)).join('')}
                        </div>
                    `;

                case 'focus':
                    return `
                        ${this.getOnboardingHeadHtml('✨', 'Des zones à travailler en priorité ?', 'Optionnel. Choisis-en autant que tu veux, ou aucune pour un programme équilibré.')}
                        <div class="ob-chips">
                            ${FOCUS.map((item, index) => `
                                <button type="button" class="ob-chip ${answers.focus.has(item.id) ? 'is-selected' : ''}" data-ob-focus="${item.id}" style="--i:${index}" aria-pressed="${answers.focus.has(item.id)}">
                                    <img class="ob-chip-icon" src="icons/muscles/${item.icon}.png" alt="">${item.label}
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
                            <h2 class="ob-title">On prépare ton programme${firstName}…</h2>
                            <ul class="ob-build-list" id="ob-build-list">
                                ${BUILD_STEPS.map((item, index) => `
                                    <li data-build="${index}"><span class="ob-build-icon">${item.emoji}</span><span class="ob-build-text">${item.text}</span><span class="ob-build-check">${CHECK_SVG}</span></li>
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
                        ${this.getOnboardingHeadHtml('📂', 'Tu as déjà ton programme ?', 'Choisis comment l\'ajouter. Tu pourras tout modifier ensuite.')}
                        <div class="ob-options">
                            <button type="button" class="ob-option" data-ob-action="own-import" style="--i:0">
                                <span class="ob-option-emoji">📥</span>
                                <span class="ob-option-copy"><strong>Importer un fichier</strong><small>Un programme ou une sauvegarde de l'app</small></span>
                            </button>
                            <button type="button" class="ob-option" data-ob-action="own-manual" style="--i:1">
                                <span class="ob-option-emoji">✍️</span>
                                <span class="ob-option-copy"><strong>Le créer moi-même</strong><small>Séance par séance, exercice par exercice</small></span>
                            </button>
                            <button type="button" class="ob-option" data-ob-action="own-chat" style="--i:2">
                                <span class="ob-option-emoji">🤖</span>
                                <span class="ob-option-copy"><strong>Le faire avec ChatGPT</strong><small>On copie un message à coller, il te crée un fichier à importer</small></span>
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
                ${this.getOnboardingHeadHtml('🧠', 'Comment ça marche ?', 'Essaie : tu viens de finir une série. Comment c\'était ?')}
                <div class="ob-demo">
                    <div class="ob-demo-set">
                        <span class="ob-demo-badge">${CHECK_SVG}</span>
                        <div class="ob-demo-set-copy">
                            <small>Développé couché · série 1</small>
                            <strong>60 kg × 8</strong>
                        </div>
                        <span class="ob-demo-xp">+10 XP</span>
                    </div>
                    <div class="ob-demo-faces" role="group" aria-label="Ressenti de la série">
                        ${faces.map(face => `
                            <button type="button" class="ob-face" data-ob-face="${face.rpe}" aria-pressed="false">
                                <span class="ob-face-emoji">${face.emoji}</span>
                                <span class="ob-face-label">${face.label}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div class="ob-demo-coach" id="ob-demo-coach">
                        <span class="ob-demo-avatar">🤖</span>
                        <p id="ob-demo-coach-text">Touche un smiley pour voir ce que ton coach te répond.</p>
                    </div>
                    <ol class="ob-demo-steps">
                        <li><span>1</span>Tu notes ton poids et tes reps</li>
                        <li><span>2</span>Tu dis comment c'était (si tu veux)</li>
                        <li><span>3</span>Le coach règle ta prochaine séance</li>
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
            const title = answers.name ? `${esc(answers.name)}, ton programme est prêt` : 'Ton programme est prêt';

            return `
                <div class="ob-plan">
                    <div class="ob-plan-badge" aria-hidden="true">🎉</div>
                    <h2 class="ob-title">${title}</h2>
                    <p class="ob-sub">${esc(program.splitLabel)} · pensé pour « ${esc(program.profile.objective.toLowerCase())} »</p>

                    <div class="ob-plan-stats">
                        <div style="--i:0"><strong data-ob-count="${answers.days}">0</strong><span>séances / sem.</span></div>
                        <div style="--i:1"><strong data-ob-count="${totalExercises}">0</strong><span>exercices</span></div>
                        <div style="--i:2"><strong>~<b data-ob-count="${answers.duration}">0</b></strong><span>min / séance</span></div>
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
                                            <small>${session.slots.length} exercices · ${muscles.map(muscleLabel).join(', ')}</small>
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

                    <p class="ob-plan-note">✏️ Tout reste modifiable : exercices, séries, ordre. Le coach ajuste les charges après chaque séance.</p>
                </div>
            `;
        },

        getOnboardingInstallHtml() {
            const platform = this.getInstallPlatform();
            const steps = platform === 'ios'
                ? [
                    { icon: SHARE_SVG, text: 'Touche <strong>Partager</strong> en bas de Safari' },
                    { icon: '<b>＋</b>', text: 'Choisis <strong>Sur l\'écran d\'accueil</strong> (fais défiler si besoin)' },
                    { icon: CHECK_SVG, text: 'Touche <strong>Ajouter</strong>, c\'est tout' }
                ]
                : [
                    { icon: DOTS_SVG, text: 'Ouvre le <strong>menu ⋮</strong> du navigateur' },
                    { icon: '<b>＋</b>', text: 'Choisis <strong>Installer l\'application</strong> ou <strong>Ajouter à l\'écran d\'accueil</strong>' },
                    { icon: CHECK_SVG, text: 'Confirme, l\'icône apparaît sur ton téléphone' }
                ];

            return `
                ${this.getOnboardingHeadHtml('📲', 'Dernière étape : garde l\'app sous la main', 'Installée, elle s\'ouvre en plein écran et marche même sans réseau à la salle.')}
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
            if (unitEl) unitEl.textContent = days > 1 ? 'séances' : 'séance';
            const captionData = DAY_CAPTIONS[days - 1];
            if (caption) caption.innerHTML = `<span>${captionData.emoji}</span> ${captionData.text}`;
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
            if (caption) caption.innerHTML = `<span>🏋️</span> Environ <strong>${count} exercices</strong> par séance`;
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
                6: 'Trop facile ? Prochaine série : <strong>62,5 kg</strong>. On monte ! 🚀',
                7: 'Ça passe bien. On garde <strong>60 kg</strong> et on vise <strong>9 reps</strong>.',
                8: 'Pile dans la zone qui fait progresser. On garde <strong>60 kg</strong>. 👌',
                9: 'Dur mais propre. On garde <strong>60 kg</strong>, les reps viendront.',
                10: 'À fond ! Prends un peu plus de repos, on reste à <strong>60 kg</strong>. 🛟'
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
                this.showCoachToast('Oups, la création a échoué. Réessaie ou crée tes séances toi-même.', 'warning', '⚠️');
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
                this.showCoachToast(
                    name ? `Ta première séance t'attend, ${name}. Touche « Commencer » quand tu es à la salle !` : 'Ta première séance t\'attend. Touche « Commencer » quand tu es à la salle !',
                    'hot',
                    '🔥'
                );
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
                this.showCoachToast('Message copié ! Colle-le dans ChatGPT, réponds à ses questions, puis reviens ici et touche « Importer un fichier ».', 'hot', '📋');
            } else {
                this.showCoachToast('Copie impossible. Réessaie dans quelques secondes.', 'warning', '📋');
            }
        }
    };

    // ===== Help bubbles =====
    // Any element with data-help="key" opens a short plain-language explanation.
    const HELP_TOPICS = {
        deload: {
            emoji: '🔋',
            title: 'C\'est quoi un deload ?',
            body: [
                'Une <strong>séance (ou semaine) plus légère</strong> : moins de séries et des charges un peu plus basses.',
                'Tes muscles et tes articulations récupèrent, et tu repars <strong>plus fort</strong> la semaine d\'après.',
                'C\'est prévu et normal : ce n\'est <strong>pas un recul</strong>. Tu choisis toujours oui ou non.'
            ]
        },
        cycle: {
            emoji: '🔁',
            title: 'Comment marche le cycle ?',
            body: [
                '<strong>Accumulation</strong> : les semaines où tu pousses normalement pour progresser.',
                'Après quelques semaines, l\'app te propose une <strong>semaine de deload</strong> pour récupérer.',
                'Puis un nouveau cycle recommence. Tu règles la durée dans les paramètres.'
            ]
        },
        ressenti: {
            emoji: '😤',
            title: 'À quoi sert le smiley ?',
            body: [
                'Tu dis comment était ta série, en un tap :',
                '😌 Facile · 🙂 Ça va · 😤 Dur · 🥵 Très dur · 💀 À fond',
                'Le coach s\'en sert pour régler ta <strong>prochaine charge</strong>. Si tu ne touches rien, pas de souci : il estime tout seul avec tes reps.',
                'Touche à nouveau un smiley pour le retirer.'
            ]
        },
        exercise: {
            title: 'Comment ça marche ?',
            body: [
                '<strong>Charge</strong> et <strong>reps</strong> sont pré-remplies par le coach. Ajuste si besoin.',
                '<strong>RIR</strong> (« reps en réserve ») : arrête la série quand il te reste ce nombre de reps dans le réservoir. Pas besoin d\'aller à l\'échec.',
                'Touche <strong>Série terminée</strong> : le repos se lance tout seul et le coach adapte la suite.',
                'Le résumé sous le titre se lit ainsi : <strong>4 × 6-10 · 150s</strong> = 4 séries de 6 à 10 reps, 150 s de repos.'
            ]
        },
        targets: {
            title: 'Comment lire ces objectifs ?',
            body: [
                '<strong>4 × 6-10</strong> = 4 séries de 6 à 10 répétitions.',
                '<strong>150s</strong> = le temps de repos entre deux séries.',
                '<strong>RIR 2</strong> = « reps en réserve » : arrête la série quand tu sens qu\'il t\'en reste <strong>encore 2</strong> dans le réservoir. Pas besoin d\'aller jusqu\'à l\'échec.'
            ]
        },
        e1rm: {
            emoji: '👑',
            title: 'C\'est quoi « e1RM » ?',
            body: [
                'La charge que tu pourrais soulever <strong>une seule fois</strong>, estimée à partir de tes séries.',
                'Ça permet de comparer des séries différentes : 80 kg × 8 et 90 kg × 5, laquelle est la meilleure ?',
                'Pas besoin de tester ton max : l\'app le calcule pour toi.'
            ]
        }
    };

    const HelpBubbles = {
        showHelpTopic(key) {
            const topic = HELP_TOPICS[key];
            if (!topic) return;
            let sheet = document.getElementById('help-sheet');
            if (!sheet) {
                sheet = document.createElement('div');
                sheet.id = 'help-sheet';
                sheet.className = 'help-sheet';
                sheet.setAttribute('role', 'dialog');
                sheet.setAttribute('aria-modal', 'true');
                sheet.innerHTML = '<div class="help-sheet-backdrop" data-help-close></div><div class="help-sheet-card"><div class="help-sheet-body"></div><button type="button" class="help-sheet-ok" data-help-close>J\'ai compris</button></div>';
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
