// ===== Coach IA intégré : discussion dans l'app =====
// The coach talks like a training buddy and knows the player's data (the
// same digest as the copy/paste flow). Two ways to reach a model:
//  - "endpoint": our backend (workers/coach-proxy.js) that holds the API key
//    and applies quotas. This is the production setup.
//  - "anthropic": the player's own Anthropic API key, called from the
//    browser. Handy for the beta and for power users.
// When a reply contains a program block, the existing review screen of the
// AI coach sheet shows the changes before anything is applied.
(() => {
    const MODEL = 'claude-sonnet-5-5';
    const MAX_HISTORY = 40;
    const MAX_CONTEXT_TURNS = 16;
    const SUGGESTIONS = [
        'Comment s’est passée ma semaine ?',
        'Je stagne au développé couché, on fait quoi ?',
        'J’ai 30 min aujourd’hui, propose-moi une séance',
        'Ajoute plus de travail pour le dos à mon programme'
    ];

    const PERSONA = [
        'Tu es « Coach », le pote coach de musculation intégré à l’app Muscu. Tu tutoies, tu es chaleureux, motivant et direct, comme un ami qui s’y connaît vraiment (hypertrophie, force, cardio, récupération).',
        'Tu réponds en français, court (3 à 8 phrases ou une petite liste), concret et chiffré à partir des DONNÉES ci-dessous. Un emoji de temps en temps, pas plus.',
        'Explique les termes techniques simplement. Si une info manque, pose UNE question courte.',
        'Sécurité : jamais de diagnostic médical. En cas de douleur, propose d’adapter (amplitude, charge, variante) et de consulter si elle persiste. Pas de conseils de dopage ni de régimes extrêmes.',
        'Ne propose un programme complet que si on te le demande explicitement ou si un changement de programme est nécessaire ; dans ce cas, respecte le format ci-dessous.'
    ].join('\n');

    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // Tiny, safe markdown: escape first, then bold/italic/lists/code.
    const renderMarkdown = text => escape(text)
        .replace(/```(?:json)?\n?([\s\S]*?)```/g, '<span class="cc-code">📋 Programme proposé (voir les changements ci-dessous)</span>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$|[.,!?])/g, '$1<em>$2</em>')
        .replace(/^[ \t]*[-•][ \t]+(.*)(?:\n|$)/gm, '<span class="cc-li">$1</span>')
        .replace(/\n/g, '<br>');

    Object.assign(App.prototype, {
        async getCoachChatConfig() {
            const config = (await db.getSetting('coachChatConfig')) || {};
            return { mode: config.mode || '', apiKey: config.apiKey || '', endpoint: config.endpoint || '' };
        },

        async openCoachChat() {
            const sheet = this.ensureCoachChatSheet();
            const [config, history] = await Promise.all([
                this.getCoachChatConfig(),
                db.getSetting('coachChatHistory')
            ]);
            this.coachChat = { config, messages: Array.isArray(history) ? history : [], sending: false, setup: !config.mode };
            sheet.classList.add('active');
            this.renderCoachChat();
        },

        closeCoachChat() {
            document.getElementById('sheet-coach-chat')?.classList.remove('active');
            this.coachChat = null;
        },

        ensureCoachChatSheet() {
            let sheet = document.getElementById('sheet-coach-chat');
            if (sheet) return sheet;
            sheet = document.createElement('div');
            sheet.className = 'bottom-sheet coach-chat-sheet';
            sheet.id = 'sheet-coach-chat';
            sheet.innerHTML = `
                <div class="sheet-backdrop"></div>
                <div class="sheet-content sheet-content-large cc-chat" role="dialog" aria-modal="true" aria-labelledby="cc-chat-title">
                    <div class="sheet-handle"></div>
                    <div id="cc-chat-body"></div>
                </div>
            `;
            document.body.appendChild(sheet);
            sheet.querySelector('.sheet-backdrop').addEventListener('click', () => this.closeCoachChat());
            sheet.addEventListener('click', event => this.handleCoachChatClick(event));
            sheet.addEventListener('submit', event => {
                event.preventDefault();
                if (event.target.id === 'cc-chat-form') void this.sendCoachMessage();
                if (event.target.id === 'cc-setup-form') void this.saveCoachChatSetup(event.target);
            });
            sheet.addEventListener('keydown', event => {
                if (event.target.id === 'cc-chat-input' && event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void this.sendCoachMessage();
                }
            });
            return sheet;
        },

        renderCoachChat() {
            const state = this.coachChat;
            const body = document.getElementById('cc-chat-body');
            if (!state || !body) return;
            const head = `
                <div class="cc-chat-head">
                    <span class="cc-chat-avatar" aria-hidden="true">🤖</span>
                    <div>
                        <h3 id="cc-chat-title">Coach</h3>
                        <small>${state.setup ? 'Connexion à l’IA' : 'Ton pote coach · connaît tes séances'}</small>
                    </div>
                    ${state.setup ? '' : '<button type="button" class="cc-chat-icon" data-cc="settings" aria-label="Réglages du coach">⚙️</button>'}
                    <button type="button" class="cc-chat-icon" data-cc="close" aria-label="Fermer">✕</button>
                </div>`;

            if (state.setup) {
                const { mode, apiKey, endpoint } = state.config;
                body.innerHTML = `${head}
                    <form id="cc-setup-form" class="cc-setup">
                        <p>Le coach a besoin d’une IA pour discuter. Choisis comment la joindre :</p>
                        <label class="cc-option"><input type="radio" name="mode" value="endpoint" ${mode !== 'anthropic' ? 'checked' : ''}>
                            <span><strong>Serveur Muscu</strong><small>Adresse du serveur du coach (fournie avec l’app).</small></span></label>
                        <input type="url" name="endpoint" class="cc-field" placeholder="https://coach.exemple.workers.dev" value="${escape(endpoint)}">
                        <label class="cc-option"><input type="radio" name="mode" value="anthropic" ${mode === 'anthropic' ? 'checked' : ''}>
                            <span><strong>Ma clé Claude (Anthropic)</strong><small>Reste sur ce téléphone et n’est envoyée qu’à Anthropic.</small></span></label>
                        <input type="password" name="apiKey" class="cc-field" placeholder="sk-ant-…" autocomplete="off" value="${escape(apiKey)}">
                        <button type="submit" class="cc-btn-main">C’est parti</button>
                        <button type="button" class="cc-text-link" data-cc="fallback">Pas d’IA ? Utiliser ChatGPT / Claude par copier-coller</button>
                        ${state.config.mode ? '<button type="button" class="cc-text-link" data-cc="forget">Effacer la conversation</button>' : ''}
                    </form>`;
                return;
            }

            const messages = state.messages;
            body.innerHTML = `${head}
                <div class="cc-thread" id="cc-thread" aria-live="polite">
                    ${messages.length ? '' : `
                        <div class="cc-bubble is-coach">Salut ! 👋 Je vois tes séances, tes records et ton volume par muscle. Pose-moi n’importe quelle question sur ton entraînement.</div>
                        <div class="cc-suggestions">${SUGGESTIONS.map(text => `<button type="button" class="cc-suggestion" data-cc-suggest="${escape(text)}">${escape(text)}</button>`).join('')}</div>`}
                    ${messages.map((message, index) => `
                        <div class="cc-bubble ${message.role === 'user' ? 'is-me' : 'is-coach'} ${message.error ? 'is-error' : ''}">
                            ${message.role === 'user' ? escape(message.content).replace(/\n/g, '<br>') : renderMarkdown(message.content)}
                            ${message.role === 'assistant' && /worktout-program-v1/.test(message.content) ? `<button type="button" class="cc-apply" data-cc-apply="${index}">Voir les changements du programme</button>` : ''}
                        </div>`).join('')}
                    ${state.sending ? '<div class="cc-bubble is-coach cc-typing" aria-label="Le coach écrit"><span></span><span></span><span></span></div>' : ''}
                </div>
                <form id="cc-chat-form" class="cc-compose">
                    <textarea id="cc-chat-input" rows="1" maxlength="1500" placeholder="Écris au coach…" ${state.sending ? 'disabled' : ''}>${escape(state.draft || '')}</textarea>
                    <button type="submit" class="cc-send" aria-label="Envoyer" ${state.sending ? 'disabled' : ''}>➤</button>
                </form>`;
            const thread = body.querySelector('#cc-thread');
            thread.scrollTop = thread.scrollHeight;
            body.querySelector('#cc-chat-input')?.addEventListener('input', event => {
                state.draft = event.target.value;
            });
        },

        async handleCoachChatClick(event) {
            const state = this.coachChat;
            const action = event.target.closest('[data-cc]')?.dataset.cc;
            const suggestion = event.target.closest('[data-cc-suggest]')?.dataset.ccSuggest;
            const apply = event.target.closest('[data-cc-apply]')?.dataset.ccApply;
            if (!state) return;
            if (action === 'close') this.closeCoachChat();
            else if (action === 'settings') { state.setup = true; this.renderCoachChat(); }
            else if (action === 'fallback') { this.closeCoachChat(); void this.openAiCoach('analyze'); }
            else if (action === 'forget') {
                state.messages = [];
                await db.setSetting('coachChatHistory', []);
                state.setup = false;
                this.renderCoachChat();
            } else if (suggestion) {
                state.draft = suggestion;
                void this.sendCoachMessage();
            } else if (apply !== undefined) {
                const text = state.messages[Number(apply)]?.content;
                if (!text) return;
                this.closeCoachChat();
                await this.openAiCoach('improve');
                await this.handleAiReplyText(text);
            }
        },

        async saveCoachChatSetup(form) {
            const data = new FormData(form);
            const mode = data.get('mode');
            const config = {
                mode,
                apiKey: String(data.get('apiKey') || '').trim(),
                endpoint: String(data.get('endpoint') || '').trim()
            };
            if (mode === 'anthropic' && !/^sk-ant-/.test(config.apiKey)) {
                this.showCoachToast('Colle une clé Anthropic (elle commence par sk-ant-).', 'cold', '⚠️');
                return;
            }
            if (mode === 'endpoint' && !/^https:\/\//.test(config.endpoint)) {
                this.showCoachToast('L’adresse du serveur doit commencer par https://', 'cold', '⚠️');
                return;
            }
            await db.setSetting('coachChatConfig', config);
            this.coachChat.config = config;
            this.coachChat.setup = false;
            this.renderCoachChat();
        },

        async buildCoachSystemPrompt() {
            let data = 'Aucune donnée disponible.';
            try {
                data = AiCoach.formatDigest(await this.buildAiDigest());
            } catch (error) {
                console.error('Résumé coach impossible:', error);
            }
            const muscleIds = MUSCLE_GROUPS.map(group => group.id).join(', ');
            return `${PERSONA}\n\nDate du jour : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.\n\n${AiCoach.PROGRAM_CONTRACT(muscleIds)}\n\n# DONNÉES DE L’UTILISATEUR\n\n${data}`;
        },

        async sendCoachMessage() {
            const state = this.coachChat;
            const text = String(state?.draft || '').trim();
            if (!state || state.sending || !text) return;
            state.draft = '';
            state.messages.push({ role: 'user', content: text, at: Date.now() });
            state.sending = true;
            this.renderCoachChat();

            let reply;
            try {
                const system = await this.buildCoachSystemPrompt();
                const turns = state.messages
                    .filter(message => !message.error)
                    .slice(-MAX_CONTEXT_TURNS)
                    .map(({ role, content }) => ({ role, content }));
                while (turns.length && turns[0].role !== 'user') turns.shift();
                reply = { role: 'assistant', content: await this.callCoachModel(state.config, system, turns), at: Date.now() };
            } catch (error) {
                console.error('Coach IA:', error);
                reply = { role: 'assistant', error: true, at: Date.now(), content: error.userMessage || 'Je n’arrive pas à joindre l’IA pour le moment. Vérifie ta connexion ou les réglages du coach (⚙️).' };
            }
            if (this.coachChat !== state) return;
            state.messages.push(reply);
            state.messages = state.messages.slice(-MAX_HISTORY);
            state.sending = false;
            await db.setSetting('coachChatHistory', state.messages);
            this.renderCoachChat();
        },

        async callCoachModel(config, system, messages) {
            if (!navigator.onLine) {
                throw Object.assign(new Error('offline'), { userMessage: 'Tu es hors ligne : le coach IA a besoin d’Internet. Le coach de séance, lui, marche toujours. 💪' });
            }
            const fail = async response => {
                const detail = await response.text().catch(() => '');
                const userMessage = response.status === 401 ? 'Clé refusée : vérifie-la dans les réglages du coach (⚙️).'
                    : response.status === 429 ? 'Tu as atteint la limite de messages pour le moment. Réessaie un peu plus tard.'
                        : null;
                throw Object.assign(new Error(`HTTP ${response.status} ${detail.slice(0, 200)}`), { userMessage });
            };

            if (config.mode === 'anthropic') {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-api-key': config.apiKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: JSON.stringify({ model: MODEL, max_tokens: 2048, system, messages })
                });
                if (!response.ok) await fail(response);
                const data = await response.json();
                return (data.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n').trim() || '…';
            }

            const installId = await this.getCoachInstallId();
            const response = await fetch(config.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ installId, plus: this.hasFeature?.('ai-coach') ?? true, system, messages })
            });
            if (!response.ok) await fail(response);
            const data = await response.json();
            return String(data.reply || '').trim() || '…';
        },

        async getCoachInstallId() {
            let id = await db.getSetting('installId');
            if (!id) {
                id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
                await db.setSetting('installId', id);
            }
            return id;
        }
    });

    // The Parcours card gets a "Discuter" button next to the copy/paste flow.
    const baseRenderAiCoachCard = App.prototype.renderAiCoachCard;
    App.prototype.renderAiCoachCard = function () {
        baseRenderAiCoachCard.call(this);
        const container = document.getElementById('ai-coach-card');
        const actions = container?.querySelector('.ai-card-actions');
        if (!actions || actions.querySelector('[data-coach-chat]')) return;
        const intro = container.querySelector('p');
        if (intro) intro.textContent = 'Discute avec ton coach : il connaît tes séances, tes records et ton volume. Il peut aussi ajuster ton programme.';
        actions.insertAdjacentHTML('afterbegin', '<button type="button" class="ai-card-btn is-main" data-coach-chat><span aria-hidden="true">💬</span>Discuter</button>');
        actions.querySelector('[data-ai-open="analyze"]')?.classList.remove('is-main');
    };

    document.addEventListener('click', event => {
        if (!event.target.closest('[data-coach-chat]') || typeof app === 'undefined') return;
        event.preventDefault();
        void app.openCoachChat();
    });
})();
