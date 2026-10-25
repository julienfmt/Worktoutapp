// ===== Coach IA — interface =====
// Sheet + Parcours card that send the training digest to an external AI and
// bring the program it returns back into the app (preview, apply, undo).
// Mixed into App so it can reuse the import pipeline, dialogs and renderers.
(function () {
    'use strict';

    const { AiBridge } = AiCoach;
    const SPARKLE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 2.5l1.7 5.1 5.1 1.7-5.1 1.7L10 16.1l-1.7-5.1-5.1-1.7 5.1-1.7z"/><path d="M18.5 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity=".75"/></svg>';
    const ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';
    const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    const PASTE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="12" height="17" rx="2.5"/><path d="M9 4V3h6v1M9.5 11h5M9.5 15h5"/></svg>';

    const DIFF_MARKS = { added: '+', removed: '−', changed: '~', kept: '=' };

    const AiCoachUI = {
        // ---------- entry points ----------
        async openAiCoach(intent = null) {
            const sheet = this.ensureAiCoachSheet();
            // Open instantly with defaults, then hydrate saved preferences and data.
            const state = {
                view: 'compose',
                intent: AiCoach.getIntent(intent || 'analyze').id,
                provider: AiCoach.AI_PROVIDERS[0].id,
                focus: new Set(),
                message: '',
                digest: null,
                prompt: '',
                launch: null,
                review: null,
                backup: null,
                loading: true
            };
            this.aiState = state;
            sheet.classList.add('active');
            this.renderAiCoach();

            const [storedProvider, storedIntent, backup] = await Promise.all([
                db.getSetting('aiProvider'),
                db.getSetting('aiLastIntent'),
                db.getSetting('aiProgramBackup')
            ]);
            if (this.aiState !== state) return;
            if (storedProvider) state.provider = AiCoach.getProvider(storedProvider).id;
            if (!intent && storedIntent) state.intent = AiCoach.getIntent(storedIntent).id;
            state.backup = backup || null;

            try {
                state.digest = await this.buildAiDigest();
            } catch (error) {
                console.error('Résumé IA impossible:', error);
                state.digestError = true;
            }
            if (this.aiState !== state) return;
            state.loading = false;
            this.refreshAiPrompt();
            this.renderAiCoach({ keepScroll: true });
        },

        closeAiCoach() {
            document.getElementById('sheet-ai-coach')?.classList.remove('active');
            this.aiState = null;
        },

        async buildAiDigest() {
            const snapshot = await this.resolveHomeDataSnapshot();
            const [slotLookup, objective, weeklyGoal, xp] = await Promise.all([
                this.buildSlotHistoryLookup(snapshot.slots),
                db.getSetting('trainingObjective'),
                db.getSetting('weeklyGoal'),
                db.getSetting('xp')
            ]);
            const player = this.getPlayerLevel(xp || 0);
            return AiCoach.buildDigest({
                sessions: snapshot.sessions,
                slots: snapshot.slots,
                history: snapshot.history,
                setHistory: snapshot.setHistory,
                slotLookup,
                profile: {
                    objective: objective || '',
                    weeklyGoal: weeklyGoal || 3,
                    level: `${player.level} (${player.title.name})`
                },
                muscleGroups: MUSCLE_GROUPS,
                landmarks: VOLUME_LANDMARKS,
                e1rm: (weight, reps, rpe) => this.calculateE1RM(weight, reps, rpe),
                muscleContributions: (set, slot) => this.getExerciseMuscleContributions(
                    set.exerciseName || set.exerciseId || slot?.activeExercise || slot?.name,
                    slot
                )
            });
        },

        refreshAiPrompt() {
            const state = this.aiState;
            if (!state?.digest) return;
            state.prompt = AiCoach.buildPrompt({
                intent: state.intent,
                digest: state.digest,
                userMessage: state.message,
                focus: Array.from(state.focus),
                muscleIds: MUSCLE_GROUPS.map(group => group.id).join(', ')
            });
        },

        // ---------- DOM ----------
        ensureAiCoachSheet() {
            let sheet = document.getElementById('sheet-ai-coach');
            if (sheet) return sheet;

            sheet = document.createElement('div');
            sheet.className = 'bottom-sheet ai-sheet';
            sheet.id = 'sheet-ai-coach';
            sheet.innerHTML = `
                <div class="sheet-backdrop"></div>
                <div class="sheet-content sheet-content-large ai-sheet-content" role="dialog" aria-modal="true" aria-labelledby="ai-coach-title">
                    <div class="sheet-handle"></div>
                    <div id="ai-coach-body"></div>
                    <input type="file" id="ai-reply-file" accept=".json,.txt,.md" hidden>
                </div>
            `;
            document.body.appendChild(sheet);

            sheet.querySelector('.sheet-backdrop').addEventListener('click', () => this.closeAiCoach());
            sheet.addEventListener('click', event => this.handleAiCoachClick(event));
            sheet.addEventListener('input', event => {
                if (!this.aiState) return;
                if (event.target.id === 'ai-message') {
                    this.aiState.message = event.target.value;
                    this.refreshAiPrompt();
                    this.updateAiPayloadMeter();
                }
            });
            sheet.querySelector('#ai-reply-file').addEventListener('change', async event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) await this.handleAiReplyText(await file.text());
            });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && sheet.classList.contains('active')) this.closeAiCoach();
            });
            return sheet;
        },

        handleAiCoachClick(event) {
            const state = this.aiState;
            if (!state) return;

            const intentButton = event.target.closest('[data-ai-intent]');
            if (intentButton) {
                state.intent = intentButton.dataset.aiIntent;
                db.setSetting('aiLastIntent', state.intent);
                this.refreshAiPrompt();
                this.renderAiCoach({ keepScroll: true });
                return;
            }

            const providerButton = event.target.closest('[data-ai-provider]');
            if (providerButton) {
                state.provider = providerButton.dataset.aiProvider;
                db.setSetting('aiProvider', state.provider);
                this.renderAiCoach({ keepScroll: true });
                return;
            }

            const focusButton = event.target.closest('[data-ai-focus]');
            if (focusButton) {
                const id = focusButton.dataset.aiFocus;
                if (state.focus.has(id)) state.focus.delete(id);
                else state.focus.add(id);
                focusButton.classList.toggle('is-active', state.focus.has(id));
                focusButton.setAttribute('aria-pressed', String(state.focus.has(id)));
                this.refreshAiPrompt();
                this.updateAiPayloadMeter();
                return;
            }

            const actionButton = event.target.closest('[data-ai-action]');
            if (!actionButton) return;
            const action = actionButton.dataset.aiAction;
            // launch / share / copy must run synchronously inside the tap.
            const actions = {
                close: () => this.closeAiCoach(),
                launch: () => this.launchAiProvider(),
                share: () => this.shareAiPrompt(),
                copy: () => this.copyAiPrompt(),
                paste: () => this.pasteAiReply(),
                'paste-manual': () => this.setAiView('paste'),
                'analyze-paste': () => this.handleAiReplyText(document.getElementById('ai-reply-input')?.value || ''),
                file: () => document.getElementById('ai-reply-file')?.click(),
                compose: () => this.setAiView('compose'),
                sent: () => this.setAiView('sent'),
                reopen: () => this.reopenAiProvider(),
                'copy-follow-up': () => this.copyAiFollowUp(),
                apply: () => this.applyAiProgram(actionButton),
                restore: () => this.restoreAiProgramBackup(),
                'open-sessions': () => {
                    this.closeAiCoach();
                    this.showEditSessionsSheet();
                }
            };
            actions[action]?.();
        },

        setAiView(view) {
            if (!this.aiState) return;
            this.aiState.view = view;
            this.renderAiCoach();
            if (view === 'paste') {
                setTimeout(() => document.getElementById('ai-reply-input')?.focus(), 80);
            }
        },

        renderAiCoach({ keepScroll = false } = {}) {
            const body = document.getElementById('ai-coach-body');
            const state = this.aiState;
            if (!body || !state) return;
            const scroller = body.closest('.sheet-content');
            const scrollTop = scroller?.scrollTop || 0;

            const views = {
                compose: () => this.renderAiCompose(),
                sent: () => this.renderAiSent(),
                paste: () => this.renderAiPaste(),
                review: () => this.renderAiReview(),
                missing: () => this.renderAiMissing(),
                applied: () => this.renderAiApplied()
            };
            body.innerHTML = (views[state.view] || views.compose)();
            body.dataset.view = state.view;
            if (scroller) scroller.scrollTop = keepScroll ? scrollTop : 0;
        },

        renderAiHero({ kicker, title, text = '', mark = null, compact = false, tone = '' }) {
            const markHtml = mark || `<span class="ai-orb">${SPARKLE_SVG}</span>`;
            return `
                <header class="ai-hero ${compact ? 'is-compact' : ''} ${tone ? `is-${tone}` : ''}">
                    <div class="hero-bg" aria-hidden="true">
                        <span class="hero-blob blob-a"></span>
                        <span class="hero-blob blob-b"></span>
                        <span class="hero-grid"></span>
                    </div>
                    <div class="ai-hero-top">
                        ${markHtml}
                        <div class="ai-hero-heading">
                            <span class="ai-kicker">${this.escapeHtml(kicker)}</span>
                            <h3 id="ai-coach-title">${this.escapeHtml(title)}</h3>
                        </div>
                        <button type="button" class="ai-close" data-ai-action="close" aria-label="Fermer">${CLOSE_SVG}</button>
                    </div>
                    ${text ? `<p class="ai-hero-text">${text}</p>` : ''}
                </header>
            `;
        },

        renderProviderMark(provider, size = '') {
            return `<span class="ai-provider-mark ${size}" style="--ai-tint: ${provider.tint}" aria-hidden="true">${this.escapeHtml(provider.monogram)}</span>`;
        },

        // ---------- view: compose ----------
        renderAiCompose() {
            const state = this.aiState;
            const provider = AiCoach.getProvider(state.provider);
            const intent = AiCoach.getIntent(state.intent);
            const launchLabel = provider.newChatUrl ? `Ouvrir ${provider.name}` : 'Copier le message';

            return `
                ${this.renderAiHero({
                    kicker: 'Coach IA',
                    title: 'Fais bosser l’IA pour toi',
                    text: 'Tes stats, ton programme et les consignes partent en un tap. Tu reviens ici avec la réponse, l’app applique les changements.'
                })}
                <ol class="ai-track" aria-label="Étapes">
                    <li class="is-current"><span>1</span>Choisis</li>
                    <li><span>2</span>Envoie</li>
                    <li><span>3</span>Colle la réponse</li>
                </ol>

                <section class="ai-section">
                    <div class="ai-section-label">Ce que tu veux</div>
                    <div class="ai-intent-grid" role="radiogroup" aria-label="Objectif de la demande">
                        ${AiCoach.AI_INTENTS.map(item => `
                            <button type="button" class="ai-intent ${item.id === state.intent ? 'is-active' : ''}" data-ai-intent="${item.id}" role="radio" aria-checked="${item.id === state.intent}">
                                <span class="ai-intent-emoji" aria-hidden="true">${item.emoji}</span>
                                <strong>${this.escapeHtml(item.title)}</strong>
                                <small>${this.escapeHtml(item.subtitle)}</small>
                                <span class="ai-intent-check" aria-hidden="true">${CHECK_SVG}</span>
                            </button>
                        `).join('')}
                    </div>
                </section>

                <section class="ai-section">
                    <div class="ai-section-label">Ton IA</div>
                    <div class="ai-provider-row" role="radiogroup" aria-label="Assistant IA">
                        ${AiCoach.AI_PROVIDERS.map(item => `
                            <button type="button" class="ai-provider ${item.id === state.provider ? 'is-active' : ''}" data-ai-provider="${item.id}" role="radio" aria-checked="${item.id === state.provider}" style="--ai-tint: ${item.tint}">
                                ${this.renderProviderMark(item)}
                                <span>${this.escapeHtml(item.name)}</span>
                            </button>
                        `).join('')}
                    </div>
                </section>

                <section class="ai-section">
                    <div class="ai-section-label">Précise ta demande <em>optionnel</em></div>
                    <div class="ai-focus-chips">
                        ${AiCoach.AI_FOCUS_CHIPS.map(chip => `
                            <button type="button" class="ai-focus ${state.focus.has(chip.id) ? 'is-active' : ''}" data-ai-focus="${chip.id}" aria-pressed="${state.focus.has(chip.id)}">${this.escapeHtml(chip.label)}</button>
                        `).join('')}
                    </div>
                    <textarea id="ai-message" class="ai-message" rows="2" maxlength="800" placeholder="${this.escapeHtml(intent.placeholder)}">${this.escapeHtml(state.message)}</textarea>
                </section>

                ${this.renderAiPayloadCard()}

                <div class="ai-actions">
                    <button type="button" class="btn btn-primary btn-large ai-launch" data-ai-action="launch" ${state.loading || !state.prompt ? 'disabled' : ''}>
                        ${this.renderProviderMark(provider, 'is-on-primary')}
                        <span>${this.escapeHtml(launchLabel)}</span>
                        ${provider.newChatUrl ? `<span class="ai-launch-arrow">${ARROW_SVG}</span>` : ''}
                    </button>
                    <div class="ai-actions-row">
                        <button type="button" class="btn btn-secondary" data-ai-action="copy" ${state.prompt ? '' : 'disabled'}>Copier</button>
                        <button type="button" class="btn btn-secondary" data-ai-action="share" ${state.prompt ? '' : 'disabled'}>${AiBridge.canShareFile() ? 'Partager' : 'Télécharger'}</button>
                    </div>
                </div>

                <button type="button" class="ai-return-link" data-ai-action="paste">
                    <span class="ai-return-icon">${PASTE_SVG}</span>
                    <span><strong>Tu as déjà la réponse de l’IA ?</strong><small>Colle-la ici pour l’appliquer</small></span>
                </button>
                ${this.renderAiBackupRow()}
            `;
        },

        renderAiPayloadCard() {
            const state = this.aiState;
            if (state.loading) {
                return `<section class="ai-payload is-loading"><div class="ai-skeleton"></div><div class="ai-skeleton short"></div></section>`;
            }
            if (state.digestError || !state.digest) {
                return `<section class="ai-payload"><div class="pz-empty">Impossible de préparer tes données pour le moment. Réessaie après avoir rouvert l’app.</div></section>`;
            }
            const { profile, stats, windowWeeks } = state.digest;
            const tiles = [
                { value: profile.recentWorkouts, label: `séances · ${windowWeeks} sem.` },
                { value: stats.exercises, label: 'exos analysés' },
                { value: stats.slots, label: 'exos au programme' },
                { value: state.digest.muscles.length, label: 'muscles suivis' }
            ];
            const lowData = profile.recentWorkouts < 3;
            return `
                <section class="ai-payload">
                    <div class="ai-payload-head">
                        <div>
                            <span class="pz-kicker">Ce qui part vers l’IA</span>
                            <h4>Ton dossier d’entraînement</h4>
                        </div>
                        <span class="pz-chip" id="ai-payload-meter">${this.formatAiPromptSize(state.prompt)}</span>
                    </div>
                    <div class="ai-payload-tiles">
                        ${tiles.map(tile => `<div class="ai-payload-tile"><strong>${tile.value}</strong><span>${this.escapeHtml(tile.label)}</span></div>`).join('')}
                    </div>
                    ${lowData ? '<p class="ai-payload-hint">Encore peu de séances : l’IA s’appuiera surtout sur ton programme et ton objectif.</p>' : ''}
                    <details class="ai-preview">
                        <summary>Voir le message complet</summary>
                        <pre id="ai-preview-text">${this.escapeHtml(state.prompt)}</pre>
                    </details>
                    <p class="ai-privacy">${LOCK_SVG}<span>Rien ne part sans toi. Seules ces données d’entraînement sont partagées : aucun nom, email ni identifiant.</span></p>
                </section>
            `;
        },

        formatAiPromptSize(prompt = '') {
            const words = String(prompt).split(/\s+/).filter(Boolean).length;
            return `≈ ${words.toLocaleString('fr-FR')} mots`;
        },

        updateAiPayloadMeter() {
            const meter = document.getElementById('ai-payload-meter');
            if (meter) meter.textContent = this.formatAiPromptSize(this.aiState?.prompt);
            const preview = document.getElementById('ai-preview-text');
            if (preview) preview.textContent = this.aiState?.prompt || '';
        },

        renderAiBackupRow() {
            const backup = this.aiState?.backup;
            if (!backup?.savedAt) return '';
            const date = new Date(backup.savedAt);
            const label = Number.isNaN(date.getTime())
                ? ''
                : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
            return `
                <button type="button" class="ai-backup-row" data-ai-action="restore">
                    <span aria-hidden="true">↩︎</span>
                    Revenir au programme d’avant l’IA${label ? ` (${this.escapeHtml(label)})` : ''}
                </button>
            `;
        },

        // ---------- sending ----------
        launchAiProvider() {
            const state = this.aiState;
            if (!state?.prompt) return;
            const plan = AiCoach.planLaunch(state.provider, state.prompt);
            const copyPromise = AiBridge.copy(state.prompt, { beforeLeaving: Boolean(plan.url) });
            const opened = plan.url ? AiBridge.openUrl(plan.url) : false;
            state.launch = { ...plan, opened, copied: null };
            state.view = 'sent';
            this.renderAiCoach();

            copyPromise.then(copied => {
                if (!this.aiState?.launch) return;
                this.aiState.launch.copied = copied;
                if (this.aiState.view === 'sent') this.renderAiCoach({ keepScroll: true });
                if (!copied && !plan.prefilled) {
                    this.showCoachToast('Copie bloquée par le navigateur : utilise « Partager » ou recopie le message depuis l’aperçu.', 'warning', '📋');
                } else if (plan.url && !opened) {
                    this.showCoachToast(`Message copié. Ouvre ${this.escapeHtml(plan.provider.name)} et colle-le.`, 'hot', '📋');
                }
            });
        },

        reopenAiProvider() {
            const state = this.aiState;
            if (!state?.prompt) return;
            const plan = AiCoach.planLaunch(state.provider, state.prompt);
            AiBridge.copy(state.prompt, { beforeLeaving: Boolean(plan.url) });
            if (plan.url) AiBridge.openUrl(plan.url);
        },

        copyAiPrompt() {
            const state = this.aiState;
            if (!state?.prompt) return;
            AiBridge.copy(state.prompt).then(copied => {
                if (!this.aiState) return;
                if (!copied) {
                    this.showCoachToast('Copie impossible. Ouvre « Voir le message complet » et sélectionne le texte.', 'warning', '📋');
                    return;
                }
                this.aiState.launch = { provider: AiCoach.getProvider(state.provider), url: null, prefilled: false, opened: false, copied };
                if (this.aiState.view === 'sent') this.showCoachToast('Message recopié.', 'hot', '📋');
                else this.setAiView('sent');
            });
        },

        shareAiPrompt() {
            const state = this.aiState;
            if (!state?.prompt) return;
            const fileName = `worktout-coach-ia-${new Date().toISOString().slice(0, 10)}.md`;
            const payload = {
                fileName,
                content: state.prompt,
                message: AiCoach.buildShareMessage(state.intent),
                title: 'Mes données Worktout'
            };
            // Started in the same tap as the share sheet so both keep user activation.
            AiBridge.copy(state.prompt);
            AiBridge.shareFile(payload).then(result => {
                if (!this.aiState) return;
                if (result === 'unavailable') {
                    AiBridge.downloadFile(payload);
                    this.showCoachToast('Fichier téléchargé : joins-le dans ton IA (le message est aussi copié).', 'hot', '📎');
                }
                if (result !== 'cancelled') {
                    this.aiState.launch = { provider: AiCoach.getProvider(state.provider), url: null, prefilled: false, opened: false, copied: true, shared: true };
                    this.setAiView('sent');
                }
            });
        },

        // ---------- view: sent ----------
        renderAiSent() {
            const state = this.aiState;
            const launch = state.launch || { provider: AiCoach.getProvider(state.provider) };
            const provider = launch.provider;
            const intent = AiCoach.getIntent(state.intent);
            const step1 = launch.shared
                ? 'Fichier envoyé'
                : launch.prefilled
                    ? `Message prêt dans ${provider.name}`
                    : launch.copied === false ? 'Copie à refaire' : 'Message copié';
            const step2 = launch.prefilled
                ? 'Envoie-le et discute avec l’IA'
                : launch.shared
                    ? 'Choisis ton app d’IA et envoie'
                    : `Colle-le dans ${provider.newChatUrl ? provider.name : 'ton IA'} et envoie`;
            const step2Hint = launch.prefilled || launch.shared
                ? 'Réponds à ses questions, demande des ajustements si besoin.'
                : 'Appui long dans la zone de texte → « Coller ».';
            const step3Hint = intent.expectsProgram
                ? 'Quand elle donne le programme final, copie sa réponse (bouton « copier » sous le message) puis reviens ici.'
                : 'Lis l’analyse. Si tu veux appliquer ses conseils, demande-lui le programme mis à jour puis colle sa réponse ici.';

            return `
                ${this.renderAiHero({
                    kicker: 'Coach IA',
                    title: `Direction ${provider.name}`,
                    text: 'Discute avec l’IA, puis reviens coller sa réponse : l’app te montre les changements avant de les appliquer.',
                    mark: this.renderProviderMark(provider, 'is-hero'),
                    compact: true
                })}
                <ol class="ai-steps">
                    <li class="${launch.copied === false && !launch.prefilled ? 'is-warning' : 'is-done'}">
                        <span class="ai-step-dot">${launch.copied === false && !launch.prefilled ? '!' : CHECK_SVG}</span>
                        <div><strong>${this.escapeHtml(step1)}</strong><small>${launch.copied === false && !launch.prefilled ? 'Utilise « Recopier » ci-dessous.' : 'Ton dossier et les consignes sont prêts.'}</small></div>
                    </li>
                    <li class="is-current">
                        <span class="ai-step-dot">2</span>
                        <div><strong>${this.escapeHtml(step2)}</strong><small>${this.escapeHtml(step2Hint)}</small></div>
                    </li>
                    <li>
                        <span class="ai-step-dot">3</span>
                        <div><strong>Reviens coller sa réponse</strong><small>${this.escapeHtml(step3Hint)}</small></div>
                    </li>
                </ol>

                <div class="ai-actions">
                    <button type="button" class="btn btn-large ai-paste-cta" data-ai-action="paste">
                        <span class="ai-paste-icon">${PASTE_SVG}</span>
                        Coller la réponse de l’IA
                    </button>
                    <div class="ai-actions-row">
                        ${provider.newChatUrl ? `<button type="button" class="btn btn-secondary" data-ai-action="reopen">Rouvrir ${this.escapeHtml(provider.name)}</button>` : ''}
                        <button type="button" class="btn btn-secondary" data-ai-action="copy">Recopier</button>
                    </div>
                </div>
                <div class="ai-footer-links">
                    <button type="button" class="ai-text-link" data-ai-action="compose">← Modifier ma demande</button>
                    <button type="button" class="ai-text-link" data-ai-action="file">Importer un fichier</button>
                </div>
            `;
        },

        // ---------- reading the reply ----------
        async pasteAiReply() {
            let text = '';
            try {
                text = await AiBridge.readClipboard();
            } catch (error) {
                this.setAiView('paste');
                return;
            }
            if (!String(text || '').trim()) {
                this.setAiView('paste');
                this.showCoachToast('Presse-papier vide : copie la réponse de l’IA ou colle-la ci-dessous.', 'warning', '📋');
                return;
            }
            await this.handleAiReplyText(text);
        },

        renderAiPaste() {
            return `
                ${this.renderAiHero({
                    kicker: 'Coach IA',
                    title: 'Colle la réponse de l’IA',
                    text: 'Tout le message, tel quel : l’app retrouve le programme toute seule.',
                    compact: true
                })}
                <textarea id="ai-reply-input" class="ai-message ai-reply-input" rows="9" placeholder="Appui long → Coller"></textarea>
                <div class="ai-actions">
                    <button type="button" class="btn btn-primary btn-large" data-ai-action="analyze-paste">Lire la réponse</button>
                </div>
                <div class="ai-footer-links">
                    <button type="button" class="ai-text-link" data-ai-action="${this.aiState?.launch ? 'sent' : 'compose'}">← Retour</button>
                    <button type="button" class="ai-text-link" data-ai-action="file">Importer un fichier</button>
                </div>
            `;
        },

        async handleAiReplyText(text) {
            const state = this.aiState;
            if (!state) return;
            const { program, reason } = AiCoach.extractProgram(text);
            if (!program) {
                state.missingReason = reason;
                this.setAiView('missing');
                return;
            }

            try {
                // Same validation as the import pipeline, without writing anything.
                this.normalizeProgramImport(program);
            } catch (error) {
                state.missingReason = 'invalid';
                state.invalidMessage = error.message;
                this.setAiView('missing');
                return;
            }

            const [sessions, slots, objective, weeklyGoal] = await Promise.all([
                db.getSessions(),
                db.getAll('slots'),
                db.getSetting('trainingObjective'),
                db.getSetting('weeklyGoal')
            ]);
            const current = AiCoach.programFromStore(sessions, slots, { objective, weeklyGoal });
            state.review = { program, diff: AiCoach.diffPrograms(current, program) };
            this.setAiView('review');
        },

        renderAiMissing() {
            const state = this.aiState;
            const reasons = {
                empty: 'Le texte collé est vide.',
                'no-json': 'L’IA n’a pas encore donné de programme dans ce message. Normal si elle a seulement fait une analyse !',
                'no-program': 'Il y a bien du JSON, mais pas un programme Worktout.',
                invalid: `Le programme est incomplet : ${state.invalidMessage || 'format inattendu'}.`
            };
            return `
                ${this.renderAiHero({
                    kicker: 'Coach IA',
                    title: 'Pas de programme à appliquer',
                    text: this.escapeHtml(reasons[state.missingReason] || reasons['no-json']),
                    mark: '<span class="ai-orb is-muted" aria-hidden="true">🤔</span>',
                    compact: true
                })}
                <div class="ai-tip">
                    <strong>Pour obtenir le programme</strong>
                    <p>Copie cette relance, envoie-la à l’IA dans la même conversation, puis copie sa nouvelle réponse.</p>
                    <blockquote>${this.escapeHtml(AiCoach.FOLLOW_UP_PROMPT)}</blockquote>
                </div>
                <div class="ai-actions">
                    <button type="button" class="btn btn-primary btn-large" data-ai-action="copy-follow-up">Copier la relance</button>
                    <div class="ai-actions-row">
                        <button type="button" class="btn btn-secondary" data-ai-action="paste">Recoller</button>
                        <button type="button" class="btn btn-secondary" data-ai-action="paste-manual">Coller à la main</button>
                    </div>
                </div>
                <div class="ai-footer-links">
                    <button type="button" class="ai-text-link" data-ai-action="compose">← Nouvelle demande</button>
                </div>
            `;
        },

        copyAiFollowUp() {
            AiBridge.copy(AiCoach.FOLLOW_UP_PROMPT).then(copied => {
                this.showCoachToast(
                    copied ? 'Relance copiée. Colle-la dans la conversation avec l’IA.' : 'Copie impossible : sélectionne le texte à la main.',
                    copied ? 'hot' : 'warning',
                    '📋'
                );
            });
        },

        // ---------- view: review ----------
        renderAiReview() {
            const { diff, program } = this.aiState.review;
            const { totals, profile } = diff;
            const chips = [
                totals.added ? `<span class="ai-diff-chip is-added">+${totals.added} ajouté${totals.added > 1 ? 's' : ''}</span>` : '',
                totals.removed ? `<span class="ai-diff-chip is-removed">−${totals.removed} retiré${totals.removed > 1 ? 's' : ''}</span>` : '',
                totals.changed ? `<span class="ai-diff-chip is-changed">~${totals.changed} modifié${totals.changed > 1 ? 's' : ''}</span>` : '',
                totals.kept ? `<span class="ai-diff-chip">${totals.kept} inchangé${totals.kept > 1 ? 's' : ''}</span>` : ''
            ].join('');
            const sessionCount = (program.program?.sessions || program.sessions || []).length;

            return `
                ${this.renderAiHero({
                    kicker: 'Proposition de l’IA',
                    title: diff.hasChanges ? 'Voici ce qui change' : 'Aucun changement',
                    text: diff.hasChanges
                        ? `${sessionCount} séance${sessionCount > 1 ? 's' : ''} · vérifie puis applique en un tap.`
                        : 'Ce programme est identique à ton programme actuel.',
                    compact: true,
                    tone: 'review'
                })}
                ${chips ? `<div class="ai-diff-chips">${chips}</div>` : ''}
                ${profile.objective || profile.weeklyGoal ? `
                    <div class="ai-diff-profile">
                        ${profile.objective ? `<div><span>Objectif</span><strong>${this.escapeHtml(profile.objective.to)}</strong></div>` : ''}
                        ${profile.weeklyGoal ? `<div><span>Séances / semaine</span><strong>${profile.weeklyGoal.from ? `${profile.weeklyGoal.from} → ` : ''}${profile.weeklyGoal.to}</strong></div>` : ''}
                    </div>
                ` : ''}
                <div class="ai-diff-list">
                    ${diff.sessions.map((session, index) => this.renderAiDiffSession(session, index)).join('')}
                </div>
                <p class="ai-safe-note">${CHECK_SVG}<span>Historique, records, XP et streak conservés. Tu pourras revenir à l’ancien programme.</span></p>
                <div class="ai-actions">
                    ${diff.hasChanges ? `
                        <button type="button" class="btn btn-large ai-apply-cta" data-ai-action="apply">
                            ${CHECK_SVG}<span>Appliquer le programme</span>
                        </button>
                    ` : ''}
                    <div class="ai-actions-row">
                        <button type="button" class="btn btn-secondary" data-ai-action="${this.aiState.launch ? 'sent' : 'compose'}">${diff.hasChanges ? 'Pas maintenant' : 'Retour'}</button>
                    </div>
                </div>
            `;
        },

        renderAiDiffSession(session, index) {
            const tag = session.isRemoved
                ? '<span class="ai-diff-tag is-removed">Supprimée</span>'
                : session.isNew
                    ? '<span class="ai-diff-tag is-added">Nouvelle</span>'
                    : session.previousName
                        ? `<span class="ai-diff-tag">ex-${this.escapeHtml(session.previousName)}</span>`
                        : '';
            return `
                <section class="ai-diff-session ${session.isRemoved ? 'is-removed' : ''}" style="--i: ${index}">
                    <div class="ai-diff-session-head">
                        <h4>${this.escapeHtml(session.name)}</h4>
                        ${tag}
                    </div>
                    <ul class="ai-diff-rows">
                        ${session.rows.map(row => `
                            <li class="ai-diff-row is-${row.status}">
                                <span class="ai-diff-mark" aria-label="${row.status}">${DIFF_MARKS[row.status]}</span>
                                <div class="ai-diff-main">
                                    <strong>${this.escapeHtml(row.name)}${row.superset ? `<em class="ai-diff-superset">SS ${this.escapeHtml(row.superset)}</em>` : ''}</strong>
                                    ${row.changes.length
                                        ? `<div class="ai-diff-changes">${row.changes.map(change => `<span><s>${this.escapeHtml(change.from)}</s> → ${this.escapeHtml(change.to)}</span>`).join('')}</div>`
                                        : ''}
                                </div>
                                <span class="ai-diff-summary">${this.escapeHtml(row.summary)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </section>
            `;
        },

        // ---------- apply / undo ----------
        async applyAiProgram(button) {
            const state = this.aiState;
            if (!state?.review || state.applying) return;
            state.applying = true;
            if (button) button.disabled = true;

            try {
                const clearChoice = await this.confirmClearCurrentWorkoutForPlanImport();
                if (clearChoice === null) return;

                const [sessions, slots, objective, weeklyGoal] = await Promise.all([
                    db.getSessions(),
                    db.getAll('slots'),
                    db.getSetting('trainingObjective'),
                    db.getSetting('weeklyGoal')
                ]);
                const backup = { savedAt: new Date().toISOString(), sessions, slots, objective, weeklyGoal };
                await db.setSetting('aiProgramBackup', backup);

                const counts = await this.importProgramData(state.review.program, {
                    preserveHistory: true,
                    clearCurrentWorkout: clearChoice
                });
                await this.afterAiPlanChange(counts);

                if (!this.aiState) return;
                this.aiState.backup = backup;
                this.aiState.appliedCounts = counts;
                this.setAiView('applied');
                requestAnimationFrame(() => {
                    gamification.burstFromElement(document.querySelector('.ai-applied-medal'), {
                        count: 60, spread: 360, power: 12, shapes: ['star', 'circle', 'rect']
                    });
                });
            } catch (error) {
                await this.showAppAlert(`Le programme n’a pas pu être appliqué :\n\n${error.message}`, {
                    title: 'Application impossible',
                    variant: 'danger',
                    confirmText: 'Fermer'
                });
            } finally {
                if (this.aiState) this.aiState.applying = false;
                if (button?.isConnected) button.disabled = false;
            }
        },

        async afterAiPlanChange(counts = {}) {
            await this.migrateExerciseIdentityMetadata({ force: true });
            if (counts.currentWorkoutCleared) {
                this.currentWorkout = null;
                this.currentSession = null;
                this.currentSlot = null;
                this.supersetSlot = null;
            }
            await this.renderHome();
            await this.refreshStorageIndicators({ includeSettings: true });
        },

        renderAiApplied() {
            const counts = this.aiState.appliedCounts || {};
            return `
                <div class="ai-applied">
                    <button type="button" class="ai-close is-light" data-ai-action="close" aria-label="Fermer">${CLOSE_SVG}</button>
                    <div class="ai-applied-medal">${CHECK_SVG}</div>
                    <span class="ai-kicker">Coach IA</span>
                    <h3 id="ai-coach-title">Programme appliqué !</h3>
                    <p>${counts.sessions || 0} séance${counts.sessions > 1 ? 's' : ''} · ${counts.slots || 0} exercices. Le coach utilise déjà tes nouveaux objectifs, ton historique est intact.</p>
                </div>
                <div class="ai-actions">
                    <button type="button" class="btn btn-primary btn-large" data-ai-action="open-sessions">Voir mes séances</button>
                    <div class="ai-actions-row">
                        <button type="button" class="btn btn-secondary" data-ai-action="close">Fermer</button>
                    </div>
                </div>
                ${this.renderAiBackupRow()}
            `;
        },

        async restoreAiProgramBackup() {
            const backup = await db.getSetting('aiProgramBackup');
            if (!backup?.sessions?.length) {
                this.showCoachToast('Aucune sauvegarde de programme à restaurer.', 'warning', '↩︎');
                return;
            }
            const confirmed = await this.showAppConfirm(
                'Ton programme actuel sera remplacé par celui d’avant la dernière modification IA.\n\nTon historique, tes records et ton XP ne bougent pas.',
                { title: 'Revenir à l’ancien programme ?', variant: 'warning', confirmText: 'Restaurer', cancelText: 'Annuler' }
            );
            if (!confirmed) return;

            const clearChoice = await this.confirmClearCurrentWorkoutForPlanImport();
            if (clearChoice === null) return;

            try {
                await this.captureCurrentSessionNamesForArchive();
                await this.captureCurrentSlotHistoryArchive();
                const counts = await db.importSessionPlanData(
                    { sessions: backup.sessions, slots: backup.slots },
                    { clearCurrentWorkout: clearChoice }
                );
                await this.applyPlanImportSettings({
                    objective: backup.objective || '',
                    weeklyGoal: backup.weeklyGoal || 3
                });
                this.invalidateExerciseHistoryCaches();
                await db.setSetting('aiProgramBackup', null);
                await this.afterAiPlanChange(counts);
                if (this.aiState) {
                    this.aiState.backup = null;
                    this.aiState.view = 'compose';
                    this.renderAiCoach();
                }
                this.showCoachToast('Ancien programme restauré.', 'hot', '↩︎');
            } catch (error) {
                await this.showAppAlert(`Restauration impossible :\n\n${error.message}`, {
                    title: 'Erreur', variant: 'danger', confirmText: 'Fermer'
                });
            }
        },

        // ---------- Parcours card ----------
        renderAiCoachCard() {
            const container = document.getElementById('ai-coach-card');
            if (!container) return;
            container.innerHTML = `
                <div class="hero-bg" aria-hidden="true">
                    <span class="hero-blob blob-a"></span>
                    <span class="hero-blob blob-b"></span>
                    <span class="hero-grid"></span>
                </div>
                <div class="ai-card-top">
                    <span class="ai-orb">${SPARKLE_SVG}</span>
                    <div>
                        <span class="ai-kicker">Coach IA</span>
                        <strong>Ton coach perso, boosté à l’IA</strong>
                    </div>
                </div>
                <p>Envoie tes stats et ton programme à ChatGPT, Claude ou Gemini en un tap, puis applique ses conseils ici.</p>
                <div class="ai-card-actions">
                    <button type="button" class="ai-card-btn is-main" data-ai-open="analyze"><span aria-hidden="true">📊</span>Analyser</button>
                    <button type="button" class="ai-card-btn" data-ai-open="improve"><span aria-hidden="true">🔧</span>Optimiser</button>
                </div>
            `;
        }
    };

    Object.assign(App.prototype, AiCoachUI);

    // Any element with data-ai-open (Parcours card, home, session editor) opens the sheet.
    document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-ai-open]');
        if (!trigger || typeof app === 'undefined') return;
        event.preventDefault();
        if (trigger.closest('#sheet-edit-sessions')) app.hideEditSessionsSheet();
        app.openAiCoach(trigger.dataset.aiOpen || null);
    });
})();
