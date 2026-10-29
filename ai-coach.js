// ===== Coach IA =====
// Everything needed to hand the user's training data to an external AI
// assistant and bring its answer back, with no DOM and no IndexedDB access:
// - buildDigest(): a compact, AI-readable summary (not the raw export)
// - buildPrompt(): role + task per intent + import contract + data
// - extractProgram() / diffPrograms(): read the AI reply and preview changes
// - AiBridge: platform adapter (web today, Capacitor plugins when the app
//   ships as a native shell) for clipboard, share sheet and opening the AI.
(function (root) {
    'use strict';

    const PROGRAM_FORMAT = 'worktout-program-v1';
    const DIGEST_WINDOW_DAYS = 56;
    const DAY_MS = 24 * 60 * 60 * 1000;
    // Long prompts are rejected or truncated by some AI front-ends when passed
    // as a query parameter: above this size the prompt goes through the clipboard.
    const MAX_PREFILL_URL_LENGTH = 7000;
    const MAX_EXERCISES_IN_DIGEST = 30;
    const MAX_NOTES_IN_DIGEST = 12;

    const AI_PROVIDERS = [
        {
            id: 'chatgpt',
            name: 'ChatGPT',
            monogram: 'G',
            tint: '#10a37f',
            newChatUrl: 'https://chatgpt.com/',
            prefillUrl: query => `https://chatgpt.com/?q=${encodeURIComponent(query)}`
        },
        {
            id: 'claude',
            name: 'Claude',
            monogram: 'C',
            tint: '#d97757',
            newChatUrl: 'https://claude.ai/new',
            prefillUrl: query => `https://claude.ai/new?q=${encodeURIComponent(query)}`
        },
        {
            id: 'gemini',
            name: 'Gemini',
            monogram: '✦',
            tint: '#4f7cf7',
            newChatUrl: 'https://gemini.google.com/app',
            prefillUrl: null
        },
        {
            id: 'mistral',
            name: 'Le Chat',
            monogram: 'M',
            tint: '#fa520f',
            newChatUrl: 'https://chat.mistral.ai/chat',
            prefillUrl: query => `https://chat.mistral.ai/chat?q=${encodeURIComponent(query)}`
        },
        {
            id: 'other',
            name: 'Autre IA',
            monogram: '…',
            tint: '#8b5cf6',
            newChatUrl: null,
            prefillUrl: null
        }
    ];

    const AI_INTENTS = [
        {
            id: 'analyze',
            emoji: '📊',
            title: 'Analyser ma progression',
            subtitle: 'Bilan, points forts, stagnations',
            placeholder: 'Ex. : pourquoi mon développé couché stagne ?',
            expectsProgram: false
        },
        {
            id: 'improve',
            emoji: '🔧',
            title: 'Optimiser mon programme',
            subtitle: 'Ajustements ciblés, même structure',
            placeholder: 'Ex. : je veux plus de volume pour les épaules',
            expectsProgram: true
        },
        {
            id: 'rebuild',
            emoji: '🔄',
            title: 'Nouveau programme',
            subtitle: 'On repart de zéro avec ton historique',
            placeholder: 'Ex. : passer en 4 séances haut / bas',
            expectsProgram: true
        },
        {
            id: 'ask',
            emoji: '💬',
            title: 'Question libre',
            subtitle: 'Tout ce que tu veux demander',
            placeholder: 'Pose ta question au coach…',
            expectsProgram: false
        }
    ];

    const AI_FOCUS_CHIPS = [
        { id: 'time', label: '⏱️ Séances plus courtes', text: 'Je manque de temps : vise des séances plus courtes sans perdre l’essentiel.' },
        { id: 'pain', label: '🩹 Douleur à gérer', text: 'J’ai une gêne à prendre en compte (je te précise où) : adapte les exercices concernés.' },
        { id: 'gear', label: '🏋️ Matériel différent', text: 'Mon matériel a changé (je te précise lequel) : adapte les exercices.' },
        { id: 'weak', label: '🎯 Point faible', text: 'Mets la priorité sur mon point faible le plus évident dans les données.' },
        { id: 'strength', label: '💪 Priorité force', text: 'Je veux surtout gagner en force sur les gros mouvements.' },
        { id: 'aesthetic', label: '✨ Priorité esthétique', text: 'Je veux surtout progresser visuellement (hypertrophie, proportions).' }
    ];

    // ---------- small helpers ----------
    const toNumber = (value, fallback = 0) => {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    };

    const round1 = value => Math.round(value * 10) / 10;

    const normalizeName = value => String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const safeDate = value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    };

    const formatDate = date => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${date.getFullYear()}`;
    };

    const formatNumber = value => String(round1(value)).replace('.', ',');

    const weekStartOf = date => {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const day = start.getDay();
        start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
        return start;
    };

    // Mirrors App.calculateE1RM: RPE-adjusted Brzycki ≤ 10 reps, Epley above.
    const defaultE1RM = (weight, reps, rpe = 10) => {
        weight = Number(weight);
        reps = Number(reps);
        if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps <= 0) return 0;
        const rir = Math.max(0, 10 - (Number(rpe) || 10));
        const total = Math.min(30, reps + rir);
        return total <= 10 ? weight * 36 / (37 - total) : weight * (1 + total / 30);
    };

    const getProvider = id => AI_PROVIDERS.find(provider => provider.id === id) || AI_PROVIDERS[0];
    const getIntent = id => AI_INTENTS.find(intent => intent.id === id) || AI_INTENTS[0];

    // ---------- program <-> worktout-program-v1 ----------
    function programFromStore(sessions = [], slots = [], { objective = '', weeklyGoal = null } = {}) {
        const sortedSessions = [...sessions].sort((a, b) => toNumber(a.order) - toNumber(b.order));
        return {
            format: PROGRAM_FORMAT,
            profile: {
                objective: objective || '',
                weeklyGoal: weeklyGoal || sortedSessions.length || 3
            },
            sessions: sortedSessions.map(session => {
                const sessionSlots = slots
                    .filter(slot => slot.sessionId === session.id)
                    .sort((a, b) => toNumber(a.order) - toNumber(b.order));
                const supersetLabels = new Map();
                let nextLabel = 0;
                sessionSlots.forEach(slot => {
                    if (!slot.supersetWith || supersetLabels.has(slot.id)) return;
                    const label = String.fromCharCode(65 + nextLabel);
                    nextLabel += 1;
                    supersetLabels.set(slot.id, label);
                    supersetLabels.set(slot.supersetWith, label);
                });

                return {
                    name: session.name,
                    estimatedDuration: session.estimatedDuration || 60,
                    slots: sessionSlots.map(slot => {
                        const name = slot.activeExercise || slot.name;
                        const entry = {
                            name,
                            sets: slot.sets,
                            repsMin: slot.repsMin,
                            repsMax: slot.repsMax,
                            rest: slot.rest,
                            rir: slot.rir,
                            type: slot.type || 'compound',
                            muscleGroup: slot.muscleGroup || '',
                            trackingMode: slot.trackingMode || 'strength',
                            ...(slot.trackingModeSource === 'user' ? { trackingModeSource: 'user' } : {}),
                            ...(slot.cardioMetric ? { cardioMetric: slot.cardioMetric } : {}),
                            ...(slot.timedLoad ? { timedLoad: slot.timedLoad } : {})
                        };
                        const pool = (slot.pool || []).filter(item => item && item !== name);
                        if (pool.length) entry.pool = [name, ...pool];
                        if (supersetLabels.has(slot.id)) entry.superset = supersetLabels.get(slot.id);
                        if (slot.unilateralMode === 'on' || slot.unilateralMode === 'off') {
                            entry.unilateralMode = slot.unilateralMode;
                        }
                        return entry;
                    })
                };
            })
        };
    }

    function unwrapProgram(data) {
        if (!data || typeof data !== 'object') return null;
        if (data.program && Array.isArray(data.program.sessions)) return data.program;
        return Array.isArray(data.sessions) ? data : null;
    }

    // ---------- reading the AI reply ----------
    // Returns every top-level JSON object found in free text, in order.
    function findJsonObjects(text) {
        const results = [];
        const source = String(text || '');
        let index = 0;
        while (index < source.length) {
            const start = source.indexOf('{', index);
            if (start === -1) break;
            let depth = 0;
            let inString = false;
            let escaped = false;
            let end = -1;
            for (let cursor = start; cursor < source.length; cursor += 1) {
                const char = source[cursor];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (char === '\\') escaped = true;
                    else if (char === '"') inString = false;
                    continue;
                }
                if (char === '"') inString = true;
                else if (char === '{') depth += 1;
                else if (char === '}') {
                    depth -= 1;
                    if (depth === 0) {
                        end = cursor;
                        break;
                    }
                }
            }
            if (end === -1) break;
            const candidate = source.slice(start, end + 1);
            try {
                results.push(JSON.parse(candidate));
                index = end + 1;
            } catch (error) {
                // Not valid JSON (prose with braces, trailing commas…): keep scanning inside.
                index = start + 1;
            }
        }
        return results;
    }

    // The AI may print several JSON blocks (draft then final): the last program wins.
    function extractProgram(text) {
        const raw = String(text || '').trim();
        if (!raw) return { program: null, reason: 'empty' };

        const candidates = [];
        const fenced = raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
        for (const match of fenced) {
            try {
                candidates.push(JSON.parse(match[1].trim()));
            } catch (error) {
                candidates.push(...findJsonObjects(match[1]));
            }
        }
        if (!candidates.length) candidates.push(...findJsonObjects(raw));

        const programs = candidates
            .map(candidate => ({ candidate, program: unwrapProgram(candidate) }))
            .filter(item => item.program && item.program.sessions.length);
        if (!programs.length) {
            return { program: null, reason: candidates.length ? 'no-program' : 'no-json' };
        }
        const preferred = [...programs].reverse().find(item => item.candidate.format === PROGRAM_FORMAT) ||
            programs[programs.length - 1];
        return { program: preferred.candidate, reason: null };
    }

    // ---------- diff ----------
    const slotSummary = slot => {
        const sets = toNumber(slot.sets, 3);
        const min = toNumber(slot.repsMin, 8);
        const max = toNumber(slot.repsMax, min);
        const reps = min === max ? `${min}` : `${min}-${max}`;
        return `${sets}×${reps}`;
    };

    function diffSlot(before, after) {
        const changes = [];
        if (slotSummary(before) !== slotSummary(after)) {
            changes.push({ field: 'volume', from: slotSummary(before), to: slotSummary(after) });
        }
        if (toNumber(before.rest, 90) !== toNumber(after.rest, 90)) {
            changes.push({ field: 'rest', from: `${toNumber(before.rest, 90)} s`, to: `${toNumber(after.rest, 90)} s` });
        }
        if (toNumber(before.rir, 2) !== toNumber(after.rir, 2)) {
            changes.push({ field: 'rir', from: `RIR ${toNumber(before.rir, 2)}`, to: `RIR ${toNumber(after.rir, 2)}` });
        }
        if (Boolean(before.superset) !== Boolean(after.superset)) {
            changes.push({ field: 'superset', from: before.superset ? 'Superset' : 'Seul', to: after.superset ? 'Superset' : 'Seul' });
        }
        return changes;
    }

    function diffPrograms(currentProgram, nextProgramRaw) {
        const current = unwrapProgram(currentProgram) || { sessions: [] };
        const next = unwrapProgram(nextProgramRaw) || { sessions: [] };
        const currentSessions = current.sessions || [];
        const usedCurrent = new Set();

        const findSessionMatch = (session, index) => {
            const key = normalizeName(session.name);
            let matchIndex = currentSessions.findIndex((item, itemIndex) =>
                !usedCurrent.has(itemIndex) && normalizeName(item.name) === key);
            if (matchIndex === -1 && index < currentSessions.length && !usedCurrent.has(index)) {
                matchIndex = index;
            }
            if (matchIndex === -1) return null;
            usedCurrent.add(matchIndex);
            return currentSessions[matchIndex];
        };

        const totals = { added: 0, removed: 0, changed: 0, kept: 0, sessionsAdded: 0, sessionsRemoved: 0 };

        const sessions = (next.sessions || []).map((session, index) => {
            const before = findSessionMatch(session, index);
            const beforeSlots = [...(before?.slots || [])];
            const rows = (session.slots || []).map(slot => {
                const name = String(slot.name || slot.exercise || slot.exerciseName || '').trim();
                const matchIndex = beforeSlots.findIndex(item => normalizeName(item.name) === normalizeName(name));
                if (matchIndex === -1) {
                    totals.added += 1;
                    return { status: 'added', name, summary: slotSummary(slot), superset: slot.superset || null, changes: [] };
                }
                const [previous] = beforeSlots.splice(matchIndex, 1);
                const changes = diffSlot(previous, slot);
                if (changes.length) totals.changed += 1;
                else totals.kept += 1;
                return {
                    status: changes.length ? 'changed' : 'kept',
                    name,
                    summary: slotSummary(slot),
                    superset: slot.superset || null,
                    changes
                };
            });
            beforeSlots.forEach(slot => {
                totals.removed += 1;
                rows.push({ status: 'removed', name: slot.name, summary: slotSummary(slot), superset: null, changes: [] });
            });
            if (!before) totals.sessionsAdded += 1;
            return {
                name: session.name || `Séance ${index + 1}`,
                previousName: before && before.name !== session.name ? before.name : null,
                isNew: !before,
                rows
            };
        });

        currentSessions.forEach((session, index) => {
            if (usedCurrent.has(index)) return;
            totals.sessionsRemoved += 1;
            totals.removed += (session.slots || []).length;
            sessions.push({
                name: session.name,
                previousName: null,
                isRemoved: true,
                rows: (session.slots || []).map(slot => ({
                    status: 'removed', name: slot.name, summary: slotSummary(slot), superset: null, changes: []
                }))
            });
        });

        const profile = {
            objective: next.profile?.objective && next.profile.objective !== current.profile?.objective
                ? { from: current.profile?.objective || '', to: next.profile.objective }
                : null,
            weeklyGoal: next.profile?.weeklyGoal && toNumber(next.profile.weeklyGoal) !== toNumber(current.profile?.weeklyGoal)
                ? { from: current.profile?.weeklyGoal || null, to: toNumber(next.profile.weeklyGoal) }
                : null
        };

        return {
            sessions,
            totals,
            profile,
            hasChanges: Boolean(totals.added || totals.removed || totals.changed ||
                totals.sessionsAdded || totals.sessionsRemoved || profile.objective || profile.weeklyGoal)
        };
    }

    // ---------- digest ----------
    function buildDigest({
        sessions = [],
        slots = [],
        history = [],
        setHistory = [],
        slotLookup = null,
        profile = {},
        muscleGroups = [],
        landmarks = {},
        e1rm = defaultE1RM,
        // (set, slot) => [{ muscleId, weight }]; secondary muscles usually weigh 0.5.
        muscleContributions = null,
        now = new Date()
    } = {}) {
        const windowStart = new Date(now.getTime() - DIGEST_WINDOW_DAYS * DAY_MS);
        const lookup = slotLookup instanceof Map
            ? slotLookup
            : new Map(slots.map(slot => [String(slot.id), slot]));
        const slotFor = set => lookup.get(String(set.slotId)) || null;
        const muscleName = id => muscleGroups.find(group => group.id === id)?.name || id;
        const isTimed = set => ['cardio', 'timed'].includes(slotFor(set)?.trackingMode || set.trackingMode);

        const datedHistory = history
            .map(workout => ({ ...workout, dateObj: safeDate(workout.date) }))
            .filter(workout => workout.dateObj)
            .sort((a, b) => a.dateObj - b.dateObj);
        const recentWorkouts = datedHistory.filter(workout => workout.dateObj >= windowStart);
        const recentSets = setHistory
            .map(set => ({ ...set, dateObj: safeDate(set.date) }))
            .filter(set => set.dateObj && set.dateObj >= windowStart && toNumber(set.reps) > 0);

        // Weekly activity (Monday-based weeks, oldest first, current week last).
        const currentWeekStart = weekStartOf(now);
        const weeks = [];
        for (let offset = 7; offset >= 0; offset -= 1) {
            const start = new Date(currentWeekStart.getTime() - offset * 7 * DAY_MS);
            weeks.push({ start, end: new Date(start.getTime() + 7 * DAY_MS), sessions: 0, tonnage: 0, durations: [] });
        }
        const weekIndexOf = date => weeks.findIndex(week => date >= week.start && date < week.end);
        recentWorkouts.forEach(workout => {
            const week = weeks[weekIndexOf(workout.dateObj)];
            if (!week) return;
            week.sessions += 1;
            const minutes = toNumber(workout.duration) / 60000;
            if (minutes >= 5 && minutes <= 300) week.durations.push(minutes);
        });
        recentSets.forEach(set => {
            const week = weeks[weekIndexOf(set.dateObj)];
            if (week && !isTimed(set)) week.tonnage += toNumber(set.weight) * toNumber(set.reps);
        });

        const firstWorkout = datedHistory[0]?.dateObj || null;
        const completedWeeks = weeks.slice(0, -1).filter(week => !firstWorkout || week.end > firstWorkout);
        const weeklyGoal = toNumber(profile.weeklyGoal, 0) || null;
        const allDurations = weeks.flatMap(week => week.durations);
        const adherence = {
            avgSessionsPerWeek: completedWeeks.length
                ? round1(completedWeeks.reduce((sum, week) => sum + week.sessions, 0) / completedWeeks.length)
                : null,
            weeksAtGoal: weeklyGoal ? completedWeeks.filter(week => week.sessions >= weeklyGoal).length : null,
            weeksCounted: completedWeeks.length,
            avgDurationMin: allDurations.length
                ? Math.round(allDurations.reduce((sum, value) => sum + value, 0) / allDurations.length)
                : null,
            weeks: weeks.map(week => ({
                label: formatDate(week.start).slice(0, 5),
                sessions: week.sessions,
                tonnage: Math.round(week.tonnage),
                isCurrent: week.start.getTime() === currentWeekStart.getTime()
            }))
        };

        // Per exercise (and side) trends.
        const byExercise = new Map();
        recentSets.forEach(set => {
            if (isTimed(set)) return;
            const name = String(set.exerciseName || slotFor(set)?.activeExercise || set.exerciseId || '').trim();
            if (!name) return;
            const side = set.side === 'left' || set.side === 'right' ? set.side : null;
            const key = `${normalizeName(name)}|${side || ''}`;
            if (!byExercise.has(key)) byExercise.set(key, { name, side, sets: [] });
            byExercise.get(key).sets.push(set);
        });

        const exercises = Array.from(byExercise.values()).map(({ name, side, sets }) => {
            const slot = sets.map(slotFor).find(Boolean) || null;
            const bodyweight = sets.every(set => toNumber(set.weight) <= 0);
            const sessionsMap = new Map();
            sets.forEach(set => {
                const key = set.workoutId != null ? `w${set.workoutId}` : set.dateObj.toDateString();
                if (!sessionsMap.has(key)) sessionsMap.set(key, { date: set.dateObj, sets: [] });
                sessionsMap.get(key).sets.push(set);
            });
            const sessionsList = Array.from(sessionsMap.values()).sort((a, b) => a.date - b.date);
            const scoreOf = set => (bodyweight ? toNumber(set.reps) : e1rm(set.weight, set.reps, set.rpe ?? 8));
            const progressionSessions = sessionsList
                .map(session => {
                    const eligible = session.sets.filter(set => !set.excludeFromProgression && !set.isDeload);
                    if (!eligible.length) return null;
                    const top = eligible.reduce((best, set) => (scoreOf(set) > scoreOf(best) ? set : best), eligible[0]);
                    return { date: session.date, score: scoreOf(top), top };
                })
                .filter(Boolean);

            const scores = progressionSessions.map(session => session.score);
            const first = scores[0] || 0;
            const last = scores[scores.length - 1] || 0;
            const best = scores.length ? Math.max(...scores) : 0;
            const bestIndex = scores.lastIndexOf(best);
            const sessionsSinceBest = scores.length ? scores.length - 1 - bestIndex : 0;
            let status = 'new';
            if (scores.length >= 3) {
                if (last < best * 0.95 && sessionsSinceBest >= 2) status = 'regress';
                else if (sessionsSinceBest >= 3) status = 'stall';
                else if (last > first * 1.01) status = 'progress';
                else status = 'stable';
            }

            const explicitRpe = sets
                .filter(set => set.rpeSource === 'user' && toNumber(set.rpe) > 0)
                .map(set => toNumber(set.rpe));
            const lastSession = sessionsList[sessionsList.length - 1];
            const lastAvgReps = lastSession
                ? lastSession.sets.reduce((sum, set) => sum + toNumber(set.reps), 0) / lastSession.sets.length
                : 0;
            const repsMin = toNumber(slot?.repsMin ?? lastSession?.sets[0]?.targetRepsMin, 0);
            const repsMax = toNumber(slot?.repsMax ?? lastSession?.sets[0]?.targetRepsMax, 0);

            const tagCounts = {};
            sets.forEach(set => (set.qualityTags || []).forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }));
            const flags = [];
            if (tagCounts.pain) flags.push(`douleur signalée ×${tagCounts.pain}`);
            if (tagCounts.reduced_rom) flags.push(`amplitude réduite ×${tagCounts.reduced_rom}`);
            if (tagCounts.cheat) flags.push(`élan ×${tagCounts.cheat}`);
            if (tagCounts.technical) flags.push(`technique difficile ×${tagCounts.technical}`);
            if (repsMax && lastAvgReps > repsMax + 0.5) flags.push('reps au-dessus de la fourchette (charge trop légère ?)');
            if (repsMin && lastAvgReps < repsMin - 0.5) flags.push('reps sous la fourchette');

            const top = progressionSessions[progressionSessions.length - 1]?.top || null;
            return {
                name,
                side,
                muscleGroup: slot?.muscleGroup || '',
                inProgram: Boolean(slot && slots.some(item => item.id === slot.id)),
                sessions: sessionsList.length,
                sets: sets.length,
                metric: bodyweight ? 'reps' : 'e1rm',
                first: round1(first),
                last: round1(last),
                best: round1(best),
                deltaPct: first > 0 ? Math.round(((last - first) / first) * 100) : null,
                status,
                sessionsSinceBest,
                lastTop: top ? { weight: toNumber(top.weight), reps: toNumber(top.reps), rpe: top.rpe ?? null } : null,
                avgRpe: explicitRpe.length ? round1(explicitRpe.reduce((sum, value) => sum + value, 0) / explicitRpe.length) : null,
                target: repsMin && repsMax ? `${repsMin}-${repsMax}` : null,
                flags
            };
        })
            .sort((a, b) => b.sessions - a.sessions || b.sets - a.sets)
            .slice(0, MAX_EXERCISES_IN_DIGEST);

        // Left / right balance on unilateral work.
        const imbalances = [];
        const sided = exercises.filter(exercise => exercise.side);
        sided.filter(exercise => exercise.side === 'left').forEach(left => {
            const right = sided.find(item => item.side === 'right' && normalizeName(item.name) === normalizeName(left.name));
            if (!right || !left.last || !right.last) return;
            const gap = Math.round((Math.abs(left.last - right.last) / Math.max(left.last, right.last)) * 100);
            if (gap >= 5) {
                imbalances.push({ name: left.name, weaker: left.last < right.last ? 'gauche' : 'droite', gapPct: gap });
            }
        });

        // Weekly working sets per primary muscle, averaged on completed weeks (max 4).
        const volumeWeeks = completedWeeks.slice(-4);
        const muscleSets = {};
        const currentWeekSets = {};
        recentSets.forEach(set => {
            if (isTimed(set)) return;
            const slot = slotFor(set);
            let contributions = typeof muscleContributions === 'function' ? (muscleContributions(set, slot) || []) : [];
            if (!contributions.length && slot?.muscleGroup) contributions = [{ muscleId: slot.muscleGroup, weight: 1 }];
            // Unilateral work stores one row per side: a left + right pair is one set.
            const sideFactor = set.side ? 0.5 : 1;
            const inCurrentWeek = set.dateObj >= currentWeekStart;
            const inVolumeWeeks = !inCurrentWeek && volumeWeeks.some(week => set.dateObj >= week.start && set.dateObj < week.end);
            contributions.forEach(({ muscleId, weight = 1 }) => {
                if (!muscleId) return;
                const amount = weight * sideFactor;
                if (inCurrentWeek) currentWeekSets[muscleId] = (currentWeekSets[muscleId] || 0) + amount;
                else if (inVolumeWeeks) muscleSets[muscleId] = (muscleSets[muscleId] || 0) + amount;
            });
        });
        const programMuscles = new Set(slots.map(slot => slot.muscleGroup).filter(Boolean));
        const muscleIds = new Set([...Object.keys(muscleSets), ...Object.keys(currentWeekSets), ...programMuscles]);
        const muscles = Array.from(muscleIds).map(id => {
            const marks = landmarks[id] || landmarks.default || {};
            const avg = volumeWeeks.length ? (muscleSets[id] || 0) / volumeWeeks.length : 0;
            let zone = 'non travaillé';
            if (avg > 0) {
                if (marks.MEV && avg < marks.MEV) zone = 'sous le minimum efficace';
                else if (marks.MAV && avg <= marks.MAV) zone = 'zone de croissance';
                else if (marks.MRV && avg <= marks.MRV) zone = 'volume élevé';
                else zone = 'au-delà du récupérable';
            }
            return {
                id,
                name: muscleName(id),
                avgWeeklySets: round1(avg),
                currentWeekSets: round1(currentWeekSets[id] || 0),
                MEV: marks.MEV ?? null,
                MAV: marks.MAV ?? null,
                MRV: marks.MRV ?? null,
                zone
            };
        }).sort((a, b) => b.avgWeeklySets - a.avgWeeklySets);

        // Free-text notes left by the user (deduplicated, most recent first).
        const notes = [];
        const seenNotes = new Set();
        [...recentSets].sort((a, b) => b.dateObj - a.dateObj).forEach(set => {
            [['exercise', set.exerciseNote], ['session', set.sessionNote]].forEach(([kind, text]) => {
                const clean = String(text || '').trim();
                if (!clean || notes.length >= MAX_NOTES_IN_DIGEST) return;
                const key = `${kind}|${clean}`;
                if (seenNotes.has(key)) return;
                seenNotes.add(key);
                notes.push({
                    date: formatDate(set.dateObj),
                    exercise: kind === 'exercise' ? (set.exerciseName || '') : '',
                    text: clean.slice(0, 220)
                });
            });
        });

        // Exercises the user keeps skipping.
        const skippedCounts = {};
        recentWorkouts.forEach(workout => (workout.skippedSlots || []).forEach(slotId => {
            const slot = lookup.get(String(slotId));
            const name = slot?.activeExercise || slot?.name;
            if (name) skippedCounts[name] = (skippedCounts[name] || 0) + 1;
        }));
        const skipped = Object.entries(skippedCounts)
            .filter(([, count]) => count >= 2)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        return {
            generatedAt: formatDate(now),
            windowWeeks: Math.round(DIGEST_WINDOW_DAYS / 7),
            profile: {
                objective: profile.objective || '',
                weeklyGoal,
                level: profile.level || null,
                firstWorkout: firstWorkout ? formatDate(firstWorkout) : null,
                totalWorkouts: datedHistory.length,
                recentWorkouts: recentWorkouts.length
            },
            adherence,
            program: programFromStore(sessions, slots, { objective: profile.objective, weeklyGoal }),
            exercises,
            imbalances,
            muscles,
            notes,
            skipped,
            stats: {
                exercises: exercises.length,
                sets: recentSets.length,
                sessions: (sessions || []).length,
                slots: (slots || []).length
            }
        };
    }

    // ---------- digest -> text (compact, model-friendly) ----------
    const STATUS_LABELS = {
        progress: 'progresse',
        stable: 'stable',
        stall: 'stagne',
        regress: 'en baisse',
        new: 'trop récent'
    };

    function compactProgramJson(program) {
        const lines = ['{', `  "format": "${PROGRAM_FORMAT}",`, `  "profile": ${JSON.stringify(program.profile)},`, '  "sessions": ['];
        program.sessions.forEach((session, sessionIndex) => {
            lines.push(`    {"name": ${JSON.stringify(session.name)}, "estimatedDuration": ${session.estimatedDuration}, "slots": [`);
            session.slots.forEach((slot, slotIndex) => {
                lines.push(`      ${JSON.stringify(slot)}${slotIndex < session.slots.length - 1 ? ',' : ''}`);
            });
            lines.push(`    ]}${sessionIndex < program.sessions.length - 1 ? ',' : ''}`);
        });
        lines.push('  ]', '}');
        return lines.join('\n');
    }

    function formatDigest(digest) {
        const out = [];
        const { profile, adherence } = digest;
        out.push(`## Profil (données du ${digest.generatedAt})`);
        out.push(`- Objectif : ${profile.objective || 'non précisé'}`);
        if (profile.weeklyGoal) out.push(`- Séances visées par semaine : ${profile.weeklyGoal}`);
        out.push(`- Séances enregistrées : ${profile.totalWorkouts}${profile.firstWorkout ? ` (depuis le ${profile.firstWorkout})` : ''}, dont ${profile.recentWorkouts} sur les ${digest.windowWeeks} dernières semaines`);
        if (profile.level) out.push(`- Niveau dans l’app : ${profile.level}`);
        if (adherence.avgSessionsPerWeek != null) {
            const goalPart = adherence.weeksAtGoal != null
                ? ` · objectif atteint ${adherence.weeksAtGoal}/${adherence.weeksCounted} semaines`
                : '';
            out.push(`- Assiduité : ${formatNumber(adherence.avgSessionsPerWeek)} séances/sem.${goalPart}`);
        }
        if (adherence.avgDurationMin) out.push(`- Durée moyenne d’une séance : ${adherence.avgDurationMin} min`);

        out.push('', '## Activité hebdomadaire (8 semaines, la dernière est en cours)');
        out.push(adherence.weeks.map(week => `${week.label}: ${week.sessions} séance${week.sessions > 1 ? 's' : ''}, ${week.tonnage} kg`).join(' | '));

        out.push('', '## Programme actuel (format d’import Worktout)');
        out.push('```json', compactProgramJson(digest.program), '```');

        if (digest.exercises.length) {
            out.push('', `## Progression par exercice (${digest.windowWeeks} dernières semaines)`);
            out.push('Métrique : e1RM estimé en kg (ou meilleures reps au poids du corps), meilleure série de chaque séance.');
            out.push('| Exercice | Séances | Début → Dernier (record) | Tendance | Dernière meilleure série | RPE moy. | Cible | Signaux |');
            out.push('|---|---|---|---|---|---|---|---|');
            digest.exercises.forEach(exercise => {
                const unit = exercise.metric === 'reps' ? ' reps' : ' kg';
                const name = exercise.side ? `${exercise.name} (${exercise.side === 'left' ? 'gauche' : 'droite'})` : exercise.name;
                const trend = `${STATUS_LABELS[exercise.status]}${exercise.deltaPct != null && exercise.status !== 'new' ? ` (${exercise.deltaPct >= 0 ? '+' : ''}${exercise.deltaPct} %)` : ''}${exercise.status === 'stall' ? `, ${exercise.sessionsSinceBest} séances sans record` : ''}`;
                const top = exercise.lastTop
                    ? `${exercise.lastTop.weight > 0 ? `${formatNumber(exercise.lastTop.weight)} kg × ` : ''}${exercise.lastTop.reps}${exercise.lastTop.rpe ? ` @RPE ${formatNumber(exercise.lastTop.rpe)}` : ''}`
                    : '–';
                out.push(`| ${name}${exercise.inProgram ? '' : ' *(plus au programme)*'} | ${exercise.sessions} | ${formatNumber(exercise.first)} → ${formatNumber(exercise.last)} (${formatNumber(exercise.best)})${unit} | ${trend} | ${top} | ${exercise.avgRpe != null ? formatNumber(exercise.avgRpe) : '–'} | ${exercise.target || '–'} | ${exercise.flags.join(' ; ') || '–'} |`);
            });
        }

        if (digest.muscles.length) {
            out.push('', '## Volume par muscle (séries de travail / semaine, moyenne des 4 dernières semaines complètes ; un muscle secondaire compte pour 0,5 série)');
            out.push('| Muscle | Moyenne | Semaine en cours | MEV / MAV / MRV | Lecture |');
            out.push('|---|---|---|---|---|');
            digest.muscles.forEach(muscle => {
                out.push(`| ${muscle.name} | ${formatNumber(muscle.avgWeeklySets)} | ${formatNumber(muscle.currentWeekSets)} | ${muscle.MEV ?? '–'} / ${muscle.MAV ?? '–'} / ${muscle.MRV ?? '–'} | ${muscle.zone} |`);
            });
        }

        if (digest.imbalances.length) {
            out.push('', '## Déséquilibres gauche / droite');
            digest.imbalances.forEach(item => out.push(`- ${item.name} : côté ${item.weaker} plus faible de ${item.gapPct} %`));
        }

        if (digest.skipped.length) {
            out.push('', '## Exercices souvent sautés');
            digest.skipped.forEach(item => out.push(`- ${item.name} : sauté ${item.count} fois`));
        }

        if (digest.notes.length) {
            out.push('', '## Notes laissées par l’utilisateur');
            digest.notes.forEach(note => out.push(`- ${note.date}${note.exercise ? ` · ${note.exercise}` : ''} : « ${note.text} »`));
        }

        return out.join('\n');
    }

    // ---------- prompt ----------
    const PROGRAM_CONTRACT = muscleIds => [
        '## Format du programme à renvoyer',
        `Quand (et seulement quand) l’utilisateur valide un programme, renvoie-le en ENTIER (toutes les séances, pas seulement les changements) dans UN SEUL bloc \`\`\`json, au même format que « Programme actuel » ci-dessus :`,
        `- "format": "${PROGRAM_FORMAT}" ; "profile": { "objective", "weeklyGoal" (entier 1 à 7) } ; "sessions": séances dans l’ordre de rotation.`,
        '- Chaque séance : "name", "estimatedDuration" (minutes), "slots".',
        '- Chaque slot : "name", "sets", "repsMin", "repsMax", "rest" (secondes), "rir", "type" ("compound" ou "isolation"), "muscleGroup", "trackingMode" ("strength", "cardio" pour durée + repère machine, "timed" pour un temps tenu ou une poussée courte comme un gainage ou un sled push), "pool" (nom principal puis 1 à 3 variantes proches).',
        '- Pour un slot cardio, conserve aussi "cardioMetric" si présent (ex. "speed", "power", "resistance", "level", "distance-m", "load").',
        '- Si "trackingModeSource": "user" est fourni, garde-le avec le mode choisi par la personne.',
        '- Les cibles "repsMin"/"repsMax" sont des répétitions pour "strength", des minutes pour "cardio" et des secondes pour "timed".',
        `- "muscleGroup" parmi : ${muscleIds}.`,
        '- Optionnel : "superset": même lettre ("A", "B"…) sur DEUX exercices consécutifs à enchaîner ; "unilateralMode": "on" pour suivre gauche/droite séparément ; "instructions": une phrase de consigne pour un exercice NOUVEAU.',
        '- RÈGLE CLÉ : pour un exercice que tu gardes, recopie son nom EXACTEMENT comme dans le programme actuel. Sinon son historique est perdu.',
        '- JSON strict : pas de commentaires, pas de virgules finales.',
        '- Juste après le bloc, ajoute : « 👉 Copie ce message, puis dans Worktout touche “Coller la réponse de l’IA”. »'
    ].join('\n');

    const INTENT_TASKS = {
        analyze: [
            '## Ta mission : analyser ma progression',
            '1. Donne un bilan clair en 5 points maximum : ce qui progresse, ce qui stagne ou régresse, l’équilibre du volume par muscle, l’assiduité, la récupération (RPE, douleurs, notes).',
            '2. Pour chaque problème, explique la cause probable en t’appuyant sur les chiffres, puis une action concrète.',
            '3. Termine par les 3 priorités des prochaines semaines.',
            '4. Si des changements de programme seraient utiles, propose-les puis demande-moi si je veux le programme mis à jour (dans ce cas seulement, utilise le format ci-dessous).'
        ],
        improve: [
            '## Ta mission : optimiser mon programme actuel',
            '1. Commence par un diagnostic court (5 lignes max) basé sur les données.',
            '2. Propose des ajustements CIBLÉS en gardant la structure (mêmes séances, même rythme) : exercice qui stagne → variante ou autre fourchette de reps ; muscle sous le minimum efficace → séries en plus ; muscle au-delà du récupérable → séries en moins ; douleur → alternative.',
            '3. Présente chaque changement sous la forme « Avant → Après : pourquoi ».',
            '4. Demande-moi si je valide ou si je veux modifier quelque chose. Ajuste si besoin.',
            '5. Une fois validé, renvoie le programme complet au format ci-dessous.'
        ],
        rebuild: [
            '## Ta mission : me construire un nouveau programme',
            '1. Avant tout, pose-moi ces 3 questions (en une fois, simplement) : combien de séances par semaine, quelle répartition (propose la plus adaptée si je ne sais pas), quel matériel est disponible.',
            '2. Appuie-toi sur mon historique : garde les exercices qui marchent bien, remplace ceux qui stagnent ou font mal, corrige les déséquilibres de volume.',
            '3. Propose d’abord un brouillon lisible (séances, exercices, séries × reps) et demande validation.',
            '4. Une fois validé, renvoie le programme complet au format ci-dessous.'
        ],
        ask: [
            '## Ta mission : répondre à ma question',
            '1. Réponds en t’appuyant sur mes données ci-dessous, de façon concrète et chiffrée.',
            '2. Si ta réponse implique de modifier le programme, propose les changements puis demande-moi si je veux le programme mis à jour (dans ce cas seulement, utilise le format ci-dessous).'
        ]
    };

    function buildPrompt({ intent = 'analyze', digest, userMessage = '', focus = [], muscleIds = '' } = {}) {
        const intentConfig = getIntent(intent);
        const focusTexts = AI_FOCUS_CHIPS.filter(chip => focus.includes(chip.id)).map(chip => `- ${chip.text}`);
        const message = String(userMessage || '').trim();
        const parts = [
            'Tu es un coach de musculation expert (hypertrophie et force), précis et bienveillant. J’utilise l’application Worktout pour suivre mes séances ; voici mes données exportées par l’app.',
            '',
            'Règles de forme : réponds en français, simplement, avec des mots compréhensibles par un non-initié (explique tout terme technique). Sois concret et chiffré. Ne pose pas de diagnostic médical : en cas de douleur, conseille d’adapter et de consulter si elle persiste.',
            '',
            INTENT_TASKS[intentConfig.id].join('\n')
        ];
        if (message || focusTexts.length) {
            parts.push('', '## Ma demande', ...(message ? [message] : []), ...focusTexts);
        }
        parts.push('', PROGRAM_CONTRACT(muscleIds), '', '# MES DONNÉES', '', formatDigest(digest));
        return parts.join('\n');
    }

    // Short message used when the full prompt rides in an attached file.
    function buildShareMessage(intent = 'analyze') {
        const intentConfig = getIntent(intent);
        return `Voici mes données d’entraînement Worktout (fichier joint). Lis tout le fichier et suis ses consignes. Objectif : ${intentConfig.title.toLowerCase()}.`;
    }

    // Decides how the prompt reaches the chosen AI.
    function planLaunch(providerId, prompt) {
        const provider = getProvider(providerId);
        if (provider.prefillUrl) {
            const url = provider.prefillUrl(prompt);
            if (url.length <= MAX_PREFILL_URL_LENGTH) {
                return { provider, url, prefilled: true };
            }
        }
        return { provider, url: provider.newChatUrl, prefilled: false };
    }

    // Copy prompt for when the AI analysed without producing the program block.
    const FOLLOW_UP_PROMPT = `Parfait. Génère maintenant le programme complet validé, dans un seul bloc \`\`\`json au format "${PROGRAM_FORMAT}" décrit plus haut, en recopiant exactement les noms des exercices conservés.`;

    // ---------- platform bridge ----------
    // The web implementation is the default. When the app runs inside a
    // Capacitor shell, the official plugins (Clipboard, Share, Filesystem,
    // Browser / AppLauncher) are used instead, with no change in the app code.
    const AiBridge = {
        native() {
            const capacitor = root.Capacitor;
            return capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform()
                ? (capacitor.Plugins || {})
                : null;
        },

        // Must be called synchronously from the tap handler (iOS user-activation rules).
        // `beforeLeaving`: a new tab is about to open and steal focus, which makes
        // the async Clipboard API reject; the synchronous copy runs first then.
        copy(text, { beforeLeaving = false } = {}) {
            const plugins = this.native();
            if (plugins?.Clipboard) {
                return plugins.Clipboard.write({ string: text }).then(() => true, () => false);
            }
            if (beforeLeaving && this.legacyCopy(text)) return Promise.resolve(true);
            if (root.navigator?.clipboard?.writeText) {
                return root.navigator.clipboard.writeText(text).then(() => true, () => this.legacyCopy(text));
            }
            return Promise.resolve(this.legacyCopy(text));
        },

        legacyCopy(text) {
            const doc = root.document;
            if (!doc?.body) return false;
            const textarea = doc.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('aria-hidden', 'true');
            textarea.style.cssText = 'position:fixed;top:0;left:-9999px;width:1px;height:1px;padding:0;border:0;opacity:0.01;font-size:16px;';
            doc.body.appendChild(textarea);
            textarea.focus({ preventScroll: true });
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            // iOS Safari only copies a selection made through a Range.
            if (root.getSelection && doc.createRange) {
                const range = doc.createRange();
                range.selectNodeContents(textarea);
                const selection = root.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
                textarea.setSelectionRange(0, textarea.value.length);
            }
            let copied = false;
            try {
                copied = doc.execCommand('copy');
            } catch (error) {
                copied = false;
            }
            textarea.remove();
            return copied;
        },

        async readClipboard() {
            const plugins = this.native();
            if (plugins?.Clipboard) {
                const result = await plugins.Clipboard.read();
                return String(result?.value || '');
            }
            if (!root.navigator?.clipboard?.readText) throw new Error('clipboard-unavailable');
            return root.navigator.clipboard.readText();
        },

        canShareFile() {
            if (this.native()?.Share) return true;
            const nav = root.navigator;
            if (!nav?.share || !nav.canShare || typeof root.File !== 'function') return false;
            try {
                return nav.canShare({ files: [new root.File(['x'], 'test.md', { type: 'text/markdown' })] });
            } catch (error) {
                return false;
            }
        },

        // Resolves 'shared', 'cancelled' or 'unavailable'.
        async shareFile({ fileName, content, message, title }) {
            const plugins = this.native();
            if (plugins?.Share && plugins?.Filesystem) {
                try {
                    const written = await plugins.Filesystem.writeFile({
                        path: fileName, data: content, directory: 'CACHE', encoding: 'utf8'
                    });
                    await plugins.Share.share({ title, text: message, files: [written.uri] });
                    return 'shared';
                } catch (error) {
                    return /cancel/i.test(String(error?.message || error)) ? 'cancelled' : 'unavailable';
                }
            }
            const nav = root.navigator;
            if (!nav?.share) return 'unavailable';
            const file = new root.File([content], fileName, { type: 'text/markdown' });
            const payload = { title, text: message, files: [file] };
            if (nav.canShare && !nav.canShare(payload)) return 'unavailable';
            try {
                await nav.share(payload);
                return 'shared';
            } catch (error) {
                return error?.name === 'AbortError' ? 'cancelled' : 'unavailable';
            }
        },

        // Must also run synchronously inside the tap handler on the web,
        // otherwise Safari treats the new tab as an unsolicited popup.
        openUrl(url) {
            if (!url) return false;
            const plugins = this.native();
            if (plugins?.AppLauncher) {
                plugins.AppLauncher.openUrl({ url }).catch(() => plugins.Browser?.open({ url }));
                return true;
            }
            if (plugins?.Browser) {
                plugins.Browser.open({ url });
                return true;
            }
            // No 'noopener' feature: it makes window.open return null, hiding a blocked popup.
            const opened = root.open ? root.open(url, '_blank') : null;
            if (opened) {
                try {
                    opened.opener = null;
                } catch (error) {
                    // Cross-origin window already detached.
                }
            }
            return Boolean(opened);
        },

        downloadFile({ fileName, content }) {
            const doc = root.document;
            if (!doc || typeof root.Blob !== 'function') return false;
            const url = root.URL.createObjectURL(new root.Blob([content], { type: 'text/markdown' }));
            const link = doc.createElement('a');
            link.href = url;
            link.download = fileName;
            link.click();
            setTimeout(() => root.URL.revokeObjectURL(url), 1000);
            return true;
        }
    };

    const AiCoach = {
        PROGRAM_FORMAT,
        MAX_PREFILL_URL_LENGTH,
        AI_PROVIDERS,
        AI_INTENTS,
        AI_FOCUS_CHIPS,
        FOLLOW_UP_PROMPT,
        getProvider,
        getIntent,
        programFromStore,
        buildDigest,
        formatDigest,
        buildPrompt,
        PROGRAM_CONTRACT,
        buildShareMessage,
        planLaunch,
        extractProgram,
        diffPrograms,
        defaultE1RM,
        AiBridge
    };

    root.AiCoach = AiCoach;
    if (typeof module !== 'undefined' && module.exports) module.exports = AiCoach;
})(typeof window !== 'undefined' ? window : globalThis);
