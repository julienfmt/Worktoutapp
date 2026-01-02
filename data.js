// ===== Initial Data =====

// Liste des groupes musculaires disponibles
const MUSCLE_GROUPS = [
    { id: 'pectoraux', name: 'Pectoraux', icon: '🫁' },
    { id: 'dos', name: 'Dos', icon: '🔙' },
    { id: 'epaules', name: 'Épaules', icon: '🎯' },
    { id: 'biceps', name: 'Biceps', icon: '💪' },
    { id: 'triceps', name: 'Triceps', icon: '🦾' },
    { id: 'avant-bras', name: 'Avant-bras', icon: '🤜' },
    { id: 'quadriceps', name: 'Quadriceps', icon: '🦵' },
    { id: 'ischio-jambiers', name: 'Ischio-jambiers', icon: '🦿' },
    { id: 'mollets', name: 'Mollets', icon: '🦶' },
    { id: 'fessiers', name: 'Fessiers', icon: '🍑' },
    { id: 'abdominaux', name: 'Abdominaux', icon: '🎽' },
    { id: 'lombaires', name: 'Lombaires', icon: '⬇️' },
    { id: 'trapèzes', name: 'Trapèzes', icon: '🔺' },
    { id: 'coiffe', name: 'Coiffe des rotateurs', icon: '🔄' }
];

// Paramètres de périodisation par défaut
const DEFAULT_PERIODIZATION = {
    cycleLength: 5,           // Semaines par cycle (4 + 1 deload)
    deloadWeek: 5,            // Semaine de deload dans le cycle
    autoDeloadEnabled: true,  // Détection automatique du besoin de deload
    coldDayThreshold: 3,      // Nombre de "journées froides" avant suggestion deload
    deloadVolumeReduction: 50, // % de réduction du volume en deload
    deloadIntensityReduction: 10 // % de réduction de l'intensité en deload
};

// Seuils de volume hebdomadaire par muscle (séries effectives)
const VOLUME_THRESHOLDS = {
    minimum: 10,   // Minimum pour progresser
    optimal: 15,   // Zone optimale
    maximum: 20    // Maximum récupérable (risque surentraînement au-delà)
};

// ===== ADVANCED HYPERTROPHY ENGINE - Scientific Constants =====
// Based on: Israetel Volume Landmarks, Beardsley Effective Reps, Tuchscherer RPE

// Volume Landmarks per muscle group (sets/week) - Israetel Framework
// MV = Maintenance Volume, MEV = Minimum Effective, MAV = Maximum Adaptive, MRV = Maximum Recoverable
const VOLUME_LANDMARKS = {
    // Large muscle groups - higher volume tolerance
    'pectoraux':        { MV: 6,  MEV: 10, MAV: 16, MRV: 22, recoveryDays: 2 },
    'dos':              { MV: 8,  MEV: 12, MAV: 18, MRV: 25, recoveryDays: 2 },
    'quadriceps':       { MV: 6,  MEV: 10, MAV: 16, MRV: 20, recoveryDays: 3 },
    'ischio-jambiers':  { MV: 4,  MEV: 8,  MAV: 14, MRV: 18, recoveryDays: 2 },
    'fessiers':         { MV: 4,  MEV: 8,  MAV: 14, MRV: 18, recoveryDays: 3 },
    
    // Medium muscle groups
    'epaules':          { MV: 6,  MEV: 10, MAV: 16, MRV: 22, recoveryDays: 2 },
    'trapèzes':         { MV: 4,  MEV: 8,  MAV: 12, MRV: 18, recoveryDays: 2 },
    
    // Small muscle groups - lower volume but higher frequency tolerance
    'biceps':           { MV: 4,  MEV: 8,  MAV: 14, MRV: 20, recoveryDays: 1 },
    'triceps':          { MV: 4,  MEV: 8,  MAV: 14, MRV: 18, recoveryDays: 1 },
    'avant-bras':       { MV: 2,  MEV: 6,  MAV: 10, MRV: 14, recoveryDays: 1 },
    'mollets':          { MV: 6,  MEV: 10, MAV: 16, MRV: 20, recoveryDays: 1 },
    'abdominaux':       { MV: 4,  MEV: 8,  MAV: 16, MRV: 25, recoveryDays: 1 },
    'lombaires':        { MV: 2,  MEV: 4,  MAV: 8,  MRV: 12, recoveryDays: 2 },
    'coiffe':           { MV: 2,  MEV: 4,  MAV: 8,  MRV: 12, recoveryDays: 1 },
    
    // Default for unknown
    'default':          { MV: 4,  MEV: 8,  MAV: 14, MRV: 18, recoveryDays: 2 }
};

// RPE-based Volume Scoring (Effective Reps weighting) - Beardsley Framework
// Maps RPE to "hypertrophic value" of a set
const RPE_VOLUME_SCORE = {
    10:   1.2,   // Failure - maximal HTMU recruitment but high fatigue cost
    9.5:  1.1,   // Near failure - excellent stimulus
    9:    1.0,   // 1 RIR - peak stimulus-to-fatigue ratio
    8.5:  0.95,  // 1-2 RIR - excellent
    8:    0.85,  // 2 RIR - solid hypertrophy zone
    7.5:  0.75,  // 2-3 RIR - good accumulation
    7:    0.6,   // 3 RIR - threshold for effective volume
    6.5:  0.35,  // 3-4 RIR - partial recruitment
    6:    0.2,   // 4 RIR - maintenance only
    5.5:  0.1,   // Sub-threshold
    5:    0.0,   // Junk volume - discard
    // Below 5 = warm-up, no hypertrophic value
};

// Axial Loading Coefficients for SFR (Stimulus-to-Fatigue Ratio)
// Higher = more systemic fatigue per unit of stimulus
const AXIAL_LOADING_COEFFICIENTS = {
    // High axial load - spinal compression, high CNS demand
    'squat': 1.8,
    'deadlift': 2.0,
    'good morning': 1.7,
    'bent over row': 1.5,
    'barbell row': 1.5,
    
    // Moderate axial load
    'développé couché barre': 1.2,
    'développé couché haltères': 1.1,
    'développé incliné': 1.1,
    'overhead press': 1.4,
    'développé militaire': 1.4,
    'dips': 1.2,
    
    // Low axial load - machine/supported movements
    'leg press': 0.8,
    'hack squat': 0.9,
    'machine chest press': 0.7,
    'smith machine': 0.9,
    'leg extension': 0.5,
    'leg curl': 0.5,
    
    // Isolation - minimal systemic fatigue
    'curl': 0.4,
    'extension': 0.4,
    'lateral raise': 0.3,
    'écarté': 0.3,
    'pullover': 0.5,
    'face pull': 0.3,
    
    // Default based on type
    'compound_default': 1.0,
    'isolation_default': 0.4
};

// Fatigue Phenotype Classification
const FATIGUE_PHENOTYPES = {
    HIGH_RESPONDER: {     // Fast-twitch dominant, needs more recovery
        fatigueDecayRate: 'high',     // >25% rep drop across sets
        optimalSetRange: [3, 4],       // Fewer sets, higher intensity
        restMultiplier: 1.3,           // Longer rest periods
        volumeTolerance: 0.8,          // 80% of standard MRV
        repRangePreference: [5, 10]    // Lower reps, heavier weight
    },
    MODERATE_RESPONDER: { // Balanced fiber type
        fatigueDecayRate: 'moderate',  // 15-25% rep drop
        optimalSetRange: [3, 5],
        restMultiplier: 1.0,
        volumeTolerance: 1.0,
        repRangePreference: [6, 12]
    },
    LOW_RESPONDER: {      // Slow-twitch dominant, high work capacity
        fatigueDecayRate: 'low',       // <15% rep drop
        optimalSetRange: [4, 6],       // More sets tolerated
        restMultiplier: 0.8,           // Shorter rest OK
        volumeTolerance: 1.2,          // Can handle more volume
        repRangePreference: [8, 15]    // Higher reps work well
    }
};

// Progression States for Volume Adjustment Matrix (Israetel Logic)
const VOLUME_ADJUSTMENT_MATRIX = {
    // [Performance Trend, Average RPE] -> Action
    'improved_low':     { action: 'increase_load', setChange: 0, message: 'Performance up avec effort faible → Monte la charge' },
    'improved_moderate': { action: 'add_volume', setChange: 1, message: 'Sweet spot ! Ajoute 1 série pour continuer à progresser' },
    'improved_high':    { action: 'maintain', setChange: 0, message: 'Bonne progression mais effort max → Maintiens pour récupérer' },
    'stalled_low':      { action: 'increase_effort', setChange: 0, message: 'Pas de progression, effort insuffisant → Pousse plus fort !' },
    'stalled_moderate': { action: 'add_volume', setChange: 1, message: 'Plateau → Volume additionnel nécessaire' },
    'stalled_high':     { action: 'maintain', setChange: 0, message: 'Approche du MRV → Ne rajoute pas de fatigue' },
    'regressed_any':    { action: 'deload', setChange: -2, message: 'MRV dépassé → Deload immédiat pour surcompensation' }
};

// e1RM Lookup Table (RPE-based percentage of true 1RM)
// Row = Reps, Column = RPE (used for prescribing load from e1RM)
const E1RM_PERCENTAGE_TABLE = {
    1:  { 10: 100, 9.5: 98, 9: 96, 8.5: 94, 8: 92, 7.5: 91, 7: 89 },
    2:  { 10: 96,  9.5: 94, 9: 92, 8.5: 91, 8: 89, 7.5: 87, 7: 86 },
    3:  { 10: 93,  9.5: 91, 9: 89, 8.5: 87, 8: 86, 7.5: 84, 7: 82 },
    4:  { 10: 90,  9.5: 88, 9: 86, 8.5: 85, 8: 83, 7.5: 81, 7: 79 },
    5:  { 10: 87,  9.5: 86, 9: 84, 8.5: 82, 8: 81, 7.5: 79, 7: 77 },
    6:  { 10: 85,  9.5: 83, 9: 81, 8.5: 80, 8: 78, 7.5: 76, 7: 75 },
    7:  { 10: 82,  9.5: 81, 9: 79, 8.5: 77, 8: 76, 7.5: 74, 7: 72 },
    8:  { 10: 80,  9.5: 78, 9: 77, 8.5: 75, 8: 74, 7.5: 72, 7: 70 },
    9:  { 10: 78,  9.5: 76, 9: 75, 8.5: 73, 8: 72, 7.5: 70, 7: 68 },
    10: { 10: 75,  9.5: 74, 9: 72, 8.5: 71, 8: 70, 7.5: 68, 7: 67 },
    12: { 10: 70,  9.5: 69, 9: 68, 8.5: 66, 8: 65, 7.5: 63, 7: 62 },
    15: { 10: 65,  9.5: 64, 9: 62, 8.5: 61, 8: 60, 7.5: 58, 7: 57 },
    20: { 10: 58,  9.5: 57, 9: 55, 8.5: 54, 8: 53, 7.5: 51, 7: 50 }
};

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
        type: 'isolation',
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
        type: 'isolation',
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
        type: 'isolation',
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
        type: 'compound',
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
        type: 'compound',
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
        type: 'compound',
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
        type: 'isolation',
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
        type: 'compound',
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
        type: 'isolation',
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
        type: 'isolation',
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
        type: 'isolation',
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
        type: 'isolation',
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
        type: 'compound',
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
        type: 'compound',
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
        type: 'isolation',
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
        type: 'isolation',
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
        await db.setSetting('lastWorkoutDate', null);
        
        // Streak system settings
        await db.setSetting('streakCount', 0);
        await db.setSetting('shieldCount', 0);
        await db.setSetting('weekProtected', false);
        await db.setSetting('weeklyGoal', 3);
        await db.setSetting('lastWeekCheck', new Date().toISOString());
        
        console.log('Default data initialized!');
    }
}
