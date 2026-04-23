// ===== Shared Data & Defaults =====

// Liste des groupes musculaires disponibles
const MUSCLE_GROUPS = [
    { id: 'pectoraux', name: 'Pectoraux', iconKey: 'muscle-pectoraux' },
    { id: 'dos', name: 'Dos', iconKey: 'muscle-dos' },
    { id: 'epaules', name: 'Épaules', iconKey: 'muscle-epaules' },
    { id: 'biceps', name: 'Biceps', iconKey: 'muscle-biceps' },
    { id: 'triceps', name: 'Triceps', iconKey: 'muscle-triceps' },
    { id: 'avant-bras', name: 'Avant-bras', iconKey: 'muscle-avant-bras' },
    { id: 'quadriceps', name: 'Quadriceps', iconKey: 'muscle-quadriceps' },
    { id: 'ischio-jambiers', name: 'Ischio-jambiers', iconKey: 'muscle-ischio' },
    { id: 'mollets', name: 'Mollets', iconKey: 'muscle-mollets' },
    { id: 'fessiers', name: 'Fessiers', iconKey: 'muscle-fessiers' },
    { id: 'abdominaux', name: 'Abdominaux', iconKey: 'muscle-abdominaux' },
    { id: 'lombaires', name: 'Lombaires', iconKey: 'muscle-lombaires' },
    { id: 'trapèzes', name: 'Trapèzes', iconKey: 'muscle-trapezes' },
    { id: 'coiffe', name: 'Coiffe des rotateurs', iconKey: 'muscle-coiffe' }
];

const APP_ICON_SVGS = {
    'muscle-default': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 5.5C9 4.12 10.12 3 11.5 3h1C13.88 3 15 4.12 15 5.5V8l2 2v7.5A2.5 2.5 0 0 1 14.5 20h-5A2.5 2.5 0 0 1 7 17.5V10l2-2V5.5Z"/>
        <path d="M9.5 11.5h5M9.5 15.5h5"/>
    </svg>`,
    'muscle-pectoraux': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 4.5c0-1.1.9-2 2-2s2 .9 2 2V7l3 2.5v7.5A2 2 0 0 1 15 19H9a2 2 0 0 1-2-2V9.5L10 7V4.5Z"/>
        <path d="M8.5 10.5 12 13l3.5-2.5"/>
        <path d="M8.8 10.8 10 15.5M15.2 10.8 14 15.5"/>
    </svg>`,
    'muscle-dos': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 4.5c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v3l2.5 2.5V17a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7L9 7.5v-3Z"/>
        <path d="M12 7v10"/>
        <path d="M8.8 10.5 12 12l3.2-1.5"/>
        <path d="M9.3 15 12 16.5 14.7 15"/>
    </svg>`,
    'muscle-epaules': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 9a4 4 0 0 1 8 0"/>
        <path d="M6 12c0-1.66 1.34-3 3-3h1.5L12 11l1.5-2H15a3 3 0 0 1 3 3v4H6v-4Z"/>
        <path d="M8 8.5 6 10.5M16 8.5l2 2"/>
    </svg>`,
    'muscle-biceps': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 15c.4-2.7 2.1-4 4.2-4H14l1.2 1.4c1.6 0 2.8 1.2 2.8 2.8 0 2.1-1.7 3.8-3.8 3.8H9.8A2.8 2.8 0 0 1 7 16.2V12"/>
        <path d="M10.5 11V8.5c0-1.1.9-2 2-2h1"/>
        <path d="M7 12h2.2"/>
    </svg>`,
    'muscle-triceps': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 7.5V6a2 2 0 0 1 2-2h1"/>
        <path d="M9 7.5 7.5 12v4.2A2.8 2.8 0 0 0 10.3 19H15a3 3 0 0 0 3-3c0-1.6-1.3-2.9-2.9-2.9h-2.3L11 10.5"/>
        <path d="M11 10.5 9 7.5"/>
    </svg>`,
    'muscle-avant-bras': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 6.5 7.5 11v5.5A2.5 2.5 0 0 0 10 19h5"/>
        <path d="M9 6.5h4l2 2.5V14a2 2 0 0 1-2 2h-2.5"/>
        <path d="M15 19v-3.5"/>
        <path d="M17 19v-4"/>
    </svg>`,
    'muscle-quadriceps': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 4h4v4l1.5 4.5-1.7 6.5H10l-1.7-6.5L10 8V4Z"/>
        <path d="M10.5 9.5h3"/>
        <path d="M10 13h4"/>
    </svg>`,
    'muscle-ischio': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 4h4v4l1.5 4.5-1.7 6.5H10l-1.7-6.5L10 8V4Z"/>
        <path d="M9.5 9.5 12 11l2.5-1.5"/>
        <path d="M10 14.5 12 16l2-1.5"/>
    </svg>`,
    'muscle-mollets': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 4h4v4.2l-.8 2.8 1.8 2.2-1.6 5.8H10.6L9 13.2l1.8-2.2L10 8.2V4Z"/>
        <path d="M10.2 14h3.6"/>
        <path d="M10.7 16.8h2.6"/>
    </svg>`,
    'muscle-fessiers': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 5h6v4.5l1.5 2V16a3 3 0 0 1-3 3H10.5a3 3 0 0 1-3-3v-4.5L9 9.5V5Z"/>
        <path d="M12 10v8"/>
        <path d="M8.7 12c1 .6 2.1.9 3.3.9 1.2 0 2.3-.3 3.3-.9"/>
    </svg>`,
    'muscle-abdominaux': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 4.5c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2V8l2 2.5V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6.5L9 8V4.5Z"/>
        <path d="M10.2 9.8h3.6M10.2 13h3.6M10.2 16.2h3.6"/>
        <path d="M12 9.8v6.4"/>
    </svg>`,
    'muscle-lombaires': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 4.5c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2V8l2 2.5V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6.5L9 8V4.5Z"/>
        <path d="M9.5 15h5"/>
        <path d="M10.5 12.5h3"/>
        <path d="M8.5 16.8 12 18l3.5-1.2"/>
    </svg>`,
    'muscle-trapezes': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 6.5c0-2.2 1.8-4 4-4s4 1.8 4 4"/>
        <path d="M7 10.5 9.5 8H14.5L17 10.5V16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5.5Z"/>
        <path d="M9.5 8 12 11l2.5-3"/>
    </svg>`,
    'muscle-coiffe': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8.5 12a3.5 3.5 0 1 1 3.5 3.5"/>
        <path d="M12 8.5h3.5A3.5 3.5 0 1 1 12 12"/>
        <path d="M6 15.5 8.5 13M18 8.5 15.5 11"/>
    </svg>`,
    'recovery-checkin': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>
        <circle cx="12" cy="12" r="3.5"/>
    </svg>`,
    'recovery-info': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 10v5"/>
        <path d="M12 7h.01"/>
    </svg>`,
    'recovery-fresh': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
        <circle cx="12" cy="12" r="4"/>
    </svg>`,
    'recovery-ready': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="m8.5 12 2.2 2.2L15.8 9"/>
    </svg>`,
    'recovery-sore': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 3 6 14h5l-1 7 8-12h-5l0-6Z"/>
    </svg>`,
    'recovery-exhausted': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 7v5"/>
        <path d="M12 16h.01"/>
    </svg>`,
    'recovery-supercompensation': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 19V6"/>
        <path d="m7 11 5-5 5 5"/>
        <path d="M6 19h12"/>
    </svg>`,
    'recovery-refuel': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 13a7 7 0 1 0 2-4.9"/>
        <path d="M5 5v4h4"/>
        <path d="M12 8v4l3 2"/>
    </svg>`,
    'recovery-repair': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.5 4a5 5 0 0 0-4.7 6.7l-5.1 5.1a1.5 1.5 0 0 0 2.1 2.1l5.1-5.1A5 5 0 1 0 14.5 4Z"/>
    </svg>`
};

function escapeIconLabel(label = '') {
    return String(label)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderAppIcon(iconKey, options = {}) {
    const {
        className = '',
        size = 20,
        label = ''
    } = options;
    const svg = APP_ICON_SVGS[iconKey] || APP_ICON_SVGS['muscle-default'];
    const classes = ['app-icon', className].filter(Boolean).join(' ');
    const aria = label
        ? `role="img" aria-label="${escapeIconLabel(label)}"`
        : 'aria-hidden="true"';
    return `<span class="${classes}" style="--icon-size:${size}px" ${aria}>${svg}</span>`;
}

function getMuscleGroupMeta(muscleId) {
    return MUSCLE_GROUPS.find(group => group.id === muscleId) || {
        id: muscleId,
        name: muscleId,
        iconKey: 'muscle-default'
    };
}

function createExerciseLibraryEntry(config) {
    const variants = Array.isArray(config.variants) ? config.variants.filter(Boolean) : [];
    const aliases = Array.isArray(config.aliases) ? config.aliases.filter(Boolean) : [];
    const pool = Array.isArray(config.pool)
        ? config.pool.filter(Boolean)
        : [config.name, ...variants];

    return {
        name: config.name,
        category: config.category || 'fullbody',
        muscleGroup: config.muscleGroup || '',
        type: config.type || 'compound',
        equipment: config.equipment || '',
        sets: config.sets ?? 3,
        repsMin: config.repsMin ?? 8,
        repsMax: config.repsMax ?? 12,
        rest: config.rest ?? 90,
        rir: config.rir ?? 2,
        instructions: config.instructions || '',
        trackingMode: config.trackingMode || 'strength',
        progressionMode: config.progressionMode || null,
        loadingProfile: config.loadingProfile || null,
        aliases,
        pool: Array.from(new Set([config.name, ...pool]))
    };
}

const EXERCISE_LIBRARY = [
    createExerciseLibraryEntry({
        name: 'Développé couché barre',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 5,
        repsMax: 8,
        rest: 150,
        instructions: 'Omoplates serrées, trajectoire contrôlée, pieds ancrés.',
        variants: ['Développé couché haltères', 'Développé machine convergente'],
        aliases: ['bench press', 'barbell bench press']
    }),
    createExerciseLibraryEntry({
        name: 'Développé couché haltères',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'haltères',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Descente contrôlée, poitrine sortie, poussée fluide.',
        variants: ['Développé couché barre', 'Développé machine convergente'],
        aliases: ['dumbbell bench press']
    }),
    createExerciseLibraryEntry({
        name: 'Développé incliné barre',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Inclinaison modérée, focus haut des pectoraux.',
        variants: ['Développé incliné haltères', 'Développé incliné machine'],
        aliases: ['incline bench press']
    }),
    createExerciseLibraryEntry({
        name: 'Développé incliné haltères',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        instructions: 'Trajectoire naturelle, contrôle en bas, poussée propre.',
        variants: ['Développé incliné barre', 'Développé incliné machine'],
        aliases: ['incline dumbbell press']
    }),
    createExerciseLibraryEntry({
        name: 'Développé machine convergente',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Garde les épaules basses et contrôle le retour.',
        variants: ['Développé couché barre', 'Développé couché haltères'],
        aliases: ['chest press machine', 'hammer strength chest press']
    }),
    createExerciseLibraryEntry({
        name: 'Développé décliné machine',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Reste gainé et cherche la contraction en fin de poussée.',
        variants: ['Dips pecs', 'Développé couché barre']
    }),
    createExerciseLibraryEntry({
        name: 'Écarté poulie vis-à-vis',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Étirement contrôlé, légère flexion des coudes, squeeze au centre.',
        variants: ['Écarté haltères', 'Pec deck'],
        aliases: ['cable fly', 'crossover']
    }),
    createExerciseLibraryEntry({
        name: 'Écarté haltères',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Amplitude douce, ne casse pas les poignets.',
        variants: ['Écarté poulie vis-à-vis', 'Pec deck'],
        aliases: ['dumbbell fly']
    }),
    createExerciseLibraryEntry({
        name: 'Pec deck',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Cherche la contraction sans hausser les épaules.',
        variants: ['Écarté poulie vis-à-vis', 'Écarté haltères']
    }),
    createExerciseLibraryEntry({
        name: 'Pompes',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 10,
        repsMax: 20,
        rest: 60,
        rir: 1,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Corps gainé, poitrine vers le sol, extension complète.',
        variants: ['Pompes déclinées', 'Pompes diamant'],
        aliases: ['push up', 'push-up']
    }),
    createExerciseLibraryEntry({
        name: 'Tractions',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 5,
        repsMax: 10,
        rest: 120,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Tire les coudes vers les hanches, contrôle la descente.',
        variants: ['Tractions assistées', 'Tirage vertical prise large'],
        aliases: ['pull up', 'pull-up', 'pullup', 'tractions pronation']
    }),
    createExerciseLibraryEntry({
        name: 'Tractions assistées',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 6,
        repsMax: 12,
        rest: 90,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Réduis l’assistance progressivement et garde une amplitude complète.',
        variants: ['Tractions', 'Tirage vertical prise neutre'],
        aliases: ['assisted pull up', 'assisted chin up']
    }),
    createExerciseLibraryEntry({
        name: 'Tirage vertical prise large',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'poulie',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Poitrine sortie, tire vers le haut du torse, évite l’élan.',
        variants: ['Tirage vertical prise neutre', 'Tractions assistées'],
        aliases: ['lat pulldown']
    }),
    createExerciseLibraryEntry({
        name: 'Tirage vertical prise neutre',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'poulie',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Conduis les coudes vers les côtes et garde le buste stable.',
        variants: ['Tirage vertical prise large', 'Tractions assistées'],
        aliases: ['neutral grip pulldown']
    }),
    createExerciseLibraryEntry({
        name: 'Rowing barre',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Buste fixé, tirage vers le nombril, contrôle total.',
        variants: ['Rowing haltère unilatéral', 'Rowing poitrine appuyée'],
        aliases: ['barbell row', 'bent over row']
    }),
    createExerciseLibraryEntry({
        name: 'Rowing haltère unilatéral',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'haltère',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        instructions: 'Tire le coude haut et près du corps, sans tourner le buste.',
        variants: ['Rowing barre', 'Rowing poitrine appuyée'],
        aliases: ['one arm dumbbell row', 'single arm row']
    }),
    createExerciseLibraryEntry({
        name: 'Rowing poulie assise',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'poulie',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Ramène les poignées vers l’abdomen, poitrine haute.',
        variants: ['Rowing poitrine appuyée', 'Rowing barre'],
        aliases: ['seated row', 'cable row']
    }),
    createExerciseLibraryEntry({
        name: 'Rowing poitrine appuyée',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Appui ferme sur le banc, tirage régulier, aucun élan.',
        variants: ['Rowing poulie assise', 'Rowing haltère unilatéral'],
        aliases: ['chest supported row']
    }),
    createExerciseLibraryEntry({
        name: 'Pullover poulie',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Bras presque tendus, omoplates basses, grand étirement.',
        variants: ['Pullover haltère', 'Tirage vertical prise large']
    }),
    createExerciseLibraryEntry({
        name: 'Développé militaire',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Gainage fort, trajectoire verticale, tête qui passe sous la barre.',
        variants: ['Shoulder press machine', 'Développé haltères épaules'],
        aliases: ['overhead press', 'shoulder press']
    }),
    createExerciseLibraryEntry({
        name: 'Développé haltères épaules',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        instructions: 'Épaules basses, mouvement propre, amplitude contrôlée.',
        variants: ['Développé militaire', 'Shoulder press machine'],
        aliases: ['dumbbell shoulder press']
    }),
    createExerciseLibraryEntry({
        name: 'Shoulder press machine',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Presse verticale contrôlée, omoplates stables.',
        variants: ['Développé militaire', 'Développé haltères épaules']
    }),
    createExerciseLibraryEntry({
        name: 'Élévation latérale',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 60,
        rir: 1,
        instructions: 'Monte dans le plan de l’épaule, poignets neutres, contrôle en descente.',
        variants: ['Élévation latérale poulie', 'Oiseau poulie'],
        aliases: ['lateral raise']
    }),
    createExerciseLibraryEntry({
        name: 'Élévation latérale poulie',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Tension continue, amplitude propre, sans élan.',
        variants: ['Élévation latérale', 'Oiseau poulie'],
        aliases: ['cable lateral raise']
    }),
    createExerciseLibraryEntry({
        name: 'Oiseau poulie',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Tire avec l’arrière d’épaule, pas avec les trapèzes.',
        variants: ['Reverse pec deck', 'Face pull'],
        aliases: ['rear delt fly', 'reverse cable fly']
    }),
    createExerciseLibraryEntry({
        name: 'Face pull',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 18,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Coude haut, rotation externe, mouvement propre.',
        variants: ['Oiseau poulie', 'Reverse pec deck']
    }),
    createExerciseLibraryEntry({
        name: 'Curl barre EZ',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'barre',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        instructions: 'Coudes fixes, montée sans élan, descente contrôlée.',
        variants: ['Curl haltères', 'Curl poulie basse']
    }),
    createExerciseLibraryEntry({
        name: 'Curl haltères',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        instructions: 'Supination complète, contrôle du tempo.',
        variants: ['Curl barre EZ', 'Curl incliné haltères']
    }),
    createExerciseLibraryEntry({
        name: 'Curl incliné haltères',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        instructions: 'Laisse le bras s’étirer en bas, épaule stable.',
        variants: ['Curl barre EZ', 'Curl pupitre machine']
    }),
    createExerciseLibraryEntry({
        name: 'Curl marteau',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        instructions: 'Prise neutre, poignet solide, amplitude complète.',
        variants: ['Curl haltères', 'Curl corde marteau'],
        aliases: ['hammer curl']
    }),
    createExerciseLibraryEntry({
        name: 'Curl pupitre machine',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Ne décolle pas le bras du pupitre, squeeze en haut.',
        variants: ['Curl incliné haltères', 'Curl poulie basse'],
        aliases: ['preacher curl machine']
    }),
    createExerciseLibraryEntry({
        name: 'Curl poulie basse',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Tension constante, aucun élan de buste.',
        variants: ['Curl barre EZ', 'Curl pupitre machine'],
        aliases: ['cable curl']
    }),
    createExerciseLibraryEntry({
        name: 'Extension triceps poulie haute',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        loadingProfile: 'machine_stack',
        instructions: 'Coudes collés, extension complète, retour maîtrisé.',
        variants: ['Pushdown corde', 'Extension nuque haltère'],
        aliases: ['triceps pushdown']
    }),
    createExerciseLibraryEntry({
        name: 'Pushdown corde',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Sépare la corde en bas sans bouger les coudes.',
        variants: ['Extension triceps poulie haute', 'Barre au front'],
        aliases: ['rope pushdown', 'triceps rope pushdown']
    }),
    createExerciseLibraryEntry({
        name: 'Barre au front',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'barre',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        instructions: 'Descente vers le front ou derrière la tête, coudes fixes.',
        variants: ['Pushdown corde', 'Extension nuque haltère'],
        aliases: ['skull crusher']
    }),
    createExerciseLibraryEntry({
        name: 'Extension nuque haltère',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'haltère',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        instructions: 'Cherche l’étirement, garde les coudes serrés.',
        variants: ['Barre au front', 'Extension triceps poulie haute'],
        aliases: ['overhead triceps extension']
    }),
    createExerciseLibraryEntry({
        name: 'Dips machine',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Garde le buste stable et pousse jusqu’à l’extension.',
        variants: ['Dips poids du corps', 'Pushdown corde']
    }),
    createExerciseLibraryEntry({
        name: 'Dips poids du corps',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 6,
        repsMax: 12,
        rest: 120,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Descends proprement, épaules basses, extension complète.',
        variants: ['Dips machine', 'Pushdown corde'],
        aliases: ['dips']
    }),
    createExerciseLibraryEntry({
        name: 'Squat',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 5,
        repsMax: 8,
        rest: 150,
        instructions: 'Tronc gainé, genoux suivis, profondeur maîtrisée.',
        variants: ['Hack squat', 'Presse à cuisses'],
        aliases: ['back squat']
    }),
    createExerciseLibraryEntry({
        name: 'Hack squat',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'machine',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        loadingProfile: 'machine_stack',
        instructions: 'Contrôle la descente et pousse au milieu du pied.',
        variants: ['Squat', 'Presse à cuisses']
    }),
    createExerciseLibraryEntry({
        name: 'Presse à cuisses',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'machine',
        sets: 4,
        repsMin: 8,
        repsMax: 12,
        rest: 120,
        loadingProfile: 'plate_stack',
        instructions: 'Amplitude contrôlée, bas du dos collé, poussée fluide.',
        variants: ['Hack squat', 'Fentes marchées'],
        aliases: ['leg press']
    }),
    createExerciseLibraryEntry({
        name: 'Fentes marchées',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 10,
        repsMax: 16,
        rest: 90,
        instructions: 'Grand pas, buste haut, genou contrôlé.',
        variants: ['Split squat bulgare', 'Presse à cuisses'],
        aliases: ['walking lunges']
    }),
    createExerciseLibraryEntry({
        name: 'Split squat bulgare',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        instructions: 'Descente verticale, appui stable, amplitude franche.',
        variants: ['Fentes marchées', 'Hack squat'],
        aliases: ['bulgarian split squat']
    }),
    createExerciseLibraryEntry({
        name: 'Leg extension',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Pause légère en haut, descente lente, pas d’élan.'
    }),
    createExerciseLibraryEntry({
        name: 'Leg curl allongé',
        category: 'jambes',
        muscleGroup: 'ischio-jambiers',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Garde le bassin calé et contrôle la négative.',
        variants: ['Soulevé de terre roumain', 'Hip thrust'],
        aliases: ['lying leg curl']
    }),
    createExerciseLibraryEntry({
        name: 'Soulevé de terre roumain',
        category: 'jambes',
        muscleGroup: 'ischio-jambiers',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Hanches en arrière, tibias quasi fixes, grand étirement ischios.',
        variants: ['Hip thrust', 'Leg curl allongé'],
        aliases: ['romanian deadlift', 'rdl']
    }),
    createExerciseLibraryEntry({
        name: 'Hip thrust',
        category: 'jambes',
        muscleGroup: 'fessiers',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 8,
        repsMax: 12,
        rest: 120,
        instructions: 'Verrouille les fessiers en haut, menton rentré, tibias verticaux.',
        variants: ['Soulevé de terre roumain', 'Split squat bulgare']
    }),
    createExerciseLibraryEntry({
        name: 'Mollets debout machine',
        category: 'jambes',
        muscleGroup: 'mollets',
        type: 'isolation',
        equipment: 'machine',
        sets: 4,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Étirement complet en bas, pointe forte en haut.',
        aliases: ['standing calf raise']
    }),
    createExerciseLibraryEntry({
        name: 'Mollets assis machine',
        category: 'jambes',
        muscleGroup: 'mollets',
        type: 'isolation',
        equipment: 'machine',
        sets: 4,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Pause courte en haut, contrôle total en bas.',
        aliases: ['seated calf raise']
    }),
    createExerciseLibraryEntry({
        name: 'Crunch machine',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Enroule la colonne, souffle fort, amplitude contrôlée.',
        aliases: ['abdominal crunch machine']
    }),
    createExerciseLibraryEntry({
        name: 'Cable crunch',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Enroule le buste, hanches fixes, contrôle tout le long.'
    }),
    createExerciseLibraryEntry({
        name: 'Relevé de jambes suspendu',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 8,
        repsMax: 15,
        rest: 60,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Monte sans balancer, rétroversion du bassin en haut.',
        aliases: ['hanging leg raise']
    }),
    createExerciseLibraryEntry({
        name: 'Tapis de course',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 10,
        repsMax: 30,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. Note la vitesse ou l’inclinaison dans la charge si tu veux la suivre.',
        aliases: ['treadmill', 'course', 'marche inclinée']
    }),
    createExerciseLibraryEntry({
        name: 'Rameur',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 8,
        repsMax: 20,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. Tu peux mettre un niveau, une allure ou des watts dans la charge.',
        aliases: ['rower', 'rowing erg', 'erg']
    }),
    createExerciseLibraryEntry({
        name: 'Vélo assis',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 10,
        repsMax: 30,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. Charge = niveau ou résistance si tu veux la conserver.',
        aliases: ['bike', 'stationary bike', 'vélo']
    }),
    createExerciseLibraryEntry({
        name: 'Vélo spinning',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 10,
        repsMax: 30,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. La charge peut servir de résistance.',
        aliases: ['spin bike']
    }),
    createExerciseLibraryEntry({
        name: 'Vélo elliptique',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 10,
        repsMax: 30,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. Charge = niveau si tu veux le suivre.',
        aliases: ['elliptique', 'elliptical']
    }),
    createExerciseLibraryEntry({
        name: 'Stair climber',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 8,
        repsMax: 20,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. Charge = niveau ou vitesse.',
        aliases: ['stairmaster', 'escalier']
    }),
    createExerciseLibraryEntry({
        name: 'Air bike',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 8,
        repsMax: 20,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. Charge = intensité / niveau si tu la suis.',
        aliases: ['assault bike']
    }),
    createExerciseLibraryEntry({
        name: 'Ski erg',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 8,
        repsMax: 20,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. Charge = niveau, allure ou watts.',
        aliases: ['skierg']
    }),
    createExerciseLibraryEntry({
        name: 'Développé incliné machine',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Réglage du siège pour pousser vers le haut des pecs, omoplates serrées, retour contrôlé.',
        variants: ['Développé incliné haltères', 'Développé incliné barre', 'Développé machine convergente'],
        aliases: ['incline chest press machine']
    }),
    createExerciseLibraryEntry({
        name: 'Développé décliné haltères',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        instructions: 'Banc décliné léger, trajectoire stable, contrôle en bas et contraction volontaire en haut.',
        variants: ['Développé décliné machine', 'Dips pecs', 'Développé couché haltères']
    }),
    createExerciseLibraryEntry({
        name: 'Dips pecs',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 6,
        repsMax: 12,
        rest: 120,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Buste légèrement penché, épaules basses, descente maîtrisée et poussée complète.',
        variants: ['Dips poids du corps', 'Développé décliné machine', 'Pompes déclinées']
    }),
    createExerciseLibraryEntry({
        name: 'Écarté incliné haltères',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        rir: 1,
        instructions: 'Banc incliné autour de 30 degrés, coudes souples, grand étirement puis fermeture contrôlée.',
        variants: ['Écarté poulie basse', 'Écarté machine', 'Écarté poulie vis-à-vis']
    }),
    createExerciseLibraryEntry({
        name: 'Écarté poulie basse',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Poulies basses, trajectoire montante, tension continue et squeeze propre au centre.',
        variants: ['Écarté incliné haltères', 'Écarté poulie vis-à-vis', 'Pec deck']
    }),
    createExerciseLibraryEntry({
        name: 'Écarté machine',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Réglage pour ouvrir sans douleur, épaules basses, contraction nette sans rebond.',
        variants: ['Pec deck', 'Écarté poulie vis-à-vis', 'Écarté incliné haltères']
    }),
    createExerciseLibraryEntry({
        name: 'Pullover haltère',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'isolation',
        equipment: 'haltère',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        rir: 1,
        instructions: 'Bras presque tendus, cage stable, étirement contrôlé sans cambrer excessivement.',
        variants: ['Pullover poulie', 'Pullover machine', 'Tirage vertical prise large']
    }),
    createExerciseLibraryEntry({
        name: 'Pullover machine',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Épaules basses, tire avec les dorsaux, pause courte en contraction.',
        variants: ['Pullover poulie', 'Pullover haltère', 'Tirage vertical prise neutre']
    }),
    createExerciseLibraryEntry({
        name: 'Tirage vertical supination',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'poulie',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Prise supination, poitrine haute, tire les coudes vers le bas sans te balancer.',
        variants: ['Tirage vertical prise neutre', 'Tractions', 'Rowing poulie assise'],
        aliases: ['supinated pulldown']
    }),
    createExerciseLibraryEntry({
        name: 'Reverse pec deck',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Poitrine calée, coudes légèrement fléchis, ouvre avec l’arrière d’épaule sans hausser les trapèzes.',
        variants: ['Oiseau poulie', 'Face pull', 'Oiseau haltères'],
        aliases: ['rear delt machine']
    }),
    createExerciseLibraryEntry({
        name: 'Oiseau haltères',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 60,
        rir: 1,
        instructions: 'Buste incliné, nuque neutre, tire large avec les coudes et contrôle la descente.',
        variants: ['Oiseau poulie', 'Reverse pec deck', 'Face pull']
    }),
    createExerciseLibraryEntry({
        name: 'Élévation frontale',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Monte jusqu’à hauteur d’épaule, gainage solide, aucun élan du buste.',
        variants: ['Élévation latérale', 'Développé haltères épaules', 'Shoulder press machine']
    }),
    createExerciseLibraryEntry({
        name: 'Curl marteau poulie',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Corde en prise neutre, coudes fixes, tension continue et contrôle en bas.',
        variants: ['Curl marteau', 'Curl corde marteau', 'Curl poulie basse']
    }),
    createExerciseLibraryEntry({
        name: 'Curl inversé',
        category: 'bras',
        muscleGroup: 'avant-bras',
        type: 'isolation',
        equipment: 'barre',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Prise pronation, poignets neutres, coudes fixes et charge contrôlable.',
        variants: ['Curl marteau', 'Curl barre EZ', 'Curl poulie basse']
    }),
    createExerciseLibraryEntry({
        name: 'Curl Larry Scott',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'barre',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        rir: 1,
        instructions: 'Bras calés sur le pupitre, descente lente, ne verrouille pas brutalement les coudes.',
        variants: ['Curl pupitre machine', 'Curl barre EZ', 'Curl concentré']
    }),
    createExerciseLibraryEntry({
        name: 'Curl concentré',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'haltère',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Coude calé, amplitude complète, squeeze en haut sans tourner le buste.',
        variants: ['Curl incliné haltères', 'Curl haltères', 'Curl Larry Scott']
    }),
    createExerciseLibraryEntry({
        name: 'Curl poulie haute',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Bras ouverts, coudes à hauteur d’épaule, contraction en ramenant les mains vers la tête.',
        variants: ['Curl poulie basse', 'Curl araignée', 'Curl 21s']
    }),
    createExerciseLibraryEntry({
        name: 'Curl araignée',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Buste appuyé sur banc incliné, bras pendants, zéro élan et contraction forte.',
        variants: ['Curl incliné haltères', 'Curl concentré', 'Curl poulie haute']
    }),
    createExerciseLibraryEntry({
        name: 'Curl 21s',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'barre',
        sets: 2,
        repsMin: 21,
        repsMax: 21,
        rest: 90,
        rir: 2,
        instructions: '7 demi-reps basses, 7 demi-reps hautes, 7 reps complètes, charge légère et contrôle total.',
        variants: ['Curl barre EZ', 'Curl poulie haute', 'Curl haltères']
    }),
    createExerciseLibraryEntry({
        name: 'Extension barre V',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Coudes près du corps, extension complète, retour jusqu’à sentir l’étirement sans décoller les épaules.',
        variants: ['Extension triceps poulie haute', 'Pushdown corde', 'Barre au front']
    }),
    createExerciseLibraryEntry({
        name: 'Extension haltère deux mains',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'haltère',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        rir: 1,
        instructions: 'Haltère derrière la tête, coudes serrés, grand étirement puis extension contrôlée.',
        variants: ['Extension nuque haltère', 'Barre au front', 'Pushdown corde']
    }),
    createExerciseLibraryEntry({
        name: 'Skull crusher haltères',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        instructions: 'Haltères vers les tempes, coudes fixes, descente lente et extension sans claquer.',
        variants: ['Barre au front', 'Extension nuque haltère', 'Pushdown corde']
    }),
    createExerciseLibraryEntry({
        name: 'Kickback poulie',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Buste penché, coude fixe, extension derrière toi avec contraction nette en fin de mouvement.',
        variants: ['Kickback haltère', 'Extension poulie unilat', 'Pushdown corde']
    }),
    createExerciseLibraryEntry({
        name: 'Kickback haltère',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'haltère',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Épaule stable, coude haut, extension complète sans balancer le bras.',
        variants: ['Kickback poulie', 'Extension poulie unilat', 'Extension nuque haltère']
    }),
    createExerciseLibraryEntry({
        name: 'Extension poulie unilat',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Un bras à la fois, coude fixé, même amplitude et même charge des deux côtés.',
        variants: ['Kickback poulie', 'Extension triceps poulie haute', 'Pushdown corde']
    }),
    createExerciseLibraryEntry({
        name: 'Soulevé de terre',
        category: 'jambes',
        muscleGroup: 'ischio-jambiers',
        type: 'compound',
        equipment: 'barre',
        sets: 3,
        repsMin: 3,
        repsMax: 6,
        rest: 180,
        instructions: 'Barre proche du corps, gainage maximal, pousse le sol puis verrouille sans hyperextension.',
        variants: ['Soulevé de terre roumain', 'Hip thrust', 'Rowing barre'],
        aliases: ['deadlift']
    }),
    createExerciseLibraryEntry({
        name: 'Abduction machine',
        category: 'jambes',
        muscleGroup: 'fessiers',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Bassin calé, ouvre avec les fessiers, pause courte en ouverture et retour lent.',
        variants: ['Hip thrust', 'Split squat bulgare']
    }),
    createExerciseLibraryEntry({
        name: 'Adduction machine',
        category: 'jambes',
        muscleGroup: 'fessiers',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Bassin fixe, ferme les jambes sans élan, contrôle le retour.',
        variants: ['Abduction machine', 'Presse à cuisses']
    }),
    createExerciseLibraryEntry({
        name: 'Gainage',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'isolation',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 0.5,
        repsMax: 1,
        rest: 45,
        rir: 2,
        trackingMode: 'cardio',
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Utilise le champ reps comme durée en minutes, bassin en rétroversion et respiration contrôlée.',
        variants: ['Cable crunch', 'Relevé de jambes suspendu'],
        aliases: ['plank']
    }),

    // ===== Library Expansion =====
    createExerciseLibraryEntry({
        name: 'Développé couché smith',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'machine',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        loadingProfile: 'plate_stack',
        instructions: 'Banc bien placé sous la barre guidée, omoplates serrées, descente contrôlée et poussée stable.',
        variants: ['Développé couché barre', 'Développé machine convergente', 'Floor press'],
        aliases: ['smith bench press']
    }),
    createExerciseLibraryEntry({
        name: 'Développé incliné smith',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'machine',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        loadingProfile: 'plate_stack',
        instructions: 'Banc incliné modérément, trajectoire fixe, poitrine haute et contrôle complet du retour.',
        variants: ['Développé incliné barre', 'Développé incliné machine', 'Développé incliné haltères'],
        aliases: ['smith incline press']
    }),
    createExerciseLibraryEntry({
        name: 'Floor press',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'barre',
        sets: 3,
        repsMin: 5,
        repsMax: 8,
        rest: 120,
        instructions: 'Pose les triceps au sol à chaque rep, reste gainé et pousse sans rebond.',
        variants: ['Développé couché barre', 'Développé couché smith', 'Développé couché haltères']
    }),
    createExerciseLibraryEntry({
        name: 'Chest press unilatérale machine',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        loadingProfile: 'machine_stack',
        instructions: 'Travaille un bras à la fois, cage stable, trajectoire régulière et symétrie entre les côtés.',
        variants: ['Développé machine convergente', 'Développé couché haltères', 'Squeeze press haltères'],
        aliases: ['single arm chest press machine']
    }),
    createExerciseLibraryEntry({
        name: 'Squeeze press haltères',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        instructions: 'Presse les haltères l’un contre l’autre pendant tout le mouvement pour garder la tension sur les pecs.',
        variants: ['Développé couché haltères', 'Chest press unilatérale machine', 'Pompes inclinées'],
        aliases: ['hex press', 'dumbbell squeeze press']
    }),
    createExerciseLibraryEntry({
        name: 'Crossover haut vers bas',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Poulies hautes, légère flexion des coudes, ramène les mains vers le bas des pecs sans élan.',
        variants: ['Écarté poulie vis-à-vis', 'Écarté poulie basse', 'Écarté machine'],
        aliases: ['high to low cable fly']
    }),
    createExerciseLibraryEntry({
        name: 'Pompes inclinées',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Mains sur support surélevé, corps gainé, amplitude complète et rythme propre.',
        variants: ['Pompes', 'Pompes déclinées', 'Pompes sur anneaux'],
        aliases: ['incline push up', 'incline push-up']
    }),
    createExerciseLibraryEntry({
        name: 'Pompes sur anneaux',
        category: 'pectoraux',
        muscleGroup: 'pectoraux',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 8,
        repsMax: 15,
        rest: 75,
        rir: 2,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Anneaux stables, gainage fort, descente contrôlée et légère adduction en haut.',
        variants: ['Pompes', 'Dips pecs', 'Squeeze press haltères'],
        aliases: ['ring push up', 'ring push-up']
    }),
    createExerciseLibraryEntry({
        name: 'Tractions supination',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 5,
        repsMax: 10,
        rest: 120,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Prise supination, poitrine vers la barre, descente complète sans perdre la tension.',
        variants: ['Tractions', 'Tirage vertical supination', 'Tractions prise neutre'],
        aliases: ['chin up', 'chin-up', 'chinup']
    }),
    createExerciseLibraryEntry({
        name: 'Tractions prise neutre',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 5,
        repsMax: 10,
        rest: 120,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Prise neutre, épaules basses, tire les coudes vers les hanches sans balancer.',
        variants: ['Tractions', 'Tractions supination', 'Tirage vertical prise neutre'],
        aliases: ['neutral grip pull up', 'neutral grip pull-up']
    }),
    createExerciseLibraryEntry({
        name: 'Tirage bras tendus poulie',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Bras quasi tendus, grand étirement en haut, ramène la barre vers les hanches avec les dorsaux.',
        variants: ['Pullover poulie', 'Tirage vertical prise large', 'Pullover machine'],
        aliases: ['straight arm pulldown', 'straight-arm pulldown']
    }),
    createExerciseLibraryEntry({
        name: 'Tirage vertical unilatéral',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'poulie',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        loadingProfile: 'machine_stack',
        instructions: 'Un bras à la fois, buste stable, cherche l’amplitude complète et la symétrie.',
        variants: ['Tirage vertical prise neutre', 'Tractions assistées', 'Rowing unilatéral poulie'],
        aliases: ['single arm pulldown']
    }),
    createExerciseLibraryEntry({
        name: 'Rowing T-bar',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Appui solide, tire vers le bas du torse et garde le tronc verrouillé.',
        variants: ['Rowing barre', 'Rowing poitrine appuyée', 'Rowing machine convergente'],
        aliases: ['t-bar row']
    }),
    createExerciseLibraryEntry({
        name: 'Rowing unilatéral poulie',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'poulie',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        loadingProfile: 'machine_stack',
        instructions: 'Hanche stable, étire l’omoplate en avant puis tire le coude loin derrière.',
        variants: ['Rowing haltère unilatéral', 'Rowing poulie assise', 'Tirage vertical unilatéral'],
        aliases: ['single arm cable row']
    }),
    createExerciseLibraryEntry({
        name: 'Rowing machine convergente',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'machine_stack',
        instructions: 'Poitrine calée, trajectoire convergente, contraction volontaire en fin de tirage.',
        variants: ['Rowing poitrine appuyée', 'Rowing T-bar', 'Rowing poulie assise'],
        aliases: ['machine row', 'hammer row']
    }),
    createExerciseLibraryEntry({
        name: 'Seal row',
        category: 'dos',
        muscleGroup: 'dos',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Buste complètement supporté, laisse pendre la barre puis tire sans tricher.',
        variants: ['Rowing poitrine appuyée', 'Rowing barre', 'Rowing T-bar'],
        aliases: ['seal row barbell']
    }),
    createExerciseLibraryEntry({
        name: 'Rack pull',
        category: 'dos',
        muscleGroup: 'lombaires',
        type: 'compound',
        equipment: 'barre',
        sets: 3,
        repsMin: 4,
        repsMax: 8,
        rest: 150,
        instructions: 'Barre sur supports, gainage maximal, pousse les hanches vers l’avant sans hyperextension.',
        variants: ['Soulevé de terre', 'Good morning', 'Shrugs barre'],
        aliases: ['block pull']
    }),
    createExerciseLibraryEntry({
        name: 'Shrugs barre',
        category: 'dos',
        muscleGroup: 'trapèzes',
        type: 'isolation',
        equipment: 'barre',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        instructions: 'Monte les épaules droit vers le haut, courte pause en haut et descente contrôlée.',
        variants: ['Shrugs haltères', 'Rack pull', 'Farmer carry'],
        aliases: ['barbell shrug']
    }),
    createExerciseLibraryEntry({
        name: 'Shrugs haltères',
        category: 'dos',
        muscleGroup: 'trapèzes',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 60,
        rir: 1,
        instructions: 'Bras longs, épaules basses au départ, élévation verticale sans rouler les épaules.',
        variants: ['Shrugs barre', 'Farmer carry', 'Reverse pec deck'],
        aliases: ['dumbbell shrug']
    }),
    createExerciseLibraryEntry({
        name: 'Arnold press',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        instructions: 'Rotation fluide, buste stable, ne sacrifie pas l’amplitude pour la charge.',
        variants: ['Développé haltères épaules', 'Shoulder press machine', 'Landmine press'],
        aliases: ['arnold shoulder press']
    }),
    createExerciseLibraryEntry({
        name: 'Landmine press',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'compound',
        equipment: 'barre',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        instructions: 'Pousse en diagonale, cage verrouillée, bras libre pour stabiliser si besoin.',
        variants: ['Développé militaire', 'Arnold press', 'Développé haltères épaules'],
        aliases: ['landmine shoulder press']
    }),
    createExerciseLibraryEntry({
        name: 'Élévation latérale machine',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Reste calé sur la machine, monte dans le plan de l’épaule et contrôle tout le retour.',
        variants: ['Élévation latérale', 'Élévation latérale poulie', 'Élévation Y poulie'],
        aliases: ['machine lateral raise']
    }),
    createExerciseLibraryEntry({
        name: 'Élévation Y poulie',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 12,
        repsMax: 18,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Monte dans un angle en Y, scapulas stables, tension continue et mouvement propre.',
        variants: ['Élévation latérale poulie', 'Face pull', 'Rotation externe poulie'],
        aliases: ['cable y raise', 'y raise']
    }),
    createExerciseLibraryEntry({
        name: 'Rowing arrière d’épaule',
        category: 'epaules',
        muscleGroup: 'epaules',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Buste incliné, coudes écartés, tire avec l’arrière d’épaule et non avec les trapèzes.',
        variants: ['Oiseau haltères', 'Oiseau poulie', 'Reverse pec deck'],
        aliases: ['rear delt row']
    }),
    createExerciseLibraryEntry({
        name: 'Rotation externe poulie',
        category: 'epaules',
        muscleGroup: 'coiffe',
        type: 'isolation',
        equipment: 'poulie',
        sets: 2,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 2,
        loadingProfile: 'machine_stack',
        instructions: 'Coude calé contre le corps ou à 90 degrés selon la variante, charge légère et contrôle maximal.',
        variants: ['Rotation externe haltère', 'Face pull', 'Cuban press'],
        aliases: ['cable external rotation']
    }),
    createExerciseLibraryEntry({
        name: 'Rotation externe haltère',
        category: 'epaules',
        muscleGroup: 'coiffe',
        type: 'isolation',
        equipment: 'haltère',
        sets: 2,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 2,
        instructions: 'Couché sur le côté ou coude calé, petite charge, amplitude lente et sans compensation.',
        variants: ['Rotation externe poulie', 'Cuban press', 'Face pull'],
        aliases: ['side lying external rotation']
    }),
    createExerciseLibraryEntry({
        name: 'Cuban press',
        category: 'epaules',
        muscleGroup: 'coiffe',
        type: 'compound',
        equipment: 'haltères',
        sets: 2,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 2,
        instructions: 'Charge très légère, rotation externe propre puis poussée au-dessus de la tête sans tricher.',
        variants: ['Rotation externe poulie', 'Face pull', 'Arnold press']
    }),
    createExerciseLibraryEntry({
        name: 'Bayesian curl',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Dos à la poulie, bras légèrement derrière le corps, supination complète et étirement franc.',
        variants: ['Curl incliné haltères', 'Curl poulie basse', 'Curl concentré'],
        aliases: ['bayesian cable curl']
    }),
    createExerciseLibraryEntry({
        name: 'Curl corde marteau',
        category: 'bras',
        muscleGroup: 'biceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Prise neutre sur corde, coudes fixes, amène les mains vers les épaules sans avancer les coudes.',
        variants: ['Curl marteau', 'Curl marteau poulie', 'Curl inversé'],
        aliases: ['rope hammer curl']
    }),
    createExerciseLibraryEntry({
        name: 'Zottman curl',
        category: 'bras',
        muscleGroup: 'avant-bras',
        type: 'isolation',
        equipment: 'haltères',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        instructions: 'Monte en supination, redescends en pronation, contrôle le tempo sans te balancer.',
        variants: ['Curl haltères', 'Curl inversé', 'Wrist curl barre'],
        aliases: ['zottman curl dumbbell']
    }),
    createExerciseLibraryEntry({
        name: 'Wrist curl barre',
        category: 'bras',
        muscleGroup: 'avant-bras',
        type: 'isolation',
        equipment: 'barre',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        instructions: 'Avant-bras calés, déroule puis fléchis les poignets avec contrôle et amplitude complète.',
        variants: ['Reverse wrist curl', 'Curl inversé', 'Farmer carry'],
        aliases: ['barbell wrist curl']
    }),
    createExerciseLibraryEntry({
        name: 'Reverse wrist curl',
        category: 'bras',
        muscleGroup: 'avant-bras',
        type: 'isolation',
        equipment: 'barre',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        instructions: 'Paumes vers le sol, monte les poignets sans décoller les avant-bras du support.',
        variants: ['Wrist curl barre', 'Curl inversé', 'Farmer carry'],
        aliases: ['reverse barbell wrist curl']
    }),
    createExerciseLibraryEntry({
        name: 'Close-grip bench press',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 5,
        repsMax: 8,
        rest: 120,
        instructions: 'Prise serrée mais confortable, coudes sous la barre, touche bas du sternum et pousse fort.',
        variants: ['Développé couché barre', 'Barre au front', 'JM press'],
        aliases: ['développé couché prise serrée']
    }),
    createExerciseLibraryEntry({
        name: 'Dips entre bancs',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 8,
        repsMax: 15,
        rest: 75,
        rir: 1,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Épaules basses, descente contrôlée et extension complète sans verrouiller brutalement.',
        variants: ['Dips poids du corps', 'Dips machine', 'Pompes diamant']
    }),
    createExerciseLibraryEntry({
        name: 'Extension corde au-dessus de la tête',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Poulie haute, coudes stables, grand étirement derrière la tête puis extension complète.',
        variants: ['Extension haltère deux mains', 'Pushdown corde', 'Extension nuque haltère'],
        aliases: ['overhead rope extension', 'rope overhead triceps extension']
    }),
    createExerciseLibraryEntry({
        name: 'JM press',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'compound',
        equipment: 'barre',
        sets: 3,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Descente contrôlée entre développé serré et barre au front, coudes sous contrôle et charge maîtrisée.',
        variants: ['Close-grip bench press', 'Barre au front', 'Skull crusher haltères']
    }),
    createExerciseLibraryEntry({
        name: 'Pompes diamant',
        category: 'bras',
        muscleGroup: 'triceps',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 8,
        repsMax: 15,
        rest: 60,
        rir: 1,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Mains rapprochées sous la poitrine, gainage solide, amplitude propre et coudes proches du corps.',
        variants: ['Pompes', 'Dips entre bancs', 'Pushdown corde'],
        aliases: ['diamond push up', 'diamond push-up']
    }),
    createExerciseLibraryEntry({
        name: 'Farmer carry',
        category: 'bras',
        muscleGroup: 'avant-bras',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 0.5,
        repsMax: 1.5,
        rest: 60,
        rir: 2,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes, marche droit, grip fort et épaules basses.',
        variants: ['Shrugs haltères', 'Wrist curl barre', 'Reverse wrist curl'],
        aliases: ['farmer walk']
    }),
    createExerciseLibraryEntry({
        name: 'Front squat',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'barre',
        sets: 4,
        repsMin: 4,
        repsMax: 8,
        rest: 150,
        instructions: 'Coudes hauts, torse vertical, descend sous contrôle et pousse le milieu du pied.',
        variants: ['Squat', 'Hack squat', 'Goblet squat'],
        aliases: ['front squat barbell']
    }),
    createExerciseLibraryEntry({
        name: 'Goblet squat',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'haltère',
        sets: 3,
        repsMin: 8,
        repsMax: 15,
        rest: 75,
        instructions: 'Charge contre la poitrine, torse haut, amplitude maximale et genoux suivis.',
        variants: ['Front squat', 'Squat', 'Sissy squat'],
        aliases: ['dumbbell goblet squat']
    }),
    createExerciseLibraryEntry({
        name: 'Smith squat',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'machine',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        loadingProfile: 'plate_stack',
        instructions: 'Place les pieds selon la dominante voulue, descente contrôlée et tension continue.',
        variants: ['Hack squat', 'Squat', 'Pendulum squat'],
        aliases: ['smith machine squat']
    }),
    createExerciseLibraryEntry({
        name: 'Pendulum squat',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'machine',
        sets: 4,
        repsMin: 8,
        repsMax: 12,
        rest: 120,
        loadingProfile: 'plate_stack',
        instructions: 'Reste calé dans la machine, descends profond et pousse sans verrouiller sèchement.',
        variants: ['Hack squat', 'Presse à cuisses', 'Smith squat']
    }),
    createExerciseLibraryEntry({
        name: 'Sissy squat',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'isolation',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 2,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Garde les hanches ouvertes, genoux avancés et contrôle toute l’amplitude sans forcer les articulations.',
        variants: ['Goblet squat', 'Leg extension', 'Fentes arrière'],
        aliases: ['bodyweight sissy squat']
    }),
    createExerciseLibraryEntry({
        name: 'Fentes arrière',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        instructions: 'Recule proprement, buste haut, pousse avec la jambe avant et garde le bassin stable.',
        variants: ['Fentes marchées', 'Split squat bulgare', 'Step-up'],
        aliases: ['reverse lunge']
    }),
    createExerciseLibraryEntry({
        name: 'Step-up',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'haltères',
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        rest: 75,
        instructions: 'Monte sur un support stable, pousse avec la jambe du dessus et redescends sans te laisser tomber.',
        variants: ['Fentes arrière', 'Split squat bulgare', 'Leg press unilatérale'],
        aliases: ['step up', 'step-up']
    }),
    createExerciseLibraryEntry({
        name: 'Leg press unilatérale',
        category: 'jambes',
        muscleGroup: 'quadriceps',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        loadingProfile: 'plate_stack',
        instructions: 'Une jambe à la fois, bassin stable, descente profonde contrôlée et poussée fluide.',
        variants: ['Presse à cuisses', 'Step-up', 'Split squat bulgare'],
        aliases: ['single leg press']
    }),
    createExerciseLibraryEntry({
        name: 'Leg curl assis',
        category: 'jambes',
        muscleGroup: 'ischio-jambiers',
        type: 'isolation',
        equipment: 'machine',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        loadingProfile: 'machine_stack',
        instructions: 'Bassin calé, dorsiflexion légère des chevilles et contrôle de la négative.',
        variants: ['Leg curl allongé', 'Nordic curl', 'Soulevé de terre roumain'],
        aliases: ['seated leg curl']
    }),
    createExerciseLibraryEntry({
        name: 'Nordic curl',
        category: 'jambes',
        muscleGroup: 'ischio-jambiers',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 4,
        repsMax: 8,
        rest: 120,
        rir: 2,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Freine la descente le plus longtemps possible, pousse légèrement avec les mains si nécessaire au retour.',
        variants: ['Leg curl assis', 'Leg curl allongé', 'Soulevé de terre jambes tendues'],
        aliases: ['nordic ham curl']
    }),
    createExerciseLibraryEntry({
        name: 'Soulevé de terre jambes tendues',
        category: 'jambes',
        muscleGroup: 'ischio-jambiers',
        type: 'compound',
        equipment: 'barre',
        sets: 3,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Genoux peu fléchis, hanches loin derrière, grand étirement des ischios et dos neutre.',
        variants: ['Soulevé de terre roumain', 'Nordic curl', 'Good morning'],
        aliases: ['stiff leg deadlift', 'stiff-leg deadlift']
    }),
    createExerciseLibraryEntry({
        name: 'Good morning',
        category: 'jambes',
        muscleGroup: 'lombaires',
        type: 'compound',
        equipment: 'barre',
        sets: 3,
        repsMin: 6,
        repsMax: 10,
        rest: 120,
        instructions: 'Barre stable sur le dos, légère flexion des genoux, bascule des hanches et gainage fort.',
        variants: ['Soulevé de terre roumain', 'Back extension 45°', 'Rack pull']
    }),
    createExerciseLibraryEntry({
        name: 'Hip thrust machine',
        category: 'jambes',
        muscleGroup: 'fessiers',
        type: 'compound',
        equipment: 'machine',
        sets: 4,
        repsMin: 8,
        repsMax: 12,
        rest: 90,
        loadingProfile: 'plate_stack',
        instructions: 'Bassin verrouillé, menton rentré, pause franche en haut et retour contrôlé.',
        variants: ['Hip thrust', 'Glute bridge', 'Abduction machine'],
        aliases: ['machine hip thrust']
    }),
    createExerciseLibraryEntry({
        name: 'Glute bridge',
        category: 'jambes',
        muscleGroup: 'fessiers',
        type: 'compound',
        equipment: 'barre',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 75,
        instructions: 'Amplitude plus courte que le hip thrust, grand contrôle et contraction maximale des fessiers.',
        variants: ['Hip thrust', 'Hip thrust machine', 'Abduction machine'],
        aliases: ['barbell glute bridge']
    }),
    createExerciseLibraryEntry({
        name: 'Back extension 45°',
        category: 'jambes',
        muscleGroup: 'lombaires',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 2,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Colonne neutre, remonte en contractant fessiers et lombaires sans casser la nuque.',
        variants: ['Reverse hyper', 'Good morning', 'Soulevé de terre roumain'],
        aliases: ['45 degree back extension', 'hyperextension']
    }),
    createExerciseLibraryEntry({
        name: 'Reverse hyper',
        category: 'jambes',
        muscleGroup: 'lombaires',
        type: 'compound',
        equipment: 'machine',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 60,
        rir: 1,
        loadingProfile: 'plate_stack',
        instructions: 'Monte avec les hanches, pas avec l’élan, et contrôle la redescente sous la ligne du corps.',
        variants: ['Back extension 45°', 'Good morning', 'Hip thrust'],
        aliases: ['reverse hyperextension']
    }),
    createExerciseLibraryEntry({
        name: 'Donkey calf raise',
        category: 'jambes',
        muscleGroup: 'mollets',
        type: 'isolation',
        equipment: 'machine',
        sets: 4,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        loadingProfile: 'plate_stack',
        instructions: 'Étirement complet en bas, montée explosive contrôlée et pause courte en haut.',
        variants: ['Mollets debout machine', 'Mollets assis machine', 'Tibialis raise'],
        aliases: ['donkey calf raise machine']
    }),
    createExerciseLibraryEntry({
        name: 'Tibialis raise',
        category: 'jambes',
        muscleGroup: 'mollets',
        type: 'isolation',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 15,
        repsMax: 25,
        rest: 45,
        rir: 1,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Talons au sol, relève les pointes au maximum et contrôle le retour.',
        variants: ['Mollets debout machine', 'Mollets assis machine', 'Donkey calf raise'],
        aliases: ['tib raise', 'tibialis anterior raise']
    }),
    createExerciseLibraryEntry({
        name: 'Ab wheel',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 6,
        repsMax: 12,
        rest: 60,
        rir: 2,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Rétroversion du bassin, va aussi loin que tu peux sans cambrer, retour contrôlé.',
        variants: ['Gainage', 'Dead bug', 'Pallof press'],
        aliases: ['ab rollout', 'ab wheel rollout']
    }),
    createExerciseLibraryEntry({
        name: 'Relevé de genoux suspendu',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'compound',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 60,
        rir: 1,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Monte les genoux vers la poitrine sans balancer, contrôle l’étirement en bas.',
        variants: ['Relevé de jambes suspendu', 'Crunch inversé', 'Gainage'],
        aliases: ['hanging knee raise']
    }),
    createExerciseLibraryEntry({
        name: 'Crunch inversé',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'isolation',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 12,
        repsMax: 20,
        rest: 45,
        rir: 1,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Enroule le bassin vers les côtes, contrôle la descente et évite l’élan des jambes.',
        variants: ['Relevé de genoux suspendu', 'Cable crunch', 'Dead bug'],
        aliases: ['reverse crunch']
    }),
    createExerciseLibraryEntry({
        name: 'Gainage latéral',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'isolation',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 0.3,
        repsMax: 1,
        rest: 45,
        rir: 2,
        trackingMode: 'cardio',
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Utilise le champ reps comme durée en minutes, corps aligné et bassin haut tout du long.',
        variants: ['Gainage', 'Pallof press', 'Dead bug'],
        aliases: ['side plank']
    }),
    createExerciseLibraryEntry({
        name: 'Pallof press',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'isolation',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 45,
        rir: 2,
        loadingProfile: 'machine_stack',
        instructions: 'Presse la poignée devant toi sans laisser le buste tourner, respiration contrôlée.',
        variants: ['Gainage latéral', 'Woodchopper poulie', 'Dead bug'],
        aliases: ['pallof press cable']
    }),
    createExerciseLibraryEntry({
        name: 'Woodchopper poulie',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'compound',
        equipment: 'poulie',
        sets: 3,
        repsMin: 10,
        repsMax: 15,
        rest: 45,
        rir: 2,
        loadingProfile: 'machine_stack',
        instructions: 'Rotation contrôlée du tronc, bassin stable et trajectoire diagonale constante.',
        variants: ['Pallof press', 'Cable crunch', 'Gainage latéral'],
        aliases: ['cable woodchopper', 'wood chop']
    }),
    createExerciseLibraryEntry({
        name: 'Dead bug',
        category: 'abdominaux',
        muscleGroup: 'abdominaux',
        type: 'isolation',
        equipment: 'poids du corps',
        sets: 3,
        repsMin: 8,
        repsMax: 16,
        rest: 45,
        rir: 2,
        progressionMode: 'bodyweight',
        loadingProfile: 'bodyweight',
        instructions: 'Lombaires collées au sol, expire en allongeant bras et jambe opposés sans perdre le gainage.',
        variants: ['Gainage', 'Ab wheel', 'Pallof press']
    }),
    createExerciseLibraryEntry({
        name: 'Course extérieure',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 10,
        repsMax: 45,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. La charge peut servir d’allure, de vitesse moyenne ou de distance.',
        aliases: ['running', 'outdoor run', 'jogging']
    }),
    createExerciseLibraryEntry({
        name: 'Corde à sauter',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 5,
        repsMax: 20,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. La charge peut suivre le rythme ou le nombre de tours.',
        aliases: ['jump rope', 'skipping rope']
    }),
    createExerciseLibraryEntry({
        name: 'Prowler push',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 5,
        repsMax: 15,
        rest: 0,
        rir: 4,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. La charge sert à noter le poids du traîneau ou l’intensité.',
        aliases: ['sled push', 'prowler sled']
    }),
    createExerciseLibraryEntry({
        name: 'Natation',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 10,
        repsMax: 45,
        rest: 0,
        rir: 3,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. La charge peut servir à noter distance, allure ou type de nage.',
        aliases: ['swimming', 'swim']
    }),
    createExerciseLibraryEntry({
        name: 'Marche rapide',
        category: 'cardio',
        equipment: 'cardio',
        sets: 1,
        repsMin: 10,
        repsMax: 45,
        rest: 0,
        rir: 2,
        trackingMode: 'cardio',
        instructions: 'Utilise le champ reps comme durée en minutes. La charge peut noter allure, pente ou distance.',
        aliases: ['brisk walk', 'walking']
    })
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

// ===== LOCAL MUSCLE SORENESS (LMS) - Reactive Volume System =====
// Based on: Israetel MRV modulation, tissue recovery markers
// LMS serves as proxy for local recovery status (distinct from systemic RPE)

const LMS_SCALE = {
    0: {
        label: 'Frais',
        iconKey: 'recovery-fresh',
        description: 'Aucune courbature, muscle prêt',
        interpretation: 'Récupération complète. Tissu prêt pour stimulus maximal.',
        mrvStatus: 'below_mrv'
    },
    1: {
        label: 'Prêt',
        iconKey: 'recovery-ready',
        description: 'Légère raideur, disparaît à l\'échauffement',
        interpretation: 'Timing optimal. Remodelage tissulaire probablement terminé.',
        mrvStatus: 'at_mav'
    },
    2: {
        label: 'Courbaturé',
        iconKey: 'recovery-sore',
        description: 'Douleur distincte, persiste à l\'échauffement',
        interpretation: 'Récupération incomplète. Dommages encore en réparation.',
        mrvStatus: 'approaching_mrv'
    },
    3: {
        label: 'Épuisé',
        iconKey: 'recovery-exhausted',
        description: 'Douloureux au toucher ou au mouvement',
        interpretation: 'Échec de récupération. Dommages excessifs.',
        mrvStatus: 'exceeded_mrv'
    }
};

function renderRecoveryIcon(score, options = {}) {
    const level = LMS_SCALE[score];
    return renderAppIcon(level?.iconKey || 'recovery-ready', {
        label: level?.label || 'Récupération',
        ...options
    });
}

// Volume modifiers based on LMS score and performance trend
// Key insight: LMS modulates MRV dynamically, not linearly
const LMS_VOLUME_MODIFIERS = {
    // LMS 0 (Fresh): Stay optimistic, but keep the plan stable by default
    0: {
        improved: { setChange: 0, loadChange: 2.5, message: 'Très bonne récupération. Le coach peut proposer un petit cran de charge.' },
        stable:   { setChange: 0, loadChange: 0, message: 'Bonne récupération. On garde le plan prévu.' },
        regressed:{ setChange: 0, loadChange: 0, message: 'Tu sembles frais, mais on reste prudent vu la tendance récente.' }
    },
    // LMS 1 (Ready): True neutral baseline
    1: {
        improved: { setChange: 0, loadChange: 0, message: 'Prêt. Le plan du jour reste la référence.' },
        stable:   { setChange: 0, loadChange: 0, message: 'Prêt. Continue normalement.' },
        regressed:{ setChange: 0, loadChange: 0, message: 'Prêt malgré une tendance plus moyenne. On ne coupe pas le volume pour autant.' }
    },
    // LMS 2 (Sore): Prefer rest / quality adjustments over volume cuts
    2: {
        improved: { setChange: 0, loadChange: 0, message: 'Courbaturé mais fonctionnel. Le coach privilégie surtout la qualité et le repos.' },
        stable:   { setChange: 0, loadChange: 0, message: 'Courbatures présentes. Le plan reste disponible, avec une lecture plus prudente.' },
        regressed:{ setChange: 0, loadChange: -2.5, message: 'Courbatures + tendance moyenne. Le coach peut suggérer un léger allègement.' }
    },
    // LMS 3 (Wrecked): Only clear readiness warning should suggest less volume
    3: {
        improved: { setChange: -1, loadChange: -2.5, message: 'Très courbaturé. Le coach peut suggérer une série de moins.' },
        stable:   { setChange: -1, loadChange: -5, message: 'Muscle épuisé. Priorité à la qualité, pas au volume.' },
        regressed:{ setChange: -1, loadChange: -5, message: 'Récupération nécessaire. Le coach peut proposer une séance allégée.' }
    }
};

// Recovery timeline estimation (hours) based on volume and intensity
const RECOVERY_ESTIMATES = {
    low_volume_low_intensity: 24,    // 1-2 sets, RPE < 7
    low_volume_high_intensity: 36,   // 1-2 sets, RPE >= 8
    moderate_volume: 48,             // 3-4 sets, RPE 7-9
    high_volume: 72,                 // 5+ sets or RPE 10
    exceeded_mrv: 96                 // LMS 3 detected
};

// Adaptation bar thresholds (percentage of full recovery)
const ADAPTATION_PHASES = {
    repair: { min: 0, max: 50, label: 'Réparation', color: '#ef4444', icon: '🔧' },
    refuel: { min: 50, max: 85, label: 'Rechargement', color: '#f59e0b', icon: '⚡' },
    supercompensation: { min: 85, max: 110, label: 'Supercompensation', color: '#22c55e', icon: '🚀' },
    detraining: { min: 110, max: 200, label: 'Perte potentielle', color: '#94a3b8', icon: '📉' }
};

// ===== EXERCISE MUSCLE MAPPING (Primary vs Secondary) =====
// For precise LMS application: only PRIMARY muscles affect volume significantly
// Secondary muscles get reduced LMS weight (50% impact)
const EXERCISE_MUSCLE_MAP = {
    // CHEST exercises
    'développé couché': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'développé barre plat': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'développé haltères plat': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'développé smith plat': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'développé incliné barre': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'développé incliné haltères': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'développé incliné smith': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'incline chest press machine': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'incline chest press machine convergente': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'chest press machine': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'chest press machine convergente': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'hammer strength chest press': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'decline machine press': { primary: ['pectoraux'], secondary: ['triceps'] },
    'press convergent': { primary: ['pectoraux'], secondary: ['epaules', 'triceps'] },
    'écarté poulie basse': { primary: ['pectoraux'], secondary: [] },
    'écarté poulie haute': { primary: ['pectoraux'], secondary: [] },
    'high-to-low cable fly': { primary: ['pectoraux'], secondary: [] },
    'low-to-high cable fly': { primary: ['pectoraux'], secondary: [] },
    'incline cable fly': { primary: ['pectoraux'], secondary: [] },
    'incline db fly': { primary: ['pectoraux'], secondary: [] },
    'incline pec deck': { primary: ['pectoraux'], secondary: [] },
    'dips assistés': { primary: ['pectoraux', 'triceps'], secondary: ['epaules'] },
    'dips poids du corps': { primary: ['pectoraux', 'triceps'], secondary: ['epaules'] },
    'dips triceps focus': { primary: ['triceps'], secondary: ['pectoraux', 'epaules'] },
    'machine dips': { primary: ['pectoraux', 'triceps'], secondary: ['epaules'] },
    'close-grip push-up': { primary: ['triceps'], secondary: ['pectoraux', 'epaules'] },
    'tractions assistées': { primary: ['dos'], secondary: ['biceps'] },
    'shoulder press machine': { primary: ['epaules'], secondary: ['triceps'] },
    'shoulder press machine optionnel': { primary: ['epaules'], secondary: ['triceps'] },
    'smith shoulder press': { primary: ['epaules'], secondary: ['triceps'] },
    'db shoulder press': { primary: ['epaules'], secondary: ['triceps'] },
    'landmine press': { primary: ['epaules'], secondary: ['pectoraux', 'triceps'] },
    'développé militaire': { primary: ['epaules'], secondary: ['triceps'] },
    'overhead': { primary: ['epaules'], secondary: ['triceps'] },
    'élévation latérale': { primary: ['epaules'], secondary: [] },
    'élévations latérales': { primary: ['epaules'], secondary: [] },
    'machine lateral raise': { primary: ['epaules'], secondary: [] },
    'lean-away cable lateral raise': { primary: ['epaules'], secondary: [] },
    'cable lateral raise': { primary: ['epaules'], secondary: [] },
    'partial lat raise': { primary: ['epaules'], secondary: [] },
    'rear delt cable fly': { primary: ['epaules'], secondary: ['dos'] },
    'reverse pec deck': { primary: ['epaules'], secondary: ['dos'] },
    'rear delt row': { primary: ['epaules'], secondary: ['dos'] },
    'incline rear delt raise': { primary: ['epaules'], secondary: ['dos'] },
    'face pull': { primary: ['epaules'], secondary: ['dos'] },
    'cuban rotation': { primary: ['epaules'], secondary: [] },
    'rotation externe': { primary: ['epaules'], secondary: [] },
    // BACK / ROWS
    'seated row': { primary: ['dos'], secondary: ['biceps'] },
    'chest-supported row': { primary: ['dos'], secondary: ['biceps'] },
    'row machine': { primary: ['dos'], secondary: ['biceps'] },
    'rowing assis machine': { primary: ['dos'], secondary: ['biceps'] },
    'seated row machine': { primary: ['dos'], secondary: ['biceps'] },
    'rowing poitrine appuyée': { primary: ['dos'], secondary: ['biceps'] },
    'rowing bas machine': { primary: ['dos'], secondary: ['biceps'] },
    'rowing unilatéral': { primary: ['dos'], secondary: ['biceps'] },
    'lat pulldown prise large': { primary: ['dos'], secondary: ['biceps'] },
    'lat pulldown prise neutre': { primary: ['dos'], secondary: ['biceps'] },
    'lat pulldown unilatéral': { primary: ['dos'], secondary: ['biceps'] },
    'straight-arm pulldown': { primary: ['dos'], secondary: [] },
    'pullover à la poulie bras tendus': { primary: ['dos'], secondary: ['pectoraux'] },
    'back extension': { primary: ['ischio-jambiers', 'fessiers'], secondary: ['dos'] },
    'extensions lombaires': { primary: ['ischio-jambiers', 'fessiers'], secondary: ['dos'] },
    'cable pull-through': { primary: ['fessiers', 'ischio-jambiers'], secondary: [] },
    'romanian deadlift': { primary: ['ischio-jambiers', 'fessiers'], secondary: ['dos'] },
    'rdl': { primary: ['ischio-jambiers', 'fessiers'], secondary: ['dos'] },
    // BICEPS
    'bayesian curl': { primary: ['biceps'], secondary: [] },
    'single-arm cable curl': { primary: ['biceps'], secondary: [] },
    'poulie unilatérale': { primary: ['biceps'], secondary: [] },
    'machine preacher curl': { primary: ['biceps'], secondary: [] },
    'finisher biceps machine preacher': { primary: ['biceps'], secondary: [] },
    'curl incliné': { primary: ['biceps'], secondary: [] },
    'curl marteau': { primary: ['biceps'], secondary: [] },
    'curl pupitre': { primary: ['biceps'], secondary: [] },
    'curl concentré': { primary: ['biceps'], secondary: [] },
    'curl': { primary: ['biceps'], secondary: [] },
    // TRICEPS (avoid generic 'extension' keyword)
    'triceps rope pushdown': { primary: ['triceps'], secondary: [] },
    'v-bar triceps pushdown': { primary: ['triceps'], secondary: [] },
    'pushdown triceps': { primary: ['triceps'], secondary: [] },
    'pushdown': { primary: ['triceps'], secondary: [] },
    'overhead cable triceps extension': { primary: ['triceps'], secondary: [] },
    'one-arm overhead cable triceps extension': { primary: ['triceps'], secondary: [] },
    'barre au front': { primary: ['triceps'], secondary: [] },
    'kickback': { primary: ['triceps'], secondary: [] },
    'overhead triceps': { primary: ['triceps'], secondary: [] },
    'extension triceps': { primary: ['triceps'], secondary: [] },
    
    // LEGS
    'hack squat': { primary: ['quadriceps'], secondary: ['fessiers'] },
    'squat': { primary: ['quadriceps'], secondary: ['fessiers'] },
    'presse à cuisses': { primary: ['quadriceps'], secondary: ['fessiers'] },
    'leg press': { primary: ['quadriceps'], secondary: ['fessiers'] },
    'split squat': { primary: ['quadriceps'], secondary: ['fessiers'] },
    'fente': { primary: ['quadriceps'], secondary: ['fessiers'] },
    'hip thrust': { primary: ['fessiers'], secondary: ['ischio-jambiers'] },
    'leg extension': { primary: ['quadriceps'], secondary: [] },
    'leg curl': { primary: ['ischio-jambiers'], secondary: [] },
    'nordic curl': { primary: ['ischio-jambiers'], secondary: [] },
    'mollet': { primary: ['mollets'], secondary: [] },
    
    // ABS / CORE
    'abdominal crunch machine': { primary: ['abdominaux'], secondary: [] },
    'cable crunch': { primary: ['abdominaux'], secondary: [] },
    'crunch': { primary: ['abdominaux'], secondary: [] },
    
    // FOREARMS
    'wrist curl': { primary: ['avant-bras'], secondary: [] },
    'reverse curl': { primary: ['avant-bras'], secondary: ['biceps'] }
};

// ===== STRETCH BIAS - Lengthened Position Training =====
// Research 2024-2025: Training at long muscle lengths = superior hypertrophy
// Each exercise tagged with length profile for execution cues
const EXERCISE_LENGTH_PROFILES = {
    // Stretch-biased exercises (prioritize bottom position)
    'curl incliné': { bias: 'lengthened', cue: 'Étirement max en bas, ne remonte pas tout en haut.' },
    'écarté': { bias: 'lengthened', cue: 'Descends profond, squeeze léger au centre.' },
    'développé incliné': { bias: 'lengthened', cue: 'Descente profonde, étire les pecs en bas.' },
    'pullover': { bias: 'lengthened', cue: 'Bras tendus derrière, étirement max.' },
    'extension nuque': { bias: 'lengthened', cue: 'Descends bien derrière la tête.' },
    'romanian deadlift': { bias: 'lengthened', cue: 'Étire les ischios en bas, ne remonte pas complètement.' },
    'rdl': { bias: 'lengthened', cue: 'Étire les ischios en bas, ne remonte pas complètement.' },
    'leg curl': { bias: 'lengthened', cue: 'Contrôle la phase négative, étirement complet.' },
    'sissy squat': { bias: 'lengthened', cue: 'Genoux en avant, étirement quad max.' },
    
    // Shortened-biased exercises (less optimal for hypertrophy but still useful)
    'leg extension': { bias: 'shortened', cue: 'Squeeze en haut, contrôle la descente.' },
    'concentration curl': { bias: 'shortened', cue: 'Contraction max en haut.' },
    'lateral raise': { bias: 'shortened', cue: 'Petite pause en haut.' },
    
    // Neutral (full ROM optimal)
    'default': { bias: 'neutral', cue: 'Amplitude complète et contrôlée.' }
};

// ===== COACHING MESSAGES - Accessible for medium-level users =====
// Clear, motivating messages without jargon
const COACHING_MESSAGES = {
    // Performance-based messages
    progress: {
        excellent: "Super progression ! Tu as gagné en force. Continue sur cette lancée.",
        good: "Bonne séance ! Tu es sur la bonne voie.",
        stable: "Performances stables. C'est normal, la progression n'est pas linéaire.",
        declining: "Petite baisse aujourd'hui. Pas d'inquiétude, vérifie ton sommeil et ta nutrition."
    },
    // Volume adjustment messages (simplified from LMS)
    volume: {
        increase: "Tes muscles récupèrent bien → on ajoute du volume pour stimuler plus de croissance.",
        maintain: "Volume parfait pour toi aujourd'hui.",
        decrease: "Muscle encore fatigué → moins de séries mais même intensité. Qualité > quantité."
    },
    // Effort guidance
    effort: {
        pushMore: "Tu peux pousser un peu plus ! Vise 2-3 reps de la limite.",
        onPoint: "Effort parfait. Garde ce niveau d'intensité.",
        tooHard: "Effort très élevé. Garde 1-2 reps en réserve pour éviter l'épuisement."
    }
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

async function initializeData() {
    const sessions = await db.getSessions();
    const workoutHistory = await db.getAll('workoutHistory');
    const hasExistingData = sessions.length > 0 || workoutHistory.length > 0;
    const appDataInitialized = await db.getSetting('appDataInitialized');

    if (appDataInitialized) {
        if (await db.getSetting('onboardingCompleted') == null) {
            await db.setSetting('onboardingCompleted', hasExistingData);
        }
        if (await db.getSetting('trainingObjective') == null) {
            await db.setSetting('trainingObjective', '');
        }
        return;
    }

    console.log('Initializing app settings...');

    if (await db.getSetting('nextSessionIndex') == null) {
        await db.setSetting('nextSessionIndex', 0);
    }
    if (await db.getSetting('xp') == null) {
        await db.setSetting('xp', 0);
    }
    if (await db.getSetting('lastWorkoutDate') == null) {
        await db.setSetting('lastWorkoutDate', null);
    }

    if (await db.getSetting('streakCount') == null) {
        await db.setSetting('streakCount', 0);
    }
    if (await db.getSetting('shieldCount') == null) {
        await db.setSetting('shieldCount', 0);
    }
    if (await db.getSetting('weekProtected') == null) {
        await db.setSetting('weekProtected', false);
    }
    if (await db.getSetting('weeklyGoal') == null) {
        await db.setSetting('weeklyGoal', 3);
    }
    if (await db.getSetting('accumulationWeeks') == null) {
        await db.setSetting('accumulationWeeks', DEFAULT_PERIODIZATION.cycleLength - 1);
    }
    if (await db.getSetting('cycleLength') == null) {
        await db.setSetting('cycleLength', DEFAULT_PERIODIZATION.cycleLength);
    }
    if (await db.getSetting('deloadWeek') == null) {
        await db.setSetting('deloadWeek', DEFAULT_PERIODIZATION.deloadWeek);
    }
    if (await db.getSetting('autoDeloadEnabled') == null) {
        await db.setSetting('autoDeloadEnabled', DEFAULT_PERIODIZATION.autoDeloadEnabled);
    }
    if (await db.getSetting('coldDayThreshold') == null) {
        await db.setSetting('coldDayThreshold', DEFAULT_PERIODIZATION.coldDayThreshold);
    }
    if (await db.getSetting('deloadVolumeReduction') == null) {
        await db.setSetting('deloadVolumeReduction', DEFAULT_PERIODIZATION.deloadVolumeReduction);
    }
    if (await db.getSetting('deloadPercent') == null) {
        await db.setSetting('deloadPercent', DEFAULT_PERIODIZATION.deloadIntensityReduction);
    }
    if (await db.getSetting('lastWeekCheck') == null) {
        await db.setSetting('lastWeekCheck', new Date().toISOString());
    }
    if (await db.getSetting('trainingObjective') == null) {
        await db.setSetting('trainingObjective', '');
    }
    if (await db.getSetting('onboardingCompleted') == null) {
        await db.setSetting('onboardingCompleted', hasExistingData);
    }
    await db.setSetting('appDataInitialized', true);

    console.log('App settings initialized!');
}
