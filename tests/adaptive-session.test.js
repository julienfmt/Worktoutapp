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
    const slot = {
        id: 'adaptive-bench',
        name: 'Développé couché test',
        activeExercise: 'Développé couché test',
        type: 'compound',
        trackingMode: 'strength',
        progressionMode: 'load',
        sets: 4,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        incrementKg: 2.5
    };
    const slotData = {
        sets: [
            { weight: 100, reps: 10, completed: true },
            { weight: 100, reps: 6, completed: true }
        ]
    };

    app.currentSlot = slot;
    app.currentWorkout = { slots: { [slot.id]: slotData } };

    const fatigue = app.getLivePerformanceAnalysis(slot, slotData);
    assert.equal(fatigue.kind, 'fatigue');
    assert.equal(fatigue.suggestedWeight, 97.5);
    assert.equal(fatigue.recommendedRestSeconds, 135);
    assert.equal(fatigue.suggestedSets, 2);
    assert.equal(fatigue.canReduceVolume, true);

    await app.setUserTargetSets(fatigue.suggestedSets, 'coach-suggestion', { render: false });
    assert.equal(slotData.userTargetSets, 2);
    assert.equal(app.getActiveTargetSets(slot, slotData), 2);

    await app.setUserTargetSets(slot.sets, 'manual', { render: false });
    assert.equal(Object.prototype.hasOwnProperty.call(slotData, 'userTargetSets'), false);
    assert.equal(app.getActiveTargetSets(slot, slotData), 4);

    const coherentDrop = {
        sets: [
            { weight: 100, reps: 8, completed: true },
            { weight: 97.5, reps: 8, completed: true }
        ]
    };
    const adapted = app.getLivePerformanceAnalysis(slot, coherentDrop);
    assert.equal(adapted.kind, 'adjusted');
    assert.equal(adapted.canReduceVolume, false);

    const dramaticDrop = {
        sets: [
            { weight: 100, reps: 10, completed: true },
            { weight: 70, reps: 6, completed: true }
        ]
    };
    const fatigueAfterDrop = app.getLivePerformanceAnalysis(slot, dramaticDrop);
    assert.equal(fatigueAfterDrop.kind, 'fatigue');
    assert.equal(fatigueAfterDrop.suggestedWeight, 70);
    assert.match(fatigueAfterDrop.message, /charge baisse fortement/);

    const unilateralSlot = {
        id: 'adaptive-unilateral',
        name: 'Cable lateral raise unilatéral',
        activeExercise: 'Cable lateral raise unilatéral',
        type: 'isolation',
        trackingMode: 'strength',
        sets: 3,
        repsMin: 12,
        repsMax: 25,
        rest: 75,
        incrementKg: 0.5
    };
    const unilateralData = {
        sets: [],
        setsLeft: [
            { weight: 10, reps: 18, completed: true },
            { weight: 10, reps: 10, completed: true }
        ],
        setsRight: [
            { weight: 10, reps: 18, completed: true },
            { weight: 10, reps: 18, completed: true }
        ]
    };

    app.currentSlot = unilateralSlot;
    app.currentWorkout = { startTime: Date.now(), slots: { [unilateralSlot.id]: unilateralData } };
    app.isUnilateralMode = true;

    const unilateralAnalysis = app.getLivePerformanceAnalysis(unilateralSlot, unilateralData);
    assert.equal(unilateralAnalysis.kind, 'fatigue');
    assert.equal(unilateralAnalysis.suggestedWeights.left, 9.5);
    assert.equal(unilateralAnalysis.suggestedWeights.right, 10);
    assert.equal(unilateralAnalysis.suggestedSets, 2);
    assert.equal(unilateralAnalysis.canReduceVolume, true);
    assert.equal(app.getCompletedUnilateralSetCount(unilateralData), 2);

    const customMuscleContributions = app.getExerciseMuscleContributions('Mouvement maison', { muscleGroup: 'dos' });
    assert.equal(customMuscleContributions.length, 1);
    assert.equal(customMuscleContributions[0].muscleId, 'dos');
    assert.equal(customMuscleContributions[0].role, 'primary');
    assert.equal(customMuscleContributions[0].weight, 1);

    const unilateralMeta = app.buildSlotCoachMeta(unilateralSlot);
    assert.equal(unilateralMeta.primaryMuscles.length, 1);
    assert.equal(unilateralMeta.primaryMuscles[0], 'epaules');
    assert.equal(unilateralMeta.exerciseFormat, 'unilateral');

    const inferredLateral = app.inferCustomExerciseTemplate('Cable lateral raise unilatéral', {
        preferLibraryMatch: false,
        allowCardioInference: true
    });
    assert.equal(inferredLateral.muscleGroup, 'epaules');
    assert.equal(inferredLateral.type, 'isolation');
    assert.equal(app.isUnilateralExercise('Single-arm cable row'), true);
    assert.equal(app.isUnilateralExercise('Fente bulgare'), true);

    const shoulderPressDescriptor = app.getExerciseDescriptor('Développé haltères épaules');
    assert.equal(shoulderPressDescriptor.primaryMuscles[0], 'epaules');
    assert.equal(shoulderPressDescriptor.secondaryMuscles.includes('triceps'), true);
    app.customExerciseLibrary = [{
        name: 'Mouvement custom épaules',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        pool: ['Développé haltères épaules']
    }];
    assert.equal(app.findExerciseLibraryEntry('Développé haltères épaules').name, 'Développé haltères épaules');
    assert.equal(app.getExerciseDescriptor('Développé haltères épaules').type, 'compound');
    app.customExerciseLibrary = [];
    assert.equal(app.getExerciseMuscleContributions('Développé haltères épaules')[0].muscleId, 'epaules');

    const inferredWoodchopper = app.inferCustomExerciseTemplate('Cable woodchopper high-to-low', {
        preferLibraryMatch: false,
        allowCardioInference: true
    });
    assert.equal(inferredWoodchopper.muscleGroup, 'abdominaux');
    assert.equal(inferredWoodchopper.type, 'isolation');

    const mixedData = {
        sets: [{ weight: 20, reps: 10, completed: true, exerciseName: 'Ancien mouvement' }],
        setsLeft: [{ weight: 8, reps: 15, completed: true, exerciseName: unilateralSlot.activeExercise }],
        setsRight: [{ weight: 8, reps: 15, completed: true, exerciseName: unilateralSlot.activeExercise }]
    };
    const mixedSummarySets = app.getCompletedStrengthSetsForSummary(unilateralSlot, mixedData);
    assert.equal(mixedSummarySets.length, 3);
    assert.equal(mixedSummarySets.filter(set => set.variant === 'left').length, 1);
    assert.equal(mixedSummarySets.filter(set => set.variant === 'right').length, 1);

    const segmentData = {
        sets: [{ weight: 30, reps: 8, completed: true, exerciseName: 'Développé archivé' }]
    };
    assert.equal(app.captureExerciseSegment(slot, segmentData), true);
    segmentData.sets = [];
    const historyEntries = app.getWorkoutSlotHistoryEntries(slot, segmentData);
    assert.equal(historyEntries.length, 1);
    assert.equal(historyEntries[0].exerciseName, 'Développé archivé');

    const cableIdentity = app.getStableExerciseId('Cable lateral raise unilatéral');
    const cableCanonical = app.getStableExerciseId('Élévation latérale poulie');
    assert.equal(cableIdentity, cableCanonical, 'translated/variant names should share an immutable exercise identity');
    assert.match(app.getExerciseFamilyId('Cable lateral raise unilatéral'), /^family:/);

    const closeSubstitution = app.getExerciseSubstitutionEquivalence(
        'Élévation latérale poulie',
        'Cable lateral raise unilatéral'
    );
    assert.ok(closeSubstitution.score >= 70, `close substitution score was ${closeSubstitution.score}`);
    const differentSubstitution = app.getExerciseSubstitutionEquivalence(
        'Élévation latérale poulie',
        'Presse à cuisses'
    );
    assert.ok(differentSubstitution.score < 70, `different movement score was ${differentSubstitution.score}`);

    const sequence = app.analyzeSetSequence([
        { weight: 100, reps: 10, completed: true, timestamp: 100000 },
        { weight: 100, reps: 6, completed: true, timestamp: 101000 },
        { weight: 90, reps: 9, completed: true, timestamp: 103000 }
    ], { rest: 90, type: 'compound', activeExercise: 'Développé couché barre' });
    assert.equal(sequence.signals.some(signal => signal.key === 'progressive_fatigue'), true);
    assert.equal(sequence.signals.some(signal => signal.key === 'short_rest'), true);
    assert.equal(sequence.signals.some(signal => signal.key === 'voluntary_load_drop'), true);

    const taggedSet = { completed: true, reps: 10, qualityTags: ['cheat', 'exclude_progression'] };
    assert.equal(app.isSetExcludedFromProgression(taggedSet), true);
    assert.equal(app.getSetQualityFactor(taggedSet), 0);
    assert.deepEqual(app.getProgressionEligibleSets([taggedSet, { completed: true, reps: 10 }]).length, 1);
    assert.equal(
        app.getProgressionEligibleSets([{ completed: false, reps: 12 }, { reps: 12 }]).length,
        1,
        'draft sets must not influence progression while legacy sets without completed remain usable'
    );

    const inferredEffectiveSets = app.calculateEffectiveSets([
        { weight: 80, reps: 10, completed: true },
        { weight: 80, reps: 8, completed: true }
    ], 100, slot);
    assert.ok(inferredEffectiveSets.effectiveSets > 0, 'missing RPE should not erase effective-set analysis');
    assert.equal(inferredEffectiveSets.details.every(detail => detail.effortSource === 'estimated'), true);
    assert.equal(inferredEffectiveSets.details.every(detail => detail.rpe === null), true);

    const excludedOnlyWorkout = {
        sets: [{ weight: 120, reps: 8, completed: true, qualityTags: ['exclude_progression'] }]
    };
    assert.equal(app.getBestWorkoutE1RM(excludedOnlyWorkout), 0);
    assert.equal(app.detectSandbagging([
        { weight: 120, reps: 8, completed: true, qualityTags: ['exclude_progression'], rpe: 10 },
        { weight: 120, reps: 8, completed: true, qualityTags: ['exclude_progression'], rpe: 10 }
    ], 120).detected, false);

    const taggedProgressionWorkout = {
        programmedSetCount: 2,
        sets: [
            { setNumber: 1, weight: 140, reps: 2, completed: true, qualityTags: ['exclude_progression'] },
            { setNumber: 2, weight: 100, reps: 12, completed: true }
        ]
    };
    assert.equal(app.getReferenceWeight(taggedProgressionWorkout, slot), 100);
    const targetCheck = app.evaluateWorkoutAgainstTargets(taggedProgressionWorkout, {
        ...slot,
        sets: 1,
        repsMin: 8,
        repsMax: 12
    });
    assert.equal(targetCheck.completedRequiredSets, true);
    assert.equal(targetCheck.allSetsHitTargets, true);

    let skipCalled = false;
    app.currentSlot = slot;
    app.currentWorkout = { slots: { [slot.id]: { sets: [] } } };
    app.isUnilateralMode = false;
    app.skipExerciseForToday = async () => {
        skipCalled = true;
        return 'skipped';
    };
    assert.equal(await app.finishOrSkipCurrentExercise(), 'skipped');
    assert.equal(skipCalled, true, 'the free control must skip cleanly when no set was validated');

    app.currentSlot = slot;
    const enrichedHistory = app.buildExerciseHistorySession({
        date: '2026-08-30T10:00:00.000Z',
        sets: [
            { setNumber: 1, weight: 100, reps: 10, completed: true, restAfterSeconds: 120, qualityTags: ['clean'] },
            { setNumber: 2, weight: 95, reps: 6, completed: true, restAfterSeconds: 60, qualityTags: ['exclude_progression'] }
        ]
    }, slot);
    assert.equal(enrichedHistory.totalVolume, 1570);
    assert.equal(enrichedHistory.progressionEligibleSetCount, 1);
    assert.ok(enrichedHistory.bestE1RM > 0);
    assert.deepEqual(enrichedHistory.qualityLabels, ['Propre 1', 'Hors progression 1']);
    assert.equal(enrichedHistory.averageRestSeconds, 90);

    stores.setHistory = [
        {
            id: 'recent-exposure',
            exerciseName: 'Développé couché barre',
            weight: 80,
            reps: 10,
            date: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString()
        },
        {
            id: 'old-exposure',
            exerciseName: 'Développé couché barre',
            weight: 80,
            reps: 10,
            date: new Date(Date.now() - (45 * 24 * 60 * 60 * 1000)).toISOString()
        }
    ];
    const recoverySnapshot = await app.buildMuscleRecoverySnapshot({ lookbackDays: 14 });
    const chestRecovery = recoverySnapshot.rows.find(row => row.muscleId === 'pectoraux');
    assert.equal(recoverySnapshot.lookbackDays, 14);
    assert.equal(chestRecovery.rawSets, 1, 'recovery fatigue must use recent exposure, not lifetime history');

    console.log('adaptive-session tests: OK');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
