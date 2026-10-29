// ===== Muscu+ : offer, entitlements and paywall =====
// The business model is defined here, but nothing is locked yet: while
// PAYWALL_ENABLED is false (PWA beta) every feature is granted and the
// paywall only presents the offer. In the native app, `PurchasesBridge`
// talks to the store SDK (RevenueCat via Capacitor) and flips the switch.
(() => {
    const PAYWALL_ENABLED = false;
    const TRIAL_DAYS = 7;

    const PLANS = [
        { id: 'plus_yearly', label: 'Annuel', price: 39.99, period: 'an', perMonth: 3.33, badge: 'Le plus populaire', saving: '-52 %', trial: true },
        { id: 'plus_monthly', label: 'Mensuel', price: 6.99, period: 'mois', perMonth: 6.99, badge: '', saving: '', trial: true },
        { id: 'plus_lifetime', label: 'À vie', price: 89.99, period: 'une fois', perMonth: null, badge: 'Fondateur', saving: '', trial: false }
    ];

    // What stays free forever vs what Muscu+ adds. Keys are what the code
    // checks with `app.hasFeature(key)`.
    const FEATURES = [
        { key: 'tracking', tier: 'free', emoji: '📒', title: 'Suivi illimité', desc: 'Séances, séries, cardio, historique complet' },
        { key: 'coach-basic', tier: 'free', emoji: '🧠', title: 'Coach de base', desc: 'Charge et reps conseillées à chaque série' },
        { key: 'journey', tier: 'free', emoji: '🗺️', title: 'Parcours & trophées', desc: 'Chapitres, coffres, quêtes et défis du mois' },
        { key: 'program-generator', tier: 'free', emoji: '✨', title: 'Programme sur mesure', desc: 'Généré en une minute à l’inscription' },
        { key: 'coach-advanced', tier: 'plus', emoji: '🚀', title: 'Coach avancé', desc: 'Deload auto, fatigue en direct, multi-axes, plateaux' },
        { key: 'cardio-intervals', tier: 'plus', emoji: '❤️‍🔥', title: 'Cardio fractionné', desc: 'Tabata, 4×4, programmes d’intervalles' },
        { key: 'stats-advanced', tier: 'plus', emoji: '📈', title: 'Stats complètes', desc: 'Historique illimité, fiches perso, records détaillés' },
        { key: 'ai-coach', tier: 'plus', emoji: '🤖', title: 'Coach IA', desc: 'Analyse et optimisation de ton programme' },
        { key: 'streak-shields', tier: 'plus', emoji: '🛡️', title: 'Boucliers bonus', desc: 'Protège ta série quand la vie s’en mêle' },
        { key: 'health-sync', tier: 'plus', emoji: '⌚', title: 'Apple Santé / Health Connect', desc: 'Séances, calories et poids synchronisés' },
        { key: 'themes', tier: 'plus', emoji: '🎨', title: 'Cartes de partage premium', desc: 'Designs exclusifs pour partager tes séances' }
    ];

    // Native purchase layer. Uses RevenueCat's Capacitor plugin when the app
    // is wrapped; in the PWA it reports itself unavailable.
    const PurchasesBridge = {
        get plugin() {
            return window.Capacitor?.Plugins?.Purchases || null;
        },
        isAvailable() {
            return Boolean(this.plugin);
        },
        async getActiveEntitlement() {
            if (!this.plugin) return null;
            try {
                const { customerInfo } = await this.plugin.getCustomerInfo();
                return customerInfo?.entitlements?.active?.plus || null;
            } catch (error) {
                return null;
            }
        },
        async purchase(planId) {
            if (!this.plugin) throw new Error('store-unavailable');
            const { offerings } = await this.plugin.getOfferings();
            const pkg = offerings?.current?.availablePackages?.find(item => item.product?.identifier === planId);
            if (!pkg) throw new Error('plan-unavailable');
            return this.plugin.purchasePackage({ aPackage: pkg });
        },
        async restore() {
            if (!this.plugin) throw new Error('store-unavailable');
            return this.plugin.restorePurchases();
        }
    };
    window.PurchasesBridge = PurchasesBridge;

    Object.assign(App.prototype, {
        getPremiumOffer() {
            return { enabled: PAYWALL_ENABLED, trialDays: TRIAL_DAYS, plans: PLANS, features: FEATURES };
        },

        async loadEntitlements() {
            const stored = (await db.getSetting('premium')) || null;
            const native = PurchasesBridge.isAvailable() ? await PurchasesBridge.getActiveEntitlement() : null;
            this.entitlements = {
                plus: Boolean(native) || stored?.status === 'active',
                source: native ? 'store' : (stored?.source || null),
                betaUnlocked: !PAYWALL_ENABLED
            };
            return this.entitlements;
        },

        // Single gate for every premium feature. During the beta it always
        // answers true so the whole app stays open.
        hasFeature(key) {
            const feature = FEATURES.find(item => item.key === key);
            if (!feature || feature.tier === 'free') return true;
            if (!PAYWALL_ENABLED) return true;
            return Boolean(this.entitlements?.plus);
        },

        // To call before a premium action: returns true when allowed,
        // otherwise opens the paywall on that feature.
        requireFeature(key) {
            if (this.hasFeature(key)) return true;
            this.showPaywall({ focus: key });
            return false;
        },

        showPaywall({ focus = null } = {}) {
            let sheet = document.getElementById('sheet-paywall');
            if (!sheet) {
                sheet = document.createElement('div');
                sheet.className = 'bottom-sheet paywall-sheet';
                sheet.id = 'sheet-paywall';
                sheet.innerHTML = '<div class="sheet-backdrop"></div><div class="sheet-content sheet-content-large paywall-content"></div>';
                document.body.appendChild(sheet);
                sheet.addEventListener('click', event => this.onPaywallClick(event));
            }
            this.paywallPlan = this.paywallPlan || 'plus_yearly';
            this.renderPaywall(focus);
            sheet.classList.add('active');
        },

        hidePaywall() {
            document.getElementById('sheet-paywall')?.classList.remove('active');
        },

        renderPaywall(focus = null) {
            const content = document.querySelector('#sheet-paywall .paywall-content');
            if (!content) return;
            const plusFeatures = FEATURES.filter(item => item.tier === 'plus');
            const freeFeatures = FEATURES.filter(item => item.tier === 'free');
            const storeReady = PurchasesBridge.isAvailable();
            const plan = PLANS.find(item => item.id === this.paywallPlan) || PLANS[0];
            const isPlus = Boolean(this.entitlements?.plus);
            const ctaLabel = isPlus
                ? 'Tu es déjà Muscu+ 💜'
                : storeReady
                    ? (plan.trial ? `Essayer ${TRIAL_DAYS} jours gratuits` : `Débloquer pour ${plan.price.toFixed(2).replace('.', ',')} €`)
                    : 'Tout est offert pendant la bêta 🎁';
            content.innerHTML = `
                <div class="sheet-handle"></div>
                <div class="paywall-hero">
                    <button type="button" class="paywall-close" data-paywall="close" aria-label="Fermer">✕</button>
                    <div class="hero-bg" aria-hidden="true"><span class="hero-blob blob-a"></span><span class="hero-blob blob-b"></span><span class="hero-grid"></span></div>
                    <span class="paywall-crown" aria-hidden="true">👑</span>
                    <span class="paywall-kicker">Muscu+</span>
                    <h3>Passe la vitesse supérieure</h3>
                    <p>Le coach complet, toutes tes stats et des récompenses en plus. ${PAYWALL_ENABLED ? '' : 'Pendant la bêta, tout est déjà débloqué.'}</p>
                </div>
                <ul class="paywall-features">
                    ${plusFeatures.map(item => `
                        <li class="${item.key === focus ? 'is-focus' : ''}">
                            <span class="paywall-feature-icon" aria-hidden="true">${item.emoji}</span>
                            <span><strong>${this.escapeHtml(item.title)}</strong><small>${this.escapeHtml(item.desc)}</small></span>
                            <span class="paywall-check" aria-hidden="true">✓</span>
                        </li>
                    `).join('')}
                </ul>
                <div class="paywall-plans" role="radiogroup" aria-label="Formule">
                    ${PLANS.map(item => `
                        <button type="button" class="paywall-plan ${item.id === plan.id ? 'active' : ''}" data-paywall-plan="${item.id}" role="radio" aria-checked="${item.id === plan.id}">
                            ${item.badge ? `<span class="paywall-plan-badge">${this.escapeHtml(item.badge)}</span>` : ''}
                            <strong>${this.escapeHtml(item.label)}</strong>
                            <span class="paywall-plan-price">${item.price.toFixed(2).replace('.', ',')} €<small>/${this.escapeHtml(item.period)}</small></span>
                            ${item.perMonth && item.period !== 'mois' ? `<small class="paywall-plan-sub">${item.perMonth.toFixed(2).replace('.', ',')} €/mois ${item.saving ? `· ${item.saving}` : ''}</small>` : '<small class="paywall-plan-sub">&nbsp;</small>'}
                        </button>
                    `).join('')}
                </div>
                <button type="button" class="btn btn-primary btn-large paywall-cta" data-paywall="buy" ${isPlus || !storeReady ? 'disabled' : ''}>${ctaLabel}</button>
                <p class="paywall-fine">${storeReady
                    ? `${plan.trial ? `${TRIAL_DAYS} jours gratuits, puis ` : ''}${plan.price.toFixed(2).replace('.', ',')} € / ${plan.period}. Sans engagement, annulable à tout moment depuis ton compte ${/iphone|ipad/i.test(navigator.userAgent) ? 'Apple' : 'Google'}.`
                    : 'Les abonnements arriveront avec l’app iOS et Android. Tes données et ta progression seront conservées.'}</p>
                <div class="paywall-free">
                    <span class="pz-kicker">Toujours gratuit</span>
                    <div class="paywall-free-list">${freeFeatures.map(item => `<span>${item.emoji} ${this.escapeHtml(item.title)}</span>`).join('')}</div>
                </div>
                ${storeReady ? '<button type="button" class="paywall-link" data-paywall="restore">Restaurer mes achats</button>' : ''}
            `;
        },

        async onPaywallClick(event) {
            if (event.target.classList.contains('sheet-backdrop') || event.target.closest('[data-paywall="close"]')) {
                this.hidePaywall();
                return;
            }
            const planButton = event.target.closest('[data-paywall-plan]');
            if (planButton) {
                this.paywallPlan = planButton.dataset.paywallPlan;
                this.hapticTap?.(8);
                this.renderPaywall();
                return;
            }
            const action = event.target.closest('[data-paywall]')?.dataset.paywall;
            if (action === 'buy') {
                try {
                    await PurchasesBridge.purchase(this.paywallPlan);
                    await db.setSetting('premium', { status: 'active', source: 'store', plan: this.paywallPlan, since: new Date().toISOString() });
                    await this.loadEntitlements();
                    gamification.triggerConfetti?.('heavy');
                    gamification.showAchievement?.('👑', 'Bienvenue dans Muscu+ !', 'Tout le coach est à toi.');
                    this.hidePaywall();
                } catch (error) {
                    if (error?.code !== 'PURCHASE_CANCELLED') this.showCoachToast('Achat impossible pour le moment. Réessaie plus tard.', 'warning', '⚠️');
                }
            } else if (action === 'restore') {
                try {
                    await PurchasesBridge.restore();
                    await this.loadEntitlements();
                    this.showCoachToast(this.entitlements.plus ? 'Muscu+ restauré ✓' : 'Aucun achat trouvé sur ce compte.', this.entitlements.plus ? 'hot' : 'neutral', '👑');
                    this.renderPaywall();
                } catch (error) {
                    this.showCoachToast('Restauration impossible pour le moment.', 'warning', '⚠️');
                }
            }
        }
    });

    const baseInit = App.prototype.init;
    App.prototype.init = async function initWithEntitlements() {
        await baseInit.call(this);
        await this.loadEntitlements().catch(() => {});
    };
})();
