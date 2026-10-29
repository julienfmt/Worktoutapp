// ===== Rhino notifications: copy library + planner (pure, no DOM / no db) =====
// The rhino is your slightly dumb gym buddy: way too invested in your
// progress, not very brave himself. This file holds:
//   1. COPY: every line he can say, per trigger, in fr and en (same ids, so
//      the "already used" history survives a language change),
//   2. the planner: buildPlan() turns real data (history, weekly goal, next
//      session, friends, past notifications) into the next reminders,
//   3. the bookkeeping: resolveLog() (was a workout done after a reminder?),
//      detectFriendEvents(), pickMessage() (never the same line twice in a
//      row), inAppMoment() (records, goal done, rest day).
// native.js gathers the data and schedules the result; the rules live here so
// they can be tested in Node.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.RhinoNotifications = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    // Placeholders: {name} {xp} {done} {goal} {streak} {session} {count}
    // `when` names a flag of the context (see conditions below).
    const COPY = {
        fr: {
            // Planned session, at the user's usual time.
            session: [
                { id: 'session-banc', title: 'J’ai réservé le banc.', body: 'J’ai aucune autorité pour faire ça. Mais viens.' },
                { id: 'session-heure', title: 'C’est l’heure.', body: 'J’ai mis mes baskets. Je suis à deux doigts de faire du sport.' },
                { id: 'session-dit', title: 'On avait dit aujourd’hui, non ?', body: 'J’ai même fait semblant de m’échauffer.' },
                { id: 'session-jambes', title: 'T’as prévu jambes aujourd’hui.', body: 'J’ai déjà préparé mes excuses.', when: 'legs' },
                { id: 'session-attends', title: 'Je t’attends.', body: 'Enfin, je suis assis. Mais je t’attends.' },
                { id: 'session-petite', title: 'Petite séance ?', body: 'Promis, je compte pas les répétitions à voix haute.' },
                { id: 'session-nom', title: '{session} au programme.', body: 'J’ai regardé. C’est faisable. Enfin, pour toi.', when: 'hasSession' },
                { id: 'session-place', title: 'J’ai gardé ta place.', body: 'Un type voulait la prendre. C’était mon reflet.' },
                { id: 'session-serviette', title: 'Rien d’obligatoire.', body: 'Mais j’ai sorti ta serviette. Elle attend.' },
                { id: 'session-jour', title: 'Je sens que c’est ton jour.', body: 'Je sens rien d’habitude. Donc c’est sérieux.' }
            ],
            // One session left for the weekly goal (numbers are real).
            weekOne: [
                { id: 'weekone-une', title: 'Plus qu’une séance.', body: 'Je suis déjà en tenue. Ça fait 45 minutes.' },
                { id: 'weekone-sur', title: '{done} séances sur {goal}.', body: 'Tu vas quand même pas t’arrêter à {done} ?', when: 'done2plus' },
                { id: 'weekone-derniere', title: 'Une dernière pour la semaine.', body: 'Après je te laisse tranquille. Peut-être.' },
                { id: 'weekone-reste', title: 'Il en reste une.', body: 'Je l’ai regardée de loin. Elle a l’air lourde.' }
            ],
            // Last day of the week, goal not reached, a streak to lose.
            weekLast: [
                { id: 'weeklast-serie', title: 'Dernier jour de la semaine.', body: 'Ta série de {streak} semaines compte sur toi. Moi aussi, un peu.', when: 'streakMany' },
                { id: 'weeklast-appel', title: 'Dimanche. Dernier appel.', body: 'Je dis pas que je panique. Je panique un peu.' },
                { id: 'weeklast-fin', title: 'La semaine se termine.', body: 'Pas de pression. Enfin, un peu. Moi j’en ai déjà beaucoup.' }
            ],
            // Weekly goal reached (in-app, after the last session).
            weekDone: [
                { id: 'weekdone-propre', title: '{goal} sur {goal}. Propre.', body: 'J’ai fait trois tours de la salle pour fêter ça.' },
                { id: 'weekdone-regulier', title: 'T’es régulier, toi.', body: 'Ça commence à me mettre la pression.', when: 'streak2' },
                { id: 'weekdone-bouclee', title: 'Semaine bouclée.', body: 'J’ai sorti mon pompon. Je l’ai fabriqué moi-même.' },
                { id: 'weekdone-repos', title: 'Objectif atteint.', body: 'Maintenant tu peux te reposer. C’est ma spécialité.' }
            ],
            // Friends (only with real data).
            friendPassed: [
                { id: 'fpassed-depasse', title: '{name} vient de te dépasser.', body: 'Je dis ça. Je dis rien.' },
                { id: 'fpassed-devant', title: '{name} te passe devant.', body: 'Je l’ai vu faire. J’ai rien dit. J’ai toussé.' },
                { id: 'fpassed-paniquer', title: '{name} est devant toi.', body: 'Pas de panique. Moi je panique déjà.' }
            ],
            friendFinished: [
                { id: 'ffinished-fini', title: '{name} a fini sa séance.', body: 'Moi aussi j’aurais pu. Mais bon.' },
                { id: 'ffinished-train', title: '{name} s’est entraîné.', body: 'Sans prévenir. Un peu louche.' }
            ],
            friendGap: [
                { id: 'fgap-manque', title: 'Il te manque {xp} XP.', body: 'Pour repasser devant {name}. Juste comme ça.' },
                { id: 'fgap-derriere', title: '{xp} XP derrière {name}.', body: 'C’est rien. C’est une séance. À peu près.' }
            ],
            friendFirst: [
                { id: 'ffirst-place', title: '{name} a pris la première place.', body: 'T’as vu ? Moi, j’aurais pas laissé passer ça.' },
                { id: 'ffirst-premier', title: '{name} est premier.', body: 'Je dis pas que c’est injuste. Je dis que je l’ai vu.' }
            ],
            // Back after an absence (two planned sessions missed, from day 3).
            comeback: [
                { id: 'comeback-passe', title: 'T’es passé où ?', body: 'J’ai demandé aux haltères. Elles savent pas non plus.' },
                { id: 'comeback-evite', title: 'Je crois que tu m’évites.', body: 'C’est à cause des squats ?' },
                { id: 'comeback-moment', title: 'Ça fait un moment.', body: 'On reprend tranquille ? Même une petite séance, ça va.' },
                { id: 'comeback-programme', title: 'J’ai gardé ton programme.', body: 'Et non, j’ai pas fait les exercices à ta place.' },
                { id: 'comeback-banc', title: 'Le banc a des questions.', body: 'Moi aussi, mais lui il est moins patient.' },
                { id: 'comeback-echauffement', title: 'J’ai essayé de faire ton échauffement.', body: 'Je suis fatigué.' },
                { id: 'comeback-range', title: 'J’ai rangé les haltères.', body: 'Tout seul. C’est plus long qu’on croit.' },
                { id: 'comeback-reproche', title: 'Pas de reproche.', body: 'Juste un petit regard déçu. Très léger.' }
            ],
            // 7 days without a workout: the last one, then silence.
            farewell: [
                { id: 'farewell-arreter', title: 'Je vais arrêter de te relancer.', body: 'Mais si tu reviens, je suis là.' },
                { id: 'farewell-dernier', title: 'Dernier message de ma part.', body: 'Je fais semblant de pas être vexé. La porte reste ouverte.' }
            ],
            // A chest / quest waiting.
            reward: [
                { id: 'reward-attend', title: 'Il y a un truc qui t’attend.', body: 'Je l’ai pas ouvert. Je te jure.' },
                { id: 'reward-coffre', title: 'Un coffre traîne dans l’app.', body: 'Je l’ai regardé. Il m’a regardé. On s’est rien dit.' }
            ],
            // In-app only: records at the end of a session.
            record: [
                { id: 'record-serieux', title: 'Nouveau record. Sérieusement ?', body: 'Je vais devoir commencer à m’entraîner aussi.' },
                { id: 'record-encore', title: 'Encore un record ?', body: 'Tu pourrais m’en laisser un de temps en temps.', when: 'again' },
                { id: 'record-force', title: 'T’as gagné en force.', body: 'Moi j’ai gagné en confiance. Sans raison.' },
                { id: 'record-progres', title: 'Regarde tes progrès.', body: 'Bon. Là, je suis un peu impressionné.', when: 'many' },
                { id: 'record-compte', title: 'Ça fait {count} records.', body: 'Je demande un contrôle.', when: 'many' }
            ],
            // In-app only: planned rest day on home.
            rest: [
                { id: 'rest-repos', title: 'Aujourd’hui, repos.', body: 'C’est le seul exercice où je suis vraiment bon.' },
                { id: 'rest-rien', title: 'On soulève rien aujourd’hui.', body: 'À part la télécommande.' },
                { id: 'rest-recup', title: 'Récupération en cours.', body: 'J’ai pris un jour d’avance. Par sécurité.' },
                { id: 'rest-off', title: 'Jour off.', body: 'Les muscles poussent pendant que tu fais rien. Moi je fais ça depuis des années, sans résultat.' },
                { id: 'rest-immobile', title: 'Rien au programme.', body: 'Je m’entraîne à rester immobile. Niveau avancé.' }
            ]
        },
        en: {
            session: [
                { id: 'session-banc', title: 'I booked the bench.', body: 'I have no authority to do that. But come.' },
                { id: 'session-heure', title: 'It’s time.', body: 'I put my sneakers on. I’m two steps from doing sport.' },
                { id: 'session-dit', title: 'We said today, right?', body: 'I even pretended to warm up.' },
                { id: 'session-jambes', title: 'Legs day today.', body: 'I’ve already prepared my excuses.', when: 'legs' },
                { id: 'session-attends', title: 'I’m waiting for you.', body: 'Well, I’m sitting. But I’m waiting.' },
                { id: 'session-petite', title: 'Quick session?', body: 'I promise I won’t count the reps out loud.' },
                { id: 'session-nom', title: '{session} is on the menu.', body: 'I looked. It’s doable. For you, I mean.', when: 'hasSession' },
                { id: 'session-place', title: 'I saved your spot.', body: 'Some guy wanted it. It was my reflection.' },
                { id: 'session-serviette', title: 'Nothing mandatory.', body: 'But I took your towel out. It’s waiting.' },
                { id: 'session-jour', title: 'I feel like it’s your day.', body: 'I usually feel nothing. So it’s serious.' }
            ],
            weekOne: [
                { id: 'weekone-une', title: 'Only one session left.', body: 'I’m already dressed. It’s been 45 minutes.' },
                { id: 'weekone-sur', title: '{done} sessions out of {goal}.', body: 'You’re not going to stop at {done}, are you?', when: 'done2plus' },
                { id: 'weekone-derniere', title: 'One last one this week.', body: 'Then I’ll leave you alone. Maybe.' },
                { id: 'weekone-reste', title: 'There’s one left.', body: 'I looked at it from afar. It looks heavy.' }
            ],
            weekLast: [
                { id: 'weeklast-serie', title: 'Last day of the week.', body: 'Your {streak}-week streak is counting on you. So am I, a bit.', when: 'streakMany' },
                { id: 'weeklast-appel', title: 'Sunday. Last call.', body: 'I’m not saying I’m panicking. I’m panicking a little.' },
                { id: 'weeklast-fin', title: 'The week is almost over.', body: 'No pressure. Well, some. I already have plenty.' }
            ],
            weekDone: [
                { id: 'weekdone-propre', title: '{goal} out of {goal}. Clean.', body: 'I ran three laps around the gym to celebrate.' },
                { id: 'weekdone-regulier', title: 'You’re consistent, you.', body: 'It’s starting to put pressure on me.', when: 'streak2' },
                { id: 'weekdone-bouclee', title: 'Week wrapped.', body: 'I got my pom-pom out. I made it myself.' },
                { id: 'weekdone-repos', title: 'Goal reached.', body: 'Now you can rest. It’s my specialty.' }
            ],
            friendPassed: [
                { id: 'fpassed-depasse', title: '{name} just passed you.', body: 'I’m just saying. I’m saying nothing.' },
                { id: 'fpassed-devant', title: '{name} is ahead of you now.', body: 'I saw it happen. I said nothing. I coughed.' },
                { id: 'fpassed-paniquer', title: '{name} is in front of you.', body: 'Don’t panic. I already am.' }
            ],
            friendFinished: [
                { id: 'ffinished-fini', title: '{name} finished a session.', body: 'I could have too. But well.' },
                { id: 'ffinished-train', title: '{name} worked out.', body: 'No warning. A bit suspicious.' }
            ],
            friendGap: [
                { id: 'fgap-manque', title: 'You’re {xp} XP short.', body: 'To get back ahead of {name}. Just saying.' },
                { id: 'fgap-derriere', title: '{xp} XP behind {name}.', body: 'It’s nothing. One session. Roughly.' }
            ],
            friendFirst: [
                { id: 'ffirst-place', title: '{name} took first place.', body: 'Did you see? I wouldn’t have let that happen.' },
                { id: 'ffirst-premier', title: '{name} is first.', body: 'I’m not saying it’s unfair. I’m saying I saw it.' }
            ],
            comeback: [
                { id: 'comeback-passe', title: 'Where did you go?', body: 'I asked the dumbbells. They don’t know either.' },
                { id: 'comeback-evite', title: 'I think you’re avoiding me.', body: 'Is it because of the squats?' },
                { id: 'comeback-moment', title: 'It’s been a while.', body: 'Easy restart? Even a short session is fine.' },
                { id: 'comeback-programme', title: 'I kept your program.', body: 'And no, I didn’t do the exercises for you.' },
                { id: 'comeback-banc', title: 'The bench has questions.', body: 'So do I, but he’s less patient.' },
                { id: 'comeback-echauffement', title: 'I tried doing your warm-up.', body: 'I’m tired.' },
                { id: 'comeback-range', title: 'I put the dumbbells away.', body: 'Alone. It takes longer than you’d think.' },
                { id: 'comeback-reproche', title: 'No reproach.', body: 'Just a small disappointed look. Very light.' }
            ],
            farewell: [
                { id: 'farewell-arreter', title: 'I’ll stop pestering you.', body: 'But if you come back, I’m here.' },
                { id: 'farewell-dernier', title: 'Last message from me.', body: 'I’m pretending I’m not offended. The door stays open.' }
            ],
            reward: [
                { id: 'reward-attend', title: 'Something’s waiting for you.', body: 'I didn’t open it. I swear.' },
                { id: 'reward-coffre', title: 'A chest is lying around.', body: 'I looked at it. It looked at me. We said nothing.' }
            ],
            record: [
                { id: 'record-serieux', title: 'New record. Seriously?', body: 'I’m going to have to start training too.' },
                { id: 'record-encore', title: 'Another record?', body: 'You could leave me one once in a while.', when: 'again' },
                { id: 'record-force', title: 'You got stronger.', body: 'I got more confident. For no reason.' },
                { id: 'record-progres', title: 'Look at your progress.', body: 'Okay. Now I’m a little impressed.', when: 'many' },
                { id: 'record-compte', title: 'That’s {count} records.', body: 'I’m asking for a drug test.', when: 'many' }
            ],
            rest: [
                { id: 'rest-repos', title: 'Rest day today.', body: 'It’s the only exercise I’m actually good at.' },
                { id: 'rest-rien', title: 'We lift nothing today.', body: 'Except the remote.' },
                { id: 'rest-recup', title: 'Recovery in progress.', body: 'I took a day in advance. Just in case.' },
                { id: 'rest-off', title: 'Day off.', body: 'Muscles grow while you do nothing. I’ve done that for years, no results.' },
                { id: 'rest-immobile', title: 'Nothing planned.', body: 'I’m training to stay still. Advanced level.' }
            ]
        }
    };

    // Which preference chip gates which trigger.
    const TRIGGER_GROUP = {
        session: 'streak', weekOne: 'streak', weekLast: 'streak', weekDone: 'streak',
        friendPassed: 'friends', friendFinished: 'friends', friendGap: 'friends', friendFirst: 'friends',
        comeback: 'comeback', farewell: 'comeback',
        reward: 'rewards', record: 'rewards', rest: 'streak'
    };

    const QUIET_START = 22; // nothing from 22:00 ...
    const QUIET_END = 8;    // ... to 08:00
    const HORIZON_DAYS = 10;
    const FOLLOW_WINDOW = 12 * HOUR;
    const FRIEND_EVENT_TTL = 6 * HOUR;
    const WEEKLY_CAP = 5;
    const LEG_MUSCLES = ['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers'];
    const COMEBACK_FIRST_DAY = 3;
    const FAREWELL_DAY = 7;
    const FAREWELL_LAST_DAY = 10;

    // ---------- helpers ----------
    function getLocale(choice, navLang) {
        let stored = choice;
        if (stored === undefined) {
            try { stored = (typeof localStorage !== 'undefined' && localStorage.getItem('locale')) || 'auto'; } catch (error) { stored = 'auto'; }
        }
        if (stored === 'fr' || stored === 'en') return stored;
        let lang = navLang;
        if (lang === undefined) lang = (typeof navigator !== 'undefined' && navigator.language) || 'fr';
        return /^en/i.test(String(lang)) ? 'en' : 'fr';
    }

    const startOfDay = date => {
        const copy = new Date(date);
        copy.setHours(0, 0, 0, 0);
        return copy;
    };
    const addDays = (date, days) => {
        const copy = new Date(date);
        copy.setDate(copy.getDate() + days);
        return copy;
    };
    const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY);
    const dayKey = date => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    // Monday 00:00 of the week holding `date` (same rule as the streak engine).
    function weekStart(date) {
        const d = startOfDay(date);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d;
    }

    function fill(text, vars) {
        return String(text).replace(/\{(\w+)\}/g, (match, key) => (vars && vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : match));
    }

    function cleanName(name) {
        return String(name || '').replace(/[{}]/g, '').trim().slice(0, 24);
    }

    // The least recently used line of a trigger whose condition holds.
    // `used` maps message id -> ISO date; `avoid` is a Set of ids to treat as
    // just used (lines already picked in the same plan).
    function pickMessage(trigger, ctx = {}, options = {}) {
        const locale = options.locale || 'fr';
        const list = (COPY[locale] || COPY.fr)[trigger] || [];
        const used = options.used || {};
        const avoid = options.avoid || new Set();
        const eligible = list.filter(item => !item.when || ctx[item.when] === true);
        if (!eligible.length) return null;
        const rank = item => {
            if (avoid.has(item.id)) return Number.POSITIVE_INFINITY;
            const time = Date.parse(used[item.id]);
            return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
        };
        const seed = Math.abs(Number(options.seed) || 0);
        let best = null;
        eligible.forEach((item, index) => {
            const key = [rank(item), (index + seed) % eligible.length];
            if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && key[1] < best.key[1])) best = { item, key };
        });
        const vars = { name: cleanName(ctx.name), xp: ctx.xp, done: ctx.done, goal: ctx.goal, streak: ctx.streak, session: cleanName(ctx.session), count: ctx.count };
        return { id: best.item.id, trigger, title: fill(best.item.title, vars), body: fill(best.item.body, vars) };
    }

    // Training weekdays (0 = Sunday): the weekdays the user really trains on
    // (last 8 weeks), completed with a sensible default for the weekly goal.
    const DEFAULT_PATTERN = { 1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
    function getTrainingWeekdays(workouts, goal, now) {
        const count = Math.max(1, Math.min(7, Math.round(Number(goal) || 3)));
        const fallback = DEFAULT_PATTERN[count];
        const since = now.getTime() - 56 * DAY;
        const tally = new Array(7).fill(0);
        let total = 0;
        for (const date of workouts) {
            if (date.getTime() < since || date.getTime() > now.getTime()) continue;
            tally[date.getDay()] += 1;
            total += 1;
        }
        if (total < 6) return fallback.slice();
        const days = tally
            .map((hits, weekday) => ({ weekday, hits, preferred: fallback.includes(weekday) ? 1 : 0 }))
            .filter(item => item.hits >= 2)
            .sort((a, b) => b.hits - a.hits || b.preferred - a.preferred || a.weekday - b.weekday)
            .slice(0, count)
            .map(item => item.weekday);
        for (const weekday of fallback) {
            if (days.length >= count) break;
            if (!days.includes(weekday)) days.push(weekday);
        }
        return days.sort((a, b) => a - b);
    }

    function emptyState() {
        return { startedAt: null, used: {}, history: [], pending: [], ignored: 0, socialSnap: null, friendEvents: [], lastRecordAt: null, restToday: null, version: 1 };
    }

    function normalizeState(raw) {
        const state = { ...emptyState(), ...(raw && typeof raw === 'object' ? raw : {}) };
        state.used = { ...(state.used || {}) };
        state.history = Array.isArray(state.history) ? state.history.map(item => ({ ...item })) : [];
        state.pending = Array.isArray(state.pending) ? state.pending.map(item => ({ ...item })) : [];
        state.friendEvents = Array.isArray(state.friendEvents) ? state.friendEvents : [];
        return state;
    }

    // Moves the reminders that were due into the history, and decides for each
    // one: did the user open the app (we are syncing, so yes if it is recent),
    // did a workout follow within 12 h? Then counts the reminders ignored in a
    // row (back-off input). Pure: returns a new state.
    function resolveLog(raw, workouts, now) {
        const state = normalizeState(raw);
        const times = workouts.map(date => date.getTime());
        for (const item of state.pending) {
            const at = Date.parse(item.at);
            if (Number.isNaN(at) || at > now.getTime()) continue;
            state.history.push({ id: item.id, trigger: item.trigger, at: item.at, opened: now.getTime() - at <= FOLLOW_WINDOW });
            state.used[item.id] = item.at;
        }
        state.pending = [];
        state.history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
        state.history = state.history.slice(-60);
        for (const item of state.history) {
            if (item.followed !== undefined) continue;
            const at = Date.parse(item.at);
            if (times.some(time => time > at && time <= at + FOLLOW_WINDOW)) item.followed = true;
            else if (now.getTime() > at + FOLLOW_WINDOW) item.followed = false;
        }
        let ignored = 0;
        for (let index = state.history.length - 1; index >= 0; index -= 1) {
            const item = state.history[index];
            if (item.followed === true || item.opened === true) break;
            if (item.followed === false) ignored += 1;
        }
        state.ignored = ignored;
        return state;
    }

    function getStats(raw) {
        const history = normalizeState(raw).history;
        return {
            sent: history.length,
            opened: history.filter(item => item.opened).length,
            followed: history.filter(item => item.followed === true).length,
            ignoredInARow: normalizeState(raw).ignored
        };
    }

    // Compares the friends' week with the stored snapshot. Only real changes
    // produce an event. cur = { weekKey, me: { xp, sessions }, friends: [{ id, name, weekXp, weekSessions }] }
    function buildSocialSnapshot(weekKey, me, friends) {
        const map = {};
        let top = null;
        for (const friend of friends || []) {
            const xp = Number(friend.weekXp) || 0;
            map[friend.id] = { name: cleanName(friend.name), weekXp: xp, weekSessions: Number(friend.weekSessions) || 0 };
            if (!top || xp > top.xp) top = { id: friend.id, xp };
        }
        const myXp = Number(me?.xp) || 0;
        return { weekKey, me: { xp: myXp, sessions: Number(me?.sessions) || 0 }, friends: map, firstId: top && top.xp > myXp ? top.id : 'me' };
    }

    function detectFriendEvents(prev, cur, now) {
        if (!prev || !cur || prev.weekKey !== cur.weekKey) return [];
        const events = [];
        for (const [id, friend] of Object.entries(cur.friends)) {
            const before = prev.friends?.[id];
            if (!before || !friend.name) continue;
            const base = { id, name: friend.name, at: now.toISOString() };
            if (cur.firstId === id && prev.firstId !== id) events.push({ ...base, type: 'friendFirst', rank: 0 });
            else if (before.weekXp <= prev.me.xp && friend.weekXp > cur.me.xp) events.push({ ...base, type: 'friendPassed', rank: 1 });
            else if (friend.weekSessions > before.weekSessions) events.push({ ...base, type: 'friendFinished', rank: 2 });
        }
        return events.sort((a, b) => a.rank - b.rank);
    }

    // ---------- planner ----------
    // input = {
    //   now: Date, prefs: { enabled, time:'HH:MM', streak, comeback, rewards, friends },
    //   workouts: Date[], goal, streak, locale,
    //   nextSession: { name, muscles: [ids] } | null,
    //   friends: { me: { xp, sessions }, list: [{ id, name, weekXp, weekSessions }] } | null,
    //   rewardsPending: boolean, state: stored state (already resolved)
    // }
    // Returns [{ kind, trigger, msgId, at (ISO), title, body }], at most one per
    // day, never in quiet hours, spaced out after ignored reminders.
    function buildPlan(input) {
        const now = input.now instanceof Date ? input.now : new Date();
        const prefs = input.prefs || {};
        if (!prefs.enabled) return [];
        const locale = input.locale || 'fr';
        const state = normalizeState(input.state);
        const workouts = (input.workouts || []).filter(date => date instanceof Date && !Number.isNaN(date.getTime()) && date <= now);
        const goal = Math.max(1, Math.min(7, Math.round(Number(input.goal) || 3)));
        const streakCount = Math.max(0, Number(input.streak) || 0);
        const [rawHour, rawMinute] = String(prefs.time || '18:30').split(':').map(Number);
        let slotMinutes = (Number.isFinite(rawHour) ? rawHour : 18) * 60 + (Number.isFinite(rawMinute) ? rawMinute : 30);
        slotMinutes = Math.max(QUIET_END * 60, Math.min(QUIET_START * 60 - 30, slotMinutes));
        const slotAt = day => {
            const copy = new Date(day);
            copy.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
            return copy;
        };

        const lastWorkout = workouts.reduce((best, date) => (!best || date > best ? date : best), null);
        const startedAt = state.startedAt ? new Date(state.startedAt) : null;
        const reference = lastWorkout || (startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : now);
        const thisWeek = weekStart(now).getTime();
        const doneThisWeek = workouts.filter(date => date.getTime() >= thisWeek).length;
        const remaining = Math.max(0, goal - doneThisWeek);
        const pattern = getTrainingWeekdays(workouts, goal, now);
        const trainedToday = workouts.some(date => dayKey(date) === dayKey(now));
        const history = state.history;
        const lastSent = history.reduce((best, item) => Math.max(best, Date.parse(item.at) || 0), 0);
        const gapDays = state.ignored >= 5 ? 4 : state.ignored >= 3 ? 2 : 1;
        const farewellSent = history.some(item => item.trigger === 'farewell' && Date.parse(item.at) > reference.getTime());
        const sentRecently = prefix => history.filter(item => String(item.trigger).startsWith(prefix) && Date.parse(item.at) > now.getTime() - 7 * DAY).length;
        const friends = input.friends && Array.isArray(input.friends.list) ? input.friends.list.filter(item => item && item.name) : [];
        const myXp = Number(input.friends?.me?.xp) || 0;
        const ahead = friends.filter(item => Number(item.weekXp) > myXp).sort((a, b) => a.weekXp - b.weekXp)[0] || null;
        const freshEvent = (state.friendEvents || []).find(event => event && Date.parse(event.at) > now.getTime() - FRIEND_EVENT_TTL);
        const nextSession = input.nextSession || null;

        // First comeback: once two planned sessions were really missed (day 3 to 5),
        // then every other day until the farewell.
        const missedBefore = ds => {
            let missed = 0;
            for (let step = 1; step < ds; step += 1) if (pattern.includes(addDays(reference, step).getDay())) missed += 1;
            return missed;
        };
        let firstComeback = 5;
        for (let ds = COMEBACK_FIRST_DAY; ds <= 5; ds += 1) {
            if (missedBefore(ds) >= 2) { firstComeback = ds; break; }
        }
        const comebackDays = [firstComeback, firstComeback + 2].filter(ds => ds < FAREWELL_DAY);

        const plan = [];
        const avoid = new Set();
        const planned = {};
        let farewellPlanned = false;
        let rewardPlanned = false;
        let gapPlanned = sentRecently('friendGap') > 0;
        let friendCount = sentRecently('friend');
        let firstSessionPlanned = false;
        let lastAccepted = lastSent ? new Date(lastSent) : null;

        for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
            const day = addDays(startOfDay(now), offset);
            const at = slotAt(day);
            if (at.getTime() <= now.getTime() + 5 * 60 * 1000) continue;
            if (offset === 0 && trainedToday) continue;
            const daysSince = dayDiff(day, reference);
            const weekKey = weekStart(day).getTime();
            const sameWeek = weekKey === thisWeek;
            const weekday = day.getDay();
            const candidates = [];

            if (daysSince >= FAREWELL_DAY) {
                // Silence after the last message, until the user trains again.
                if (prefs.comeback && !farewellSent && !farewellPlanned && daysSince <= FAREWELL_LAST_DAY) {
                    candidates.push({ trigger: 'farewell', group: 'comeback', exempt: true, ctx: {} });
                }
            } else if (daysSince >= COMEBACK_FIRST_DAY) {
                if (prefs.comeback && comebackDays.includes(daysSince)) {
                    candidates.push({ trigger: 'comeback', group: 'comeback', ctx: { missed2: true } });
                }
            } else {
                // Active period.
                if (prefs.friends && offset === 0 && freshEvent && friendCount < 2
                    && at.getTime() - Date.parse(freshEvent.at) <= FRIEND_EVENT_TTL) {
                    candidates.push({ trigger: freshEvent.type, group: 'friends', ctx: { name: freshEvent.name }, friend: true });
                }
                const cap = sameWeek ? remaining : goal;
                const used = planned[weekKey] || 0;
                const isTrainingDay = pattern.includes(weekday) && used < cap;
                const left = cap - used;
                if (prefs.streak && sameWeek && weekday === 0 && left >= 1 && streakCount > 0) {
                    candidates.push({ trigger: 'weekLast', group: 'streak', ctx: { streakMany: streakCount >= 2, streak: streakCount, done: doneThisWeek, goal } });
                }
                if (prefs.streak && isTrainingDay) {
                    const oneLeft = sameWeek && left === 1 && goal - 1 >= 1;
                    const legs = !firstSessionPlanned && Boolean(nextSession?.muscles?.some(id => LEG_MUSCLES.includes(id)));
                    candidates.push(oneLeft
                        ? { trigger: 'weekOne', group: 'streak', counts: true, ctx: { done: goal - 1, goal, done2plus: goal - 1 >= 2 } }
                        : { trigger: 'session', group: 'streak', counts: true, first: true, ctx: { legs, hasSession: !firstSessionPlanned && Boolean(nextSession?.name), session: nextSession?.name } });
                }
                if (prefs.friends && !isTrainingDay && offset >= 1 && offset <= 2 && sameWeek && ahead && !gapPlanned && friendCount < 2
                    && (Number(ahead.weekXp) - myXp) > 0 && (Number(ahead.weekXp) - myXp) <= 400) {
                    candidates.push({ trigger: 'friendGap', group: 'friends', gap: true, ctx: { name: ahead.name, xp: Math.round(Number(ahead.weekXp) - myXp) } });
                }
                if (prefs.rewards && input.rewardsPending && !rewardPlanned && offset >= 1) {
                    candidates.push({ trigger: 'reward', group: 'rewards', ctx: {} });
                }
            }
            if (!candidates.length) continue;
            // Priority: farewell > fresh friend news > last day > comeback > weekly goal > session > gap > reward.
            const order = ['farewell', 'friendFirst', 'friendPassed', 'friendFinished', 'weekLast', 'comeback', 'weekOne', 'session', 'friendGap', 'reward'];
            candidates.sort((a, b) => order.indexOf(a.trigger) - order.indexOf(b.trigger));
            const choice = candidates[0];

            // Spacing (back-off) and weekly cap. The farewell always goes through.
            if (!choice.exempt) {
                if (lastAccepted && dayDiff(day, lastAccepted) < gapDays) continue;
                const windowStart = at.getTime() - 7 * DAY;
                const inWindow = plan.filter(item => Date.parse(item.at) > windowStart).length
                    + history.filter(item => Date.parse(item.at) > windowStart).length;
                if (inWindow >= WEEKLY_CAP) continue;
            }

            const message = pickMessage(choice.trigger, { ...choice.ctx }, { locale, used: state.used, avoid, seed: weekday + offset });
            if (!message) continue;
            avoid.add(message.id);
            if (choice.counts) planned[weekKey] = (planned[weekKey] || 0) + 1;
            if (choice.first) firstSessionPlanned = true;
            if (choice.trigger === 'farewell') farewellPlanned = true;
            if (choice.trigger === 'reward') rewardPlanned = true;
            if (choice.gap) gapPlanned = true;
            if (choice.group === 'friends') friendCount += 1;
            lastAccepted = at;
            plan.push({ kind: choice.group, trigger: choice.trigger, msgId: message.id, at: at.toISOString(), title: message.title, body: message.body });
        }
        return plan;
    }

    // ---------- in-app moments ----------
    // Returns { id, trigger, title, body, state } with the line marked as used,
    // or null. kind: 'record' | 'weekDone' | 'rest'.
    function inAppMoment(kind, ctx, rawState, now, locale) {
        const state = normalizeState(rawState);
        const when = now || new Date();
        if (kind === 'rest') {
            const today = dayKey(when);
            if (state.restToday && state.restToday.day === today) {
                const list = (COPY[locale] || COPY.fr).rest;
                const known = list.find(item => item.id === state.restToday.id);
                if (known) return { id: known.id, trigger: 'rest', title: known.title, body: known.body, state };
            }
        }
        const message = pickMessage(kind, ctx || {}, { locale, used: state.used, seed: when.getDate() });
        if (!message) return null;
        state.used[message.id] = when.toISOString();
        if (kind === 'record') state.lastRecordAt = when.toISOString();
        if (kind === 'rest') state.restToday = { day: dayKey(when), id: message.id };
        return { ...message, state };
    }

    // Is today a rest day worth a rhino line? Only for an active user: they
    // trained recently and today is off-pattern, or the week is already done.
    function isRestDay({ now, workouts, goal }) {
        const dates = (workouts || []).filter(date => date <= now);
        if (!dates.length) return false;
        const last = dates.reduce((best, date) => (date > best ? date : best), dates[0]);
        if (dayDiff(now, last) >= COMEBACK_FIRST_DAY) return false;
        if (dates.some(date => dayKey(date) === dayKey(now))) return false;
        const thisWeek = weekStart(now).getTime();
        const done = dates.filter(date => date.getTime() >= thisWeek).length;
        if (done >= Math.max(1, Number(goal) || 3)) return true;
        return !getTrainingWeekdays(dates, goal, now).includes(now.getDay());
    }

    return {
        COPY, TRIGGER_GROUP, LEG_MUSCLES,
        getLocale, pickMessage, getTrainingWeekdays, emptyState, normalizeState,
        resolveLog, getStats, buildSocialSnapshot, detectFriendEvents,
        buildPlan, inAppMoment, isRestDay, weekStart, dayKey
    };
});
