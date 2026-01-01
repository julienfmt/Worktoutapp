// ===== Initial Data =====
const INITIAL_SESSIONS = [
    {
        id: 'bras-a',
        name: 'Bras A',
        order: 0,
        estimatedDuration: 45
    },
    {
        id: 'pecs-a',
        name: 'Pecs A',
        order: 1,
        estimatedDuration: 50
    },
    {
        id: 'bras-b',
        name: 'Bras B',
        order: 2,
        estimatedDuration: 45
    },
    {
        id: 'pecs-b',
        name: 'Pecs B',
        order: 3,
        estimatedDuration: 50
    }
];

const INITIAL_SLOTS = [
    // === BRAS A ===
    {
        id: 'bras-a-1',
        sessionId: 'bras-a',
        slotId: 'A1',
        name: 'Curl barre EZ',
        order: 0,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        rir: 2,
        instructions: 'Coudes fixes le long du corps. Contraction maximale en haut, descente contrôlée.',
        activeExercise: 'Curl barre EZ',
        pool: ['Curl barre EZ', 'Curl haltères', 'Curl poulie basse']
    },
    {
        id: 'bras-a-2',
        sessionId: 'bras-a',
        slotId: 'A2',
        name: 'Curl marteau',
        order: 1,
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        rir: 2,
        instructions: 'Prise neutre, mouvement contrôlé. Travaille le brachial et le long supinateur.',
        activeExercise: 'Curl marteau',
        pool: ['Curl marteau', 'Curl marteau poulie', 'Curl inversé']
    },
    {
        id: 'bras-a-3',
        sessionId: 'bras-a',
        slotId: 'A3',
        name: 'Extension triceps poulie haute',
        order: 2,
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        rir: 2,
        instructions: 'Coudes fixes, extension complète. Squeeze en bas du mouvement.',
        activeExercise: 'Extension triceps poulie haute',
        pool: ['Extension triceps poulie haute', 'Pushdown corde', 'Extension barre V']
    },
    {
        id: 'bras-a-4',
        sessionId: 'bras-a',
        slotId: 'A4',
        name: 'Dips entre bancs',
        order: 3,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        rir: 2,
        instructions: 'Descendre jusqu\'à 90° aux coudes. Ajouter du poids si trop facile.',
        activeExercise: 'Dips entre bancs',
        pool: ['Dips entre bancs', 'Dips machine', 'Extension nuque haltère']
    },

    // === PECS A ===
    {
        id: 'pecs-a-1',
        sessionId: 'pecs-a',
        slotId: 'A1',
        name: 'Développé couché haltères',
        order: 0,
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        rir: 2,
        instructions: 'Descente contrôlée jusqu\'aux pecs. Poussée explosive. Omoplates serrées.',
        activeExercise: 'Développé couché haltères',
        pool: ['Développé couché haltères', 'Développé couché barre', 'Développé machine convergente']
    },
    {
        id: 'pecs-a-2',
        sessionId: 'pecs-a',
        slotId: 'A2',
        name: 'Développé incliné haltères',
        order: 1,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        rir: 2,
        instructions: 'Inclinaison 30-45°. Focus sur le haut des pectoraux.',
        activeExercise: 'Développé incliné haltères',
        pool: ['Développé incliné haltères', 'Développé incliné barre', 'Développé incliné machine']
    },
    {
        id: 'pecs-a-3',
        sessionId: 'pecs-a',
        slotId: 'A3',
        name: 'Écarté poulie vis-à-vis',
        order: 2,
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Légère flexion des coudes. Stretch en ouverture, squeeze au centre.',
        activeExercise: 'Écarté poulie vis-à-vis',
        pool: ['Écarté poulie vis-à-vis', 'Écarté haltères', 'Pec deck']
    },
    {
        id: 'pecs-a-4',
        sessionId: 'pecs-a',
        slotId: 'A4',
        name: 'Pompes',
        order: 3,
        sets: 3,
        repsMin: 10,
        repsMax: 20,
        rest: 60,
        rir: 1,
        instructions: 'Finisher. Corps gainé, amplitude complète.',
        activeExercise: 'Pompes',
        pool: ['Pompes', 'Pompes déclinées', 'Pompes diamant']
    },

    // === BRAS B ===
    {
        id: 'bras-b-1',
        sessionId: 'bras-b',
        slotId: 'B1',
        name: 'Curl incliné haltères',
        order: 0,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        rir: 2,
        instructions: 'Banc incliné 45°. Étirement maximal du biceps en bas.',
        activeExercise: 'Curl incliné haltères',
        pool: ['Curl incliné haltères', 'Curl Larry Scott', 'Curl concentré']
    },
    {
        id: 'bras-b-2',
        sessionId: 'bras-b',
        slotId: 'B2',
        name: 'Curl poulie haute',
        order: 1,
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Position bras en croix. Contraction maximale.',
        activeExercise: 'Curl poulie haute',
        pool: ['Curl poulie haute', 'Curl araignée', 'Curl 21s']
    },
    {
        id: 'bras-b-3',
        sessionId: 'bras-b',
        slotId: 'B3',
        name: 'Barre au front',
        order: 2,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        rir: 2,
        instructions: 'Descente contrôlée vers le front. Coudes fixes.',
        activeExercise: 'Barre au front',
        pool: ['Barre au front', 'Extension haltère deux mains', 'Skull crusher haltères']
    },
    {
        id: 'bras-b-4',
        sessionId: 'bras-b',
        slotId: 'B4',
        name: 'Kickback poulie',
        order: 3,
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Coude fixe, extension complète. Squeeze en haut.',
        activeExercise: 'Kickback poulie',
        pool: ['Kickback poulie', 'Kickback haltère', 'Extension poulie unilat']
    },

    // === PECS B ===
    {
        id: 'pecs-b-1',
        sessionId: 'pecs-b',
        slotId: 'B1',
        name: 'Développé couché barre',
        order: 0,
        sets: 4,
        repsMin: 5,
        repsMax: 8,
        rest: 150,
        rir: 2,
        instructions: 'Prise moyenne. Descente contrôlée sur le bas des pecs. Poussée explosive.',
        activeExercise: 'Développé couché barre',
        pool: ['Développé couché barre', 'Développé couché haltères', 'Floor press']
    },
    {
        id: 'pecs-b-2',
        sessionId: 'pecs-b',
        slotId: 'B2',
        name: 'Développé décliné machine',
        order: 1,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        rir: 2,
        instructions: 'Focus sur le bas des pectoraux. Contraction en haut.',
        activeExercise: 'Développé décliné machine',
        pool: ['Développé décliné machine', 'Développé décliné haltères', 'Dips pecs']
    },
    {
        id: 'pecs-b-3',
        sessionId: 'pecs-b',
        slotId: 'B3',
        name: 'Écarté incliné haltères',
        order: 2,
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        rir: 2,
        instructions: 'Banc incliné 30°. Stretch profond, squeeze au centre.',
        activeExercise: 'Écarté incliné haltères',
        pool: ['Écarté incliné haltères', 'Écarté poulie basse', 'Écarté machine']
    },
    {
        id: 'pecs-b-4',
        sessionId: 'pecs-b',
        slotId: 'B4',
        name: 'Pullover poulie',
        order: 3,
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Étirement complet en haut. Contraction des pecs en bas.',
        activeExercise: 'Pullover poulie',
        pool: ['Pullover poulie', 'Pullover haltère', 'Pullover machine']
    }
];

async function initializeData() {
    const sessions = await db.getSessions();
    
    if (sessions.length === 0) {
        console.log('Initializing default data...');
        
        for (const session of INITIAL_SESSIONS) {
            await db.put('sessions', session);
        }
        
        for (const slot of INITIAL_SLOTS) {
            await db.put('slots', slot);
        }
        
        // Set initial next session
        await db.setSetting('nextSessionIndex', 0);
        await db.setSetting('xp', 0);
        await db.setSetting('weeklyWorkouts', 0);
        await db.setSetting('lastWorkoutDate', null);
        
        console.log('Default data initialized!');
    }
}
