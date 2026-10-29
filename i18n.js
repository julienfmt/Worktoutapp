// ===== i18n: tiny runtime translator, no build step =====
// Dictionaries live in locales/<lang>.js and register themselves on
// window.I18N_LOCALES (plain scripts, so they work offline without fetch).
// French is the source of truth and the fallback for any missing key.
//
//   t('home.title', { name: 'Julien' })      → "Bonjour Julien"
//   t('common.sets', { count: 3 })           → "3 séries"  (plural entry)
//   applyI18n(root)                          → fills [data-i18n], [data-i18n-placeholder],
//                                              [data-i18n-aria-label], [data-i18n-title]
//
// Language choice ('auto' | 'fr' | 'en', default 'auto'):
// - stored in localStorage 'locale' (read synchronously, before first paint)
//   and mirrored to db setting 'locale' so it travels with backups;
// - 'auto' follows the phone (navigator.languages: in the Capacitor WebView
//   this is the iOS / Android 13+ per-app language), French if unsupported;
// - ?lang=xx overrides for testing only and is never saved.
(function (global) {
    'use strict';

    const FALLBACK = 'fr';
    const STORAGE_KEY = 'locale';
    const SUPPORTED = [
        { id: 'fr', label: 'Français' },
        { id: 'en', label: 'English' }
    ];
    const SUPPORTED_IDS = SUPPORTED.map(item => item.id);

    const dictionaries = global.I18N_LOCALES = global.I18N_LOCALES || {};

    const normalize = (value) => String(value || '').trim().toLowerCase().split(/[-_]/)[0] || null;
    const isSupported = code => SUPPORTED_IDS.includes(code) && Boolean(dictionaries[code]);
    const isChoice = value => value === 'auto' || SUPPORTED_IDS.includes(value);

    const readStoredChoice = () => {
        try {
            const value = global.localStorage?.getItem(STORAGE_KEY);
            return isChoice(value) ? value : null;
        } catch (error) {
            return null;
        }
    };

    const writeStoredChoice = (value) => {
        try { global.localStorage?.setItem(STORAGE_KEY, value); } catch (error) {}
    };

    const readQueryOverride = () => {
        try {
            const code = normalize(new URLSearchParams(global.location?.search || '').get('lang'));
            return code && isSupported(code) ? code : null;
        } catch (error) {
            return null;
        }
    };

    const deviceLocale = () => {
        const languages = global.navigator?.languages?.length ? global.navigator.languages : [global.navigator?.language];
        for (const language of languages) {
            const code = normalize(language);
            if (code && isSupported(code)) return code;
        }
        return FALLBACK;
    };

    const resolve = choice => (choice && choice !== 'auto' && isSupported(choice) ? choice : deviceLocale());

    let choice = readStoredChoice() || 'auto';
    const override = readQueryOverride();
    let locale = override || resolve(choice);

    const pluralRules = {};
    const getPluralRule = (code) => {
        if (!pluralRules[code]) {
            try { pluralRules[code] = new Intl.PluralRules(code); } catch (error) { pluralRules[code] = { select: n => (Math.abs(n) < 2 ? 'one' : 'other') }; }
        }
        return pluralRules[code];
    };

    const lookup = (code, key) => {
        const dict = dictionaries[code];
        return dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
    };

    const interpolate = (text, params) => String(text).replace(/\{(\w+)\}/g, (match, name) => (
        params && params[name] !== undefined && params[name] !== null ? String(params[name]) : match
    ));

    // Plural entries are objects: { one: '{count} séance', other: '{count} séances' }
    // (optionally zero: '…'). The form is picked with Intl.PluralRules on params.count.
    const pickPlural = (entry, code, params) => {
        const count = Number(params?.count);
        if (Number.isFinite(count) && count === 0 && entry.zero !== undefined) return entry.zero;
        const form = Number.isFinite(count) ? getPluralRule(code).select(count) : 'other';
        return entry[form] ?? entry.other ?? entry.one ?? '';
    };

    function has(key) {
        return lookup(locale, key) !== undefined || lookup(FALLBACK, key) !== undefined;
    }

    function t(key, params) {
        let code = locale;
        let entry = lookup(code, key);
        if (entry === undefined) {
            code = FALLBACK;
            entry = lookup(code, key);
        }
        if (entry === undefined) return key;
        if (entry && typeof entry === 'object') entry = pickPlural(entry, code, params);
        return interpolate(entry, params);
    }

    // Shorthand for the common "{count} séance(s)" case.
    function plural(key, count, params) {
        return t(key, { ...(params || {}), count });
    }

    const ATTRIBUTES = [
        ['data-i18n-placeholder', 'placeholder'],
        ['data-i18n-aria-label', 'aria-label'],
        ['data-i18n-title', 'title']
    ];
    const SELECTOR = '[data-i18n],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-title]';

    // Elements keep their French text as fallback content: a key missing from
    // every dictionary leaves the markup untouched.
    function applyI18n(root) {
        const scope = root || global.document;
        if (!scope || !scope.querySelectorAll) return;
        const apply = (element) => {
            const key = element.getAttribute('data-i18n');
            if (key && has(key)) element.textContent = t(key);
            ATTRIBUTES.forEach(([dataAttribute, attribute]) => {
                const attributeKey = element.getAttribute(dataAttribute);
                if (attributeKey && has(attributeKey)) element.setAttribute(attribute, t(attributeKey));
            });
        };
        if (scope.nodeType === 1 && scope.matches(SELECTOR)) apply(scope);
        scope.querySelectorAll(SELECTOR).forEach(apply);
    }

    const mirrorToDb = (value) => {
        try {
            if (typeof db !== 'undefined' && db?.db && typeof db.setSetting === 'function') {
                return Promise.resolve(db.setSetting(STORAGE_KEY, value)).catch(() => {});
            }
        } catch (error) {}
        return Promise.resolve();
    };

    // Saves the choice ('auto' | 'fr' | 'en') in localStorage and the db, then
    // reloads so every screen (including text built in JS) uses the new language.
    async function setLocale(nextChoice, { reload = true } = {}) {
        const value = isChoice(nextChoice) ? nextChoice : 'auto';
        choice = value;
        writeStoredChoice(value);
        await mirrorToDb(value);
        const next = resolve(value);
        if (reload && next !== locale && global.location) {
            global.location.reload();
            return next;
        }
        locale = next;
        if (global.document?.documentElement) global.document.documentElement.lang = locale;
        applyI18n(global.document);
        return next;
    }

    // Called once the database is open (app init). Restores a choice that only
    // exists in the db (e.g. after importing a backup or clearing site data) and
    // otherwise copies the local choice to the db.
    async function syncLocaleWithDb() {
        if (typeof db === 'undefined' || typeof db.getSetting !== 'function') return;
        try {
            const stored = readStoredChoice();
            const saved = await db.getSetting(STORAGE_KEY);
            if (!stored && isChoice(saved)) {
                choice = saved;
                writeStoredChoice(saved);
                if (!override && resolve(saved) !== locale && global.location) global.location.reload();
                return;
            }
            if (stored && saved !== stored) await db.setSetting(STORAGE_KEY, stored);
        } catch (error) {}
    }

    // Number / date formatting follows the active language.
    const intlLocale = () => (locale === 'fr' ? 'fr-FR' : locale === 'en' ? 'en-GB' : locale);

    const api = {
        t,
        plural,
        has,
        applyI18n,
        setLocale,
        syncLocaleWithDb,
        getChoice: () => choice,
        intlLocale,
        supported: SUPPORTED.slice()
    };
    Object.defineProperty(api, 'locale', { get: () => locale, enumerable: true });

    global.t = t;
    global.i18n = api;
    global.applyI18n = applyI18n;

    if (global.document?.documentElement) {
        global.document.documentElement.lang = locale;
        // Loaded with defer before the app scripts: the DOM is parsed already.
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', () => applyI18n(global.document));
        } else {
            applyI18n(global.document);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
