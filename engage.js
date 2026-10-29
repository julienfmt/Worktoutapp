// ===== Engagement: monthly challenge, first-time tips, shareable recap =====
// - A monthly challenge on the home pane ("Résolution 2027" in January) with
//   a claimable reward and its own trophy family.
// - One-time coach tips on the first exercises of a beginner.
// - A "Partager" button on the end-of-workout screen that renders the
//   session as an image (Web Share API, download as a fallback).
(() => {
    const MONTHS = [
        { emoji: '🎆', name: 'janvier', title: year => `Résolution ${year}`, pitch: 'Tiens ta résolution dès le premier mois.' },
        { emoji: '❄️', name: 'février', title: () => 'Février de glace', pitch: 'Le mois le plus court, aucune excuse.' },
        { emoji: '🌱', name: 'mars', title: () => 'Mars en force', pitch: 'Le printemps se prépare maintenant.' },
        { emoji: '🌸', name: 'avril', title: () => 'Avril en fleurs', pitch: 'La régularité fait éclore les résultats.' },
        { emoji: '☀️', name: 'mai', title: () => 'Mai solaire', pitch: 'L’été approche : on accélère.' },
        { emoji: '🏖️', name: 'juin', title: () => 'Juin d’acier', pitch: 'Dernière ligne droite avant l’été.' },
        { emoji: '🔥', name: 'juillet', title: () => 'Juillet brûlant', pitch: 'Les vacances ne cassent pas la série.' },
        { emoji: '🌊', name: 'août', title: () => 'Août en vagues', pitch: 'Même en été, on garde le rythme.' },
        { emoji: '🍂', name: 'septembre', title: () => 'La rentrée', pitch: 'Nouvelle saison, nouvelles charges.' },
        { emoji: '🎃', name: 'octobre', title: () => 'Octobre monstre', pitch: 'Deviens le monstre de la salle.' },
        { emoji: '🌧️', name: 'novembre', title: () => 'Novembre tenace', pitch: 'Quand il pleut dehors, on brille dedans.' },
        { emoji: '🎄', name: 'décembre', title: () => 'Décembre de légende', pitch: 'Finis l’année plus fort qu’elle n’a commencé.' }
    ];

    const baseRenderStats = App.prototype.renderStats;
    const baseBuildTrophies = App.prototype.buildTrophies;
    const baseGetTrophyDefinitions = App.prototype.getTrophyDefinitions;
    const baseOpenExercise = App.prototype.openExercise;
    const baseShowStimulusScoreAnimation = App.prototype.showStimulusScoreAnimation;

    Object.assign(App.prototype, {
        // ---------- Monthly challenge ----------
        getMonthlyChallenge(date = new Date()) {
            const year = date.getFullYear();
            const month = date.getMonth();
            const theme = MONTHS[month];
            const weeklyGoal = Math.max(1, Number(this.progressContext?.snapshot?.weeklyGoal) || 3);
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 1);
            const daysInMonth = Math.round((end - start) / 86400000);
            // Roughly the weekly goal over the month, a little forgiving.
            const target = Math.max(4, Math.min(24, Math.round(weeklyGoal * (daysInMonth / 7) * 0.85)));
            const workouts = (this.homeDataSnapshot?.history || []).filter(workout => {
                const workoutDate = this.getSafeDate(workout.date);
                return workoutDate && workoutDate >= start && workoutDate < end;
            }).length;
            const today = new Date();
            const isCurrent = today.getFullYear() === year && today.getMonth() === month;
            const daysLeft = isCurrent ? Math.max(0, Math.ceil((end - today) / 86400000)) : 0;
            return {
                key: `${year}-${String(month + 1).padStart(2, '0')}`,
                emoji: theme.emoji,
                title: theme.title(year),
                monthName: theme.name,
                pitch: theme.pitch,
                isResolution: month === 0,
                target,
                current: workouts,
                done: workouts >= target,
                progress: Math.min(1, workouts / target),
                daysLeft,
                xp: month === 0 ? 400 : 250
            };
        },

        async getMonthlyClaims() {
            const stored = await db.getSetting('monthlyChallengeClaims');
            return Array.isArray(stored) ? stored : [];
        },

        async renderStats(homeData = null) {
            this.monthlyClaimsCache = await this.getMonthlyClaims();
            await baseRenderStats.call(this, homeData);
            await this.renderMonthlyChallenge();
        },

        async renderMonthlyChallenge() {
            const card = document.getElementById('month-challenge');
            if (!card || !this.progressContext) return;
            const challenge = this.getMonthlyChallenge();
            const claims = this.monthlyClaimsCache || await this.getMonthlyClaims();
            const claimed = claims.includes(challenge.key);
            const remaining = Math.max(0, challenge.target - challenge.current);
            const weeksLeft = Math.max(1, challenge.daysLeft / 7);
            const pace = remaining > 0 ? Math.ceil((remaining / weeksLeft) * 10) / 10 : 0;
            const radius = 26;
            const circumference = 2 * Math.PI * radius;
            let status;
            if (claimed) status = 'Défi relevé, bravo !';
            else if (challenge.done) status = 'Objectif atteint : récupère ta récompense !';
            else if (challenge.daysLeft <= 1) status = 'Dernier jour du mois : fonce !';
            else status = `Encore ${remaining} séance${remaining > 1 ? 's' : ''} · ~${String(pace).replace('.', ',')} / sem. · ${challenge.daysLeft} j restants`;

            card.hidden = false;
            card.className = `month-challenge ${challenge.isResolution ? 'is-resolution' : ''} ${challenge.done ? 'is-done' : ''} ${claimed ? 'is-claimed' : ''}`;
            card.innerHTML = `
                <div class="month-ring" aria-hidden="true">
                    <svg viewBox="0 0 64 64">
                        <circle class="month-ring-track" cx="32" cy="32" r="${radius}"/>
                        <circle class="month-ring-fill" cx="32" cy="32" r="${radius}" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${(circumference * (1 - challenge.progress)).toFixed(1)}"/>
                    </svg>
                    <span>${challenge.emoji}</span>
                </div>
                <div class="month-main">
                    <span class="month-kicker">${challenge.isResolution ? 'Défi du Nouvel An' : `Défi de ${challenge.monthName}`}</span>
                    <strong>${this.escapeHtml(challenge.title)} · ${challenge.current}/${challenge.target}</strong>
                    <small>${this.escapeHtml(status)}</small>
                </div>
                ${challenge.done && !claimed
                    ? `<button type="button" class="btn month-claim" data-month-claim="${challenge.key}" data-month-xp="${challenge.xp}">+${challenge.xp} XP</button>`
                    : `<span class="month-reward">${claimed ? '✓' : `+${challenge.xp}`}</span>`}
            `;
            const claimButton = card.querySelector('[data-month-claim]');
            if (claimButton) {
                claimButton.addEventListener('click', async () => {
                    claimButton.disabled = true;
                    await this.claimMonthlyChallenge(challenge, claimButton);
                }, { once: true });
            }
        },

        async claimMonthlyChallenge(challenge, anchor) {
            const claims = await this.getMonthlyClaims();
            if (claims.includes(challenge.key) || !challenge.done) return;
            claims.push(challenge.key);
            await db.setSetting('monthlyChallengeClaims', claims);
            this.monthlyClaimsCache = claims;
            const xp = ((await db.getSetting('xp')) || 0) + challenge.xp;
            await db.setSetting('xp', xp);
            const previousLevel = this.progressContext.player.level;
            this.progressContext.player = this.getPlayerLevel(xp);
            this.hapticTap?.([14, 40, 20, 40, 30]);
            gamification.burstFromElement?.(anchor, { count: 46, spread: 190, power: 12, shapes: ['star', 'circle', 'rect'] });
            gamification.triggerConfetti('heavy');
            gamification.showAchievement(
                challenge.emoji,
                challenge.isResolution ? 'Résolution tenue !' : 'Défi du mois relevé !',
                `${challenge.title} · +${challenge.xp} XP`,
                challenge.xp
            );
            if (this.progressContext.player.level > previousLevel) {
                setTimeout(() => gamification.showAchievement('⬆️', `Niveau ${this.progressContext.player.level} !`, `Tu passes ${this.progressContext.player.title.name}.`), 3200);
            }
            this.renderPlayerCard();
            await this.renderMonthlyChallenge();
            await this.renderTrophyCase();
        },

        getTrophyDefinitions() {
            const definitions = baseGetTrophyDefinitions.call(this);
            const monthly = [
                [1, '📅', 'Défi du mois', 'Relève un défi du mois'],
                [3, '🗓️', 'Trimestre de défis', 'Relève 3 défis du mois'],
                [6, '🌗', 'Semestre de défis', 'Relève 6 défis du mois'],
                [12, '🎆', 'Année de défis', 'Relève 12 défis du mois']
            ].map(([target, icon, name, desc]) => ({ id: `monthly-${target}`, metric: 'monthly', category: 'regularity', target, icon, name, desc, unit: 'défis' }));
            const resolution = [{ id: 'resolution-1', metric: 'resolutions', category: 'regularity', target: 1, icon: '🥂', name: 'Résolution tenue', desc: 'Relève le défi du Nouvel An en janvier', unit: 'résolution' }];
            return [...definitions, ...monthly, ...resolution];
        },

        buildTrophies() {
            const trophies = baseBuildTrophies.call(this);
            const claims = this.monthlyClaimsCache || [];
            const values = { monthly: claims.length, resolutions: claims.filter(key => key.endsWith('-01')).length };
            return trophies.map(trophy => {
                if (!(trophy.metric in values)) return trophy;
                const current = values[trophy.metric];
                return { ...trophy, current, unlocked: current >= trophy.target, progress: Math.min(1, current / trophy.target) };
            });
        },

        // ---------- First-time tips ----------
        async openExercise(slotId) {
            await baseOpenExercise.call(this, slotId);
            await this.renderFirstTimeTip();
        },

        async renderFirstTimeTip() {
            document.getElementById('coach-first-tip')?.remove();
            const slot = this.currentSlot;
            if (!slot || this.isReviewMode || this.isTimedSlot(slot)) return;
            const seen = (await db.getSetting('tipsSeen')) || [];
            if (seen.includes('first-exercise')) return;
            const totalSets = (this.homeDataSnapshot?.setHistory || []).length;
            const slotData = this.currentWorkout?.slots?.[slot.id];
            const doneHere = (slotData?.sets || []).some(set => set?.completed);
            // Only for players who have not logged much yet.
            if (totalSets > 30 || doneHere) return;
            const list = document.getElementById('series-list');
            if (!list || this.currentSlot?.id !== slot.id) return;
            const rir = Number(slot.rir);
            const tip = document.createElement('div');
            tip.className = 'coach-first-tip';
            tip.id = 'coach-first-tip';
            tip.innerHTML = `
                <div class="coach-first-tip-head">
                    <span class="coach-first-tip-icon" aria-hidden="true">💡</span>
                    <strong>Comment ça marche</strong>
                </div>
                <ol>
                    <li><b>Charge</b> et <b>reps</b> sont pré-remplies par le coach. Ajuste si besoin.</li>
                    <li>${Number.isFinite(rir) ? `<b>RIR ${rir}</b> : arrête la série quand il te reste ~${rir} rep${rir > 1 ? 's' : ''} en réserve.` : 'Arrête la série quand tu sens qu’il te reste 1 ou 2 reps.'}</li>
                    <li>Touche <b>Série terminée</b> : le repos se lance tout seul, le coach s’adapte.</li>
                </ol>
                <button type="button" class="btn coach-first-tip-ok">Compris !</button>
            `;
            list.before(tip);
            tip.querySelector('.coach-first-tip-ok').addEventListener('click', async () => {
                tip.classList.add('is-leaving');
                setTimeout(() => tip.remove(), 250);
                const current = (await db.getSetting('tipsSeen')) || [];
                if (!current.includes('first-exercise')) await db.setSetting('tipsSeen', [...current, 'first-exercise']);
            });
        },

        // ---------- Shareable recap ----------
        async showStimulusScoreAnimation(score, recap = null) {
            const pending = baseShowStimulusScoreAnimation.call(this, score, recap);
            // The overlay can be created a tick later (another wrapper awaits first).
            let overlay = null;
            for (let attempt = 0; attempt < 40 && !overlay; attempt += 1) {
                overlay = [...document.querySelectorAll('.stimulus-score-overlay')].pop() || null;
                if (!overlay) await new Promise(resolve => setTimeout(resolve, 50));
            }
            const action = overlay?.querySelector('.fin-action');
            if (action && typeof HTMLCanvasElement !== 'undefined') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'fin-share';
                button.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>
                    Partager ma séance
                `;
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    try {
                        await this.shareWorkoutCard(score);
                    } finally {
                        button.disabled = false;
                    }
                });
                action.prepend(button);
            }
            return pending;
        },

        async buildShareStats(score) {
            const history = await db.getAll('workoutHistory');
            const workout = history.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            if (!workout) return null;
            const [sets, sessions, streak, xp] = await Promise.all([
                db.getByIndex('setHistory', 'workoutId', workout.id),
                db.getSessions(),
                streakEngine.getStreakData(),
                db.getSetting('xp')
            ]);
            let tonnage = 0;
            let cardioSeconds = 0;
            let workSets = 0;
            const exerciseIds = new Set();
            for (const set of sets) {
                exerciseIds.add(set.exerciseId);
                if (set.trackingMode === 'cardio' || set.trackingMode === 'timed') {
                    cardioSeconds += Number(set.durationSeconds) || 0;
                    continue;
                }
                workSets += 1;
                tonnage += (Number(set.weight) || 0) * (Number(set.reps) || 0);
            }
            const records = Object.values(workout.slots || {}).reduce((sum, data) => sum + [...(data.sets || []), ...(data.setsLeft || []), ...(data.setsRight || [])].filter(set => set?.livePr).length, 0);
            return {
                sessionName: sessions.find(session => session.id === workout.sessionId)?.name || 'Séance',
                date: new Date(workout.date),
                minutes: Math.max(1, Math.round((Number(workout.duration) || 0) / 60000)),
                workSets,
                exercises: exerciseIds.size,
                tonnage,
                cardioMinutes: Math.round(cardioSeconds / 60),
                records,
                streak: streak.displayStreakCount ?? streak.streakCount ?? 0,
                level: this.getPlayerLevel(xp || 0),
                score: Math.max(0, Math.min(100, Math.round(Number(score?.normalized) || 0)))
            };
        },

        async renderShareCanvas(stats) {
            const width = 1080;
            const height = 1350;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            try {
                await document.fonts?.load?.('900 80px Nunito');
                await document.fonts?.load?.('800 40px Inter');
            } catch (error) {
                // System fonts are fine.
            }
            const display = '"Nunito", "Inter", system-ui, sans-serif';
            const text = '"Inter", system-ui, sans-serif';

            const bg = ctx.createLinearGradient(0, 0, width, height);
            bg.addColorStop(0, '#1e1b4b');
            bg.addColorStop(0.55, '#2a1660');
            bg.addColorStop(1, '#160f3a');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);
            const glow = (x, y, r, color) => {
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, color);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, width, height);
            };
            glow(160, 140, 620, 'rgba(139, 92, 246, 0.55)');
            glow(960, 1150, 560, 'rgba(236, 72, 153, 0.32)');
            ctx.strokeStyle = 'rgba(255,255,255,0.035)';
            ctx.lineWidth = 2;
            for (let x = 0; x <= width; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
            for (let y = 0; y <= height; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

            const roundRect = (x, y, w, h, r) => {
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.arcTo(x + w, y, x + w, y + h, r);
                ctx.arcTo(x + w, y + h, x, y + h, r);
                ctx.arcTo(x, y + h, x, y, r);
                ctx.arcTo(x, y, x + w, y, r);
                ctx.closePath();
            };

            ctx.textAlign = 'left';
            ctx.fillStyle = '#c4b5fd';
            ctx.font = `800 34px ${text}`;
            ctx.fillText(stats.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase(), 90, 150);
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 78px ${display}`;
            ctx.fillText('Séance terminée', 90, 255);
            ctx.font = `800 54px ${text}`;
            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.fillText(`💪 ${stats.sessionName}`.slice(0, 34), 90, 340);

            // Score ring
            const cx = 900;
            const cy = 270;
            ctx.lineWidth = 22;
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.beginPath(); ctx.arc(cx, cy, 84, 0, Math.PI * 2); ctx.stroke();
            const ring = ctx.createLinearGradient(cx - 100, cy - 100, cx + 100, cy + 100);
            ring.addColorStop(0, '#8b5cf6'); ring.addColorStop(0.55, '#ec4899'); ring.addColorStop(1, '#f97316');
            ctx.strokeStyle = ring;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(cx, cy, 84, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * stats.score / 100)); ctx.stroke();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.font = `900 64px ${display}`;
            ctx.fillText(String(stats.score), cx, cy + 16);
            ctx.font = `800 20px ${text}`;
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('STIMULUS', cx, cy + 48);

            const tiles = [
                { icon: '⏱️', value: `${stats.minutes} min`, label: 'durée' },
                { icon: '🔁', value: String(stats.workSets), label: stats.workSets > 1 ? 'séries' : 'série' },
                stats.tonnage > 0
                    ? { icon: '🧱', value: this.formatTonnage(stats.tonnage), label: 'soulevés' }
                    : stats.cardioMinutes > 0
                        ? { icon: '❤️', value: `${stats.cardioMinutes} min`, label: 'de cardio' }
                        : { icon: '🏋️', value: String(stats.exercises), label: stats.exercises > 1 ? 'exercices' : 'exercice' },
                stats.records > 0
                    ? { icon: '🏆', value: String(stats.records), label: stats.records > 1 ? 'records' : 'record' }
                    : { icon: '🔥', value: `${stats.streak} sem.`, label: 'de série' }
            ];
            tiles.forEach((tile, index) => {
                const x = 90 + (index % 2) * 465;
                const y = 440 + Math.floor(index / 2) * 300;
                roundRect(x, y, 435, 260, 44);
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.textAlign = 'left';
                ctx.fillStyle = '#ffffff';
                ctx.font = `64px ${text}`;
                ctx.fillText(tile.icon, x + 40, y + 96);
                ctx.fillStyle = '#ffffff';
                ctx.font = `900 84px ${display}`;
                ctx.fillText(tile.value, x + 40, y + 190);
                ctx.fillStyle = 'rgba(255,255,255,0.65)';
                ctx.font = `700 32px ${text}`;
                ctx.fillText(tile.label, x + 40, y + 234);
            });

            roundRect(90, 1060, 900, 120, 60);
            const pill = ctx.createLinearGradient(90, 0, 990, 0);
            pill.addColorStop(0, '#6366f1'); pill.addColorStop(1, '#a855f7');
            ctx.fillStyle = pill;
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.font = `800 40px ${text}`;
            ctx.fillText(`${stats.level.title.emoji}  Niveau ${stats.level.level} · ${stats.level.title.name}  ·  🔥 ${stats.streak} sem.`, width / 2, 1134);

            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = `800 30px ${text}`;
            ctx.fillText('Muscu · la salle comme un jeu', width / 2, 1270);

            return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        },

        async shareWorkoutCard(score) {
            const stats = await this.buildShareStats(score);
            if (!stats) return;
            const blob = await this.renderShareCanvas(stats);
            if (!blob) {
                this.showCoachToast('Image impossible à créer sur cet appareil.', 'warning', '⚠️');
                return;
            }
            const fileName = `seance-${stats.date.toISOString().slice(0, 10)}.png`;
            const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
            const shareText = `${stats.sessionName} bouclée 💪 ${stats.workSets} séries en ${stats.minutes} min.`;
            try {
                if (file && navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file], text: shareText });
                    return;
                }
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            this.showCoachToast('Image enregistrée : partage-la où tu veux !', 'hot', '📸');
        }
    });
})();
