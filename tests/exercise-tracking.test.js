const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const exerciseDatabase = JSON.parse(fs.readFileSync(path.join(root, 'exercises-db.json'), 'utf8'));
const stores = {
    sessions: [],
    slots: [],
    workoutHistory: [],
    setHistory: [],
    settings: [],
    currentWorkout: []
};
const db = {
    async getAll(name) { return [...(stores[name] || [])]; },
    async getByIndex(name, field, value) { return (stores[name] || []).filter(item => item?.[field] === value); },
    async getSetting() { return null; },
    async get(name, id) { return (stores[name] || []).find(item => item?.id === id) || null; },
    async put(name, item) { (stores[name] ||= []).push(item); return item?.id; },
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

const app = new context.__App();

async function run() {
    const curated = [
        ['Tapis de course', 'cardio', 'speed'],
        ['Course extérieure', 'cardio', 'speed'],
        ['Marche rapide', 'cardio', 'speed'],
        ['Rameur', 'cardio', 'power'],
        ['Vélo assis', 'cardio', 'resistance'],
        ['Vélo spinning', 'cardio', 'resistance'],
        ['Vélo elliptique', 'cardio', 'resistance'],
        ['Stair climber', 'cardio', 'level'],
        ['Air bike', 'cardio', 'power'],
        ['Ski erg', 'cardio', 'power'],
        ['Corde à sauter', 'cardio', 'cadence'],
        ['Prowler push', 'timed', null],
        ['Natation', 'cardio', 'distance-m'],
        ['Gainage', 'timed', null],
        ['Gainage latéral', 'timed', null],
        ['Farmer carry', 'timed', null]
    ];

    curated.forEach(([name, mode, metric]) => {
        const slot = app.findExerciseLibraryEntry(name);
        assert.ok(slot, `${name} should exist in the curated library`);
        assert.equal(app.getTrackingMode(slot), mode, `${name} tracking mode`);
        if (metric) assert.equal(app.getCardioMetricConfig(slot).key, metric, `${name} cardio metric`);
    });

    // Normalization must not let default strength progression fields turn
    // treadmill and machine cardio back into reps and weight.
    const rawTreadmill = {
        id: 'legacy-treadmill', name: 'Tapis de course', activeExercise: 'Tapis de course',
        trackingMode: 'cardio', progressionMode: 'load', loadingProfile: 'free_weight',
        sets: 1, repsMin: 10, repsMax: 30, rest: 0
    };
    const normalizedTreadmill = app.normalizeSlotProgressionConfig(rawTreadmill);
    assert.equal(normalizedTreadmill.trackingMode, 'cardio');
    assert.equal(app.getTrackingMode(app.normalizeSlotProgressionConfig(normalizedTreadmill)), 'cardio');

    // A slot previously rewritten to the common Muscle preset is restored to
    // the exercise's one-block duration prescription when the user opens it.
    const corruptedTreadmill = app.normalizeSlotProgressionConfig({
        id: 'corrupted-treadmill', name: 'Tapis de course', activeExercise: 'Tapis de course',
        trackingMode: 'strength', trackingModeSource: 'definition',
        progressionMode: 'load', loadingProfile: 'free_weight',
        sets: 3, repsMin: 8, repsMax: 12, rest: 90
    });
    assert.equal(corruptedTreadmill.trackingMode, 'cardio');
    assert.equal(corruptedTreadmill.sets, 1);
    assert.equal(corruptedTreadmill.repsMin, 10);
    assert.equal(corruptedTreadmill.repsMax, 30);
    assert.equal(corruptedTreadmill.rest, 0);
    stores.slots = [];
    const persistedLegacy = await app.normalizeStoredSlots([{
        id: 'persisted-legacy-treadmill', name: 'Tapis de course', activeExercise: 'Tapis de course',
        trackingMode: 'strength', trackingModeSource: 'definition',
        progressionMode: 'load', loadingProfile: 'free_weight',
        sets: 3, repsMin: 8, repsMax: 12, rest: 90
    }]);
    assert.equal(persistedLegacy[0].sets, 1);
    assert.equal(stores.slots[0].trackingMode, 'cardio', 'the repaired slot is saved for later views');

    // An explicit choice made in the editor remains authoritative.
    assert.equal(app.getTrackingMode({
        name: 'Tapis de course', activeExercise: 'Tapis de course',
        trackingMode: 'strength', trackingModeSource: 'user'
    }), 'strength');

    // Time-based core and carry exercises use seconds, including old holds
    // whose targets were stored as fractions of a minute.
    const oldPlank = app.normalizeSlotProgressionConfig({
        id: 'old-plank', name: 'Gainage', activeExercise: 'Gainage',
        trackingMode: 'strength', progressionMode: 'bodyweight', loadingProfile: 'bodyweight',
        sets: 3, repsMin: 0.5, repsMax: 1, rest: 45
    });
    assert.equal(oldPlank.trackingMode, 'timed');
    assert.equal(oldPlank.repsMin, 30);
    assert.equal(oldPlank.repsMax, 60);
    assert.equal(oldPlank.durationUnit, 'seconds');
    assert.equal(app.getSetDurationSeconds({ reps: 0.5 }, oldPlank), 30);
    assert.equal(app.getSetDurationSeconds({ reps: 90, trackingMode: 'timed', durationSeconds: 90 }, oldPlank), 90);

    // Exercise-database names cover the major machine families without
    // misclassifying dynamic rep exercises that happen to contain "walking"
    // or "plank" in their names.
    const inferred = [
        ['Walking treadmill incliné', 'cardio', 'speed'],
        ['Walking stepmill', 'cardio', 'level'],
        ['Cycle cross trainer', 'cardio', 'resistance'],
        ['Ski ergometer', 'cardio', 'power'],
        ['Jump rope', 'cardio', 'cadence'],
        ['Air bike', 'cardio', 'power'],
        ['Dead hang', 'timed', null],
        ['Farmer walk', 'timed', null],
        ['Sled push', 'timed', null],
        ['Weighted front plank', 'timed', null],
        ['Walking lunge', 'strength', null],
        ['Plank shoulder tap', 'strength', null],
        ['Front plank with twist', 'strength', null],
        ['Side plank hip adduction', 'strength', null],
        ['Isometric chest squeeze', 'strength', null],
        ['Hanging leg raise', 'strength', null],
        ['Burpee', 'strength', null],
        ['Développé couché barre', 'strength', null]
    ];
    inferred.forEach(([name, mode, metric]) => {
        const definition = app.inferCustomExerciseTemplate(name, {
            preferLibraryMatch: false,
            allowCardioInference: true
        });
        assert.equal(definition.trackingMode || 'strength', mode, `${name} inferred tracking mode`);
        if (metric) assert.equal(definition.cardioMetric, metric, `${name} inferred cardio metric`);
    });

    // The full exercise database stores English names alongside French names.
    // Passing both names lets translated labels such as "Saut corde" retain
    // their cardio mode when selected from that catalog.
    const jumpRopeDbEntry = app.inferCustomExerciseTemplate('Saut corde jump rope', {
        preferLibraryMatch: false,
        allowCardioInference: true
    });
    assert.equal(jumpRopeDbEntry.trackingMode, 'cardio');
    assert.equal(jumpRopeDbEntry.cardioMetric, 'cadence');

    const machineOrSteadyCardio = exerciseDatabase.x.filter(entry => (
        entry.m === 'cardio'
        && /treadmill|cross trainer|stepmill|stepper|ellipt|bike|ergom|skierg|velo|corde|rower|rowing|jump rope|swim|tapis/i.test(`${entry.n} ${entry.en} ${entry.eq}`)
    ));
    assert.ok(machineOrSteadyCardio.length > 0, 'the exercise catalog should include machine and steady-state cardio');
    machineOrSteadyCardio.forEach(entry => {
        const definition = app.inferCustomExerciseTemplate(`${entry.n} ${entry.en}`, {
            preferLibraryMatch: false,
            allowCardioInference: true
        });
        assert.equal(definition.trackingMode, 'cardio', `${entry.n} (${entry.en}) should use time-based cardio tracking`);
    });

    const treadmillAggregate = app.buildWorkoutAggregateFromSets([
        { slotId: normalizedTreadmill.id, reps: 10.5, weight: 8.5, trackingMode: 'cardio', durationSeconds: 630 }
    ], new Map([[normalizedTreadmill.id, normalizedTreadmill]]));
    assert.equal(treadmillAggregate.totalVolume, 0);
    assert.equal(treadmillAggregate.totalReps, 0);
    assert.equal(treadmillAggregate.totalCardioMinutes, 10.5);
    assert.equal(treadmillAggregate.totalTimedMinutes, 10.5);

    const speedSet = {
        reps: 10.5,
        weight: 8.5,
        trackingMode: 'cardio',
        durationSeconds: 630,
        cardioMetric: 'speed',
        cardioMetricValue: 8.5
    };
    assert.equal(app.formatRepTargetValue(10.5, normalizedTreadmill), '10.5 min');
    assert.equal(app.formatSetResult(speedSet, normalizedTreadmill), '10 min 30 s · vitesse 8.5 km/h');

    // Imports made from old strength presets recover as cardio; explicit user
    // overrides still survive the round trip.
    const imported = app.normalizeProgramImport({
        sessions: [{
            name: 'Cardio',
            slots: [
                { name: 'Tapis de course', trackingMode: 'strength', sets: 3, repsMin: 8, repsMax: 12, rest: 90 },
                { name: 'Tapis de course', trackingMode: 'strength', trackingModeSource: 'user', sets: 4, repsMin: 4, repsMax: 6, rest: 180 },
                { name: 'Gainage', trackingMode: 'cardio', sets: 3, repsMin: 0.5, repsMax: 1, rest: 45 }
            ]
        }]
    });
    assert.equal(imported.slots[0].trackingMode, 'cardio');
    assert.equal(imported.slots[0].sets, 1);
    assert.equal(imported.slots[0].repsMin, 10);
    assert.equal(imported.slots[1].trackingMode, 'strength');
    assert.equal(imported.slots[1].sets, 4);
    assert.equal(imported.slots[2].trackingMode, 'timed');
    assert.equal(imported.slots[2].repsMin, 30);

    // Name detection: strength rows are never cardio, holds are timed,
    // hyphenated bodyweight names are recognised.
    const modeOf = name => app.getTrackingMode(name);
    for (const name of ['Rowing haltère', 'Rowing poulie basse', 'Rowing inversé', 'Rowing à la machine', 'Rowing barre', 'Row haltère', 'Développé couché', 'Curl élastique']) {
        assert.equal(modeOf(name), 'strength', `${name} stays strength`);
    }
    for (const name of ['Tapis de course', 'Rameur', 'Elliptique', 'Vélo elliptique', 'SkiErg', 'Corde à sauter', 'Spinning', 'Natation crawl', 'Stepper']) {
        assert.equal(modeOf(name), 'cardio', `${name} is cardio`);
    }
    for (const name of ['Gainage', 'Planche', 'Planche latérale', 'Chaise', 'Chaise au mur', 'Wall sit', 'Dead hang']) {
        assert.equal(modeOf(name), 'timed', `${name} is timed`);
    }
    assert.equal(modeOf('Relevé de jambes chaise romaine'), 'strength');
    assert.equal(app.getBodyweightAutoConfig('Pull-up').autoMode, true, 'Pull-up is bodyweight');
    assert.equal(app.getBodyweightAutoConfig('Muscle-up').autoMode, true, 'Muscle-up is bodyweight');
    assert.equal(app.getBodyweightAutoConfig('Dip machine').autoMode, false, 'Dip machine is loaded');
    assert.equal(app.getBodyweightAutoConfig('Tractions assistées').assistedPattern, true);
    assert.equal(app.getBodyweightAutoConfig('Band pull apart').assistedPattern, false, 'a band exercise is not assistance');

    // A stored strength row is never rewritten by keyword inference, and a row
    // an older version turned into a 1-block cardio slot is repaired.
    const keptRow = app.normalizeSlotProgressionConfig({ name: 'Rowing haltère', trackingMode: 'strength', sets: 3, repsMin: 8, repsMax: 12, rest: 90 });
    assert.equal(keptRow.trackingMode, 'strength');
    assert.equal(keptRow.sets, 3);
    const repairedRow = app.normalizeSlotProgressionConfig({ name: 'Rowing poulie basse', trackingMode: 'cardio', sets: 1, repsMin: 10, repsMax: 30, rest: 0, cardioMetric: 'power' });
    assert.equal(repairedRow.trackingMode, 'strength');
    assert.equal(repairedRow.sets, 3);
    assert.equal(repairedRow.rest, 90);

    // Stats rely on the set's own mode even when its slot is gone.
    const swimSet = { exerciseName: 'Natation', weight: 1000, reps: 30, trackingMode: 'cardio', durationSeconds: 1800 };
    assert.equal(app.getSetLoadedVolume(swimSet, null), 0, 'cardio never counts as tonnage');
    assert.equal(app.getSetLoadedVolume({ exerciseName: 'Tractions assistées', weight: 30, reps: 8 }, null), 0, 'assistance is not tonnage');
    assert.equal(app.getSetLoadedVolume({ exerciseName: 'Squat', weight: 100, reps: 5, trackingMode: 'strength' }, null), 500);

    // Rower: distance gives a split /500 m; treadmill: pace /km.
    const rowerSet = { reps: 8, durationSeconds: 480, trackingMode: 'cardio', distanceMeters: 2000, cardioMetric: 'power', cardioMetricValue: 180 };
    assert.equal(app.getCardioDerivedLabel(rowerSet, 'Rameur'), '2:00 /500 m');
    assert.equal(app.getCardioDerivedLabel({ reps: 30, durationSeconds: 1800, distanceMeters: 5000 }, 'Tapis de course'), '6:00 /km');
    assert.ok(app.getCardioExtraFields('Tapis de course').some(field => field.key === 'inclinePct'), 'treadmill offers incline');
    assert.ok(app.getCardioExtraFields('Rameur').some(field => field.key === 'distanceMeters' && field.unit === 'm'), 'rower distance in meters');
    assert.equal(app.getCardioMetricConfig('Corde à sauter', 'cadence').unit, 'sauts/min');

    console.log('exercise-tracking tests: OK');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
