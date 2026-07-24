const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backup = JSON.parse(fs.readFileSync(path.join(root, 'muscu-backup-2026-07-24.json'), 'utf8'));
const settings = new Map((backup.settings || []).map(setting => [setting.key, setting.value]));
const stores = {
    sessions: backup.sessions || [],
    slots: backup.slots || [],
    workoutHistory: backup.workoutHistory || [],
    setHistory: backup.setHistory || [],
    settings: backup.settings || [],
    currentWorkout: backup.currentWorkout || []
};

const db = {
    async getAll(storeName) {
        return [...(stores[storeName] || [])];
    },
    async getByIndex(storeName, indexName, value) {
        return (stores[storeName] || []).filter(item => item?.[indexName] === value);
    },
    async getSetting(key) {
        return settings.has(key) ? settings.get(key) : null;
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
    async saveCurrentWorkout() {}
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

vm.runInContext(
    `${fs.readFileSync(path.join(root, 'data.js'), 'utf8')}\n`,
    context,
    { filename: 'data.js' }
);

let appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
appSource = appSource.replace(
    /\/\/ Initialize app[\s\S]*$/,
    'globalThis.__App = App;'
);
vm.runInContext(
    `const db = globalThis.__db;\n${appSource}`,
    context,
    { filename: 'app.js' }
);

const App = context.__App;

async function run() {
    const app = new App();
    const curlName = 'Curl marteau à la corde';
    const reversePecDeck = 'Reverse pec deck';

    const curlSets = await app.getSetHistoryForExercise(curlName);
    assert.ok(curlSets.some(set => set.id === 2637), 'the real F6 curl session must remain');
    assert.ok(curlSets.some(set => set.id === 2521), 'curl sets from the former G7 position must remain');
    assert.ok(!curlSets.some(set => set.id === 2523 || set.id === 2524), '73 kg reverse-pec-deck sets must not leak into curl history');
    assert.ok(curlSets.every(set => app.getBaseExerciseHistoryName(set.exerciseId) === curlName));

    app.invalidateExerciseHistoryCaches();
    const reverseSets = await app.getSetHistoryForExercise(reversePecDeck);
    assert.ok(reverseSets.some(set => set.id === 2523), 'reverse pec deck history must keep its 73 kg sets');
    assert.ok(!reverseSets.some(set => set.id === 2521 || set.id === 2522), '28.25 kg curl sets must not leak into reverse pec deck history');

    const f6 = stores.slots.find(slot => slot.id === 'session-masse-2026-06-22-4-f6-5');
    assert.ok(f6, 'fixture F6 slot must exist');
    app.currentWorkout = null;
    const advice = await app.calculateCoachingAdviceForSlot(f6);
    assert.equal(advice.type, 'increase');
    assert.equal(advice.referenceWeight, 28.25);
    assert.equal(advice.weightIncrement, 0.75);
    assert.equal(advice.suggestedWeight, 29);
    assert.equal(advice.suggestedReps, '13 / 13 / 13');
    assert.ok(!Object.prototype.hasOwnProperty.call(advice, 'suggestedSets'));

    app.currentWorkout = {
        slots: {
            [f6.id]: {
                coachVolumeDecision: { acceptedTargetSets: 1 },
                autoTargetSets: 1,
                autoTargetSource: 'deload'
            }
        }
    };
    const targetState = app.getSlotTargetState(f6, app.currentWorkout.slots[f6.id]);
    assert.equal(targetState.activeTargetSets, f6.sets);
    const setPlan = app.buildCoachSetPlan(f6, { suggestedSets: 1, deloadSets: 1 });
    assert.equal(setPlan.activeTargetSets, f6.sets);
    assert.equal(setPlan.showReductionPrompt, false);

    const constrained = app.enforceProgressionConstraints(
        { suggestedWeight: 28.25, suggestedSets: 1, deloadSets: 1 },
        f6
    );
    assert.ok(!Object.prototype.hasOwnProperty.call(constrained, 'suggestedSets'));
    assert.ok(!Object.prototype.hasOwnProperty.call(constrained, 'deloadSets'));
    assert.equal(constrained.programmedSets, f6.sets);

    app.currentWorkout = null;
    const adviceRows = [];
    for (const slot of stores.slots.filter(item => item.trackingMode !== 'cardio')) {
        const slotAdvice = await app.calculateCoachingAdviceForSlot(slot);
        assert.ok(
            !Object.prototype.hasOwnProperty.call(slotAdvice, 'suggestedSets'),
            `${slot.name} must never receive a set-count suggestion`
        );
        assert.equal(
            app.buildCoachSetPlan(slot, slotAdvice).activeTargetSets,
            slot.sets,
            `${slot.name} must keep its programmed set count`
        );
        adviceRows.push({
            slot: slot.name,
            type: slotAdvice.type,
            reference: slotAdvice.referenceWeight ?? null,
            weight: slotAdvice.suggestedWeight,
            reps: slotAdvice.suggestedReps
        });
    }
    if (process.env.PRINT_ADVICE === '1') {
        console.table(adviceRows);
    }

    console.log('history-coach regression tests: OK');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
