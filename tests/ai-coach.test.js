const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ai-coach.js'), 'utf8');
const moduleShim = { exports: {} };
new Function('module', source)(moduleShim);
const AiCoach = moduleShim.exports;

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-22T12:00:00');

function run(name, fn) {
    fn();
    console.log(`✓ ${name}`);
}

const program = {
    format: 'worktout-program-v1',
    profile: { objective: 'Prise de masse', weeklyGoal: 3 },
    sessions: [
        {
            name: 'Push',
            estimatedDuration: 60,
            slots: [
                { name: 'Développé couché barre', sets: 4, repsMin: 6, repsMax: 8, rest: 150, rir: 2 },
                { name: 'Élévation latérale', sets: 3, repsMin: 12, repsMax: 15, rest: 60, rir: 1 }
            ]
        }
    ]
};

run('extractProgram lit un bloc ```json entouré de texte', () => {
    const reply = `Voici ton programme !\n\n\`\`\`json\n${JSON.stringify(program, null, 2)}\n\`\`\`\n👉 Copie ce message.`;
    const { program: found, reason } = AiCoach.extractProgram(reply);
    assert.equal(reason, null);
    assert.equal(found.sessions[0].slots.length, 2);
});

run('extractProgram garde le dernier programme quand il y en a plusieurs', () => {
    const draft = { ...program, sessions: [{ name: 'Brouillon', slots: [{ name: 'Squat' }] }] };
    const reply = `Brouillon :\n\`\`\`json\n${JSON.stringify(draft)}\n\`\`\`\nFinal :\n\`\`\`json\n${JSON.stringify(program)}\n\`\`\``;
    assert.equal(AiCoach.extractProgram(reply).program.sessions[0].name, 'Push');
});

run('extractProgram trouve un JSON nu au milieu de prose avec accolades', () => {
    const reply = `Note {pas du json} puis ${JSON.stringify(program)} et fin.`;
    assert.equal(AiCoach.extractProgram(reply).program.sessions[0].name, 'Push');
});

run('extractProgram signale une analyse sans programme', () => {
    assert.equal(AiCoach.extractProgram('Ton bilan : tu progresses bien.').reason, 'no-json');
    assert.equal(AiCoach.extractProgram('```json\n{"score": 3}\n```').reason, 'no-program');
    assert.equal(AiCoach.extractProgram('   ').reason, 'empty');
});

run('diffPrograms classe ajouts, retraits, modifications et inchangés', () => {
    const next = {
        format: 'worktout-program-v1',
        profile: { objective: 'Prise de masse', weeklyGoal: 4 },
        sessions: [
            {
                name: 'Push',
                slots: [
                    { name: 'Developpe couche barre', sets: 5, repsMin: 5, repsMax: 5, rest: 180, rir: 2 },
                    { name: 'Dips', sets: 3, repsMin: 8, repsMax: 12, rest: 90, rir: 2 }
                ]
            },
            { name: 'Pull', slots: [{ name: 'Tractions', sets: 4, repsMin: 6, repsMax: 10, rest: 120, rir: 2 }] }
        ]
    };
    const diff = AiCoach.diffPrograms(program, next);
    assert.equal(diff.totals.changed, 1, 'nom sans accent = même exercice');
    assert.equal(diff.totals.added, 2);
    assert.equal(diff.totals.removed, 1);
    assert.equal(diff.totals.sessionsAdded, 1);
    assert.deepEqual(diff.profile.weeklyGoal, { from: 3, to: 4 });
    const bench = diff.sessions[0].rows.find(row => row.status === 'changed');
    assert.deepEqual(bench.changes.map(change => change.field), ['volume', 'rest']);
    assert.equal(bench.changes[0].to, '5×5');
    assert.ok(diff.hasChanges);
});

run('diffPrograms ne voit aucun changement sur le même programme', () => {
    const diff = AiCoach.diffPrograms(program, JSON.parse(JSON.stringify(program)));
    assert.equal(diff.hasChanges, false);
    assert.equal(diff.totals.kept, 2);
});

run('programFromStore exporte supersets et mode unilatéral', () => {
    const exported = AiCoach.programFromStore(
        [{ id: 's1', name: 'Bras', order: 0 }],
        [
            { id: 'a', sessionId: 's1', order: 0, name: 'Curl', activeExercise: 'Curl', sets: 3, repsMin: 10, repsMax: 12, rest: 60, rir: 1, supersetWith: 'b', pool: ['Curl', 'Curl marteau'] },
            { id: 'b', sessionId: 's1', order: 1, name: 'Extension', sets: 3, repsMin: 10, repsMax: 12, rest: 60, rir: 1 },
            { id: 'c', sessionId: 's1', order: 2, name: 'Curl concentré', sets: 2, repsMin: 12, repsMax: 15, rest: 45, rir: 1, unilateralMode: 'on' }
        ],
        { objective: 'Bras', weeklyGoal: 2 }
    );
    const slots = exported.sessions[0].slots;
    assert.equal(slots[0].superset, 'A');
    assert.equal(slots[1].superset, 'A');
    assert.equal(slots[2].superset, undefined);
    assert.equal(slots[2].unilateralMode, 'on');
    assert.deepEqual(slots[0].pool, ['Curl', 'Curl marteau']);
});

run('buildDigest résume tendances, volume, déséquilibres et notes', () => {
    const slots = [
        { id: 'bench', sessionId: 's1', order: 0, name: 'Développé couché barre', activeExercise: 'Développé couché barre', muscleGroup: 'pectoraux', sets: 3, repsMin: 6, repsMax: 8, rest: 150, rir: 2 },
        { id: 'curl', sessionId: 's1', order: 1, name: 'Curl haltère', activeExercise: 'Curl haltère', muscleGroup: 'biceps', sets: 3, repsMin: 10, repsMax: 12, rest: 60, rir: 1 }
    ];
    const history = [];
    const setHistory = [];
    // 6 bench sessions, 3 days apart: progresses then stalls for 3 sessions.
    const benchWeights = [80, 82.5, 85, 82.5, 82.5, 82.5];
    benchWeights.forEach((weight, index) => {
        const date = new Date(now.getTime() - (30 - index * 3) * DAY).toISOString();
        history.push({ id: index + 1, sessionId: 's1', date, duration: 60 * 60000, skippedSlots: index < 3 ? ['curl'] : [] });
        for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
            setHistory.push({ slotId: 'bench', exerciseName: 'Développé couché barre', workoutId: index + 1, setNumber, weight, reps: 7, rpe: 8, rpeSource: 'user', date, qualityTags: index === 5 && setNumber === 1 ? ['pain'] : [], exerciseNote: index === 5 ? 'Épaule qui tire' : '' });
        }
        ['left', 'right'].forEach(side => setHistory.push({ slotId: 'curl', exerciseName: 'Curl haltère', side, workoutId: index + 1, setNumber: 1, weight: side === 'left' ? 12 : 14, reps: 10, rpe: 8, date }));
    });

    const digest = AiCoach.buildDigest({
        sessions: [{ id: 's1', name: 'Haut', order: 0 }],
        slots,
        history,
        setHistory,
        profile: { objective: 'Force', weeklyGoal: 3 },
        muscleGroups: [{ id: 'pectoraux', name: 'Pectoraux' }, { id: 'biceps', name: 'Biceps' }],
        landmarks: { pectoraux: { MEV: 10, MAV: 16, MRV: 22 }, default: { MEV: 8, MAV: 14, MRV: 20 } },
        now
    });

    const bench = digest.exercises.find(exercise => exercise.name === 'Développé couché barre');
    assert.equal(bench.sessions, 6);
    assert.equal(bench.status, 'stall');
    assert.equal(bench.sessionsSinceBest, 3);
    assert.ok(bench.flags.some(flag => flag.startsWith('douleur')));
    assert.equal(bench.avgRpe, 8);
    assert.equal(digest.imbalances[0].weaker, 'gauche');
    assert.equal(digest.skipped[0].name, 'Curl haltère');
    assert.equal(digest.notes[0].text, 'Épaule qui tire');
    const biceps = digest.muscles.find(muscle => muscle.id === 'biceps');
    assert.ok(biceps.avgWeeklySets > 0, 'les séries unilatérales comptent pour moitié par côté');
    assert.equal(digest.profile.totalWorkouts, 6);

    const text = AiCoach.formatDigest(digest);
    assert.match(text, /stagne/);
    assert.match(text, /worktout-program-v1/);
    assert.match(text, /côté gauche plus faible/);

    const prompt = AiCoach.buildPrompt({ intent: 'improve', digest, userMessage: 'Plus de pecs', focus: ['time'], muscleIds: 'pectoraux, biceps' });
    assert.match(prompt, /optimiser mon programme/);
    assert.match(prompt, /Plus de pecs/);
    assert.match(prompt, /séances plus courtes/);
    assert.match(prompt, /recopie son nom EXACTEMENT/);
});

run('planLaunch pré-remplit seulement quand c’est possible', () => {
    const short = AiCoach.planLaunch('chatgpt', 'Bonjour coach');
    assert.ok(short.prefilled);
    assert.ok(short.url.startsWith('https://chatgpt.com/?q='));

    const long = AiCoach.planLaunch('claude', 'é'.repeat(5000));
    assert.equal(long.prefilled, false);
    assert.equal(long.url, 'https://claude.ai/new');

    assert.equal(AiCoach.planLaunch('gemini', 'Bonjour').prefilled, false);
    assert.equal(AiCoach.planLaunch('other', 'Bonjour').url, null);
});

console.log('ai-coach: tous les tests passent');
