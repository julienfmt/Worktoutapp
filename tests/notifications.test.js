const assert = require('node:assert/strict');
const path = require('node:path');

const RN = require(path.resolve(__dirname, '..', 'rhino-notifications.js'));

const DAY = 24 * 60 * 60 * 1000;
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
// Wednesday 2026-10-28 10:00 (the week started Monday the 26th).
const NOW = at(2026, 10, 28, 10, 0);
const prefs = { enabled: true, time: '18:30', streak: true, comeback: true, rewards: true, friends: true };
const daysAgo = (n, h = 18) => new Date(at(2026, 10, 28, h).getTime() - n * DAY);

const base = (overrides = {}) => ({
    now: NOW,
    prefs,
    locale: 'fr',
    goal: 3,
    streak: 4,
    workouts: [daysAgo(1), daysAgo(7), daysAgo(8), daysAgo(9), daysAgo(14), daysAgo(15), daysAgo(16)],
    nextSession: { name: 'Push', muscles: ['pectoraux', 'triceps'] },
    friends: null,
    rewardsPending: false,
    state: RN.emptyState(),
    ...overrides
});

const dayOf = item => RN.dayKey(new Date(item.at));
const hourOf = item => new Date(item.at).getHours() + new Date(item.at).getMinutes() / 60;

// --- Disabled: nothing. ---
assert.deepEqual(RN.buildPlan(base({ prefs: { ...prefs, enabled: false } })), []);

// --- One push per day, never in quiet hours, always in the future. ---
const plan = RN.buildPlan(base());
assert.ok(plan.length > 0, 'a plan exists');
assert.equal(new Set(plan.map(dayOf)).size, plan.length, 'one push per day');
plan.forEach(item => {
    assert.ok(new Date(item.at) > NOW, 'in the future');
    assert.ok(hourOf(item) >= 8 && hourOf(item) < 22, `outside quiet hours: ${item.at}`);
    assert.ok(item.title && item.body, 'has copy');
    assert.ok(!/[{}]/.test(item.title + item.body), `unfilled placeholder in ${item.msgId}`);
});

// Quiet hours: a 23:30 or 06:00 preference is pulled back into the day.
for (const time of ['23:30', '06:00', '22:00']) {
    RN.buildPlan(base({ prefs: { ...prefs, time } })).forEach(item => {
        assert.ok(hourOf(item) >= 8 && hourOf(item) <= 21.5, `quiet hours respected for ${time}: ${hourOf(item)}`);
    });
}

// --- No repeated line, in a plan or across sends. ---
const longPlan = RN.buildPlan(base({ goal: 5, workouts: [daysAgo(0, 7)].concat([2, 3, 4, 8, 9, 10, 11, 12].map(n => daysAgo(n))) }));
const ids = longPlan.map(item => item.msgId);
assert.equal(new Set(ids).size, ids.length, 'no id twice in a plan');

const usedAll = {};
RN.COPY.fr.session.forEach((item, index) => { usedAll[item.id] = new Date(NOW.getTime() - (index + 5) * DAY).toISOString(); });
const oldest = RN.COPY.fr.session[RN.COPY.fr.session.length - 1];
const picked = RN.pickMessage('session', { legs: true, hasSession: true, session: 'Push' }, { locale: 'fr', used: usedAll });
assert.equal(picked.id, oldest.id, 'least recently used line wins');
// Unused lines come before used ones.
delete usedAll['session-petite'];
assert.equal(RN.pickMessage('session', {}, { locale: 'fr', used: usedAll }).id, 'session-petite');
// Same ids in both languages (history survives a language change).
for (const trigger of Object.keys(RN.COPY.fr)) {
    assert.deepEqual(RN.COPY.en[trigger].map(item => item.id), RN.COPY.fr[trigger].map(item => item.id), `ids match for ${trigger}`);
}
// Conditional lines are skipped when false.
assert.notEqual(RN.pickMessage('session', { legs: false }, { locale: 'fr', used: {} }).id, 'session-jambes');

// --- Legs line only when the next session is legs. ---
const legsPlan = RN.buildPlan(base({ nextSession: { name: 'Legs', muscles: ['quadriceps', 'fessiers'] }, workouts: [], state: { ...RN.emptyState(), startedAt: NOW.toISOString() } }));
const noLegs = RN.buildPlan(base({ nextSession: { name: 'Push', muscles: ['pectoraux'] } }));
assert.ok(noLegs.every(item => item.msgId !== 'session-jambes'), 'no legs line for a push session');

// --- Weekly goal messages only when true. ---
// 1 done (daysAgo(1) is Tuesday), goal 3: two left, so no "plus qu'une".
const twoLeft = RN.buildPlan(base());
assert.ok(twoLeft.every(item => item.trigger !== 'weekOne'), 'no "one left" with two left');
// 2 done this week, goal 3: exactly one left.
const oneLeft = RN.buildPlan(base({ workouts: [daysAgo(1), daysAgo(2), daysAgo(7), daysAgo(8), daysAgo(9), daysAgo(14), daysAgo(15), daysAgo(16)] }));
const weekOne = oneLeft.find(item => item.trigger === 'weekOne');
assert.ok(weekOne, 'one session left produces a weekly goal reminder');
assert.ok(!/\{|\}/.test(weekOne.title + weekOne.body));
assert.ok(new Date(weekOne.at) < RN.weekStart(new Date(NOW.getTime() + 7 * DAY)), 'only within this week');
// Goal done: no training reminder for the rest of the week (rest days stay quiet).
const goalDone = RN.buildPlan(base({ workouts: [daysAgo(0, 7), daysAgo(1), daysAgo(2), daysAgo(7), daysAgo(8), daysAgo(9), daysAgo(14)] }));
const nextMonday = RN.weekStart(new Date(NOW.getTime() + 7 * DAY));
assert.ok(goalDone.filter(item => new Date(item.at) < nextMonday).every(item => !['session', 'weekOne', 'weekLast'].includes(item.trigger)), 'week done: no push before next Monday');
// Never daily lifting: never more session pushes in a week than the goal needs.
const week = RN.buildPlan(base({ goal: 2, workouts: [daysAgo(1), daysAgo(8), daysAgo(9), daysAgo(15), daysAgo(16), daysAgo(22), daysAgo(23)] }));
assert.ok(week.filter(item => ['session', 'weekOne'].includes(item.trigger) && new Date(item.at) < nextMonday).length <= 1, 'no more reminders than sessions left');
// A "N sur M" line carries real numbers.
const realNumbers = RN.pickMessage('weekOne', { done: 2, goal: 3, done2plus: true }, { locale: 'fr', used: Object.fromEntries(RN.COPY.fr.weekOne.filter(m => m.id !== 'weekone-sur').map(m => [m.id, NOW.toISOString()])) });
assert.equal(realNumbers.title, '2 séances sur 3.');
assert.ok(!RN.pickMessage('weekOne', { done: 1, goal: 2, done2plus: false }, { locale: 'fr', used: {} }).id.includes('sur'), '"done2plus" needs done >= 2');
// Weekly-goal last-day push needs a streak to lose.
const sundayNow = at(2026, 11, 1, 9, 0);
const sundayWorkouts = [new Date(sundayNow.getTime() - DAY)];
assert.ok(RN.buildPlan(base({ now: sundayNow, streak: 0, workouts: sundayWorkouts })).every(item => item.trigger !== 'weekLast'));
assert.ok(RN.buildPlan(base({ now: sundayNow, streak: 5, workouts: sundayWorkouts })).some(item => item.trigger === 'weekLast'));

// --- Friends: nothing without real friend data. ---
const withFriends = (overrides = {}) => base({
    friends: { me: { xp: 100, sessions: 1 }, list: [{ id: 'v', name: 'Victor', weekXp: 140, weekSessions: 2 }] },
    ...overrides
});
const noFriendPlan = RN.buildPlan(base({ workouts: [daysAgo(1), daysAgo(8), daysAgo(9)] }));
assert.ok(noFriendPlan.every(item => !item.trigger.startsWith('friend')), 'no friend message without friend data');
const eventState = { ...RN.emptyState(), friendEvents: [{ type: 'friendPassed', name: 'Victor', id: 'v', at: new Date(NOW.getTime() - 3600 * 1000).toISOString() }] };
const friendPlan = RN.buildPlan(withFriends({ state: eventState, prefs: { ...prefs, time: '13:00' } }));
const friendItem = friendPlan.find(item => item.trigger === 'friendPassed');
assert.ok(friendItem && friendItem.title.includes('Victor'), 'fresh friend event produces a real message');
// No event, no "vient de te dépasser".
assert.ok(RN.buildPlan(withFriends()).every(item => !['friendPassed', 'friendFinished', 'friendFirst'].includes(item.trigger)));
// Stale event (older than 6 h) is ignored.
const staleState = { ...RN.emptyState(), friendEvents: [{ type: 'friendPassed', name: 'Victor', id: 'v', at: new Date(NOW.getTime() - 9 * 3600 * 1000).toISOString() }] };
assert.ok(RN.buildPlan(withFriends({ state: staleState })).every(item => item.trigger !== 'friendPassed'));
// Friend opt-out.
assert.ok(RN.buildPlan(withFriends({ state: eventState, prefs: { ...prefs, friends: false } })).every(item => !item.trigger.startsWith('friend')));
// The gap line only exists while a friend is really ahead, with the real gap.
const gapPlan = RN.buildPlan(withFriends({ workouts: [daysAgo(1), daysAgo(2), daysAgo(0, 7), daysAgo(8)] }));
gapPlan.filter(item => item.trigger === 'friendGap').forEach(item => assert.ok(item.title.includes('40') || item.body.includes('Victor')));
const behind = RN.buildPlan(base({ friends: { me: { xp: 500, sessions: 3 }, list: [{ id: 'v', name: 'Victor', weekXp: 140, weekSessions: 2 }] }, workouts: [daysAgo(1), daysAgo(2), daysAgo(0, 7), daysAgo(8)] }));
assert.ok(behind.every(item => item.trigger !== 'friendGap'), 'no gap line when nobody is ahead');
// Events detection.
const snapBefore = RN.buildSocialSnapshot('W1', { xp: 100, sessions: 1 }, [{ id: 'v', name: 'Victor', weekXp: 80, weekSessions: 1 }, { id: 'c', name: 'Camille', weekXp: 50, weekSessions: 1 }]);
const snapAfter = RN.buildSocialSnapshot('W1', { xp: 100, sessions: 1 }, [{ id: 'v', name: 'Victor', weekXp: 130, weekSessions: 2 }, { id: 'c', name: 'Camille', weekXp: 50, weekSessions: 1 }]);
const events = RN.detectFriendEvents(snapBefore, snapAfter, NOW);
assert.equal(events[0].type, 'friendFirst', 'Victor takes first place');
assert.equal(RN.detectFriendEvents(snapBefore, snapBefore, NOW).length, 0, 'nothing changed, no event');
assert.equal(RN.detectFriendEvents(snapBefore, { ...snapAfter, weekKey: 'W2' }, NOW).length, 0, 'new week resets');

// --- Comeback: timeline, then the last message, then silence. ---
const absent = n => base({ workouts: [daysAgo(n, 18), daysAgo(n + 3), daysAgo(n + 5), daysAgo(n + 8), daysAgo(n + 10), daysAgo(n + 12)] });
const comebackPlan = RN.buildPlan(absent(2));
assert.ok(comebackPlan.some(item => item.trigger === 'comeback'), 'a comeback is planned after an absence');
assert.ok(comebackPlan.some(item => item.trigger === 'farewell'), 'the farewell is planned within 10 days');
const farewell = comebackPlan.find(item => item.trigger === 'farewell');
const lastWorkoutDay = RN.dayKey(daysAgo(2));
const farewellDays = Math.round((new Date(RN.dayKey(new Date(farewell.at)) + 'T00:00:00') - new Date(lastWorkoutDay + 'T00:00:00')) / DAY);
assert.ok(farewellDays >= 7 && farewellDays <= 10, `farewell between day 7 and 10 (${farewellDays})`);
assert.ok(comebackPlan.filter(item => new Date(item.at) > new Date(farewell.at)).length === 0, 'nothing after the farewell');
assert.equal(comebackPlan.filter(item => item.trigger === 'farewell').length, 1);
// After the farewell was sent: silence until the user trains again.
const sentState = { ...RN.emptyState(), history: [{ id: 'farewell-arreter', trigger: 'farewell', at: daysAgo(1, 18).toISOString(), opened: false, followed: false }], ignored: 1 };
const silent = RN.buildPlan({ ...absent(9), state: sentState });
assert.equal(silent.length, 0, 'silence after the last message');
const silent2 = RN.buildPlan({ ...absent(12), state: RN.emptyState() });
assert.equal(silent2.length, 0, 'no comeback past 10 days');
// A workout resets everything: new reference date.
const oldFarewell = { ...RN.emptyState(), history: [{ id: 'farewell-arreter', trigger: 'farewell', at: daysAgo(30, 18).toISOString(), opened: false, followed: false }] };
assert.ok(RN.buildPlan({ ...base(), state: oldFarewell }).some(item => item.trigger === 'farewell'), 'an old farewell does not silence a user who came back');
// Comeback chip off: no comeback or farewell.
assert.ok(RN.buildPlan({ ...absent(2), prefs: { ...prefs, comeback: false } }).every(item => !['comeback', 'farewell'].includes(item.trigger)));

// --- Back-off after ignored reminders. ---
const ignoredHistory = n => Array.from({ length: n }, (_, index) => ({
    id: `x${index}`, trigger: 'session', at: daysAgo(n + 1 - index, 18).toISOString(), opened: false, followed: false
}));
const resolved = RN.resolveLog({ ...RN.emptyState(), history: ignoredHistory(4) }, [], NOW);
assert.equal(resolved.ignored, 4, 'four ignored in a row');
const loose = RN.buildPlan(base({ goal: 5, workouts: [daysAgo(0, 7), daysAgo(1), daysAgo(2), daysAgo(8), daysAgo(9), daysAgo(10)] }));
const spaced = RN.buildPlan(base({ goal: 5, workouts: [daysAgo(0, 7), daysAgo(1), daysAgo(2), daysAgo(8), daysAgo(9), daysAgo(10)], state: resolved }));
assert.ok(spaced.length <= loose.length, 'back-off sends fewer reminders');
for (let index = 1; index < spaced.length; index += 1) {
    const gap = Math.round((new Date(RN.dayKey(new Date(spaced[index].at)) + 'T00:00:00') - new Date(RN.dayKey(new Date(spaced[index - 1].at)) + 'T00:00:00')) / DAY);
    if (spaced[index].trigger === 'farewell') continue; // the last message is never held back
    assert.ok(gap >= 2, `reminders at least 2 days apart after 3+ ignored (${gap})`);
}
// Training resets the counter.
const reset = RN.resolveLog({ ...RN.emptyState(), history: [...ignoredHistory(3), { id: 'ok', trigger: 'session', at: daysAgo(1, 8).toISOString(), opened: true }] }, [daysAgo(1, 10)], NOW);
assert.equal(reset.ignored, 0, 'a followed reminder resets the counter');
assert.equal(RN.getStats(reset).followed, 1);

// --- Log: due reminders move to history, followed within 12 h. ---
const pendingState = { ...RN.emptyState(), pending: [{ id: 'session-banc', trigger: 'session', at: daysAgo(0, 8).toISOString() }, { id: 'session-heure', trigger: 'session', at: new Date(NOW.getTime() + DAY).toISOString() }] };
const afterLog = RN.resolveLog(pendingState, [at(2026, 10, 28, 9, 0)], NOW);
assert.equal(afterLog.history.length, 1);
assert.equal(afterLog.history[0].followed, true);
assert.equal(afterLog.pending.length, 0);
assert.ok(afterLog.used['session-banc'], 'sent line is remembered');

// --- Locale helper. ---
assert.equal(RN.getLocale('auto', 'en-GB'), 'en');
assert.equal(RN.getLocale('auto', 'fr-FR'), 'fr');
assert.equal(RN.getLocale('fr', 'en-US'), 'fr');
assert.equal(RN.getLocale('auto', 'de-DE'), 'fr', 'fallback to French');

// --- Copy sanity. ---
for (const locale of ['fr', 'en']) {
    for (const [trigger, list] of Object.entries(RN.COPY[locale])) {
        list.forEach(item => {
            assert.ok(item.id && item.title && item.body, `${locale}/${trigger}`);
            assert.ok(item.title.split(/\s+/).length <= 8, `title too long: ${item.title}`);
        });
    }
}
const total = Object.values(RN.COPY.fr).reduce((sum, list) => sum + list.length, 0);
assert.ok(total >= 35, `library has ${total} lines`);

console.log('notifications tests passed');
