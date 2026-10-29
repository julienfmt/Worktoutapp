// ===== Toolbox: plate calculator, 1RM / percentages, body tracking =====
// Opened from the Stats pane ("Outils & suivi") and, for the plate
// calculator, from the exercise header on barbell movements.
(() => {
    // Standard competition colours so the bar reads like a real one.
    const PLATES = [
        { kg: 25, color: '#ef4444', height: 100 },
        { kg: 20, color: '#3b82f6', height: 100 },
        { kg: 15, color: '#eab308', height: 92 },
        { kg: 10, color: '#22c55e', height: 84 },
        { kg: 5, color: '#f8fafc', height: 68, dark: true },
        { kg: 2.5, color: '#1e293b', height: 56 },
        { kg: 1.25, color: '#94a3b8', height: 46 },
        { kg: 0.5, color: '#cbd5e1', height: 38, dark: true }
    ];
    const BARS = [20, 15, 10];
    const icon = body => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    const TOOLS = [
        { id: 'plates', tab: 'Disques', title: 'Disques à charger', desc: 'Quels disques mettre de chaque côté de la barre', icon: icon('<path d="M2 12h20"/><rect x="5" y="6" width="3" height="12" rx="1"/><rect x="16" y="6" width="3" height="12" rx="1"/>') },
        { id: 'orm', tab: 'Max', title: 'Charge max estimée', desc: 'Ton max sur 1 rep et les charges par %', icon: icon('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>') },
        { id: 'body', tab: 'Mensurations', title: 'Mensurations', desc: 'Poids, tour de taille, bras…', icon: icon('<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/><path d="M14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>') }
    ];
    const MEASURES = [
        { key: 'weight', label: 'Poids', unit: 'kg', step: 0.1 },
        { key: 'waist', label: 'Tour de taille', unit: 'cm', step: 0.5 },
        { key: 'chest', label: 'Poitrine', unit: 'cm', step: 0.5 },
        { key: 'arm', label: 'Bras', unit: 'cm', step: 0.5 },
        { key: 'thigh', label: 'Cuisse', unit: 'cm', step: 0.5 },
        { key: 'hips', label: 'Hanches', unit: 'cm', step: 0.5 }
    ];

    const baseOpenExercise = App.prototype.openExercise;
    const baseRenderStats = App.prototype.renderStats;
    const baseBindEvents = App.prototype.bindEvents;

    Object.assign(App.prototype, {
        // Greedy split per side with the plates available.
        computePlates(target, barKg = 20, available = PLATES.map(plate => plate.kg)) {
            const perSide = Math.max(0, (Number(target) - barKg) / 2);
            let remaining = Math.round(perSide * 100) / 100;
            const plates = [];
            for (const plate of PLATES.filter(item => available.includes(item.kg))) {
                while (remaining + 1e-9 >= plate.kg) {
                    plates.push(plate);
                    remaining = Math.round((remaining - plate.kg) * 100) / 100;
                }
            }
            const loaded = barKg + plates.reduce((sum, plate) => sum + plate.kg, 0) * 2;
            return { plates, perSide, loaded: Math.round(loaded * 100) / 100, missing: remaining };
        },

        async showToolsSheet(tab = 'plates', { weight = null } = {}) {
            let sheet = document.getElementById('sheet-tools');
            if (!sheet) {
                sheet = document.createElement('div');
                sheet.className = 'bottom-sheet tools-sheet';
                sheet.id = 'sheet-tools';
                sheet.innerHTML = '<div class="sheet-backdrop"></div><div class="sheet-content sheet-content-large tools-content"></div>';
                document.body.appendChild(sheet);
                sheet.addEventListener('click', event => this.onToolsClick(event));
                sheet.addEventListener('input', event => this.onToolsInput(event));
                sheet.addEventListener('submit', event => {
                    event.preventDefault();
                    const form = event.target.closest('[data-tools-form="body"]');
                    if (form) void this.saveBodyEntry(form);
                });
            }
            const prefs = (await db.getSetting('toolsPrefs')) || {};
            this.toolsState = {
                tab,
                plateTarget: weight || this.toolsState?.plateTarget || 60,
                bar: prefs.bar || 20,
                ormWeight: this.toolsState?.ormWeight || 80,
                ormReps: this.toolsState?.ormReps || 5
            };
            this.bodyLog = await this.getBodyLog();
            this.renderToolsSheet();
            sheet.classList.add('active');
        },

        hideToolsSheet() {
            document.getElementById('sheet-tools')?.classList.remove('active');
        },

        async getBodyLog() {
            const stored = await db.getSetting('bodyLog');
            return Array.isArray(stored) ? stored.sort((a, b) => new Date(a.date) - new Date(b.date)) : [];
        },

        renderToolsSheet() {
            const content = document.querySelector('#sheet-tools .tools-content');
            if (!content || !this.toolsState) return;
            const { tab } = this.toolsState;
            const tabs = TOOLS.map(tool => [tool.id, tool.tab]);
            const current = TOOLS.find(tool => tool.id === tab) || TOOLS[0];
            content.innerHTML = `
                <div class="sheet-handle"></div>
                <div class="tools-head">
                    <div>
                        <h3>${current.title}</h3>
                        <small>${current.desc}</small>
                    </div>
                    <button type="button" class="tools-close" data-tools="close" aria-label="Fermer"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                </div>
                <div class="tools-tabs" role="tablist">
                    ${tabs.map(([id, label]) => `<button type="button" class="tools-tab ${tab === id ? 'active' : ''}" data-tools-tab="${id}" role="tab" aria-selected="${tab === id}">${label}</button>`).join('')}
                </div>
                <div class="tools-panel" id="tools-panel">${tab === 'plates' ? this.renderPlatesPanel() : tab === 'orm' ? this.renderOrmPanel() : this.renderBodyPanel()}</div>
            `;
        },

        renderPlatesPanel() {
            const { plateTarget, bar } = this.toolsState;
            const result = this.computePlates(plateTarget, bar);
            const sideHtml = result.plates.map(plate => `
                <span class="tools-plate ${plate.dark ? 'is-light' : ''}" style="--plate: ${plate.color}; --h: ${plate.height}%">${String(plate.kg).replace('.', ',')}</span>
            `).join('');
            return `
                <div class="tools-field">
                    <span>Charge totale</span>
                    <div class="tools-stepper">
                        <button type="button" data-tools-step="plateTarget" data-dir="-2.5" aria-label="Moins 2,5 kg">−</button>
                        <input type="number" inputmode="decimal" step="0.5" data-tools-input="plateTarget" value="${plateTarget}" aria-label="Charge totale">
                        <span class="tools-unit">kg</span>
                        <button type="button" data-tools-step="plateTarget" data-dir="2.5" aria-label="Plus 2,5 kg">+</button>
                    </div>
                </div>
                <div class="tools-bars" role="radiogroup" aria-label="Barre">
                    ${BARS.map(kg => `<button type="button" class="tools-chip ${bar === kg ? 'active' : ''}" data-tools-bar="${kg}" role="radio" aria-checked="${bar === kg}">Barre ${kg} kg</button>`).join('')}
                </div>
                <div class="tools-barbell" aria-label="${this.escapeHtml(`Par côté : ${result.plates.map(plate => plate.kg).join(', ') || 'aucun disque'}`)}">
                    <span class="tools-bar-sleeve"></span>
                    <div class="tools-plates">${sideHtml || '<span class="tools-empty">Barre seule</span>'}</div>
                    <span class="tools-bar-collar"></span>
                </div>
                <div class="tools-result">
                    <strong>${result.plates.length ? `Par côté : ${result.plates.map(plate => String(plate.kg).replace('.', ',')).join(' + ')} kg` : 'Aucun disque'}</strong>
                    <small>${result.missing > 0.01
                        ? `Avec ces disques : ${String(result.loaded).replace('.', ',')} kg (manque ${String(Math.round(result.missing * 2 * 100) / 100).replace('.', ',')} kg)`
                        : `Total chargé : ${String(result.loaded).replace('.', ',')} kg`}</small>
                </div>
            `;
        },

        renderOrmPanel() {
            const { ormWeight, ormReps } = this.toolsState;
            const e1rm = this.calculateE1RM(Number(ormWeight) || 0, Number(ormReps) || 0, 10) || 0;
            const rows = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];
            const repsAt = pct => {
                if (pct >= 100) return 1;
                return Math.max(1, Math.round(30 * (100 / pct - 1)));
            };
            return `
                <div class="tools-orm-inputs">
                    <div class="tools-field">
                        <span>Charge</span>
                        <div class="tools-stepper">
                            <button type="button" data-tools-step="ormWeight" data-dir="-2.5" aria-label="Moins">−</button>
                            <input type="number" inputmode="decimal" step="0.5" data-tools-input="ormWeight" value="${ormWeight}" aria-label="Charge">
                            <span class="tools-unit">kg</span>
                            <button type="button" data-tools-step="ormWeight" data-dir="2.5" aria-label="Plus">+</button>
                        </div>
                    </div>
                    <div class="tools-field">
                        <span>Répétitions</span>
                        <div class="tools-stepper">
                            <button type="button" data-tools-step="ormReps" data-dir="-1" aria-label="Moins">−</button>
                            <input type="number" inputmode="numeric" step="1" data-tools-input="ormReps" value="${ormReps}" aria-label="Répétitions">
                            <span class="tools-unit">reps</span>
                            <button type="button" data-tools-step="ormReps" data-dir="1" aria-label="Plus">+</button>
                        </div>
                    </div>
                </div>
                <div class="tools-orm-hero">
                    <span>Max estimé sur 1 rep</span>
                    <strong>${e1rm > 0 ? `${this.formatOneDecimal(e1rm)} kg` : '--'}</strong>
                    <small>Sert à régler tes charges, pas à être testé.</small>
                </div>
                <div class="tools-orm-table">
                    ${rows.map(pct => `
                        <div class="tools-orm-row">
                            <span>${pct} %</span>
                            <strong>${e1rm > 0 ? `${String(Math.round((e1rm * pct / 100) * 2) / 2).replace('.', ',')} kg` : '--'}</strong>
                            <small>~${repsAt(pct)} rep${repsAt(pct) > 1 ? 's' : ''}</small>
                        </div>
                    `).join('')}
                </div>
            `;
        },

        renderBodyPanel() {
            const log = this.bodyLog || [];
            const latest = log[log.length - 1] || {};
            const first = log[0] || {};
            const weights = log.map(entry => Number(entry.weight)).filter(value => value > 0);
            const delta = (key) => {
                const a = Number(first[key]);
                const b = Number(latest[key]);
                if (!(a > 0) || !(b > 0) || log.length < 2) return '';
                const diff = Math.round((b - a) * 10) / 10;
                return diff === 0 ? '=' : `${diff > 0 ? '+' : ''}${String(diff).replace('.', ',')}`;
            };
            return `
                <div class="tools-body-chart">
                    <div class="tools-body-head">
                        <span class="pz-kicker">Poids</span>
                        <strong>${latest.weight ? `${String(latest.weight).replace('.', ',')} kg` : '--'}</strong>
                        ${delta('weight') ? `<span class="pz-chip">${delta('weight')} kg depuis le début</span>` : ''}
                    </div>
                    ${weights.length >= 2 ? this.renderSparklineSVG(weights, { width: 320, height: 70, color: '#8b5cf6' }) : '<small class="tools-hint">Ajoute au moins deux pesées pour voir ta courbe.</small>'}
                </div>
                <form class="tools-body-form" data-tools-form="body">
                    ${MEASURES.map(measure => `
                        <label class="tools-measure">
                            <span>${this.escapeHtml(measure.label)}</span>
                            <span class="tools-measure-input">
                                <input type="number" inputmode="decimal" step="${measure.step}" name="${measure.key}" placeholder="${latest[measure.key] ?? ''}">
                                <small>${measure.unit}</small>
                            </span>
                            ${delta(measure.key) && measure.key !== 'weight' ? `<em>${delta(measure.key)} ${measure.unit}</em>` : ''}
                        </label>
                    `).join('')}
                    <button type="submit" class="btn btn-primary btn-large tools-save">Enregistrer la mesure du jour</button>
                </form>
                ${log.length ? `
                    <div class="tools-body-history">
                        <span class="pz-kicker">Historique</span>
                        ${log.slice(-6).reverse().map(entry => `
                            <div class="tools-body-row">
                                <span>${new Date(entry.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                                <small>${MEASURES.filter(measure => Number(entry[measure.key]) > 0).map(measure => `${measure.label.toLowerCase()} ${String(entry[measure.key]).replace('.', ',')} ${measure.unit}`).join(' · ')}</small>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            `;
        },

        async onToolsClick(event) {
            if (event.target.classList.contains('sheet-backdrop') || event.target.closest('[data-tools="close"]')) {
                this.hideToolsSheet();
                return;
            }
            const tab = event.target.closest('[data-tools-tab]');
            if (tab) {
                this.toolsState.tab = tab.dataset.toolsTab;
                this.renderToolsSheet();
                return;
            }
            const bar = event.target.closest('[data-tools-bar]');
            if (bar) {
                this.toolsState.bar = Number(bar.dataset.toolsBar);
                await db.setSetting('toolsPrefs', { bar: this.toolsState.bar });
                this.renderToolsSheet();
                return;
            }
            const step = event.target.closest('[data-tools-step]');
            if (step) {
                const key = step.dataset.toolsStep;
                const next = Math.max(key === 'ormReps' ? 1 : 0, (Number(this.toolsState[key]) || 0) + Number(step.dataset.dir));
                this.toolsState[key] = key === 'ormReps' ? Math.min(30, Math.round(next)) : Math.round(next * 4) / 4;
                this.hapticTap?.(5);
                this.renderToolsSheet();
                return;
            }
            const form = event.target.closest('[data-tools-form="body"]');
            if (form && event.target.closest('.tools-save')) {
                event.preventDefault();
                await this.saveBodyEntry(form);
            }
        },

        onToolsInput(event) {
            const input = event.target.closest('[data-tools-input]');
            if (!input) return;
            const value = parseFloat(String(input.value).replace(',', '.'));
            if (!Number.isFinite(value)) return;
            this.toolsState[input.dataset.toolsInput] = value;
            // Only refresh the result zone so the field keeps focus.
            clearTimeout(this.toolsInputTimer);
            this.toolsInputTimer = setTimeout(() => {
                const panel = document.getElementById('tools-panel');
                if (!panel) return;
                const focused = document.activeElement?.dataset?.toolsInput;
                const caret = document.activeElement?.value;
                panel.innerHTML = this.toolsState.tab === 'plates' ? this.renderPlatesPanel() : this.renderOrmPanel();
                const again = focused ? panel.querySelector(`[data-tools-input="${focused}"]`) : null;
                if (again) {
                    again.focus();
                    again.value = caret;
                }
            }, 350);
        },

        async saveBodyEntry(form) {
            const entry = { date: new Date().toISOString() };
            let hasValue = false;
            MEASURES.forEach(measure => {
                const value = parseFloat(String(form.elements[measure.key]?.value || '').replace(',', '.'));
                if (Number.isFinite(value) && value > 0) {
                    entry[measure.key] = Math.round(value * 10) / 10;
                    hasValue = true;
                }
            });
            if (!hasValue) {
                this.showCoachToast('Entre au moins une mesure.', 'warning', '📏');
                return;
            }
            const log = await this.getBodyLog();
            // One entry per day: today's measure replaces/extends the previous one.
            const todayKey = this.getLocalDateKey(new Date());
            const existing = log.find(item => this.getLocalDateKey(new Date(item.date)) === todayKey);
            if (existing) Object.assign(existing, entry);
            else log.push(entry);
            await db.setSetting('bodyLog', log);
            if (entry.weight) await db.setSetting('bodyWeight', Math.round(entry.weight));
            this.bodyLog = log;
            this.hapticTap?.([10, 30, 14]);
            this.showCoachToast('Mesure enregistrée.', 'hot', '📏');
            this.renderToolsSheet();
        },

        renderToolsCard() {
            const card = document.getElementById('tools-card');
            if (!card) return;
            card.innerHTML = `
                <div class="pz-card-head">
                    <div>
                        <h4>Outils</h4>
                    </div>
                </div>
                <div class="tools-list">
                    ${TOOLS.map(tool => `
                        <button type="button" class="tools-row" data-open-tools="${tool.id}">
                            <span class="tools-row-icon" aria-hidden="true">${tool.icon}</span>
                            <span class="tools-row-text"><strong>${tool.title}</strong><small>${tool.desc}</small></span>
                            <svg class="tools-row-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                    `).join('')}
                </div>
            `;
        },

        async renderStats(homeData = null) {
            await baseRenderStats.call(this, homeData);
            this.renderToolsCard();
        },

        bindEvents() {
            baseBindEvents.call(this);
            document.getElementById('tools-card')?.addEventListener('click', event => {
                const button = event.target.closest('[data-open-tools]');
                if (button) void this.showToolsSheet(button.dataset.openTools);
            });
            document.getElementById('btn-exercise-plates')?.addEventListener('click', () => {
                const input = document.querySelector('#series-list .series-card.next-up .input-weight, #series-list .input-weight');
                const weight = parseFloat(input?.value || input?.placeholder || '') || null;
                void this.showToolsSheet('plates', { weight });
            });
        },

        // The plate shortcut only makes sense on barbell movements.
        async openExercise(slotId) {
            await baseOpenExercise.call(this, slotId);
            const button = document.getElementById('btn-exercise-plates');
            if (!button) return;
            const slot = this.currentSlot;
            const isBarbell = slot && !this.isTimedSlot(slot)
                && this.getSemanticExerciseProfile(slot, slot).equipmentCategory === 'barbell';
            button.hidden = !isBarbell || this.isUnilateralMode;
        }
    });
})();
