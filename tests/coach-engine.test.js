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

    console.log('coach-engine tests: OK');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
