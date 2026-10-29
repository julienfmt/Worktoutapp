const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const stores = {
    sessions: [],
    slots: [],
    workoutHistory: [],
    setHistory: [],
    settings: [],
    currentWorkout: []
};

const db = {
    async getAll(storeName) {
        return [...(stores[storeName] || [])];
    },
    async getByIndex(storeName, indexName, value) {
        return (stores[storeName] || []).filter(item => item?.[indexName] === value);
    },
    async getSetting() {
        return null;
    },
    async get(storeName, key) {
        return (stores[storeName] || []).find(item => item?.id === key) || null;
    },
    async put(storeName, item) {
        const collection = stores[storeName] || (stores[storeName] = []);
        const index = collection.findIndex(existing => existing?.id === item?.id);
        if (index >= 0) collection[index] = item;
        else collection.push(item);
        return item?.id;
    },
    async saveCurrentWorkout() {},
    async setSetting() {}
};

const context = vm.createContext({
    __db: db,
    console,
    Date,
    Map,
    Set,
    Promise,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    RegExp,
    Intl,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
});

vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context, { filename: 'data.js' });

let appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
appSource = appSource.replace(/\/\/ Initialize app[\s\S]*$/, 'globalThis.__App = App;');
vm.runInContext(`const db = globalThis.__db;\n${appSource}`, context, { filename: 'app.js' });

const App = context.__App;

async function run() {
    const app = new App();

    // Loads always land on the equipment grid, anchored on the last real load.
    assert.equal(app.snapLoadToStep(29.1, 28.25, 0.75), 29);
    assert.equal(app.snapLoadToStep(57.37, 60, 2.5, 'down'), 55);
    assert.equal(app.snapLoadToStep(54, 60, 2.5, 'down'), 52.5);
    assert.equal(app.snapLoadToStep(41.3, 40, 2.5, 'up'), 42.5);

    // e1RM stays sane for high-rep sets (Brzycki used to explode).
    const highRep = app.calculateE1RM(20, 30, 10);
    assert.ok(highRep > 30 && highRep < 45, `e1RM 20kg×30 = ${highRep}`);
    const lowRep = app.calculateE1RM(100, 5, 10);
    assert.ok(lowRep > 110 && lowRep < 120, `e1RM 100kg×5 = ${lowRep}`);

    // Reps predicted after a load jump depend on the reps in reserve.
    assert.equal(app.predictRepsAtLoad(28.25, 15, 1, 29, 1), 13);
    const easy = app.predictRepsAtLoad(60, 12, 4, 62.5, 2);
    const hard = app.predictRepsAtLoad(60, 12, 0, 62.5, 2);
    assert.ok(easy > hard, 'more reserve → more reps expected at the new load');

    // Programmed RIR is the coach's target.
    assert.equal(app.getTargetRirForSlot({ rir: 3, type: 'compound' }), 3);
    assert.equal(app.getTargetRirForSlot({ type: 'isolation' }), 1);

    // Clearly too easy at the top of the range → double step.
    const slot = app.normalizeSlotProgressionConfig({
        id: 'engine-row', name: 'Rowing test', activeExercise: 'Rowing test', type: 'compound',
        trackingMode: 'strength', progressionMode: 'load', sets: 3, repsMin: 8, repsMax: 12, rest: 90, rir: 2, incrementKg: 2.5
    });
    const lastWorkout = {
        sets: [1, 2, 3].map(setNumber => ({ setNumber, weight: 60, reps: 12, rpe: 6, rpeSource: 'user', targetReps: 12 }))
    };
    const context = {
        lastWorkout,
        lastWeight: 60,
        avgReps: 12,
        targetReps: '12 / 12 / 12',
        lastRepVector: [12, 12, 12],
        weightIncrement: 2.5,
        nextLoadCandidate: 62.5,
        canIncreaseLoad: true,
        lastRir: 4,
        increaseLoadTargetRepsArray: [10, 10, 10],
        effortEvidence: app.getWorkoutEffortEvidence(lastWorkout),
        lastExposure: app.evaluateWorkoutAgainstTargets(lastWorkout, slot, { repCeiling: 12 })
    };
    app.getProgramRecalibrationAdvice = () => null;
    app.getRangeFitRecalibrationAdvice = () => null;
    const advice = app.getLoadProgressionAdvice(slot, context);
    assert.equal(advice.type, 'increase');
    assert.equal(advice.suggestedWeight, 65, 'double step when RPE 6 at the top of range');

    // Normal effort at the top of the range → single step.
    const normalWorkout = { sets: lastWorkout.sets.map(set => ({ ...set, rpe: 8 })) };
    const normalAdvice = app.getLoadProgressionAdvice(slot, {
        ...context,
        lastWorkout: normalWorkout,
        lastRir: 2,
        effortEvidence: app.getWorkoutEffortEvidence(normalWorkout),
        lastExposure: app.evaluateWorkoutAgainstTargets(normalWorkout, slot, { repCeiling: 12 })
    });
    assert.equal(normalAdvice.suggestedWeight, 62.5);

    // Default RPE written at save time is not a real effort signal.
    assert.notEqual(app.getStatsRpe({ weight: 50, reps: 10, rpe: 8, rpeSource: 'default' }, null), 8);

    // Unilateral override on the slot wins over name detection.
    assert.equal(app.isUnilateralSlot({ name: 'Curl haltères', unilateralMode: 'on' }), true);
    assert.equal(app.isUnilateralSlot({ name: 'Fente bulgare', unilateralMode: 'off' }), false);
    assert.equal(app.isUnilateralSlot({ name: 'One-arm dumbbell row' }), true);
    assert.equal(app.isUnilateralSlot({ name: 'Fentes alternées' }), false);

    // Side histories never mix (legacy name matching used to merge them).
    const base = 'Élévation latérale unilatérale poulie';
    const leftId = app.getUnilateralHistoryExerciseId(base, 'left');
    const rightId = app.getUnilateralHistoryExerciseId(base, 'right');
    stores.setHistory = [
        { id: 1, exerciseId: leftId, exerciseName: base, side: 'left', workoutId: 'w1', setNumber: 1, weight: 8, reps: 12, date: new Date().toISOString() },
        { id: 2, exerciseId: rightId, exerciseName: base, side: 'right', workoutId: 'w1', setNumber: 1, weight: 8, reps: 15, date: new Date().toISOString() }
    ];
    app.invalidateExerciseHistoryCaches();
    const rightHistory = await app.getSetHistoryForExercise(rightId);
    assert.equal(rightHistory.length, 1);
    assert.equal(rightHistory[0].side, 'right');
    const leftHistory = await app.getSetHistoryForExercise(leftId);
    assert.equal(leftHistory.length, 1);
    assert.equal(leftHistory[0].reps, 12);

    // ---- Deload, sibling slots, plateaus, gaps ----
    const daysAgo = days => new Date(Date.now() - days * 86400000).toISOString();
    const mkSets = (workoutId, slotId, exerciseId, date, weight, repsList, extra = {}) => repsList.map((reps, index) => ({
        id: `${workoutId}-${index}`, workoutId, slotId, exerciseId, exerciseName: exerciseId, setNumber: index + 1,
        weight, reps, rpe: 8, rpeSource: 'default', date, targetRepsMin: 8, targetRepsMax: 12,
        targetSetCount: repsList.length, programmedSetCount: repsList.length, ...extra
    }));
    const pulldown = app.normalizeSlotProgressionConfig({
        id: 'S3-B2', sessionId: 'S3', name: 'Tirage test', activeExercise: 'Tirage test', type: 'compound',
        trackingMode: 'strength', progressionMode: 'load', sets: 2, repsMin: 8, repsMax: 12, rest: 120, rir: 2,
        loadingProfile: 'machine_stack', minIncrementKg: 1
    });
    stores.slots = [pulldown];
    stores.setHistory = [
        ...mkSets('w1', 'S3-B2', 'Tirage test', daysAgo(18), 66, [10, 10]),
        ...mkSets('w2', 'S3-B2', 'Tirage test', daysAgo(9), 59, [12, 12], { isDeload: true, deloadSource: 'cycle' })
    ];
    app.invalidateExerciseHistoryCaches();
    app.currentWorkout = null;
    const postDeload = await app.calculateCoachingAdviceForSlot(pulldown, { dryRun: true });
    assert.equal(postDeload.referenceWeight, 66, 'a deload session never becomes the load reference');
    assert.equal(postDeload.suggestedWeight, 66);
    assert.ok(postDeload.postDeload && /deload/.test(postDeload.message), 'the coach says it ignored the deload');

    // Logbook reference (prefill, set-vs-history, summaries) skips the deload too.
    const groups = [
        { date: daysAgo(9), sets: mkSets('w2', 'S3-B2', 'Tirage test', daysAgo(9), 59, [12, 12], { isDeload: true }) },
        { date: daysAgo(18), sets: mkSets('w1', 'S3-B2', 'Tirage test', daysAgo(18), 66, [10, 10]) }
    ];
    assert.equal(app.pickReferenceHistory(groups).sets[0].weight, 66);
    assert.equal(app.pickReferenceHistory(groups.slice(0, 1)), null);

    // Same exercise in another session of the plan with more sets: not a program change.
    const legCurlDay2 = { id: 'S2-H8', sessionId: 'S2', name: 'Leg curl test', activeExercise: 'Leg curl test', type: 'isolation',
        trackingMode: 'strength', progressionMode: 'load', sets: 2, repsMin: 10, repsMax: 15, rest: 90, rir: 1, minIncrementKg: 0.5 };
    const legCurlDay4 = { ...legCurlDay2, id: 'S4-B2', sessionId: 'S4', sets: 3 };
    stores.slots = [legCurlDay2, legCurlDay4];
    stores.setHistory = mkSets('w3', 'S2-H8', 'Leg curl test', daysAgo(3), 45, [15, 15], { targetRepsMin: 10, targetRepsMax: 15 });
    app.invalidateExerciseHistoryCaches();
    const sibling = await app.calculateCoachingAdviceForSlot(legCurlDay4, { dryRun: true });
    assert.notEqual(sibling.type, 'decrease', 'a sibling slot with more sets must not trigger a load cut');
    assert.ok(!/Programme mis à jour/.test(sibling.message));

    // Unilateral exposures store one row per side: 3 sets, not 6.
    const uniWorkouts = app.buildWorkoutsFromSetHistory([
        ...mkSets('w4', 'x', 'Lateral', daysAgo(2), 4.5, [25, 25, 25], { side: 'left' }),
        ...mkSets('w4', 'x', 'Lateral', daysAgo(2), 4.5, [25, 25, 25], { side: 'right' })
    ].map((set, index) => ({ ...set, id: `u${index}`, programmedSetCount: undefined, targetSetCount: undefined })));
    assert.equal(uniWorkouts[0].targetSetCount, 3);

    // No observed step on a plate machine: a realistic 2.5 kg jump, not 0.5 kg.
    assert.equal(app.inferExerciseLoadIncrement(
        [{ sets: [{ weight: 86, reps: 20 }] }, { sets: [{ weight: 86, reps: 20 }] }],
        { loadingProfile: 'plate_stack', minIncrementKg: 0.5, type: 'isolation', sets: 1 },
        0.5
    ), 2.5);
    // ...but capped on very light loads.
    assert.equal(app.inferExerciseLoadIncrement(
        [{ sets: [{ weight: 4.5, reps: 25 }] }],
        { loadingProfile: 'machine_stack', minIncrementKg: 0.5, type: 'isolation', sets: 1 },
        0.5
    ), 0.5);

    // Plateau without RPE: 3 exposures with no rep gained → warning, 4 → micro-reset.
    const press = { id: 'S1-A1', sessionId: 'S1', name: 'Press test', activeExercise: 'Press test', type: 'compound',
        trackingMode: 'strength', progressionMode: 'load', sets: 3, repsMin: 6, repsMax: 10, rest: 180, rir: 2, incrementKg: 2.5 };
    stores.slots = [press];
    stores.setHistory = [
        ...mkSets('p1', 'S1-A1', 'Press test', daysAgo(20), 70, [8, 8, 7], { targetRepsMin: 6, targetRepsMax: 10 }),
        ...mkSets('p2', 'S1-A1', 'Press test', daysAgo(13), 70, [8, 7, 7], { targetRepsMin: 6, targetRepsMax: 10 }),
        ...mkSets('p3', 'S1-A1', 'Press test', daysAgo(6), 70, [7, 7, 7], { targetRepsMin: 6, targetRepsMax: 10 })
    ];
    app.invalidateExerciseHistoryCaches();
    const plateauWarn = await app.calculateCoachingAdviceForSlot(press, { dryRun: true });
    assert.equal(plateauWarn.type, 'maintain');
    assert.ok(plateauWarn.plateau);
    stores.setHistory.unshift(...mkSets('p0', 'S1-A1', 'Press test', daysAgo(27), 70, [8, 8, 8], { targetRepsMin: 6, targetRepsMax: 10 }));
    app.invalidateExerciseHistoryCaches();
    const plateauReset = await app.calculateCoachingAdviceForSlot(press, { dryRun: true });
    assert.equal(plateauReset.type, 'decrease');
    assert.equal(plateauReset.suggestedWeight, 67.5);

    // Long break: no load jump after 3+ weeks, a ~10% reload after 6+ weeks.
    stores.setHistory = mkSets('g1', 'S1-A1', 'Press test', daysAgo(25), 70, [10, 10, 10], { targetRepsMin: 6, targetRepsMax: 10 });
    app.invalidateExerciseHistoryCaches();
    const gap = await app.calculateCoachingAdviceForSlot(press, { dryRun: true });
    assert.equal(gap.suggestedWeight, 70, 'after 3+ weeks off, confirm before increasing');
    stores.setHistory = mkSets('g2', 'S1-A1', 'Press test', daysAgo(50), 70, [10, 10, 10], { targetRepsMin: 6, targetRepsMax: 10 });
    app.invalidateExerciseHistoryCaches();
    const longGap = await app.calculateCoachingAdviceForSlot(press, { dryRun: true });
    assert.equal(longGap.type, 'decrease');
    assert.ok(longGap.suggestedWeight < 70 && longGap.suggestedWeight >= 62.5);

    // Light loads never snap to 0 kg (2 kg raises with a 2 kg step).
    assert.equal(app.snapLoadToStep(1.8, 2, 2, 'down'), 2);
    assert.equal(app.snapLoadToStep(0.5, 3, 2, 'down'), 2);

    // Capped machine with no history: let the player choose, never "2 kg".
    const cappedFirst = app.getCappedLoadProgressionAdvice(
        { ...press, progressionMode: 'capped_load', maxSelectableLoadKg: 120 },
        { lastWorkout: null, nextLoadCandidate: 2, targetReps: '8 / 8 / 8' }
    );
    assert.equal(cappedFirst.suggestedWeight, '?');

    // Assisted bodyweight: assistance comes from what was logged last time.
    const assisted = app.getBodyweightProgressionAdvice(
        { ...press, progressionMode: 'bodyweight', bodyweightProfile: { family: 'pullup', allowAssistance: true, assistanceStepKg: 5 } },
        { lastWorkout: { sets: [] }, lastWeight: 30, consecutiveExposureSuccess: 2, targetReps: '8 / 8 / 8', avgReps: 8, avgRpe: 8 }
    );
    assert.equal(assisted.suggestedAssistanceKg, 25);

    console.log('coach-engine tests: OK');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
