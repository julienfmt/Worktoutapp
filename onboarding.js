// ===== Onboarding =====
// One question per screen, big tappable cards, a progress bar and a mascot,
// then a complete program is generated from the answers (split, exercises,
// sets/reps/rest, warm-up and cardio). Everything stays editable afterwards.
(() => {
    const GOALS = [
        { id: 'muscle', emoji: '💪', title: 'Prendre du muscle', hint: 'Plus de volume, un physique qui change', objective: 'Prise de muscle' },
        { id: 'strength', emoji: '🏋️', title: 'Devenir plus fort', hint: 'Soulever plus lourd sur les gros mouvements', objective: 'Force' },
        { id: 'fatloss', emoji: '🔥', title: 'Perdre du gras', hint: 'Garder le muscle, brûler plus', objective: 'Perte de gras' },
        { id: 'fitness', emoji: '❤️', title: 'Être en forme', hint: 'Santé, énergie, se sentir bien', objective: 'Remise en forme' }
    ];
    const LEVELS = [
        { id: 'beginner', emoji: '🐣', title: 'Je débute', hint: 'Moins de 6 mois de salle' },
        { id: 'intermediate', emoji: '🌱', title: 'J’ai les bases', hint: '6 mois à 2 ans de pratique' },
        { id: 'advanced', emoji: '🦍', title: 'Confirmé', hint: 'Plus de 2 ans, je connais mes charges' }
    ];
    const DURATIONS = [
        { id: 30, emoji: '⚡', title: '30 min', hint: 'Court et efficace' },
        { id: 45, emoji: '⏱️', title: '45 min', hint: 'Le bon compromis' },
        { id: 60, emoji: '🕐', title: '1 h', hint: 'Le classique' },
        { id: 75, emoji: '🏆', title: '1 h 15 et plus', hint: 'J’ai le temps' }
    ];
    const CARDIO = [
        { id: 'none', emoji: '🙅', title: 'Pas de cardio', hint: 'Que de la muscu' },
        { id: 'warmup', emoji: '🔥', title: 'Juste pour m’échauffer', hint: '5 min de vélo avant chaque séance' },
        { id: 'finisher', emoji: '❤️', title: 'Un peu à chaque séance', hint: 'Échauffement + 10-15 min à la fin' },
        { id: 'dedicated', emoji: '🏃', title: 'Beaucoup', hint: 'Une séance 100 % cardio en plus' }
    ];
    const FREQUENCY_CAPTIONS = {
        2: 'Parfait pour démarrer en douceur',
        3: 'Le rythme idéal pour progresser',
        4: 'Pour accélérer les résultats',
        5: 'Gros rythme, récupère bien',
        6: 'Mode machine, pour confirmés'
    };

    // Movement slots per session type: each entry lists alternatives, the
    // first that exists in the library wins. Beginners get machines first.
    const PATTERNS = {
        quads: { beginner: ['Presse à cuisses', 'Goblet squat'], default: ['Squat', 'Hack squat', 'Presse à cuisses'] },
        quads2: { default: ['Leg extension'] },
        hinge: { beginner: ['Soulevé de terre roumain', 'Hip thrust machine'], default: ['Soulevé de terre roumain', 'Soulevé de terre'] },
        hamstrings: { default: ['Leg curl assis', 'Leg curl allongé'] },
        glutes: { default: ['Hip thrust', 'Hip thrust machine'] },
        lunge: { default: ['Fentes marchées', 'Split squat bulgare'] },
        calves: { default: ['Mollets debout machine', 'Mollets assis machine'] },
        chest: { beginner: ['Développé machine convergente', 'Développé couché haltères'], default: ['Développé couché barre', 'Développé couché haltères'] },
        chest2: { default: ['Développé incliné haltères', 'Développé incliné machine'] },
        chestFly: { default: ['Pec deck', 'Écarté poulie vis-à-vis'] },
        vpull: { beginner: ['Tirage vertical prise large', 'Tractions assistées'], default: ['Tractions', 'Tirage vertical prise large'] },
        vpull2: { default: ['Tirage vertical prise neutre', 'Tirage vertical supination'] },
        row: { beginner: ['Rowing poulie assise', 'Rowing poitrine appuyée'], default: ['Rowing barre', 'Rowing poulie assise'] },
        row2: { default: ['Rowing haltère unilatéral', 'Rowing machine convergente'] },
        press: { beginner: ['Shoulder press machine', 'Développé haltères épaules'], default: ['Développé militaire', 'Développé haltères épaules'] },
        lateral: { default: ['Élévation latérale', 'Élévation latérale poulie'] },
        rearDelt: { default: ['Face pull', 'Oiseau poulie', 'Reverse pec deck'] },
        biceps: { default: ['Curl haltères', 'Curl barre EZ'] },
        biceps2: { default: ['Curl marteau', 'Curl incliné haltères'] },
        triceps: { default: ['Pushdown corde', 'Extension triceps poulie haute'] },
        triceps2: { default: ['Extension corde au-dessus de la tête', 'Barre au front'] },
        abs: { default: ['Crunch machine', 'Cable crunch', 'Relevé de genoux suspendu'] },
        core: { default: ['Gainage', 'Dead bug'] }
    };

    const SESSION_BLUEPRINTS = {
        fullA: { name: 'Full body A', emoji: '🔥', slots: ['quads', 'chest', 'row', 'press', 'hamstrings', 'biceps', 'triceps', 'abs'] },
        fullB: { name: 'Full body B', emoji: '⚡', slots: ['hinge', 'vpull', 'chest2', 'lunge', 'lateral', 'triceps2', 'biceps2', 'core'] },
        fullC: { name: 'Full body C', emoji: '💥', slots: ['quads', 'row2', 'chest', 'glutes', 'rearDelt', 'biceps', 'calves', 'abs'] },
        push: { name: 'Push', emoji: '🫸', slots: ['chest', 'press', 'chest2', 'lateral', 'triceps', 'triceps2', 'chestFly', 'abs'] },
        pull: { name: 'Pull', emoji: '🧲', slots: ['vpull', 'row', 'vpull2', 'rearDelt', 'biceps', 'biceps2', 'row2', 'core'] },
        legs: { name: 'Legs', emoji: '🦵', slots: ['quads', 'hinge', 'quads2', 'hamstrings', 'glutes', 'calves', 'lunge', 'abs'] },
        upperA: { name: 'Haut du corps A', emoji: '💪', slots: ['chest', 'row', 'press', 'vpull', 'triceps', 'biceps', 'lateral', 'rearDelt'] },
        lowerA: { name: 'Bas du corps A', emoji: '🦵', slots: ['quads', 'hinge', 'quads2', 'hamstrings', 'calves', 'abs', 'glutes'] },
        upperB: { name: 'Haut du corps B', emoji: '🏋️', slots: ['vpull', 'chest2', 'row2', 'lateral', 'biceps2', 'triceps2', 'chestFly', 'rearDelt'] },
        lowerB: { name: 'Bas du corps B', emoji: '🍑', slots: ['hinge', 'lunge', 'glutes', 'quads2', 'hamstrings', 'calves', 'core'] },
        push2: { name: 'Push B', emoji: '🫸', slots: ['press', 'chest2', 'chest', 'lateral', 'triceps2', 'triceps', 'chestFly', 'core'] },
        pull2: { name: 'Pull B', emoji: '🧲', slots: ['row', 'vpull2', 'row2', 'rearDelt', 'biceps2', 'biceps', 'vpull', 'abs'] },
        legs2: { name: 'Legs B', emoji: '🍑', slots: ['hinge', 'quads', 'glutes', 'hamstrings', 'lunge', 'calves', 'quads2', 'core'] }
    };

    const baseShowEditSessionsSheet = App.prototype.showEditSessionsSheet;

    Object.assign(App.prototype, {
        async maybeStartOnboarding() {
            const onboardingCompleted = await db.getSetting('onboardingCompleted');
            if (onboardingCompleted === true) return false;
            const [sessions, history] = await Promise.all([db.getSessions(), db.getAll('workoutHistory')]);
            if (sessions.length > 0 || history.length > 0) {
                await db.setSetting('onboardingCompleted', true);
                return false;
            }
            await this.showOnboarding();
            return true;
        },

        getOnboardingSteps() {
            if (this.onboardingMode === 'wizard') {
                return ['goal', 'level', 'frequency', 'duration', 'cardio', 'building', 'program'];
            }
            const steps = ['welcome', 'goal', 'level', 'frequency', 'duration', 'cardio', 'body', 'building', 'program'];
            if (!this.isAppInstalled()) steps.push('install');
            return steps;
        },

        // Same questions for someone who already uses the app: the sessions
        // generated are added next to the existing ones, nothing is deleted.
        async showProgramWizard() {
            this.onboardingMode = 'wizard';
            const profile = (await db.getSetting('trainingProfile')) || {};
            await this.showOnboarding({ keepMode: true });
            Object.assign(this.onboardingAnswers, {
                goal: profile.goal || null,
                level: profile.level || null,
                duration: profile.duration || null,
                cardio: profile.cardio || null
            });
            this.renderOnboardingStep();
        },

        async showOnboarding({ keepMode = false } = {}) {
            const modal = document.getElementById('modal-onboarding');
            if (!modal) return;
            if (!keepMode) this.onboardingMode = 'first-run';
            this.onboardingVisible = true;
            this.onboardingAnswers = {
                goal: null,
                level: null,
                frequency: Math.max(2, Math.min(6, (await db.getSetting('weeklyGoal')) ?? 3)),
                duration: null,
                cardio: null,
                bodyWeight: (await db.getSetting('bodyWeight')) || 75
            };
            this.onboardingSteps = this.getOnboardingSteps();
            this.onboardingIndex = 0;
            this.onboardingProgram = null;
            if (!modal.dataset.bound) {
                modal.dataset.bound = 'true';
                modal.addEventListener('click', event => this.onOnboardingClick(event));
                document.getElementById('onboard-back')?.addEventListener('click', () => this.previousOnboardingStep());
            }
            modal.classList.add('active');
            document.body.classList.add('onboarding-open');
            this.renderOnboardingStep();
        },

        hideOnboarding() {
            clearTimeout(this.onboardingAdvanceTimer);
            clearTimeout(this.onboardingBuildTimer);
            this.onboardingVisible = false;
            document.getElementById('modal-onboarding')?.classList.remove('active');
            document.body.classList.remove('onboarding-open');
        },

        previousOnboardingStep() {
            clearTimeout(this.onboardingAdvanceTimer);
            clearTimeout(this.onboardingBuildTimer);
            if (!this.onboardingIndex) {
                if (this.onboardingMode === 'wizard') this.hideOnboarding();
                return;
            }
            let index = this.onboardingIndex - 1;
            // Never step back into the loading screen.
            if (this.onboardingSteps[index] === 'building') index -= 1;
            this.onboardingIndex = Math.max(0, index);
            this.renderOnboardingStep('back');
        },

        nextOnboardingStep() {
            if (this.onboardingIndex >= this.onboardingSteps.length - 1) {
                void this.finishOnboarding();
                return;
            }
            this.onboardingIndex += 1;
            this.renderOnboardingStep('forward');
        },

        renderOnboardingChoice(field, option, { large = false } = {}) {
            const selected = this.onboardingAnswers[field] === option.id;
            return `
                <button type="button" class="onboard-choice ${large ? 'is-large' : ''} ${selected ? 'is-selected' : ''}" data-onboard-pick="${field}" data-value="${option.id}" aria-pressed="${selected}">
                    <span class="onboard-choice-emoji" aria-hidden="true">${option.emoji}</span>
                    <span class="onboard-choice-text">
                        <strong>${this.escapeHtml(option.title)}</strong>
                        <small>${this.escapeHtml(option.hint)}</small>
                    </span>
                    <span class="onboard-choice-check" aria-hidden="true">✓</span>
                </button>
            `;
        },

        renderOnboardingMascot(text) {
            return `
                <div class="onboard-mascot">
                    <span class="onboard-mascot-face" aria-hidden="true">💪</span>
                    <span class="onboard-bubble">${text}</span>
                </div>
            `;
        },

        renderOnboardingStep(direction = 'forward') {
            const stage = document.getElementById('onboard-stage');
            const footer = document.getElementById('onboard-footer');
            const modal = document.getElementById('modal-onboarding');
            if (!stage || !footer || !modal) return;
            const step = this.onboardingSteps[this.onboardingIndex];
            const answers = this.onboardingAnswers;
            const questionSteps = this.onboardingSteps.filter(item => !['welcome', 'building'].includes(item));
            const progressStep = step === 'building' ? this.onboardingSteps[this.onboardingIndex - 1] : step;
            const progressIndex = Math.max(0, questionSteps.indexOf(progressStep));
            const progress = step === 'welcome' ? 0 : ((progressIndex + 1) / questionSteps.length) * 100;
            document.getElementById('onboard-progress-fill')?.style.setProperty('width', `${progress}%`);
            modal.dataset.step = step;
            const back = document.getElementById('onboard-back');
            if (back) {
                const isWizardStart = this.onboardingMode === 'wizard' && this.onboardingIndex === 0;
                back.style.visibility = ['welcome', 'building'].includes(step) ? 'hidden' : 'visible';
                back.setAttribute('aria-label', isWizardStart ? 'Fermer' : 'Retour');
                back.classList.toggle('is-close', isWizardStart);
            }

            let html = '';
            let foot = '';
            switch (step) {
                case 'welcome':
                    html = `
                        <div class="onboard-hero">
                            <div class="onboard-logo" aria-hidden="true">
                                <span class="onboard-logo-ring"></span>
                                <span class="onboard-logo-emoji">💪</span>
                            </div>
                            <h1>Ta salle devient un jeu</h1>
                            <p>Un coach qui règle tes charges, un parcours à débloquer, des trophées à collectionner. Prêt ?</p>
                            <ul class="onboard-perks">
                                <li><span aria-hidden="true">🎯</span>Un programme fait pour toi en 1 minute</li>
                                <li><span aria-hidden="true">🧠</span>Le coach te dit quoi soulever à chaque série</li>
                                <li><span aria-hidden="true">🏆</span>XP, niveaux, coffres et trophées</li>
                            </ul>
                        </div>
                    `;
                    foot = `
                        <button type="button" class="btn btn-primary btn-large onboard-cta" data-onboard="next">C’est parti !</button>
                        <button type="button" class="onboard-link" data-onboard="import">J’ai déjà une sauvegarde</button>
                    `;
                    break;
                case 'goal':
                    html = `
                        ${this.renderOnboardingMascot('Quel est ton objectif principal ?')}
                        <div class="onboard-choices">${GOALS.map(option => this.renderOnboardingChoice('goal', option)).join('')}</div>
                    `;
                    break;
                case 'level':
                    html = `
                        ${this.renderOnboardingMascot('Et ton niveau en salle ?')}
                        <div class="onboard-choices">${LEVELS.map(option => this.renderOnboardingChoice('level', option)).join('')}</div>
                    `;
                    break;
                case 'frequency':
                    html = `
                        ${this.renderOnboardingMascot('Combien de séances par semaine ?')}
                        <div class="onboard-frequency" role="radiogroup" aria-label="Séances par semaine">
                            ${[2, 3, 4, 5, 6].map(value => `
                                <button type="button" class="onboard-freq ${answers.frequency === value ? 'is-selected' : ''}" data-onboard-frequency="${value}" role="radio" aria-checked="${answers.frequency === value}">
                                    <strong>${value}</strong>
                                    <span>/ sem.</span>
                                </button>
                            `).join('')}
                        </div>
                        <div class="onboard-week" aria-hidden="true">
                            ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => `<span class="${this.getOnboardingTrainingDays(answers.frequency).includes(index) ? 'on' : ''}">${day}</span>`).join('')}
                        </div>
                        <p class="onboard-caption">${this.escapeHtml(FREQUENCY_CAPTIONS[answers.frequency] || '')}</p>
                        <p class="onboard-note">C’est aussi ton objectif de la semaine : chaque semaine validée allume ta série 🔥</p>
                    `;
                    foot = '<button type="button" class="btn btn-primary btn-large onboard-cta" data-onboard="next">Continuer</button>';
                    break;
                case 'duration':
                    html = `
                        ${this.renderOnboardingMascot('Combien de temps par séance ?')}
                        <div class="onboard-choices is-grid">${DURATIONS.map(option => this.renderOnboardingChoice('duration', option, { large: true })).join('')}</div>
                    `;
                    break;
                case 'cardio':
                    html = `
                        ${this.renderOnboardingMascot('Et le cardio, tu en veux ?')}
                        <div class="onboard-choices">${CARDIO.map(option => this.renderOnboardingChoice('cardio', option)).join('')}</div>
                    `;
                    break;
                case 'body':
                    html = `
                        ${this.renderOnboardingMascot('Ton poids, pour estimer tes calories en cardio.')}
                        <div class="onboard-weight">
                            <button type="button" class="onboard-weight-step" data-onboard-weight="-1" aria-label="Moins un kilo">−</button>
                            <div class="onboard-weight-value">
                                <strong id="onboard-weight-value">${answers.bodyWeight}</strong>
                                <span>kg</span>
                            </div>
                            <button type="button" class="onboard-weight-step" data-onboard-weight="1" aria-label="Plus un kilo">+</button>
                        </div>
                        <input type="range" class="onboard-range" id="onboard-weight-range" min="35" max="180" step="1" value="${answers.bodyWeight}" aria-label="Poids en kilos">
                        <p class="onboard-note">Reste sur ton téléphone, jamais partagé.</p>
                    `;
                    foot = `
                        <button type="button" class="btn btn-primary btn-large onboard-cta" data-onboard="next">Continuer</button>
                        <button type="button" class="onboard-link" data-onboard="skip-weight">Passer</button>
                    `;
                    break;
                case 'building':
                    html = `
                        <div class="onboard-building">
                            <div class="onboard-building-orb" aria-hidden="true"><span>⚙️</span></div>
                            <h2>Je prépare ton programme…</h2>
                            <ul class="onboard-checklist">
                                <li style="--i: 0">Analyse de ton objectif</li>
                                <li style="--i: 1">Choix du découpage de la semaine</li>
                                <li style="--i: 2">Sélection des exercices</li>
                                <li style="--i: 3">Réglage des séries, reps et repos</li>
                            </ul>
                        </div>
                    `;
                    clearTimeout(this.onboardingBuildTimer);
                    this.onboardingBuildTimer = setTimeout(() => {
                        if (this.onboardingSteps[this.onboardingIndex] === 'building') this.nextOnboardingStep();
                    }, 2300);
                    break;
                case 'program': {
                    const program = this.onboardingProgram || (this.onboardingProgram = this.generateOnboardingProgram(answers));
                    html = `
                        <div class="onboard-program">
                            <div class="onboard-program-head">
                                <span class="onboard-program-badge" aria-hidden="true">✨</span>
                                <h2>Ton programme est prêt !</h2>
                                <p>${this.escapeHtml(program.summary)}</p>
                            </div>
                            <div class="onboard-sessions">
                                ${program.sessions.map((session, index) => `
                                    <div class="onboard-session" style="--i: ${index}">
                                        <span class="onboard-session-emoji" aria-hidden="true">${session.emoji}</span>
                                        <div class="onboard-session-main">
                                            <strong>${this.escapeHtml(session.name)}</strong>
                                            <small>${session.slots.length} exercices · ~${session.duration} min</small>
                                            <span class="onboard-session-muscles">${session.muscles.map(muscleId => this.renderMuscleBadge(muscleId, { label: '' })).join('')}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            <p class="onboard-note">Le coach ajustera tes charges dès ta première séance. Tu peux tout modifier dans « Mes séances ».</p>
                        </div>
                    `;
                    foot = this.onboardingMode === 'wizard' ? `
                        <button type="button" class="btn btn-primary btn-large onboard-cta" data-onboard="accept-program">Ajouter à mes séances</button>
                        <button type="button" class="onboard-link" data-onboard="close">Annuler</button>
                    ` : `
                        <button type="button" class="btn btn-primary btn-large onboard-cta" data-onboard="accept-program">Je prends ce programme</button>
                        <button type="button" class="onboard-link" data-onboard="manual">Je préfère créer mes séances</button>
                    `;
                    break;
                }
                case 'install': {
                    const platform = this.getInstallPlatform();
                    const steps = platform === 'ios'
                        ? ['Touche le bouton Partager <b>⬆︎</b> de Safari', 'Choisis <b>« Sur l’écran d’accueil »</b>', 'Touche <b>Ajouter</b>']
                        : platform === 'android'
                            ? ['Ouvre le menu <b>⋮</b> de Chrome', 'Choisis <b>« Installer l’application »</b>', 'Confirme']
                            : ['Ouvre l’app sur ton téléphone', 'Ajoute-la à l’écran d’accueil', 'Lance-la comme une vraie app'];
                    html = `
                        ${this.renderOnboardingMascot('Dernière chose : mets l’app sur ton écran d’accueil.')}
                        <div class="onboard-install">
                            <div class="onboard-install-phone" aria-hidden="true"><span>💪</span></div>
                            <ol class="onboard-install-steps">${steps.map(item => `<li>${item}</li>`).join('')}</ol>
                            <p class="onboard-note">Elle s’ouvre en plein écran, marche sans réseau et tes données restent en sécurité.</p>
                        </div>
                    `;
                    foot = `
                        <button type="button" class="btn btn-primary btn-large onboard-cta" data-onboard="next">C’est fait !</button>
                        <button type="button" class="onboard-link" data-onboard="next">Plus tard</button>
                    `;
                    break;
                }
                default:
                    break;
            }

            stage.classList.remove('is-forward', 'is-back');
            void stage.offsetWidth;
            stage.classList.add(direction === 'back' ? 'is-back' : 'is-forward');
            stage.innerHTML = html;
            stage.scrollTop = 0;
            footer.innerHTML = foot;
            footer.hidden = !foot;

            const range = document.getElementById('onboard-weight-range');
            if (range) {
                range.oninput = () => this.setOnboardingWeight(Number(range.value));
            }
        },

        getOnboardingTrainingDays(frequency) {
            const patterns = {
                2: [1, 4],
                3: [0, 2, 4],
                4: [0, 1, 3, 4],
                5: [0, 1, 2, 4, 5],
                6: [0, 1, 2, 3, 4, 5]
            };
            return patterns[frequency] || patterns[3];
        },

        setOnboardingWeight(value) {
            const weight = Math.max(35, Math.min(180, Math.round(value)));
            this.onboardingAnswers.bodyWeight = weight;
            const label = document.getElementById('onboard-weight-value');
            if (label) label.textContent = weight;
            const range = document.getElementById('onboard-weight-range');
            if (range && Number(range.value) !== weight) range.value = weight;
        },

        async onOnboardingClick(event) {
            const pick = event.target.closest('[data-onboard-pick]');
            if (pick) {
                const field = pick.dataset.onboardPick;
                const raw = pick.dataset.value;
                this.onboardingAnswers[field] = field === 'duration' ? Number(raw) : raw;
                this.onboardingProgram = null;
                this.hapticTap?.(10);
                document.querySelectorAll(`[data-onboard-pick="${field}"]`).forEach(item => {
                    const selected = item === pick;
                    item.classList.toggle('is-selected', selected);
                    item.setAttribute('aria-pressed', String(selected));
                });
                // Auto-advance: one tap answers the question.
                clearTimeout(this.onboardingAdvanceTimer);
                this.onboardingAdvanceTimer = setTimeout(() => this.nextOnboardingStep(), 260);
                return;
            }
            const frequency = event.target.closest('[data-onboard-frequency]');
            if (frequency) {
                this.onboardingAnswers.frequency = Number(frequency.dataset.onboardFrequency);
                this.onboardingProgram = null;
                this.hapticTap?.(8);
                this.renderOnboardingStep('none');
                return;
            }
            const weightStep = event.target.closest('[data-onboard-weight]');
            if (weightStep) {
                this.setOnboardingWeight(this.onboardingAnswers.bodyWeight + Number(weightStep.dataset.onboardWeight));
                this.hapticTap?.(5);
                return;
            }
            const action = event.target.closest('[data-onboard]')?.dataset.onboard;
            if (!action) return;
            switch (action) {
                case 'next':
                    this.nextOnboardingStep();
                    break;
                case 'close':
                    this.hideOnboarding();
                    break;
                case 'skip-weight':
                    this.onboardingAnswers.bodyWeight = null;
                    this.nextOnboardingStep();
                    break;
                case 'import':
                    this.pendingImportContext = 'onboarding';
                    document.getElementById('import-file')?.click();
                    break;
                case 'accept-program':
                    if (this.onboardingAccepting) return;
                    this.onboardingAccepting = true;
                    event.target.closest('button')?.setAttribute('disabled', '');
                    try {
                        await this.saveOnboardingAnswers();
                        await this.createOnboardingProgram(this.onboardingProgram);
                        this.onboardingProgramCreated = true;
                        gamification.burstFromElement?.(event.target, { count: 40, spread: 170, power: 12, shapes: ['star', 'circle', 'rect'] });
                    } finally {
                        this.onboardingAccepting = false;
                    }
                    this.nextOnboardingStep();
                    break;
                case 'manual':
                    await this.saveOnboardingAnswers();
                    await this.completeOnboarding({ refreshHome: true });
                    await this.showEditSessionsSheet();
                    this.showNewSessionView();
                    break;
                default:
                    break;
            }
        },

        async saveOnboardingAnswers() {
            const answers = this.onboardingAnswers;
            const goal = GOALS.find(item => item.id === answers.goal);
            await db.setSetting('trainingObjective', goal?.objective || '');
            await db.setSetting('weeklyGoal', Math.min(7, (answers.frequency || 3) + (answers.cardio === 'dedicated' ? 1 : 0)));
            await db.setSetting('trainingProfile', {
                goal: answers.goal,
                level: answers.level,
                frequency: answers.frequency,
                duration: answers.duration,
                cardio: answers.cardio
            });
            if (answers.bodyWeight) await db.setSetting('bodyWeight', answers.bodyWeight);
        },

        async finishOnboarding() {
            if (this.onboardingMode === 'wizard') {
                this.hideOnboarding();
                this.sessionsEditorDirty = true;
                await this.renderHome();
                await this.showEditSessionsSheet();
                this.showCoachToast('Nouvelles séances ajoutées. Supprime celles que tu ne veux plus garder.', 'hot', '✨');
                return;
            }
            await this.completeOnboarding({ refreshHome: true });
            if (this.onboardingProgramCreated) {
                setTimeout(() => {
                    gamification.triggerConfetti?.('heavy');
                    gamification.showAchievement?.('🗺️', 'Ton aventure commence !', 'Chapitre 1 · Les fondations');
                }, 450);
            }
        },

        async completeOnboarding({ refreshHome = true } = {}) {
            await db.setSetting('onboardingCompleted', true);
            this.hideOnboarding();
            if (refreshHome) await this.renderHome();
        },

        // ---------- Program generator ----------
        pickOnboardingExercise(patternId, level, used) {
            const pattern = PATTERNS[patternId];
            if (!pattern) return null;
            const candidates = [...(level === 'beginner' && pattern.beginner ? pattern.beginner : []), ...pattern.default];
            for (const name of candidates) {
                if (used.has(name)) continue;
                const entry = this.findExerciseLibraryEntry(name);
                if (entry) {
                    used.add(name);
                    return entry;
                }
            }
            return null;
        },

        getOnboardingSplit(frequency, level, goal) {
            const beginner = level === 'beginner';
            switch (frequency) {
                case 2: return ['fullA', 'fullB'];
                case 3: return beginner || goal === 'fatloss' || goal === 'fitness' ? ['fullA', 'fullB', 'fullC'] : ['push', 'pull', 'legs'];
                case 4: return ['upperA', 'lowerA', 'upperB', 'lowerB'];
                case 5: return beginner ? ['upperA', 'lowerA', 'upperB', 'lowerB', 'fullA'] : ['push', 'pull', 'legs', 'upperA', 'lowerB'];
                case 6: return ['push', 'pull', 'legs', 'push2', 'pull2', 'legs2'];
                default: return ['fullA', 'fullB', 'fullC'];
            }
        },

        // Sets, reps, rest and RIR for one exercise from goal + level.
        getOnboardingDose(entry, goal, level) {
            const compound = entry.type !== 'isolation';
            const beginner = level === 'beginner';
            const doses = {
                muscle: compound ? { sets: 4, repsMin: 6, repsMax: 10, rest: 120 } : { sets: 3, repsMin: 10, repsMax: 15, rest: 75 },
                strength: compound ? { sets: 4, repsMin: 4, repsMax: 6, rest: 180 } : { sets: 3, repsMin: 8, repsMax: 12, rest: 90 },
                fatloss: compound ? { sets: 3, repsMin: 8, repsMax: 12, rest: 90 } : { sets: 3, repsMin: 12, repsMax: 15, rest: 60 },
                fitness: compound ? { sets: 3, repsMin: 8, repsMax: 12, rest: 90 } : { sets: 3, repsMin: 10, repsMax: 15, rest: 60 }
            };
            const dose = { ...(doses[goal] || doses.muscle) };
            if (beginner) dose.sets = Math.min(dose.sets, 3);
            dose.rir = beginner ? 3 : (level === 'advanced' ? 1 : 2);
            return dose;
        },

        generateOnboardingProgram(answers) {
            const goal = answers.goal || 'muscle';
            const level = answers.level || 'beginner';
            const frequency = answers.frequency || 3;
            const duration = answers.duration || 60;
            const cardio = answers.cardio || 'none';
            const split = this.getOnboardingSplit(frequency, level, goal);
            const sessions = split.map(key => {
                const blueprint = SESSION_BLUEPRINTS[key];
                const used = new Set();
                const before = [];
                const after = [];
                if (cardio === 'warmup' || cardio === 'finisher' || (cardio === 'dedicated' && goal === 'fatloss')) {
                    before.push({ name: 'Vélo assis', sets: 1, repsMin: 5, repsMax: 8, rest: 0, role: 'warmup' });
                }
                if (cardio === 'finisher') {
                    const minutes = goal === 'fatloss' ? [15, 25] : [10, 15];
                    after.push({ name: 'Tapis de course', sets: 1, repsMin: minutes[0], repsMax: minutes[1], rest: 0 });
                }
                // Add exercises in priority order while the session still
                // fits the time the player has (at least 3, at most 8).
                const strength = [];
                for (const patternId of blueprint.slots) {
                    const entry = this.pickOnboardingExercise(patternId, level, used);
                    if (!entry) continue;
                    const candidate = { name: entry.name, ...this.getOnboardingDose(entry, goal, level) };
                    const draft = [...before, ...strength, candidate, ...after].map(item => ({ ...this.resolveTemplateDefinition(item.name), ...item }));
                    if (strength.length >= 3 && this.estimateSessionDuration(draft) > duration + 12) break;
                    strength.push(candidate);
                }
                // Still over the time budget: shorter finisher, one set less on
                // the 4-set lifts, and finally no finisher at all.
                const estimate = () => this.estimateSessionDuration([...before, ...strength, ...after]
                    .map(item => ({ ...this.resolveTemplateDefinition(item.name), ...item })));
                if (after.length && estimate() > duration + 8) after[0] = { ...after[0], repsMin: 5, repsMax: 8 };
                if (estimate() > duration + 8) strength.forEach(item => { if (item.sets > 3) item.sets = 3; });
                if (after.length && estimate() > duration + 10) after.length = 0;
                return { name: blueprint.name, emoji: blueprint.emoji, slots: [...before, ...strength, ...after] };
            });
            if (cardio === 'dedicated') {
                const long = duration >= 60;
                sessions.push({
                    name: 'Cardio',
                    emoji: '🏃',
                    slots: [
                        { name: 'Tapis de course', sets: 1, repsMin: duration <= 30 ? 15 : 20, repsMax: duration <= 30 ? 20 : (long ? 35 : 25), rest: 0 },
                        { name: 'Rameur', sets: 1, repsMin: duration <= 30 ? 5 : 8, repsMax: long ? 15 : 10, rest: 0 },
                        ...(duration > 30 ? [{ name: 'Gainage', sets: 3, repsMin: 30, repsMax: 60, rest: 45 }] : [])
                    ]
                });
            }

            const enriched = sessions.map(session => {
                const definitions = session.slots.map(item => ({ ...this.resolveTemplateDefinition(item.name), ...item, name: item.name }));
                return {
                    ...session,
                    definitions,
                    duration: this.estimateSessionDuration(definitions),
                    muscles: this.getSessionTopMuscles(definitions.map(item => ({ ...item, muscleGroup: this.findExerciseLibraryEntry(item.name)?.muscleGroup || item.muscleGroup })), 4)
                };
            });
            const goalLabel = GOALS.find(item => item.id === goal)?.title.toLowerCase() || 'progresser';
            return {
                sessions: enriched,
                summary: `${frequency} séance${frequency > 1 ? 's' : ''} par semaine pour ${goalLabel}${cardio === 'dedicated' ? ', + 1 séance cardio' : ''}. Elles s’enchaînent dans l’ordre, l’app te propose toujours la bonne.`
            };
        },

        async createOnboardingProgram(program) {
            if (!program?.sessions?.length) return;
            const existing = await db.getSessions();
            let order = existing.length;
            const stamp = Date.now().toString(36);
            for (const [sessionIndex, session] of program.sessions.entries()) {
                const sessionId = `session-${stamp}-${sessionIndex}`;
                const record = { id: sessionId, name: session.name, order: order++, estimatedDuration: session.duration || 45 };
                await db.put('sessions', record);
                let strengthIndex = 0;
                for (const [slotIndex, item] of session.definitions.entries()) {
                    const definition = this.findExerciseLibraryEntry(item.name) || this.resolveTemplateDefinition(item.name);
                    const slot = this.buildSlotFromExerciseDefinition(definition, sessionId, slotIndex);
                    slot.id = `${sessionId}-${slotIndex}-${Math.random().toString(36).slice(2, 7)}`;
                    slot.order = slotIndex;
                    slot.sets = item.sets;
                    slot.repsMin = item.repsMin;
                    slot.repsMax = item.repsMax;
                    slot.rest = item.rest;
                    if (item.rir != null) slot.rir = item.rir;
                    if (item.role === 'warmup') {
                        slot.role = 'warmup';
                        slot.slotId = 'W';
                    } else {
                        slot.slotId = `${String.fromCharCode(65 + strengthIndex)}${strengthIndex + 1}`;
                        strengthIndex += 1;
                    }
                    this.normalizeSlotProgressionConfig(slot);
                    await db.put('slots', slot);
                }
            }
            await db.setSetting('nextSessionIndex', existing.length);
        },

        async showEditSessionsSheet(...args) {
            await baseShowEditSessionsSheet.apply(this, args);
            const addButton = document.getElementById('btn-add-session');
            if (!addButton || document.getElementById('btn-generate-program')) return;
            addButton.insertAdjacentHTML('afterend', `
                <button type="button" class="se-generate" id="btn-generate-program">
                    <span class="se-generate-icon" aria-hidden="true">✨</span>
                    <span>
                        <strong>Générer un programme complet</strong>
                        <small>5 questions, le coach construit ta semaine</small>
                    </span>
                </button>
            `);
            document.getElementById('btn-generate-program')?.addEventListener('click', async () => {
                document.getElementById('sheet-edit-sessions')?.classList.remove('active');
                await this.showProgramWizard();
            });
        }
    });
})();
