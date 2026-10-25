// Demo data generator — DEV ONLY. Replaces every local store with a fake
// 8-week Push / Pull / Legs history so the home stats, trophies and coach
// screens can be previewed. Never loaded by the app itself.
// Usage (browser console, on a throwaway origin such as 127.0.0.1):
//   const s = document.createElement('script'); s.src = 'tests/demo-seed.js'; document.body.append(s);
//   await window.seedDemoData();
(function () {
    const PROGRAM = [
        { name: 'Push', exercises: [['Développé couché barre', 80, 7], ['Développé incliné haltères', 30, 10], ['Élévation latérale poulie', 9, 13], ['Extension triceps poulie haute', 30, 12]] },
        { name: 'Pull', exercises: [['Tractions', 0, 8], ['Rowing barre', 70, 9], ['Oiseau poulie', 8, 14], ['Curl barre EZ', 30, 10]] },
        { name: 'Legs', exercises: [['Squat', 100, 7], ['Soulevé de terre roumain', 90, 9], ['Leg curl assis', 45, 12], ['Mollets debout machine', 80, 12]] }
    ];

    const DAY = 24 * 60 * 60 * 1000;

    window.seedDemoData = async function seedDemoData({ weeks = 8 } = {}) {
        for (const store of ['sessions', 'slots', 'workoutHistory', 'setHistory', 'settings', 'currentWorkout']) {
            await db.clear(store);
        }

        const sessions = [];
        const slots = [];
        PROGRAM.forEach((program, sessionIndex) => {
            const sessionId = `demo-session-${sessionIndex + 1}`;
            sessions.push({ id: sessionId, name: program.name, order: sessionIndex, estimatedDuration: 60 });
            program.exercises.forEach(([exerciseName], order) => {
                const definition = app.findExerciseLibraryEntry(exerciseName) || app.inferCustomExerciseTemplate(exerciseName);
                const slot = app.buildSlotFromExerciseDefinition(definition, sessionId, order);
                slot.id = `${sessionId}-slot-${order}`;
                slots.push(slot);
            });
        });
        for (const session of sessions) await db.put('sessions', session);
        for (const slot of slots) await db.put('slots', slot);

        const today = new Date();
        today.setHours(18, 30, 0, 0);
        const start = new Date(today.getTime() - weeks * 7 * DAY);
        let workoutIndex = 0;
        let workoutId = 0;
        for (let day = start.getTime(); day < today.getTime() - DAY / 2; day += DAY) {
            const weekday = new Date(day).getDay();
            if (![1, 3, 5].includes(weekday)) continue;
            if (Math.random() < 0.12) continue; // a missed session now and then
            const sessionIndex = workoutIndex % sessions.length;
            const session = sessions[sessionIndex];
            const progress = workoutIndex / 3;
            const date = new Date(day).toISOString();
            workoutId += 1;
            const workout = { id: workoutId, sessionId: session.id, date, duration: (52 + Math.round(Math.random() * 18)) * 60000, slots: {}, completedSlots: [] };

            for (const [order, [exerciseName, baseWeight, baseReps]] of PROGRAM[sessionIndex].exercises.entries()) {
                const slot = slots.find(item => item.sessionId === session.id && item.order === order);
                const step = baseWeight >= 60 ? 2.5 : baseWeight > 0 ? 1 : 0;
                const weight = baseWeight + Math.floor(progress / 2) * step;
                const sets = [];
                for (let setNumber = 1; setNumber <= slot.sets; setNumber += 1) {
                    const reps = Math.max(slot.repsMin, baseReps + (progress % 2 > 0.6 ? 1 : 0) - (setNumber > 2 ? 1 : 0));
                    const rpe = Math.min(10, 7 + setNumber - 1 + (Math.random() < 0.3 ? 1 : 0));
                    sets.push({ weight, reps, rpe, rpeSource: 'user', completed: true, exerciseName, timestamp: new Date(day).getTime() + setNumber * 180000, qualityTags: [] });
                    await db.add('setHistory', {
                        slotId: slot.id,
                        exerciseId: exerciseName,
                        exerciseName,
                        exerciseStableId: slot.exerciseStableId,
                        exerciseFamilyId: slot.exerciseFamilyId,
                        workoutId,
                        setNumber,
                        weight,
                        reps,
                        rpe,
                        rpeSource: 'user',
                        targetSetCount: slot.sets,
                        programmedSetCount: slot.sets,
                        targetRepsMin: slot.repsMin,
                        targetRepsMax: slot.repsMax,
                        targetRir: slot.rir,
                        qualityTags: [],
                        excludeFromProgression: false,
                        isDeload: false,
                        date
                    });
                }
                workout.slots[slot.id] = { sets };
                workout.completedSlots.push(slot.id);
            }
            await db.put('workoutHistory', workout);
            workoutIndex += 1;
        }

        const settings = {
            appDataInitialized: true,
            onboardingCompleted: true,
            weeklyGoal: 3,
            xp: workoutIndex * 180,
            streakSystemInitialized: false,
            nextSessionIndex: workoutIndex % sessions.length,
            lastWorkoutDate: new Date(today.getTime() - 2 * DAY).toISOString()
        };
        for (const [key, value] of Object.entries(settings)) await db.setSetting(key, value);
        return { sessions: sessions.length, workouts: workoutIndex };
    };
})();
