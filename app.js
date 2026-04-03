// ===== Streak Engine =====
class StreakEngine {
    constructor() {
        this.LEVELS = [
            { name: 'Rookie', min: 0, max: 2, color: '#94a3b8', emoji: '🌱', description: 'Début du voyage' },
            { name: 'Initié', min: 3, max: 5, color: '#22c55e', emoji: '🔰', description: 'Tu prends le rythme' },
            { name: 'Focus', min: 6, max: 9, color: '#f59e0b', emoji: '🔥', description: 'En pleine concentration' },
            { name: 'Guerrier', min: 10, max: 15, color: '#f97316', emoji: '⚔️', description: 'Rien ne t\'arrête' },
            { name: 'Machine', min: 16, max: 24, color: '#8b5cf6', emoji: '⚡', description: 'Régularité parfaite' },
            { name: 'Elite', min: 25, max: 35, color: '#ec4899', emoji: '💎', description: 'Parmi les meilleurs' },
            { name: 'Légende', min: 36, max: 51, color: '#ef4444', emoji: '👑', description: 'Statut légendaire' },
            { name: 'Titan', min: 52, max: Infinity, color: '#eab308', emoji: '🏆', description: '1 an+ de streak !' }
        ];
        this.MAX_SHIELDS = 3;
    }

    getWeekBounds(date = new Date()) {
        const d = new Date(date);
        const day = d.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const monday = new Date(d);
        monday.setDate(d.getDate() + diffToMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return { start: monday, end: sunday };
    }

    async getCurrentWeekSessions() {
        const { start, end } = this.getWeekBounds();
        const history = await db.getAll('workoutHistory');
        return history.filter(w => {
            const d = new Date(w.date);
            return d >= start && d <= end;
        }).length;
    }

    async getStreakData() {
        const streakCount = (await db.getSetting('streakCount')) ?? 0;
        const shieldCount = (await db.getSetting('shieldCount')) ?? 0;
        const weekProtected = (await db.getSetting('weekProtected')) ?? false;
        const weeklyGoal = (await db.getSetting('weeklyGoal')) ?? 3;
        const currentWeekSessions = await this.getCurrentWeekSessions();
        const lastWeekCheck = await db.getSetting('lastWeekCheck');
        const currentWeekValidated = currentWeekSessions >= weeklyGoal;
        const displayStreakCount = streakCount + (currentWeekValidated ? 1 : 0);
        
        return {
            streakCount,
            displayStreakCount,
            shieldCount,
            weekProtected,
            weeklyGoal,
            currentWeekSessions,
            lastWeekCheck,
            currentWeekValidated
        };
    }

    getLevel(streakCount) {
        for (const level of this.LEVELS) {
            if (streakCount >= level.min && streakCount <= level.max) {
                return level;
            }
        }
        return this.LEVELS[0];
    }

    async getWeekPrediction() {
        const { weeklyGoal, currentWeekSessions, weekProtected, shieldCount, streakCount } = await this.getStreakData();
        const { end } = this.getWeekBounds();
        const now = new Date();
        
        const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        const sessionsNeeded = weeklyGoal - currentWeekSessions;
        
        if (sessionsNeeded <= 0) {
            return { status: 'success', message: 'Objectif atteint !', daysLeft, sessionsNeeded: 0 };
        }
        
        if (sessionsNeeded > daysLeft) {
            if (shieldCount >= 1 || weekProtected) {
                return { 
                    status: 'danger', 
                    message: `Impossible d'atteindre l'objectif. Bouclier en jeu.`,
                    daysLeft, 
                    sessionsNeeded,
                    shieldAtRisk: true
                };
            }
            return { 
                status: 'danger', 
                message: `Plus assez de jours ! Streak en danger.`,
                daysLeft, 
                sessionsNeeded,
                streakAtRisk: true
            };
        }
        
        if (sessionsNeeded === daysLeft) {
            const protectionMsg = shieldCount >= 1 ? ' Bouclier disponible.' : '';
            return { 
                status: 'warning', 
                message: `${sessionsNeeded} séance${sessionsNeeded > 1 ? 's' : ''} requise${sessionsNeeded > 1 ? 's' : ''} en ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.${protectionMsg}`,
                daysLeft, 
                sessionsNeeded 
            };
        }
        
        return { 
            status: 'ontrack', 
            message: `${sessionsNeeded} séance${sessionsNeeded > 1 ? 's' : ''} restante${sessionsNeeded > 1 ? 's' : ''} cette semaine.`,
            daysLeft, 
            sessionsNeeded 
        };
    }

    async checkAndProcessWeekEnd() {
        const lastWeekCheck = await db.getSetting('lastWeekCheck');
        const { start: currentWeekStart } = this.getWeekBounds();
        
        if (lastWeekCheck) {
            const lastCheckDate = new Date(lastWeekCheck);
            const { start: lastCheckWeekStart } = this.getWeekBounds(lastCheckDate);
            
            if (lastCheckWeekStart.getTime() === currentWeekStart.getTime()) {
                return null;
            }
            
            const weeksPassed = Math.floor((currentWeekStart - lastCheckWeekStart) / (7 * 24 * 60 * 60 * 1000));
            
            if (weeksPassed > 0) {
                return await this.processWeekTransition(weeksPassed, lastCheckWeekStart);
            }
        }
        
        await db.setSetting('lastWeekCheck', new Date().toISOString());
        return null;
    }

    async processWeekTransition(weeksPassed, lastCheckWeekStart) {
        let streakCount = (await db.getSetting('streakCount')) ?? 0;
        let shieldCount = (await db.getSetting('shieldCount')) ?? 0;
        let weekProtected = (await db.getSetting('weekProtected')) ?? false;
        const weeklyGoal = (await db.getSetting('weeklyGoal')) ?? 3;
        
        const results = [];
        const history = await db.getAll('workoutHistory');
        
        // Check each week that passed (i=0 is the week of lastCheckWeekStart, i=1 is the next week, etc.)
        // We check weeks 0 to weeksPassed-1 (the weeks that have ENDED)
        for (let i = 0; i < weeksPassed; i++) {
            const weekToCheck = new Date(lastCheckWeekStart);
            weekToCheck.setDate(weekToCheck.getDate() + (i * 7));
            const { start, end } = this.getWeekBounds(weekToCheck);
            
            const weekSessions = history.filter(w => {
                const d = new Date(w.date);
                return d >= start && d <= end;
            }).length;
            
            const goalMet = weekSessions >= weeklyGoal;
            
            if (goalMet) {
                streakCount++;
                // Award 0.5 shield for completing a successful week (max 3)
                shieldCount = Math.min(shieldCount + 0.5, this.MAX_SHIELDS);
                weekProtected = false;
                results.push({ week: i, success: true, streakCount, shieldCount, weekSessions });
            } else {
                if (shieldCount >= 1) {
                    shieldCount -= 1;
                    weekProtected = true;
                    results.push({ week: i, success: false, protected: true, streakCount, shieldCount, weekSessions });
                } else {
                    streakCount = 0;
                    weekProtected = false;
                    results.push({ week: i, success: false, protected: false, streakCount: 0, shieldCount, weekSessions });
                }
            }
        }
        
        await db.setSetting('streakCount', streakCount);
        await db.setSetting('shieldCount', shieldCount);
        await db.setSetting('weekProtected', weekProtected);
        await db.setSetting('lastWeekCheck', new Date().toISOString());
        
        return results;
    }
    
    // Calculate streak retroactively from workout history (for existing users)
    async calculateRetroactiveStreak() {
        const history = await db.getAll('workoutHistory');
        if (history.length === 0) return { streakCount: 0, shieldCount: 0 };
        
        const weeklyGoal = (await db.getSetting('weeklyGoal')) ?? 3;
        
        // Sort history by date
        const sortedHistory = history.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Find the earliest and latest workout dates
        const firstWorkout = new Date(sortedHistory[0].date);
        const lastWorkout = new Date(sortedHistory[sortedHistory.length - 1].date);
        const { start: currentWeekStart } = this.getWeekBounds();
        
        // Get all weeks from first workout to now
        const weeks = [];
        let weekStart = this.getWeekBounds(firstWorkout).start;
        
        while (weekStart < currentWeekStart) {
            const { start, end } = this.getWeekBounds(weekStart);
            const weekSessions = history.filter(w => {
                const d = new Date(w.date);
                return d >= start && d <= end;
            }).length;
            weeks.push({ start, end, sessions: weekSessions, goalMet: weekSessions >= weeklyGoal });
            weekStart = new Date(weekStart);
            weekStart.setDate(weekStart.getDate() + 7);
        }
        
        // Calculate streak counting backwards from the most recent completed week
        let streakCount = 0;
        let shieldCount = 0;
        let tempShields = 0;
        
        // Process weeks in reverse to find current streak
        for (let i = weeks.length - 1; i >= 0; i--) {
            const week = weeks[i];
            if (week.goalMet) {
                streakCount++;
                tempShields = Math.min(tempShields + 0.5, this.MAX_SHIELDS);
            } else {
                // Streak broken - stop counting
                break;
            }
        }
        
        // Shields earned from recent successful weeks
        shieldCount = tempShields;
        
        return { streakCount, shieldCount, weeks };
    }

    async recordWorkoutForStreak() {
        await this.checkAndProcessWeekEnd();
    }
    
    // Initialize streak system for new or existing users
    async initializeStreakSystem() {
        const lastWeekCheck = await db.getSetting('lastWeekCheck');
        const streakInitialized = await db.getSetting('streakSystemInitialized');
        
        // If no lastWeekCheck exists, calculate retroactive streak
        if (!lastWeekCheck || !streakInitialized) {
            const history = await db.getAll('workoutHistory');
            
            if (history.length > 0) {
                const retroactive = await this.calculateRetroactiveStreak();
                await db.setSetting('streakCount', retroactive.streakCount);
                await db.setSetting('shieldCount', retroactive.shieldCount);
            }
            
            await db.setSetting('lastWeekCheck', new Date().toISOString());
            await db.setSetting('streakSystemInitialized', true);
            await db.setSetting('lastStreakNotification', null);
            
            return true; // Indicates initialization happened
        }
        
        return false;
    }
}

const streakEngine = new StreakEngine();

// ===== Gamification Engine =====
class GamificationEngine {
    constructor() {
        this.confettiColors = ['#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
    }
    
    triggerConfetti(intensity = 'medium') {
        const container = document.createElement('div');
        container.className = 'confetti-container';
        document.body.appendChild(container);
        
        const counts = { light: 30, medium: 60, heavy: 100 };
        const count = counts[intensity] || 60;
        
        for (let i = 0; i < count; i++) {
            const confetti = document.createElement('div');
            const shapes = ['circle', 'square', 'triangle'];
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            
            confetti.className = `confetti ${shape}`;
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.backgroundColor = this.confettiColors[Math.floor(Math.random() * this.confettiColors.length)];
            confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            
            container.appendChild(confetti);
        }
        
        setTimeout(() => container.remove(), 4000);
    }
    
    showAchievement(icon, title, message, xpGain = null) {
        // Remove existing toast if any
        const existing = document.querySelector('.achievement-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'achievement-toast';
        toast.innerHTML = `
            <div class="achievement-toast-icon">${icon}</div>
            <div class="achievement-toast-title">${title}</div>
            <div class="achievement-toast-message">${message}</div>
            ${xpGain ? `<div class="achievement-toast-xp">+${xpGain} XP</div>` : ''}
        `;
        
        document.body.appendChild(toast);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });
        
        // Auto-dismiss
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 400);
        }, 2500);
        
        // Dismiss on tap
        toast.addEventListener('click', () => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 400);
        });
    }
    
    celebrateWorkoutComplete(sessionName, stats) {
        this.triggerConfetti('medium');
        
        setTimeout(() => {
            this.showAchievement(
                '🎉',
                'Séance terminée',
                `${sessionName} • ${stats.totalSets} séries • ${stats.duration} min`,
                stats.xpGain
            );
        }, 300);
    }
    
    celebrateWeeklyGoal() {
        this.triggerConfetti('heavy');
        
        setTimeout(() => {
            this.showAchievement(
                '🏆',
                'Objectif atteint !',
                'Tu as validé ton objectif hebdomadaire !',
                50
            );
        }, 300);
        
        // Add celebration class to streak card
        const streakCard = document.getElementById('streak-card');
        if (streakCard) {
            streakCard.classList.add('celebrating');
            setTimeout(() => streakCard.classList.remove('celebrating'), 2000);
        }
    }
    
    celebrateStreak(streakCount) {
        const milestones = {
            3: { icon: '🔰', title: 'Initié !', message: 'Tu prends le rythme !', xp: 50 },
            6: { icon: '🔥', title: 'Focus !', message: 'En pleine concentration !', xp: 75 },
            10: { icon: '⚔️', title: 'Guerrier !', message: 'Rien ne t\'arrête !', xp: 100 },
            16: { icon: '⚡', title: 'Machine !', message: 'Régularité parfaite !', xp: 150 },
            25: { icon: '💎', title: 'Elite !', message: 'Parmi les meilleurs !', xp: 200 },
            36: { icon: '👑', title: 'Légende !', message: 'Statut légendaire atteint !', xp: 300 },
            52: { icon: '🏆', title: 'TITAN !', message: '1 AN DE STREAK ! Incroyable !', xp: 500 }
        };
        
        const milestone = milestones[streakCount];
        if (milestone) {
            this.triggerConfetti('heavy');
            setTimeout(() => {
                this.showAchievement(milestone.icon, milestone.title, milestone.message, milestone.xp);
            }, 300);
        }
    }
    
    celebrateShieldEarned(shieldCount) {
        const isFullShield = shieldCount % 1 === 0;
        if (isFullShield && shieldCount > 0) {
            this.triggerConfetti('light');
            this.showAchievement('🛡️', 'Bouclier complet !', `Tu as maintenant ${Math.floor(shieldCount)} bouclier${shieldCount > 1 ? 's' : ''} !`, 25);
        }
    }
    
    // Celebrate successful week(s) when opening the app
    celebrateSuccessfulWeeks(results) {
        const successfulWeeks = results.filter(r => r.success);
        if (successfulWeeks.length === 0) return;
        
        const lastResult = results[results.length - 1];
        const streakCount = lastResult.streakCount;
        
        this.triggerConfetti('heavy');
        
        setTimeout(() => {
            if (successfulWeeks.length === 1) {
                this.showAchievement(
                    '🔥',
                    'Semaine validée !',
                    `Félicitations ! Tu as atteint ton objectif la semaine dernière. Ton streak est maintenant de ${streakCount} semaine${streakCount > 1 ? 's' : ''} !`,
                    75
                );
            } else {
                this.showAchievement(
                    '🔥',
                    `${successfulWeeks.length} semaines validées !`,
                    `Incroyable ! Tu as maintenu ton rythme. Streak actuel : ${streakCount} semaine${streakCount > 1 ? 's' : ''} !`,
                    100
                );
            }
        }, 300);
        
        // Trigger streak milestone celebration if applicable
        setTimeout(() => {
            this.celebrateStreak(streakCount);
        }, 2500);
    }
    
    // Celebrate when shield protected a failed week
    celebrateShieldProtection() {
        this.triggerConfetti('light');
        setTimeout(() => {
            this.showAchievement(
                '🛡️',
                'Bouclier utilisé !',
                'Ton bouclier a protégé ton streak cette semaine. Continue comme ça !',
                0
            );
        }, 300);
    }
    
    celebratePersonalRecord(exerciseName) {
        this.triggerConfetti('light');
        this.showAchievement('💪', 'Nouveau record !', `PR sur ${exerciseName}`);
    }
    
    pulseElement(element) {
        element.style.animation = 'none';
        element.offsetHeight; // Trigger reflow
        element.style.animation = 'indicatorPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    }
}

const gamification = new GamificationEngine();

// ===== Main Application =====
class App {
    constructor() {
        this.currentScreen = 'home';
        this.currentSession = null;
        this.currentSlot = null;
        this.currentWorkout = null;
        this.currentCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        this.sessionTimer = null;
        this.sessionStartTime = null;
        this.restTimer = null;
        this.restTimeLeft = 0;
        this.restTimeTotal = 0;
        this.lastExerciseHistory = null;
        this.poolSlotId = null;
        this.editingSessionId = null;
        this.isFinishingSession = false;
        this.isReviewMode = false;
        this.currentSessionFatigueContext = null;
        this.currentExerciseTrendSummary = null;
        this.exerciseProgressHistory = [];
        this.supersetProgressHistory = [];
        this.noteSaveTimeout = null;
        this.homeChartData = {
            history: [],
            setHistory: []
        };
        this.homeChartsFrame = null;
    }

    async init() {
        await db.init();
        await initializeData();
        
        // Automatic storage cleanup on startup
        try {
            const shouldCleanup = await db.shouldCleanup();
            if (shouldCleanup) {
                console.log('🧹 Nettoyage automatique du stockage...');
                await db.cleanupOldData();
            }
        } catch (error) {
            console.error('Erreur lors du nettoyage automatique:', error);
        }
        
        await this.loadCurrentWorkout();
        this.bindEvents();
        this.setupVisibilityHandler();
        await this.updateStorageInfo();
        setInterval(() => this.updateStorageInfo(), 5000);
        await this.renderHome();
        
        // Check for pending session to resume
        await this.checkPendingSession();
    }
    
    // ===== Session Persistence =====
    async checkPendingSession() {
        const savedWorkout = await db.getCurrentWorkout();
        if (!savedWorkout || !savedWorkout.sessionId) return;
        
        // Auto-expire sessions older than 12 hours (storage optimization)
        const MAX_SESSION_AGE = 12 * 60 * 60 * 1000; // 12 hours
        if (Date.now() - savedWorkout.startTime > MAX_SESSION_AGE) {
            console.log('🧹 Séance expirée, nettoyage automatique');
            await db.clearCurrentWorkout();
            return;
        }
        
        const session = await db.get('sessions', savedWorkout.sessionId);
        if (!session) {
            await db.clearCurrentWorkout();
            return;
        }
        
        // Calculate progress
        const slots = await db.getSlotsBySession(session.id);
        const completedCount = savedWorkout.completedSlots?.length || 0;
        const totalCount = slots.length;
        const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
        
        // Calculate elapsed time with better formatting
        const elapsed = Date.now() - savedWorkout.startTime;
        const elapsedMin = Math.floor(elapsed / 60000);
        const elapsedHours = Math.floor(elapsedMin / 60);
        const remainingMin = elapsedMin % 60;
        
        let timeText;
        if (elapsedHours > 0) {
            timeText = `${elapsedHours}h${remainingMin > 0 ? remainingMin : ''}`;
        } else {
            timeText = `${elapsedMin} min`;
        }
        
        // Update modal content
        document.getElementById('resume-session-info').textContent = 
            `Séance "${session.name}" commencée il y a ${timeText}`;
        document.getElementById('resume-progress-text').textContent = 
            `${completedCount}/${totalCount} exercices complétés`;
        document.getElementById('resume-progress-fill').style.width = `${progress}%`;
        
        // Show modal
        document.getElementById('modal-resume-session').classList.add('active');
    }
    
    async resumeSession() {
        document.getElementById('modal-resume-session').classList.remove('active');
        
        const savedWorkout = await db.getCurrentWorkout();
        if (!savedWorkout) return;
        
        const session = await db.get('sessions', savedWorkout.sessionId);
        if (!session) return;
        
        // Restore session state
        this.currentSession = session;
        this.currentWorkout = savedWorkout;
        this.ensureWorkoutCoachingState();
        this.sessionStartTime = savedWorkout.startTime;
        this.isDeloadMode = savedWorkout.isDeload || false;

        const sessionSlots = await db.getSlotsBySession(session.id);
        let workoutTouched = false;
        sessionSlots.forEach(slot => {
            const slotData = this.currentWorkout?.slots?.[slot.id];
            if (slotData && !slotData.meta) {
                slotData.meta = this.buildSlotCoachMeta(slot);
                workoutTouched = true;
            }
        });
        if (workoutTouched) {
            await db.saveCurrentWorkout(this.currentWorkout);
        }
        
        // Update UI
        document.getElementById('current-session-name').textContent = 
            session.name + (this.isDeloadMode ? ' 🔋' : '');
        
        // Start timer from saved time
        this.startSessionTimer();
        
        // Render slots with completed state
        await this.renderSlots();
        this.showScreen('session');
    }
    
    async discardSession() {
        document.getElementById('modal-resume-session').classList.remove('active');
        await db.clearCurrentWorkout();
        this.currentWorkout = null;
        this.currentSession = null;
    }
    
    showQuitSessionModal() {
        document.getElementById('modal-quit-session').classList.add('active');
    }
    
    hideQuitSessionModal() {
        document.getElementById('modal-quit-session').classList.remove('active');
    }
    
    async confirmQuitSession() {
        this.hideQuitSessionModal();
        this.stopSessionTimer();
        await db.clearCurrentWorkout();
        this.currentWorkout = null;
        await this.renderHome();
    }
    
    async updateStorageInfo() {
        try {
            const storageInfo = await db.getStorageInfo();
            const storageElement = document.getElementById('storage-info');
            
            if (storageInfo.quota && storageInfo.usage) {
                const usedMB = (storageInfo.usage / 1024 / 1024).toFixed(2);
                const quotaMB = (storageInfo.quota / 1024 / 1024).toFixed(2);
                const percentUsed = Math.round((storageInfo.usage / storageInfo.quota) * 100);
                
                const persistStatus = storageInfo.isPersisted ? '✅' : '⚠️';
                storageElement.textContent = `${persistStatus} ${usedMB}MB / ${quotaMB}MB (${percentUsed}%)`;
            }
        } catch (error) {
            console.error('Erreur lors de la mise à jour des informations de stockage:', error);
        }
    }
    
    setupVisibilityHandler() {
        // Handle app returning from background on iOS
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.onAppResume();
            }
        });
        
        // Also handle page focus (alternative event)
        window.addEventListener('focus', () => {
            this.onAppResume();
        });
    }
    
    onAppResume() {
        // Check if there's an active timer in localStorage
        const timerEndTime = localStorage.getItem('restTimerEndTime');
        if (timerEndTime) {
            const remaining = Math.max(0, Math.ceil((parseInt(timerEndTime) - Date.now()) / 1000));
            
            if (remaining > 0 && this.currentScreen === 'exercise') {
                // Timer still running, restore it
                this.restTimerEndTime = parseInt(timerEndTime);
                this.restTimeTotal = remaining; // Approximate, but good enough
                
                // Show timer overlay if not already visible
                const overlay = document.getElementById('timer-overlay');
                if (!overlay.classList.contains('active')) {
                    overlay.classList.add('active');
                }
                
                // Restart the update loop if not running
                if (!this.restTimer) {
                    this.updateRestTimer();
                    this.restTimer = setInterval(() => this.updateRestTimer(), 100);
                }
            } else if (remaining <= 0) {
                // Timer expired while app was in background
                localStorage.removeItem('restTimerEndTime');
                if (this.currentScreen === 'exercise') {
                    this.onTimerComplete();
                }
            }
        }
    }

    // ===== Navigation =====
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`screen-${screenId}`).classList.add('active');
        this.currentScreen = screenId;
    }

    getSuggestedSessionIndex(sessions, history, fallbackIndex = 0) {
        if (!Array.isArray(sessions) || sessions.length === 0) return 0;

        const lastDoneBySession = new Map();

        for (const workout of Array.isArray(history) ? history : []) {
            if (!workout?.sessionId || !workout?.date) continue;

            const workoutTime = new Date(workout.date).getTime();
            if (Number.isNaN(workoutTime)) continue;

            const previousTime = lastDoneBySession.get(workout.sessionId);
            if (previousTime === undefined || workoutTime > previousTime) {
                lastDoneBySession.set(workout.sessionId, workoutTime);
            }
        }

        const rankedSessions = sessions.map((session, index) => ({
            index,
            lastDoneAt: lastDoneBySession.get(session.id) ?? Number.NEGATIVE_INFINITY
        }));

        rankedSessions.sort((a, b) => {
            if (a.lastDoneAt !== b.lastDoneAt) {
                return a.lastDoneAt - b.lastDoneAt;
            }

            if (a.index === fallbackIndex) return -1;
            if (b.index === fallbackIndex) return 1;
            return a.index - b.index;
        });

        return rankedSessions[0]?.index ?? 0;
    }

    // ===== Home Screen =====
    async renderHome() {
        this.showScreen('home');

        // Initialize streak system for existing users (retroactive calculation)
        await streakEngine.initializeStreakSystem();
        
        // Process any week transitions and get results
        const weekTransitionResults = await streakEngine.checkAndProcessWeekEnd();
        
        // Show celebration popup if weeks were successfully completed
        if (weekTransitionResults && weekTransitionResults.length > 0) {
            const hasSuccessfulWeeks = weekTransitionResults.some(r => r.success);
            const hasProtectedWeeks = weekTransitionResults.some(r => r.protected);
            
            // Delay celebrations slightly to let the UI render first
            setTimeout(() => {
                if (hasSuccessfulWeeks) {
                    gamification.celebrateSuccessfulWeeks(weekTransitionResults);
                } else if (hasProtectedWeeks) {
                    gamification.celebrateShieldProtection();
                }
            }, 500);
        }
        
        const sessions = await db.getSessions();
        const history = await db.getAll('workoutHistory');
        const storedIndex = (await db.getSetting('nextSessionIndex')) ?? 0;
        const nextIndex = this.getSuggestedSessionIndex(sessions, history, storedIndex);
        const nextSession = sessions[nextIndex];
        
        if (nextSession) {
            document.getElementById('session-name').textContent = nextSession.name;
            document.getElementById('session-duration').textContent = `~${nextSession.estimatedDuration} min`;
            
            const slots = await db.getSlotsBySession(nextSession.id);
            document.getElementById('session-slots').textContent = `${slots.length} exercices`;
            
            this.currentSession = nextSession;
        }

        // Last session info
        if (history.length > 0) {
            const lastWorkout = history.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const lastSession = await db.get('sessions', lastWorkout.sessionId);
            const daysAgo = Math.floor((Date.now() - new Date(lastWorkout.date)) / (1000 * 60 * 60 * 24));
            const daysText = daysAgo === 0 ? "aujourd'hui" : daysAgo === 1 ? 'hier' : `il y a ${daysAgo} jours`;
            document.getElementById('last-session-info').textContent = `Dernière séance : ${lastSession?.name || 'Inconnue'}, ${daysText}`;
        } else {
            document.getElementById('last-session-info').textContent = 'Dernière séance : --';
        }

        this.renderCurrentMonthCalendar(history, sessions);

        // Render streak system
        await this.renderStreakSystem();

        // Render stats
        await this.renderStats();
    }

    getLocalDateKey(dateValue) {
        const date = new Date(dateValue);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    getCurrentMonthRange(baseDate = new Date()) {
        const referenceDate = new Date(baseDate);
        const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    }

    shiftCalendarMonth(offset) {
        const baseDate = this.currentCalendarDate instanceof Date
            ? this.currentCalendarDate
            : new Date();
        this.currentCalendarDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
    }

    getCalendarAccent(index) {
        const palette = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6'];
        return palette[index % palette.length];
    }

    hexToRgba(hex, alpha) {
        if (!hex || typeof hex !== 'string') return `rgba(99, 102, 241, ${alpha})`;
        const normalized = hex.replace('#', '');
        const safeHex = normalized.length === 3
            ? normalized.split('').map(char => char + char).join('')
            : normalized;

        if (safeHex.length !== 6) {
            return `rgba(99, 102, 241, ${alpha})`;
        }

        const intValue = Number.parseInt(safeHex, 16);
        const r = (intValue >> 16) & 255;
        const g = (intValue >> 8) & 255;
        const b = intValue & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    abbreviateSessionName(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) return '--';
        if (trimmed.length <= 10) return trimmed;

        const tokens = trimmed.split(/\s+/).filter(Boolean);
        const acronym = tokens.map(token => token[0]?.toUpperCase() || '').join('');
        if (acronym.length >= 2 && acronym.length <= 5) {
            return acronym;
        }

        return `${trimmed.slice(0, 9).trim()}…`;
    }

    renderCurrentMonthCalendar(history, sessions) {
        const kickerEl = document.getElementById('history-calendar-kicker');
        const titleEl = document.getElementById('history-calendar-title');
        const summaryEl = document.getElementById('history-calendar-summary');
        const gridEl = document.getElementById('history-calendar-grid');
        const emptyEl = document.getElementById('history-calendar-empty');
        const prevBtn = document.getElementById('history-calendar-prev');
        const nextBtn = document.getElementById('history-calendar-next');

        if (!titleEl || !summaryEl || !gridEl || !emptyEl || !kickerEl || !prevBtn || !nextBtn) return;

        const activeMonth = this.currentCalendarDate instanceof Date
            ? this.currentCalendarDate
            : new Date();
        const { start, end } = this.getCurrentMonthRange(activeMonth);
        titleEl.textContent = start.toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });

        const now = new Date();
        const isCurrentMonth = start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
        kickerEl.textContent = isCurrentMonth ? 'Mois en cours' : 'Historique';
        nextBtn.disabled = isCurrentMonth;

        const sessionLookup = new Map();
        const sessionColors = new Map();
        sessions.forEach((session, index) => {
            sessionLookup.set(session.id, session);
            sessionColors.set(session.id, this.getCalendarAccent(index));
        });

        const targetYear = start.getFullYear();
        const targetMonth = start.getMonth();
        const monthHistory = history
            .filter(workout => {
                const workoutDate = new Date(workout.date);
                return workoutDate.getFullYear() === targetYear && workoutDate.getMonth() === targetMonth;
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        summaryEl.textContent = `${monthHistory.length} séance${monthHistory.length > 1 ? 's' : ''}`;
        emptyEl.style.display = monthHistory.length === 0 ? 'block' : 'none';

        const workoutsByDay = new Map();
        for (const workout of monthHistory) {
            const key = this.getLocalDateKey(workout.date);
            if (!workoutsByDay.has(key)) {
                workoutsByDay.set(key, []);
            }

            const session = sessionLookup.get(workout.sessionId);
            workoutsByDay.get(key).push({
                sessionId: workout.sessionId,
                sessionName: session?.name || 'Inconnue'
            });
        }

        gridEl.innerHTML = '';

        const leadingEmptyDays = (start.getDay() + 6) % 7;
        for (let i = 0; i < leadingEmptyDays; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day empty';
            gridEl.appendChild(emptyCell);
        }

        const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(start.getFullYear(), start.getMonth(), day);
            const key = this.getLocalDateKey(date);
            const workouts = workoutsByDay.get(key) || [];
            const primaryColor = sessionColors.get(workouts[0]?.sessionId) || '#6366f1';

            const dayEl = document.createElement('div');
            dayEl.className = `calendar-day${workouts.length ? ' has-workout' : ''}`;

            if (workouts.length) {
                dayEl.style.setProperty('--calendar-accent-soft', this.hexToRgba(primaryColor, 0.14));
                dayEl.style.setProperty('--calendar-accent-border', this.hexToRgba(primaryColor, 0.24));
            }

            const numberEl = document.createElement('span');
            numberEl.className = 'calendar-day-number';
            numberEl.textContent = day;
            dayEl.appendChild(numberEl);

            if (workouts.length) {
                const badgesEl = document.createElement('div');
                badgesEl.className = 'calendar-day-badges';

                workouts.slice(0, 2).forEach(workout => {
                    const badge = document.createElement('span');
                    const accent = sessionColors.get(workout.sessionId) || primaryColor;
                    badge.className = 'calendar-session-badge';
                    badge.style.setProperty('--calendar-badge-bg', this.hexToRgba(accent, 0.14));
                    badge.style.setProperty('--calendar-badge-text', accent);
                    badge.textContent = this.abbreviateSessionName(workout.sessionName);
                    badge.title = workout.sessionName;
                    badgesEl.appendChild(badge);
                });

                if (workouts.length > 2) {
                    const moreBadge = document.createElement('span');
                    moreBadge.className = 'calendar-more-badge';
                    moreBadge.textContent = `+${workouts.length - 2}`;
                    badgesEl.appendChild(moreBadge);
                }

                dayEl.appendChild(badgesEl);
            }

            gridEl.appendChild(dayEl);
        }
    }
    
    // ===== Streak System Rendering =====
    async renderStreakSystem() {
        const data = await streakEngine.getStreakData();
        const prediction = await streakEngine.getWeekPrediction();
        const effectiveStreakCount = data.displayStreakCount ?? data.streakCount;
        const level = streakEngine.getLevel(effectiveStreakCount);
        const nextLevel = streakEngine.LEVELS.find(l => l.min > effectiveStreakCount) || level;
        
        // Render consolidated streak card
        this.renderStreakCard({ ...data, effectiveStreakCount }, prediction, level, nextLevel);
        
        // Render prediction/warning
        this.renderWeekPrediction(prediction);
    }

    getStreakClockIconSVG() {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M12 7v5l3.5 2"></path>
        </svg>`;
    }

    hexToRgbObject(hex) {
        const safe = String(hex || '').trim().replace('#', '');
        const full = safe.length === 3
            ? safe.split('').map((char) => char + char).join('')
            : safe.padEnd(6, '0').slice(0, 6);

        return {
            r: Number.parseInt(full.slice(0, 2), 16),
            g: Number.parseInt(full.slice(2, 4), 16),
            b: Number.parseInt(full.slice(4, 6), 16)
        };
    }

    mixHexColors(hexA, hexB, amount = 0.5) {
        const t = Math.min(1, Math.max(0, amount));
        const a = this.hexToRgbObject(hexA);
        const b = this.hexToRgbObject(hexB);

        const r = Math.round(a.r + (b.r - a.r) * t);
        const g = Math.round(a.g + (b.g - a.g) * t);
        const bValue = Math.round(a.b + (b.b - a.b) * t);

        return `rgb(${r}, ${g}, ${bValue})`;
    }

    rgbaFromHex(hex, alpha) {
        const { r, g, b } = this.hexToRgbObject(hex);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    getStreakVisualConfig(streakCount) {
        const clamped = Math.min(Math.max(Number(streakCount) || 0, 0), 52);

        const stages = [
            {
                score: 0,
                colors: ['#ffe35a', '#ffbf1f', '#ff9200', '#ff5f0f'],
                glow: '#ff9d14',
                halo: '#ffcb47',
                shadow: '#8f3a00',
                sparkOpacity: 0.12,
                flameOpacity: 0.3,
                motionClass: 'is-calm'
            },
            {
                score: 4,
                colors: ['#ffd93f', '#ffab14', '#ff7b00', '#ff4d0a'],
                glow: '#ff8a12',
                halo: '#ffc43f',
                shadow: '#8d2f00',
                sparkOpacity: 0.18,
                flameOpacity: 0.38,
                motionClass: 'is-warm'
            },
            {
                score: 8,
                colors: ['#ffc926', '#ff8d00', '#ff5a00', '#f23800'],
                glow: '#ff7108',
                halo: '#ffb22a',
                shadow: '#851f00',
                sparkOpacity: 0.34,
                flameOpacity: 0.46,
                motionClass: 'is-warm'
            },
            {
                score: 12,
                colors: ['#ffb01f', '#ff6200', '#ff2b00', '#d40000'],
                glow: '#ff4d0d',
                halo: '#ff9631',
                shadow: '#7f1200',
                sparkOpacity: 0.44,
                flameOpacity: 0.56,
                motionClass: 'is-hot'
            },
            {
                score: 16,
                colors: ['#ffad22', '#ff4f0e', '#ff1720', '#a40010'],
                glow: '#ff3520',
                halo: '#ff7a40',
                shadow: '#710813',
                sparkOpacity: 0.52,
                flameOpacity: 0.62,
                motionClass: 'is-hot'
            },
            {
                score: 24,
                colors: ['#ff9a3a', '#ff4d5f', '#ff117c', '#bb005f'],
                glow: '#ff2d75',
                halo: '#ff7db2',
                shadow: '#700038',
                sparkOpacity: 0.58,
                flameOpacity: 0.68,
                motionClass: 'is-pink'
            },
            {
                score: 32,
                colors: ['#ff8fd0', '#ff3ea7', '#ff007f', '#b30066'],
                glow: '#ff2395',
                halo: '#ff7fcc',
                shadow: '#650038',
                sparkOpacity: 0.64,
                flameOpacity: 0.74,
                motionClass: 'is-pink'
            },
            {
                score: 40,
                colors: ['#d48cff', '#a33cff', '#6e1fff', '#4215cf'],
                glow: '#7d36ff',
                halo: '#bc78ff',
                shadow: '#2f116f',
                sparkOpacity: 0.72,
                flameOpacity: 0.8,
                motionClass: 'is-purple'
            },
            {
                score: 52,
                colors: ['#e2a5ff', '#b24cff', '#6e20ff', '#2e0fc9'],
                glow: '#8141ff',
                halo: '#c58cff',
                shadow: '#240c72',
                sparkOpacity: 0.78,
                flameOpacity: 0.88,
                motionClass: 'is-purple-max'
            }
        ];

        let start = stages[0];
        let end = stages[stages.length - 1];

        for (let index = 0; index < stages.length - 1; index += 1) {
            const current = stages[index];
            const next = stages[index + 1];

            if (clamped <= next.score) {
                start = current;
                end = next;
                break;
            }
        }

        const span = Math.max(1, end.score - start.score);
        const t = Math.min(1, Math.max(0, (clamped - start.score) / span));

        const gradient = start.colors.map((color, index) => this.mixHexColors(color, end.colors[index], t));
        const glow = this.mixHexColors(start.glow, end.glow, t);
        const halo = this.mixHexColors(start.halo, end.halo, t);
        const shadow = this.mixHexColors(start.shadow, end.shadow, t);
        const sparkOpacity = (start.sparkOpacity + (end.sparkOpacity - start.sparkOpacity) * t).toFixed(2);
        const flameOpacity = (start.flameOpacity + (end.flameOpacity - start.flameOpacity) * t).toFixed(2);

        const scale = (1 + clamped * 0.0026).toFixed(3);
        const floatDistance = `${Math.min(10, 5 + clamped * 0.08).toFixed(2)}px`;
        const animationSeconds = `${Math.max(5.2, 7.2 - clamped * 0.03).toFixed(2)}s`;

        return {
            c1: gradient[0],
            c2: gradient[1],
            c3: gradient[2],
            c4: gradient[3],
            glow,
            glowSoft: this.rgbaFromHex(glow, 0.18),
            glowMid: this.rgbaFromHex(glow, 0.32),
            halo,
            haloSoft: this.rgbaFromHex(halo, 0.32),
            shadow,
            shadowSoft: this.rgbaFromHex(shadow, 0.28),
            shadowDeep: this.rgbaFromHex(shadow, 0.38),
            sparkOpacity,
            flameOpacity,
            scale,
            floatDistance,
            animationSeconds,
            motionClass: end.motionClass
        };
    }

    renderStreakScoreVisual(score) {
        const theme = this.getStreakVisualConfig(score);

        return `
            <div
                class="streakv4-score-visual ${theme.motionClass}"
                style="
                    --streak-core-1:${theme.c1};
                    --streak-core-2:${theme.c2};
                    --streak-core-3:${theme.c3};
                    --streak-core-4:${theme.c4};
                    --streak-glow:${theme.glow};
                    --streak-glow-soft:${theme.glowSoft};
                    --streak-glow-mid:${theme.glowMid};
                    --streak-halo:${theme.halo};
                    --streak-halo-soft:${theme.haloSoft};
                    --streak-shadow:${theme.shadow};
                    --streak-shadow-soft:${theme.shadowSoft};
                    --streak-shadow-deep:${theme.shadowDeep};
                    --streak-spark-opacity:${theme.sparkOpacity};
                    --streak-flame-opacity:${theme.flameOpacity};
                    --streak-score-scale:${theme.scale};
                    --streak-float-distance:${theme.floatDistance};
                    --streak-flow-duration:${theme.animationSeconds};
                "
                aria-label="Score streak ${score}"
            >
                <span class="streakv4-score-flame flame-back" aria-hidden="true"></span>
                <span class="streakv4-score-flame flame-front" aria-hidden="true"></span>
                <span class="streakv4-score-number" data-score="${score}">${score}</span>
                <span class="streakv4-score-spark spark-a" aria-hidden="true"></span>
                <span class="streakv4-score-spark spark-b" aria-hidden="true"></span>
                <span class="streakv4-score-spark spark-c" aria-hidden="true"></span>
                <span class="streakv4-score-spark spark-d" aria-hidden="true"></span>
                <span class="streakv4-score-spark spark-e" aria-hidden="true"></span>
                <span class="streakv4-score-spark spark-f" aria-hidden="true"></span>
                <span class="streakv4-score-spark spark-g" aria-hidden="true"></span>
            </div>
        `;
    }

    renderStreakCard(data, prediction, level, nextLevel) {
        const container = document.getElementById('streak-card');
        if (!container) return;

        const isComplete = data.currentWeekValidated ?? (data.currentWeekSessions >= data.weeklyGoal);
        const effectiveStreakCount = data.effectiveStreakCount ?? data.displayStreakCount ?? data.streakCount;
        const progressInLevel = effectiveStreakCount - level.min;
        const levelRange = nextLevel === level ? 1 : (nextLevel.min - level.min) || 1;
        const levelProgress = nextLevel === level ? 100 : Math.min((progressInLevel / levelRange) * 100, 100);
        const weeksToNext = nextLevel.min - effectiveStreakCount;
        const sessionsRemaining = Math.max(0, data.weeklyGoal - data.currentWeekSessions);

        const sessionsHtml = Array.from({ length: data.weeklyGoal }, (_, index) => {
            const filled = index < data.currentWeekSessions;
            return `<span class="streakv4-session-indicator ${filled ? 'is-filled' : ''}" aria-hidden="true">
                ${filled ? `<svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>` : ''}
            </span>`;
        }).join('');

        const fullShields = Math.floor(data.shieldCount);
        const hasHalf = data.shieldCount % 1 >= 0.5;
        const shieldsHtml = Array.from({ length: 3 }, (_, index) => {
            if (index < fullShields) {
                return `<span class="streakv4-shield is-filled" aria-hidden="true">${this.getShieldSVG('full')}</span>`;
            }
            if (index === fullShields && hasHalf) {
                return `<span class="streakv4-shield is-half" aria-hidden="true">${this.getShieldSVG('half')}</span>`;
            }
            return `<span class="streakv4-shield is-empty" aria-hidden="true">${this.getShieldSVG('empty')}</span>`;
        }).join('');

        const protectedBadge = data.weekProtected
            ? `<div class="streakv4-protected">
                ${this.getShieldSVG('full')}
                <span>Protégé</span>
            </div>`
            : '';

        const weekStatusText = isComplete
            ? `<div class="streakv4-status streakv4-status--success"><strong>✓ Objectif validé !</strong></div>`
            : sessionsRemaining === 1
                ? `<div class="streakv4-status">
                    <span class="streakv4-status-icon">${this.getStreakClockIconSVG()}</span>
                    <strong>${data.currentWeekSessions}/${data.weeklyGoal}</strong>
                    <span class="streakv4-status-muted">· Plus qu'une !</span>
                </div>`
                : `<div class="streakv4-status">
                    <span class="streakv4-status-icon">${this.getStreakClockIconSVG()}</span>
                    <strong>${data.currentWeekSessions}/${data.weeklyGoal}</strong>
                    <span class="streakv4-status-muted">· ${sessionsRemaining} restante${sessionsRemaining > 1 ? 's' : ''}</span>
                </div>`;

        const shieldExplanation = data.shieldCount < 3
            ? `<div class="streakv4-shields-hint">+0.5 par semaine validée</div>`
            : `<div class="streakv4-shields-hint is-full">Maximum atteint !</div>`;

        const levelStyle = [
            `--streak-level-color:${level.color}`,
            `--streak-level-soft:${level.color}`,
            `--streak-level-glow:${this.hexToRgba(level.color, 0.24)}`
        ].join(';');

        const nextLevelText = weeksToNext > 0
            ? `${nextLevel.emoji} <strong>${nextLevel.name}</strong> dans ${weeksToNext} sem.`
            : `<strong>Niveau max !</strong>`;

        container.innerHTML = `
            <div class="streakv4-shell">
                <div class="streakv4-hero">
                    <div class="streakv4-score">
                        ${this.renderStreakScoreVisual(effectiveStreakCount)}
                        <div class="streakv4-score-label">STREAK</div>
                    </div>

                    <div class="streakv4-meta">
                        <div class="streakv4-level-row">
                            <span class="streakv4-level-emoji">${level.emoji}</span>
                            <div class="streakv4-level-pill" style="${levelStyle}">
                                <span>${level.name}</span>
                            </div>
                        </div>
                        <div class="streakv4-level-description">${level.description}</div>
                        <div class="streakv4-progress">
                            <div class="streakv4-progress-track">
                                <div class="streakv4-progress-fill" style="width:${levelProgress}%; background:linear-gradient(90deg, ${level.color}, ${nextLevel.color});"></div>
                            </div>
                            <div class="streakv4-next-level">${nextLevelText}</div>
                        </div>
                    </div>
                </div>

                <div class="streakv4-divider"></div>

                <div class="streakv4-week">
                    <div class="streakv4-week-header">
                        <div class="streakv4-week-title">Cette semaine</div>
                        ${protectedBadge}
                    </div>

                    <div class="streakv4-week-body">
                        <div class="streakv4-week-left">
                            ${weekStatusText}
                            <div class="streakv4-session-row">${sessionsHtml}</div>
                        </div>

                        <div class="streakv4-week-right">
                            <div class="streakv4-shields-header">
                                <span class="streakv4-shields-label">🛡️ Boucliers</span>
                                <span class="streakv4-shields-count">${data.shieldCount}/3</span>
                            </div>
                            <div class="streakv4-shields-row">${shieldsHtml}</div>
                            ${shieldExplanation}
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.className = `streak-card streak-card-v4${isComplete ? ' is-week-complete' : ''}`;
    }
    
    getLevelIconSVG(levelName) {
        const name = levelName.toLowerCase();
        
        if (name === 'rookie') {
            // Rookie: Simple target/goal icon
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="6"/>
                <circle cx="12" cy="12" r="2"/>
            </svg>`;
        } else if (name === 'focus') {
            // Focus: Lightning bolt for energy/focus
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>`;
        } else if (name === 'machine') {
            // Machine: Gear/cog for mechanical precision
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24"/>
            </svg>`;
        } else {
            // Légende: Crown/star for legendary status
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>`;
        }
    }
    
    getShieldSVG(type) {
        if (type === 'full') {
            return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"/>
            </svg>`;
        } else if (type === 'half') {
            return `<svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" 
                      fill="none" stroke="currentColor" stroke-width="2"/>
                <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91V2z" fill="currentColor"/>
            </svg>`;
        }
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"/>
        </svg>`;
    }

    getSupersetBoltIconSVG() {
        return `
            <svg viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"></path>
            </svg>
        `;
    }
    
    renderWeekPrediction(prediction) {
        const container = document.getElementById('week-prediction');
        if (!container) return;
        
        if (prediction.status === 'success') {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'flex';
        container.className = `week-prediction prediction-${prediction.status}`;
        
        let icon = '';
        if (prediction.status === 'danger') {
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>`;
        } else if (prediction.status === 'warning') {
            icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="9" fill="url(#warningGradient)" stroke="none"></circle>
                <defs>
                    <linearGradient id="warningGradient" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#fef3c7"/>
                        <stop offset="100%" stop-color="#fcd34d"/>
                    </linearGradient>
                </defs>
                <circle cx="12" cy="12" r="9" stroke="currentColor" fill="none"></circle>
                <path d="M12 6v6.5" stroke-linecap="round"></path>
                <circle cx="12" cy="15.8" r="1.1" fill="currentColor" stroke="none"></circle>
            </svg>`;
        } else {
            icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>`;
        }
        
        container.innerHTML = `
            <span class="prediction-icon">${icon}</span>
            <span class="prediction-message">${prediction.message}</span>
        `;
    }

    // ===== Stats Section =====
    async renderStats() {
        const history = await db.getAll('workoutHistory');
        const setHistory = await db.getAll('setHistory');
        this.homeChartData = {
            history,
            setHistory
        };
        
        // Total workouts
        document.getElementById('stat-total-workouts').textContent = history.length;
        
        // This month workouts
        const now = new Date();
        const thisMonthWorkouts = history.filter(w => {
            const d = new Date(w.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length;
        document.getElementById('stat-this-month').textContent = thisMonthWorkouts;
        
        // Total volume
        let totalVolume = 0;
        for (const set of setHistory) {
            totalVolume += (set.weight || 0) * (set.reps || 0);
        }
        document.getElementById('stat-total-volume').textContent = this.formatVolume(totalVolume);
        
        // Motivation message
        this.renderMotivationMessage(history, thisMonthWorkouts, totalVolume);
        
        // Charts
        this.scheduleHomeChartsRender();
        
        // Muscle group stats
        await this.renderMuscleStats();
    }
    
    async renderMuscleStats() {
        const container = document.getElementById('muscle-stats-grid');
        if (!container) return;
        
        const volumeByMuscle = await this.getWeeklyVolumeByMuscle();
        const slots = await db.getAll('slots');
        
        // Get unique muscle groups from slots that have been used
        const usedMuscleGroups = new Set();
        for (const slot of slots) {
            if (slot.muscleGroup) {
                usedMuscleGroups.add(slot.muscleGroup);
            }
        }
        
        // If no muscle groups configured, show empty state
        if (usedMuscleGroups.size === 0) {
            container.innerHTML = `
                <div class="muscle-stats-empty" style="grid-column: 1 / -1;">
                    <svg class="muscle-stats-empty-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/>
                        <line x1="16" y1="8" x2="2" y2="22"/>
                        <line x1="17.5" y1="15" x2="9" y2="15"/>
                    </svg>
                    <div>Configure les groupes musculaires dans tes exercices pour voir les stats</div>
                </div>
            `;
            return;
        }
        
        // Build muscle stats HTML
        let html = '';
        const maxSets = 20; // Reference for progress bar
        
        // Sort muscle groups: those with volume first, then alphabetically
        const sortedGroups = Array.from(usedMuscleGroups).sort((a, b) => {
            const volA = volumeByMuscle[a]?.effectiveSets || 0;
            const volB = volumeByMuscle[b]?.effectiveSets || 0;
            if (volB !== volA) return volB - volA;
            return a.localeCompare(b);
        });
        
        for (const muscleId of sortedGroups) {
            const muscleInfo = MUSCLE_GROUPS.find(m => m.id === muscleId);
            if (!muscleInfo) continue;
            
            const volume = volumeByMuscle[muscleId]?.effectiveSets || 0;
            const formattedVolume = this.formatVolume(
                Number.isFinite(volume) ? Math.round(volume * 10) / 10 : 0
            );
            const hasVolume = volume > 0;
            const isOptimal = volume >= VOLUME_THRESHOLDS.minimum && volume <= VOLUME_THRESHOLDS.optimal;
            const isExcessive = volume > VOLUME_THRESHOLDS.maximum;
            const isLow = hasVolume && volume < VOLUME_THRESHOLDS.minimum;
            
            const progressPercent = Math.min((volume / maxSets) * 100, 100);
            
            let statusClass = '';
            let statusLabel = '';
            if (isExcessive) {
                statusClass = 'excessive';
                statusLabel = 'Excessif';
            } else if (isOptimal) {
                statusClass = 'optimal';
                statusLabel = 'Optimal';
            } else if (isLow) {
                statusClass = 'has-volume low';
                statusLabel = 'Insuffisant';
            } else if (hasVolume) {
                statusClass = 'has-volume';
                statusLabel = '';
            }
            
            html += `
                <div class="muscle-stat-item ${statusClass}">
                    <div class="muscle-stat-header">
                        <span class="muscle-stat-name">${muscleInfo.name}</span>
                        ${statusLabel ? `<span class="muscle-stat-status">${statusLabel}</span>` : ''}
                    </div>
                    <div class="muscle-stat-value">
                        <span class="muscle-stat-sets">${formattedVolume}</span>
                        <span class="muscle-stat-unit">séries</span>
                    </div>
                    <div class="muscle-stat-bar">
                        <div class="muscle-stat-fill" style="width: ${progressPercent}%"></div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }
    
    formatVolume(vol) {
        if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
        if (vol >= 1000) return (vol / 1000).toFixed(1) + 'k';
        if (Number.isInteger(vol)) return vol.toString();
        return vol.toFixed(1).replace(/\.0$/, '');
    }
    
    drawRoundRect(ctx, x, y, width, height, radius) {
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, width, height, radius);
        } else {
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        }
    }

    scheduleHomeChartsRender() {
        if (this.homeChartsFrame) {
            cancelAnimationFrame(this.homeChartsFrame);
        }

        this.homeChartsFrame = requestAnimationFrame(() => {
            this.homeChartsFrame = null;
            this.renderVolumeChart(this.homeChartData.setHistory || []);
            this.renderFrequencyChart(this.homeChartData.history || []);
        });
    }

    getChartContext(canvas) {
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const width = Math.round(rect.width || canvas.clientWidth || 0);
        const height = Math.round(rect.height || canvas.clientHeight || 0);

        if (!ctx || width <= 0 || height <= 0) return null;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        return { ctx, width, height };
    }

    getWeekStart(dateValue) {
        const date = new Date(dateValue);
        const day = date.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        date.setDate(date.getDate() + diffToMonday);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    formatWeekShort(dateValue) {
        return new Intl.DateTimeFormat('fr-FR', {
            day: 'numeric',
            month: 'short'
        }).format(new Date(dateValue));
    }

    getRecentWeeklyBuckets(totalWeeks, getValueForRange) {
        const currentWeekStart = this.getWeekStart(new Date());
        const buckets = [];

        for (let index = totalWeeks - 1; index >= 0; index--) {
            const start = new Date(currentWeekStart);
            start.setDate(currentWeekStart.getDate() - (index * 7));

            const end = new Date(start);
            end.setDate(start.getDate() + 7);

            buckets.push({
                start,
                end,
                shortLabel: this.formatWeekShort(start),
                value: getValueForRange(start, end)
            });
        }

        return buckets;
    }

    drawChartEmptyState(ctx, width, height, message) {
        ctx.save();
        ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
        ctx.beginPath();
        this.drawRoundRect(ctx, 0, 0, width, height, 16);
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 13px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, width / 2, height / 2);
        ctx.restore();
    }

    drawChartGrid(ctx, width, top, bottom, left, right, lines = 4) {
        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
        ctx.lineWidth = 1;

        for (let i = 0; i < lines; i++) {
            const y = top + ((bottom - top) / Math.max(lines - 1, 1)) * i;
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(width - right, y);
            ctx.stroke();
        }

        ctx.restore();
    }
    
    renderMotivationMessage(history, thisMonth, totalVolume) {
        const container = document.getElementById('stats-motivation');
        
        if (history.length === 0) {
            container.innerHTML = `
                <span class="stats-motivation-icon">🎯</span>
                <span class="stats-motivation-text">C'est le moment de commencer ! Ta première séance t'attend.</span>
            `;
            return;
        }
        
        // Check recent activity
        const lastWorkout = history.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const daysSinceLast = Math.floor((Date.now() - new Date(lastWorkout.date)) / (1000 * 60 * 60 * 24));
        
        let icon, message;
        
        if (daysSinceLast === 0) {
            icon = '🔥';
            message = 'Tu as trainé aujourd\'hui ! Continue sur cette lancée !';
        } else if (daysSinceLast === 1) {
            icon = '💪';
            message = 'Bonne récup ! Prêt pour ta prochaine séance ?';
        } else if (daysSinceLast <= 3) {
            icon = '✅';
            message = `${daysSinceLast} jours de repos. Parfait pour la récupération !`;
        } else if (daysSinceLast <= 7) {
            icon = '⏰';
            message = `${daysSinceLast} jours sans training. Il est temps d'y retourner !`;
        } else {
            icon = '🚀';
            message = 'Ca fait un moment ! Reviens en force, on y croit !';
        }
        
        // Override with achievements
        if (thisMonth >= 12) {
            icon = '🏆';
            message = `${thisMonth} séances ce mois ! Tu es une machine !`;
        } else if (thisMonth >= 8) {
            icon = '⭐';
            message = `${thisMonth} séances ce mois ! Excellent rythme !`;
        } else if (history.length === 10) {
            icon = '🎉';
            message = '10 séances au total ! Belle étape !';
        } else if (history.length === 50) {
            icon = '🌟';
            message = '50 séances ! Tu es un vétéran !';
        } else if (history.length === 100) {
            icon = '👑';
            message = '100 séances ! Légende absolue !';
        }
        
        container.innerHTML = `
            <span class="stats-motivation-icon">${icon}</span>
            <span class="stats-motivation-text">${message}</span>
        `;
    }
    
    renderVolumeChart(setHistory) {
        const canvas = document.getElementById('volume-chart');
        const chart = this.getChartContext(canvas);
        if (!chart) return;

        const subtitle = document.getElementById('volume-chart-subtitle');
        const { ctx, width, height } = chart;
        const weeks = this.getRecentWeeklyBuckets(4, (weekStart, weekEnd) => {
            let volume = 0;

            for (const set of setHistory) {
                const setDate = new Date(set.date);
                if (setDate >= weekStart && setDate < weekEnd) {
                    volume += (set.weight || 0) * (set.reps || 0);
                }
            }

            return volume;
        });

        const values = weeks.map(week => week.value);
        const hasData = values.some(value => value > 0);

        if (subtitle) {
            subtitle.textContent = hasData
                ? `Pic: ${this.formatVolume(Math.max(...values))} sur les 4 dernières semaines`
                : 'Les volumes hebdo apparaîtront ici après tes prochaines séances';
        }

        if (!hasData) {
            this.drawChartEmptyState(ctx, width, height, 'Aucune charge enregistrée sur cette période');
            return;
        }

        const top = 18;
        const bottom = height - 28;
        const left = 10;
        const right = 10;
        const availableWidth = width - left - right;
        const slotWidth = availableWidth / weeks.length;
        const barWidth = Math.min(36, slotWidth * 0.56);
        const chartHeight = bottom - top;
        const maxValue = Math.max(...values, 1);

        this.drawChartGrid(ctx, width, top, bottom, left, right, 4);

        weeks.forEach((week, index) => {
            const x = left + (slotWidth * index) + ((slotWidth - barWidth) / 2);
            const ratio = week.value / maxValue;
            const barHeight = Math.max(10, chartHeight * ratio);
            const y = bottom - barHeight;

            ctx.save();
            ctx.fillStyle = 'rgba(99, 102, 241, 0.09)';
            ctx.beginPath();
            this.drawRoundRect(ctx, x, top, barWidth, chartHeight, 12);
            ctx.fill();

            const gradient = ctx.createLinearGradient(x, y, x, bottom);
            gradient.addColorStop(0, '#818cf8');
            gradient.addColorStop(1, '#4f46e5');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            this.drawRoundRect(ctx, x, y, barWidth, barHeight, 12);
            ctx.fill();

            ctx.fillStyle = '#0f172a';
            ctx.font = '700 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.formatVolume(week.value), x + (barWidth / 2), Math.max(12, y - 8));

            ctx.fillStyle = '#64748b';
            ctx.font = '600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillText(week.shortLabel, x + (barWidth / 2), height - 10);
            ctx.restore();
        });
    }
    
    renderFrequencyChart(history) {
        const canvas = document.getElementById('frequency-chart');
        const chart = this.getChartContext(canvas);
        if (!chart) return;

        const subtitle = document.getElementById('frequency-chart-subtitle');
        const { ctx, width, height } = chart;
        const weeks = this.getRecentWeeklyBuckets(6, (weekStart, weekEnd) => {
            let count = 0;

            for (const workout of history) {
                const workoutDate = new Date(workout.date);
                if (workoutDate >= weekStart && workoutDate < weekEnd) {
                    count++;
                }
            }

            return count;
        });

        const values = weeks.map(week => week.value);
        const totalSessions = values.reduce((sum, value) => sum + value, 0);
        const average = totalSessions > 0 ? totalSessions / values.length : 0;
        const hasData = totalSessions > 0;

        if (subtitle) {
            subtitle.textContent = hasData
                ? `${Math.round(average * 10) / 10} séance${average >= 2 ? 's' : ''}/semaine en moyenne`
                : 'Ton rythme hebdo apparaîtra ici dès les premières séances';
        }

        if (!hasData) {
            this.drawChartEmptyState(ctx, width, height, 'Aucune séance sur les 6 dernières semaines');
            return;
        }

        const top = 18;
        const bottom = height - 28;
        const left = 14;
        const right = 14;
        const chartHeight = bottom - top;
        const chartWidth = width - left - right;
        const maxValue = Math.max(...values, 1);
        const stepX = weeks.length > 1 ? chartWidth / (weeks.length - 1) : 0;
        const points = weeks.map((week, index) => ({
            x: left + (stepX * index),
            y: bottom - ((week.value / maxValue) * chartHeight),
            label: week.shortLabel,
            value: week.value
        }));

        this.drawChartGrid(ctx, width, top, bottom, left, right, 4);

        ctx.beginPath();
        points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.lineTo(points[points.length - 1].x, bottom);
        ctx.lineTo(points[0].x, bottom);
        ctx.closePath();

        const areaGradient = ctx.createLinearGradient(0, top, 0, bottom);
        areaGradient.addColorStop(0, 'rgba(34, 197, 94, 0.22)');
        areaGradient.addColorStop(1, 'rgba(34, 197, 94, 0.03)');
        ctx.fillStyle = areaGradient;
        ctx.fill();

        ctx.beginPath();
        points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#22c55e';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        points.forEach((point, index) => {
            ctx.beginPath();
            ctx.fillStyle = index === points.length - 1 ? '#16a34a' : '#22c55e';
            ctx.arc(point.x, point.y, index === points.length - 1 ? 5 : 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.fillStyle = '#ffffff';
            ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#64748b';
            ctx.font = '600 10px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(point.label, point.x, height - 10);

            if (point.value > 0) {
                ctx.fillStyle = '#0f172a';
                ctx.font = '700 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.fillText(point.value, point.x, Math.max(12, point.y - 10));
            }
        });
    }

    // ===== Deload System =====
    async checkDeloadSuggestion() {
        const cycleLength = (await db.getSetting('cycleLength')) ?? 5;
        const autoDeloadEnabled = (await db.getSetting('autoDeloadEnabled')) ?? true;
        const coldDayThreshold = (await db.getSetting('coldDayThreshold')) ?? 3;
        
        // Get workout history
        const history = await db.getAll('workoutHistory');
        if (history.length === 0) return { shouldSuggest: false };
        
        // Sort by date
        const sortedHistory = history.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Check 1: Cycle-based deload (every X weeks)
        const lastDeloadDate = await db.getSetting('lastDeloadDate');
        const cycleStartDate = await db.getSetting('cycleStartDate');
        
        if (cycleStartDate) {
            const weeksSinceCycleStart = Math.floor((Date.now() - new Date(cycleStartDate)) / (7 * 24 * 60 * 60 * 1000));
            if (weeksSinceCycleStart >= cycleLength - 1) {
                return {
                    shouldSuggest: true,
                    reason: 'cyclique',
                    message: `Tu as complété ${weeksSinceCycleStart} semaines d'entraînement intensif. Ton corps a besoin de récupérer pour continuer à progresser !`
                };
            }
        }
        
        // Check 2: Auto-deload based on cold days (if enabled)
        if (autoDeloadEnabled && sortedHistory.length >= coldDayThreshold) {
            let consecutiveColdDays = 0;
            
            for (let i = 0; i < Math.min(sortedHistory.length, coldDayThreshold + 2); i++) {
                const workout = sortedHistory[i];
                if (workout.dayStatus === 'cold' || workout.performanceDown) {
                    consecutiveColdDays++;
                } else {
                    break;
                }
            }
            
            if (consecutiveColdDays >= coldDayThreshold) {
                return {
                    shouldSuggest: true,
                    reason: 'fatigue',
                    message: `Tes ${consecutiveColdDays} dernières séances montrent des signes de fatigue accumulée. Une semaine de récupération t'aidera à revenir plus fort !`
                };
            }
        }
        
        return { shouldSuggest: false };
    }
    
    async showDeloadModal(deloadInfo) {
        const modal = document.getElementById('modal-deload');
        const reasonEl = document.getElementById('deload-reason');
        
        const deloadVolumeReduction = (await db.getSetting('deloadVolumeReduction')) ?? 50;
        const deloadIntensityReduction = (await db.getSetting('deloadPercent')) ?? 10;
        
        reasonEl.innerHTML = `
            <div class="deload-reason-badge ${deloadInfo.reason}">
                ${deloadInfo.reason === 'cyclique' ? '📅 Fin de cycle' : '😓 Fatigue détectée'}
            </div>
            <p>${deloadInfo.message}</p>
        `;
        
        document.getElementById('deload-volume-reduction').textContent = deloadVolumeReduction + '%';
        document.getElementById('deload-intensity-reduction').textContent = deloadIntensityReduction + '%';
        
        modal.classList.add('active');
        
        return new Promise((resolve) => {
            const acceptBtn = document.getElementById('btn-accept-deload');
            const skipBtn = document.getElementById('btn-skip-deload');
            
            const cleanup = () => {
                acceptBtn.removeEventListener('click', onAccept);
                skipBtn.removeEventListener('click', onSkip);
                modal.classList.remove('active');
            };
            
            const onAccept = async () => {
                cleanup();
                await db.setSetting('isDeloadMode', true);
                await db.setSetting('lastDeloadDate', new Date().toISOString());
                await db.setSetting('cycleStartDate', new Date().toISOString()); // Reset cycle
                resolve(true);
            };
            
            const onSkip = () => {
                cleanup();
                resolve(false);
            };
            
            acceptBtn.addEventListener('click', onAccept);
            skipBtn.addEventListener('click', onSkip);
        });
    }
    
    async getDeloadModifiers() {
        const isDeload = await db.getSetting('isDeloadMode');
        if (!isDeload) return { volume: 1, intensity: 1 };
        
        const volumeReduction = (await db.getSetting('deloadVolumeReduction')) ?? 50;
        const intensityReduction = (await db.getSetting('deloadPercent')) ?? 10;
        
        return {
            volume: 1 - (volumeReduction / 100),
            intensity: 1 - (intensityReduction / 100)
        };
    }

    // ===== Volume Tracker =====
    async getWeeklyVolumeByMuscle() {
        const { start, end } = streakEngine.getWeekBounds();
        const setHistory = await db.getAll('setHistory');
        const slots = await db.getAll('slots');
        
        const slotMap = {};
        for (const slot of slots) {
            slotMap[slot.id] = slot;
        }
        
        // Count sets per muscle this week
        const volumeByMuscle = {};
        
        for (const set of setHistory) {
            const setDate = new Date(set.date);
            if (setDate >= start && setDate <= end) {
                const slot = slotMap[set.slotId];
                const slotMeta = this.buildSlotCoachMeta(slot);
                const contributions = this.getExerciseMuscleContributions(set.exerciseId || slot?.activeExercise || slot?.name);
                if (contributions.length === 0 && slot?.muscleGroup) {
                    contributions.push({ muscleId: slot.muscleGroup, role: 'primary', weight: 1 });
                }
                const inferredRpe = set.rpe != null ? set.rpe : this.estimateSetRpe(set, slotMeta);
                const effectiveScore = set.rpe != null
                    ? this.calculateEffectiveVolumeScore(set.reps, inferredRpe, set.weight, null)
                    : Math.min(0.75, this.calculateEffectiveVolumeScore(set.reps, inferredRpe, set.weight, null));

                contributions.forEach(({ muscleId, weight }) => {
                    if (!volumeByMuscle[muscleId]) {
                        volumeByMuscle[muscleId] = { sets: 0, effectiveSets: 0 };
                    }
                    volumeByMuscle[muscleId].sets += weight;
                    volumeByMuscle[muscleId].effectiveSets += effectiveScore * weight;
                });
            }
        }
        
        return volumeByMuscle;
    }
    
    async getVolumeStatus(muscleGroup) {
        const volumeByMuscle = await this.getWeeklyVolumeByMuscle();
        const volume = volumeByMuscle[muscleGroup]?.effectiveSets || 0;
        
        if (volume < VOLUME_THRESHOLDS.minimum) {
            return { status: 'low', sets: volume, message: `Volume faible (${volume}/${VOLUME_THRESHOLDS.minimum} séries min)` };
        } else if (volume <= VOLUME_THRESHOLDS.optimal) {
            return { status: 'optimal', sets: volume, message: `Volume optimal (${volume} séries)` };
        } else if (volume <= VOLUME_THRESHOLDS.maximum) {
            return { status: 'high', sets: volume, message: `Volume élevé (${volume} séries)` };
        } else {
            return { status: 'excessive', sets: volume, message: `⚠️ Volume excessif (${volume}/${VOLUME_THRESHOLDS.maximum} max)` };
        }
    }

    // ===== Session Screen =====
    async startSession(session) {
        // Check if deload should be suggested
        const deloadCheck = await this.checkDeloadSuggestion();
        if (deloadCheck.shouldSuggest) {
            const accepted = await this.showDeloadModal(deloadCheck);
            // Continue with session regardless of choice
        }
        
        this.currentSession = session;
        this.sessionStartTime = Date.now();
        this.isDeloadMode = await db.getSetting('isDeloadMode') || false;
        
        // Initialize current workout
        this.currentWorkout = {
            sessionId: session.id,
            startTime: this.sessionStartTime,
            slots: {},
            completedSlots: [],
            isDeload: this.isDeloadMode,
            lmsScores: {}, // Store LMS scores per muscle group
            coachingState: {
                version: 2,
                updatedAt: Date.now(),
                systemicFatigue: 0,
                axialFatigue: 0,
                setCount: 0,
                hardSetsTotal: 0,
                localFatigue: {},
                stimulusByMuscle: {},
                hardSetsByMuscle: {},
                slotState: {},
                lastWorkedMuscles: []
            }
        };
        await db.saveCurrentWorkout(this.currentWorkout);

        document.getElementById('current-session-name').textContent = session.name + (this.isDeloadMode ? ' 🔋' : '');
        
        // Show LMS prompt for muscle groups in this session
        await this.showLMSPrompt(session);
        
        // Start session timer
        this.startSessionTimer();
        
        await this.renderSlots();
        this.showScreen('session');
    }
    
    // ===== LMS (Local Muscle Soreness) System =====
    // Determines muscle groups targeted by a session's exercises
    async getSessionMuscleGroups(session) {
        const slots = await db.getSlotsBySession(session.id);
        const muscleGroups = new Set();
        
        for (const slot of slots) {
            const exerciseName = (slot.activeExercise || slot.name || '').toLowerCase();
            const contributions = this.getExerciseMuscleContributions(exerciseName);
            if (contributions.length === 0 && slot.muscleGroup) {
                muscleGroups.add(slot.muscleGroup);
                continue;
            }
            contributions.forEach(({ muscleId }) => muscleGroups.add(muscleId));
        }
        
        return Array.from(muscleGroups);
    }
    
    getMuscleKeywordsMap() {
        return {
            'pectoraux': ['pec', 'chest', 'développé', 'écarté', 'dips', 'pompes', 'push'],
            'dos': ['dos', 'back', 'row', 'tirage', 'pull', 'lat', 'tractions'],
            'epaules': ['épaule', 'shoulder', 'delto', 'élévation', 'lateral', 'military', 'overhead'],
            'biceps': ['biceps', 'curl', 'flexion'],
            'triceps': ['triceps', 'extension', 'pushdown', 'dips', 'skull', 'barre au front', 'kickback'],
            'quadriceps': ['quad', 'squat', 'leg press', 'extension jambe', 'fente', 'lunge'],
            'ischio-jambiers': ['ischio', 'hamstring', 'leg curl', 'soulevé de terre', 'deadlift'],
            'mollets': ['mollet', 'calf', 'calves'],
            'abdominaux': ['abdo', 'crunch', 'planche', 'core'],
            'fessiers': ['fessier', 'glute', 'hip thrust'],
            'avant-bras': ['avant-bras', 'forearm', 'wrist', 'reverse curl']
        };
    }
    
    getMuscleGroupInfo(muscleId) {
        const info = {
            'pectoraux': { name: 'Pectoraux', icon: '🫁' },
            'dos': { name: 'Dos', icon: '🔙' },
            'epaules': { name: 'Épaules', icon: '🎯' },
            'biceps': { name: 'Biceps', icon: '💪' },
            'triceps': { name: 'Triceps', icon: '🦾' },
            'quadriceps': { name: 'Quadriceps', icon: '🦵' },
            'ischio-jambiers': { name: 'Ischio-jambiers', icon: '🦿' },
            'mollets': { name: 'Mollets', icon: '🦶' },
            'abdominaux': { name: 'Abdominaux', icon: '🎽' },
            'fessiers': { name: 'Fessiers', icon: '🍑' },
            'avant-bras': { name: 'Avant-bras', icon: '✊' }
        };
        return info[muscleId] || { name: muscleId, icon: '💪' };
    }
    
    // Show LMS prompt modal
    async showLMSPrompt(session) {
        const muscleGroups = await this.getSessionMuscleGroups(session);
        
        if (muscleGroups.length === 0) {
            return; // No identified muscles, skip LMS
        }
        
        // Generate LMS UI for each muscle group
        const container = document.getElementById('lms-muscle-list');
        container.innerHTML = '';
        
        this.lmsScoresTemp = {}; // Only persist answers the user actually touched
        this.lmsScoresTouched = {};
        
        for (const muscleId of muscleGroups) {
            const info = this.getMuscleGroupInfo(muscleId);
            
            const muscleItem = document.createElement('div');
            muscleItem.className = 'lms-muscle-item';
            muscleItem.dataset.muscle = muscleId;
            muscleItem.innerHTML = `
                <div class="lms-muscle-name">
                    <span class="lms-muscle-icon">${info.icon}</span>
                    <span class="lms-muscle-label">${info.name}</span>
                </div>
                <div class="lms-slider-container">
                    <input type="range" class="lms-slider" data-muscle="${muscleId}" 
                           min="0" max="3" step="1" value="1">
                    <div class="lms-labels">
                        <span data-value="0"><small>Frais</small>💪</span>
                        <span data-value="1" class="active"><small>Prêt</small>👍</span>
                        <span data-value="2"><small>Courbaturé</small>😬</span>
                        <span data-value="3"><small>Épuisé</small>🤕</span>
                    </div>
                </div>
                <div class="lms-feedback">
                    <span class="lms-feedback-label">${LMS_SCALE[1].label}</span>
                    <span class="lms-feedback-desc">${LMS_SCALE[1].description}</span>
                </div>
            `;
            
            container.appendChild(muscleItem);
            
            // Add slider event listener
            const slider = muscleItem.querySelector('.lms-slider');
            slider.addEventListener('input', (e) => this.handleLMSSliderChange(e, muscleId));
        }
        
        // Show the sheet
        return new Promise((resolve) => {
            const sheet = document.getElementById('sheet-lms');
            sheet.classList.add('active');
            
            // Confirm button
            const confirmBtn = document.getElementById('btn-confirm-lms');
            const handleConfirm = async () => {
                const confirmedScores = Object.entries(this.lmsScoresTemp)
                    .filter(([muscleId]) => this.lmsScoresTouched?.[muscleId])
                    .reduce((acc, [muscleId, value]) => {
                        acc[muscleId] = value;
                        return acc;
                    }, {});

                // Save only explicit LMS answers to current workout
                this.currentWorkout.lmsScores = confirmedScores;
                await db.saveCurrentWorkout(this.currentWorkout);
                
                // Save LMS history for tracking only if the user answered something
                if (Object.keys(confirmedScores).length > 0) {
                    await this.saveLMSHistory(confirmedScores);
                }
                
                sheet.classList.remove('active');
                confirmBtn.removeEventListener('click', handleConfirm);
                
                // Show adaptation modal for worst muscle
                await this.showAdaptationStatus();
                
                resolve();
            };
            confirmBtn.addEventListener('click', handleConfirm);
            
            // Backdrop close
            sheet.querySelector('.sheet-backdrop').onclick = () => {
                sheet.classList.remove('active');
                confirmBtn.removeEventListener('click', handleConfirm);
                resolve();
            };
        });
    }
    
    handleLMSSliderChange(e, muscleId) {
        const value = parseInt(e.target.value);
        this.lmsScoresTemp[muscleId] = value;
        this.lmsScoresTouched[muscleId] = true;
        
        const muscleItem = e.target.closest('.lms-muscle-item');
        const labels = muscleItem.querySelectorAll('.lms-labels span');
        const feedback = muscleItem.querySelector('.lms-feedback');
        
        // Update active label
        labels.forEach(label => {
            label.classList.toggle('active', parseInt(label.dataset.value) === value);
        });
        
        // Update feedback
        const lmsData = LMS_SCALE[value];
        feedback.querySelector('.lms-feedback-label').textContent = lmsData.label;
        feedback.querySelector('.lms-feedback-desc').textContent = lmsData.description;
    }
    
    // Save LMS history for trend analysis
    async saveLMSHistory(lmsScores) {
        const history = await db.getSetting('lmsHistory') || [];
        
        history.unshift({
            date: new Date().toISOString(),
            scores: lmsScores
        });
        
        // Keep last 30 entries
        if (history.length > 30) {
            history.pop();
        }
        
        await db.setSetting('lmsHistory', history);
    }
    
    // Show adaptation status modal based on LMS
    async showAdaptationStatus() {
        if (!this.currentWorkout?.lmsScores) return;
        
        const scores = this.currentWorkout.lmsScores;
        const muscleIds = Object.keys(scores);
        
        if (muscleIds.length === 0) return;
        
        // Find the worst muscle (highest LMS)
        let worstMuscle = muscleIds[0];
        let worstScore = scores[worstMuscle];
        
        for (const muscleId of muscleIds) {
            if (scores[muscleId] > worstScore) {
                worstScore = scores[muscleId];
                worstMuscle = muscleId;
            }
        }
        
        // Calculate adaptation percentage (inverse of LMS)
        // LMS 0 = 100%, LMS 1 = 85%, LMS 2 = 50%, LMS 3 = 20%
        const adaptationMap = { 0: 100, 1: 85, 2: 50, 3: 20 };
        const adaptationPercent = adaptationMap[worstScore];
        
        // Determine phase
        let phase, title, icon;
        if (adaptationPercent >= 85) {
            phase = 'supercompensation';
            title = 'Prêt pour progresser !';
            icon = '🚀';
        } else if (adaptationPercent >= 50) {
            phase = 'refuel';
            title = 'Bientôt prêt';
            icon = '⚡';
        } else {
            phase = 'repair';
            title = 'En récupération';
            icon = '🔧';
        }
        
        // Get volume recommendation
        const volumeRec = this.getVolumeRecommendationFromLMS(worstScore, worstMuscle);
        
        // Update modal UI
        document.getElementById('adaptation-icon').textContent = icon;
        document.getElementById('adaptation-title').textContent = title;
        document.getElementById('adaptation-bar-marker').style.left = `${Math.min(95, adaptationPercent)}%`;
        
        const muscleInfo = this.getMuscleGroupInfo(worstMuscle);
        
        // Simplified message based on recovery status
        let adaptationMessage;
        if (adaptationPercent >= 85) {
            adaptationMessage = `Tes ${muscleInfo.name.toLowerCase()} sont bien récupérés. C'est le moment idéal pour progresser !`;
        } else if (adaptationPercent >= 50) {
            adaptationMessage = `Tes ${muscleInfo.name.toLowerCase()} récupèrent encore. Le coach ajuste surtout ses suggestions.`;
        } else {
            adaptationMessage = `Tes ${muscleInfo.name.toLowerCase()} ont besoin de repos. Le coach te proposera une version plus prudente si besoin.`;
        }
        document.getElementById('adaptation-message').textContent = adaptationMessage;
        
        // Volume recommendation - simplified
        const recContainer = document.getElementById('adaptation-recommendation');
        let recText;
        if (volumeRec.setChange > 0) {
            recText = `+${volumeRec.setChange} série${volumeRec.setChange > 1 ? 's' : ''} par exercice`;
        } else if (volumeRec.setChange < 0) {
            recText = `${volumeRec.setChange} série${volumeRec.setChange < -1 ? 's' : ''} par exercice`;
        } else {
            recText = 'Volume normal';
        }
        recContainer.innerHTML = `
            <div class="adaptation-recommendation-item">
                <span class="adaptation-recommendation-icon">${volumeRec.setChange > 0 ? '📈' : volumeRec.setChange < 0 ? '📉' : '✓'}</span>
                <span class="adaptation-recommendation-text">${recText}</span>
            </div>
        `;
        
        // Show modal
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-adaptation');
            modal.classList.add('active');
            
            const closeBtn = document.getElementById('btn-close-adaptation');
            const handleClose = () => {
                modal.classList.remove('active');
                closeBtn.removeEventListener('click', handleClose);
                resolve();
            };
            closeBtn.addEventListener('click', handleClose);
            
            modal.querySelector('.modal-backdrop').onclick = handleClose;
        });
    }
    
    // Get volume recommendation based on LMS and performance trend
    getVolumeRecommendationFromLMS(lmsScore, muscleId, trendOrOptions = 'stable') {
        const options = typeof trendOrOptions === 'object' ? trendOrOptions : { performanceTrend: trendOrOptions };
        const trend = options.performanceTrend || 'stable';
        
        const modifier = LMS_VOLUME_MODIFIERS[lmsScore]?.[trend] || LMS_VOLUME_MODIFIERS[lmsScore]?.stable;
        if (!modifier) {
            return { setChange: 0, loadChange: 0, message: 'Continue normalement.' };
        }

        const sessionContext = options.sessionContext || null;
        const adjusted = { ...modifier };

        // LMS is a readiness input, not a second punishment layer on top of session fatigue.
        if (sessionContext?.fatigueLevel === 'high') {
            adjusted.message = `${adjusted.message} La séance sera lue de façon prudente, sans cumuler les sanctions de volume.`;
        } else if (sessionContext?.fatigueLevel === 'moderate' && sessionContext.maxPrimaryFatigue >= 3) {
            adjusted.message = `${adjusted.message} Le muscle a déjà travaillé aujourd'hui, donc le coach restera surtout prudent sur les suggestions.`;
        }

        return adjusted;
    }
    
    // Apply LMS-based volume adjustment to a slot
    // Uses EXERCISE_MUSCLE_MAP for precise primary muscle targeting
    async applyLMSVolumeAdjustment(slot) {
        if (!this.currentWorkout?.lmsScores) return slot;
        
        const exerciseName = (slot.activeExercise || slot.name || '').toLowerCase();
        
        // Use precise muscle mapping (primary vs secondary)
        const muscleMapping = this.getExerciseMuscleMapping(exerciseName);
        if (!muscleMapping) return slot;
        
        // Only use PRIMARY muscles for LMS adjustment
        const primaryMuscles = muscleMapping.primary;
        let worstPrimaryLMS = 0;
        let targetMuscle = primaryMuscles[0];
        
        for (const muscle of primaryMuscles) {
            const lmsScore = this.currentWorkout.lmsScores[muscle];
            if (lmsScore !== undefined && lmsScore > worstPrimaryLMS) {
                worstPrimaryLMS = lmsScore;
                targetMuscle = muscle;
            }
        }
        
        // If primary muscles are fresh (LMS 0), no adjustment
        if (worstPrimaryLMS === 0) return slot;
        
        // Get volume adjustment based on PRIMARY muscle only
        const rec = this.getVolumeRecommendationFromLMS(worstPrimaryLMS, targetMuscle);
        
        // Calculate adjusted sets with MINIMUM 2 sets
        const originalSets = slot.sets || 3;
        let adjustedSets = originalSets + rec.setChange;
        adjustedSets = Math.max(2, Math.min(6, adjustedSets)); // Min 2, Max 6
        
        return {
            ...slot,
            adjustedSets,
            originalSets,
            lmsScore: worstPrimaryLMS,
            lmsAdjustment: rec,
            targetMuscle,
            primaryMuscles,
            secondaryMuscles: muscleMapping.secondary
        };
    }
    
    // Get LMS data for a specific slot (used by coaching advice)
    // Uses EXERCISE_MUSCLE_MAP to only apply LMS based on PRIMARY muscles
    async getLMSDataForSlot(slot, options = {}) {
        if (!this.currentWorkout?.lmsScores) return null;
        
        const exerciseName = (slot.activeExercise || slot.name || '').toLowerCase();
        
        // Find exercise in EXERCISE_MUSCLE_MAP for precise primary/secondary distinction
        const muscleMapping = this.getExerciseMuscleMapping(exerciseName);
        
        if (!muscleMapping) return null;
        
        // Get LMS scores for PRIMARY muscles only (secondary muscles don't reduce volume)
        const primaryMuscles = muscleMapping.primary;
        let worstPrimaryLMS = 0;
        let worstPrimaryMuscle = primaryMuscles[0];
        let hasPrimaryLMSData = false;
        
        for (const muscle of primaryMuscles) {
            const lmsScore = this.currentWorkout.lmsScores[muscle];
            if (Object.prototype.hasOwnProperty.call(this.currentWorkout.lmsScores, muscle)) {
                hasPrimaryLMSData = true;
            }
            if (lmsScore !== undefined && lmsScore > worstPrimaryLMS) {
                worstPrimaryLMS = lmsScore;
                worstPrimaryMuscle = muscle;
            }
        }
        
        // If no LMS data for primary muscles, no adjustment needed
        if (!hasPrimaryLMSData) {
            return null;
        }
        
        // Get volume adjustment based on PRIMARY muscle LMS only
        const rec = this.getVolumeRecommendationFromLMS(worstPrimaryLMS, worstPrimaryMuscle, options);
        
        // Calculate adjusted sets with MINIMUM 2 sets (scientific minimum for stimulus)
        const originalSets = slot.sets || 3;
        let adjustedSets = originalSets + rec.setChange;
        adjustedSets = Math.max(2, Math.min(6, adjustedSets)); // Min 2, Max 6
        
        // Recalculate actual set change after clamping
        const actualSetChange = adjustedSets - originalSets;
        
        const muscleInfo = this.getMuscleGroupInfo(worstPrimaryMuscle);
        const lmsInfo = LMS_SCALE[worstPrimaryLMS];
        
        return {
            targetMuscle: worstPrimaryMuscle,
            primaryMuscles,
            secondaryMuscles: muscleMapping.secondary,
            muscleName: muscleInfo.name,
            muscleIcon: muscleInfo.icon,
            lmsScore: worstPrimaryLMS,
            lmsLabel: lmsInfo.label,
            lmsEmoji: lmsInfo.emoji,
            lmsDescription: lmsInfo.description,
            mrvStatus: lmsInfo.mrvStatus,
            originalSets,
            adjustedSets,
            setChange: actualSetChange,
            loadChange: rec.loadChange,
            message: rec.message,
            performanceTrend: options.performanceTrend || 'stable',
            sessionFatigueLevel: options.sessionContext?.fatigueLevel || 'low'
        };
    }
    
    // Get exercise muscle mapping from EXERCISE_MUSCLE_MAP
    getExerciseMuscleMapping(exerciseName) {
        if (!exerciseName) return null;
        
        const normalizedName = this.normalizeExerciseText(exerciseName);
        
        // Match most specific keys first to avoid collisions (e.g., 'overhead')
        const entries = Object.entries(EXERCISE_MUSCLE_MAP)
            .map(([k, v]) => [this.normalizeExerciseText(k), v, k])
            .sort((a, b) => b[0].length - a[0].length);
        
        for (const [normKey, mapping] of entries) {
            if (!normKey) continue;
            if (normalizedName.includes(normKey)) {
                return mapping;
            }
        }
        
        // Fallback: try to infer from keywords
        const keywordMap = this.getMuscleKeywordsMap();
        for (const [muscleId, keywords] of Object.entries(keywordMap)) {
            if (keywords.some(kw => normalizedName.includes(this.normalizeExerciseText(kw)))) {
                return { primary: [muscleId], secondary: [] };
            }
        }
        
        return null;
    }

    normalizeExerciseText(text) {
        if (!text) return '';
        return String(text)
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    getInputValueOrFallback(savedValue, fallbackValue = '') {
        if (savedValue === 0) return 0;
        if (savedValue !== undefined && savedValue !== null && savedValue !== '') {
            return savedValue;
        }
        return fallbackValue ?? '';
    }

    isPureBodyweightSlot(slotOrMeta) {
        const slot = typeof slotOrMeta === 'object' ? slotOrMeta : null;
        if (!slot) return false;
        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...slot });
        return normalizedSlot.progressionMode === 'bodyweight' &&
            !normalizedSlot.bodyweightProfile?.allowExternalLoad &&
            !normalizedSlot.bodyweightProfile?.allowAssistance;
    }

    formatSetWeight(weight, slotOrExercise = null) {
        const numericWeight = Number(weight || 0);
        const slot = typeof slotOrExercise === 'object' ? slotOrExercise : null;
        const exerciseName = typeof slotOrExercise === 'string'
            ? slotOrExercise
            : (slot?.activeExercise || slot?.name || '');
        const isPureBodyweight = slot
            ? this.isPureBodyweightSlot(slot)
            : (numericWeight <= 0 && this.getBodyweightAutoConfig(exerciseName).autoMode);

        if (isPureBodyweight && numericWeight <= 0) {
            return 'PDC';
        }

        return `${numericWeight}kg`;
    }

    getLoadFieldLabel(slotOrMeta) {
        const slot = typeof slotOrMeta === 'object' ? this.normalizeSlotProgressionConfig({ ...slotOrMeta }) : null;
        if (!slot) return 'Charge (kg)';
        if (slot.progressionMode !== 'bodyweight') return 'Charge (kg)';
        if (slot.bodyweightProfile?.allowAssistance) return 'Assistance (kg)';
        if (slot.bodyweightProfile?.allowExternalLoad) return 'Lest (kg)';
        return 'Poids';
    }

    formatSuggestedWeightDisplay(advice) {
        if (!advice) return '--';
        if (advice.suggestedWeightLabel) return advice.suggestedWeightLabel;
        if (advice.suggestedWeight === '?' || advice.suggestedWeight === null || advice.suggestedWeight === undefined) {
            return '--';
        }
        return `${advice.suggestedWeight} kg`;
    }

    getAdviceTargetRepsArray(advice, fallbackTargets = []) {
        if (!advice?.suggestedReps) return fallbackTargets;
        if (Array.isArray(advice.suggestedReps)) {
            return advice.suggestedReps.map(value => parseInt(value, 10) || 0).filter(Boolean);
        }

        const repText = String(advice.suggestedReps).trim();
        if (!repText) return fallbackTargets;

        if (repText.includes('/')) {
            const values = repText
                .split('/')
                .map(value => parseInt(value.trim(), 10) || 0)
                .filter(Boolean);

            if (values.length) return values;
        }

        const singleValue = parseInt(repText, 10);
        if (Number.isFinite(singleValue) && singleValue > 0) {
            return fallbackTargets.map(() => singleValue);
        }

        return fallbackTargets;
    }

    stripCoachMetaFromMessage(message = '') {
        return String(message)
            .replace(/\s*Motif:.*$/i, '')
            .replace(/\s*Repos conseillé:.*$/i, '')
            .trim();
    }

    buildCoachSetPlan(slot = this.currentSlot, advice = this.currentCoachingAdvice) {
        const programmedSets = Math.max(0, Number(slot?.sets) || 0);
        const slotData = slot?.id ? this.currentWorkout?.slots?.[slot.id] : null;
        const targetState = this.getSlotTargetState(slot, slotData);
        const volumeDecision = targetState.decision || null;
        const lmsAdjustedSets = Number(this.currentLMSData?.adjustedSets);
        const lmsOriginalSets = Number(this.currentLMSData?.originalSets || programmedSets);
        const directSuggestedSets = Number.isFinite(Number(advice?.suggestedSets))
            ? Number(advice.suggestedSets)
            : Number.isFinite(Number(advice?.deloadSets))
                ? Number(advice.deloadSets)
                : null;
        const isDeloadAdvice = advice?.type === 'deload'
            || advice?.type === 'reactive_deload'
            || advice?.type === 'deload_mini'
            || advice?.isDeload;

        const candidates = [];

        if (Number.isFinite(directSuggestedSets) && directSuggestedSets > 0) {
            candidates.push({
                source: isDeloadAdvice ? 'deload' : (advice?.autoAdjustSets || directSuggestedSets < programmedSets ? 'fatigue' : 'coach'),
                sets: directSuggestedSets
            });
        }

        if (Number.isFinite(lmsAdjustedSets) && lmsAdjustedSets > 0 && lmsAdjustedSets !== lmsOriginalSets) {
            candidates.push({
                source: 'lms',
                sets: lmsAdjustedSets
            });
        }

        const reductionCandidate = candidates
            .filter(candidate => candidate.sets < programmedSets)
            .sort((a, b) => a.sets - b.sets)[0] || null;

        const increaseCandidate = candidates
            .filter(candidate => candidate.sets > programmedSets)
            .sort((a, b) => b.sets - a.sets)[0] || null;
        const suggestedReductionSets = reductionCandidate?.sets || null;
        const completedSets = (slotData?.sets || []).filter(set => set?.completed).length;
        const dismissedSuggestedSets = Number.isFinite(Number(volumeDecision?.dismissedSuggestedSets))
            ? Number(volumeDecision.dismissedSuggestedSets)
            : null;
        const reductionAccepted = targetState.activeTargetSets < programmedSets;
        const activeTargetSets = targetState.activeTargetSets;

        const reasonMap = {
            deload: 'deload',
            fatigue: 'fatigue / récupération',
            lms: 'readiness du jour',
            coach: 'progression'
        };

        return {
            programmedSets,
            activeTargetSets,
            directSuggestedSets,
            suggestedReductionSets,
            reductionCandidate,
            increaseCandidate,
            reductionAccepted,
            acceptedDecision: volumeDecision,
            hasSuggestedReduction: Boolean(reductionCandidate),
            hasOptionalIncrease: Boolean(increaseCandidate),
            showReductionPrompt: Boolean(reductionCandidate)
                && !reductionAccepted
                && completedSets >= (suggestedReductionSets || programmedSets + 1)
                && dismissedSuggestedSets !== suggestedReductionSets,
            reductionReason: reductionCandidate ? (reasonMap[reductionCandidate.source] || 'gestion du volume') : '',
            displayDelta: (reductionAccepted ? activeTargetSets : suggestedReductionSets || programmedSets) - programmedSets,
            optionalDelta: increaseCandidate ? increaseCandidate.sets - programmedSets : 0
        };
    }

    getCoachCardChipText(advice, slot = this.currentSlot, setPlan = this.buildCoachSetPlan(slot, advice)) {
        if (setPlan.reductionAccepted) return 'Volume validé';
        if (setPlan.showReductionPrompt) return 'Suggestion volume';
        if (advice?.topSetProgression) return 'Top set';
        if (slot?.progressionMode === 'capped_load') return 'Charge plafonnée';
        if (slot?.progressionMode === 'bodyweight') return 'Poids du corps';
        if (advice?.sessionContext?.fatigueLevel === 'high') return 'Fatigue haute';
        if (advice?.sessionContext?.fatigueLevel === 'moderate') return 'Fatigue modérée';
        if (advice?.progressionAxis) return this.getReadableProgressionAxis(advice.progressionAxis);
        return 'Plan du jour';
    }

    getCoachFatiguePill(advice) {
        const sessionContext = advice?.sessionContext;
        if (!sessionContext) return null;

        const fatigueLevel = sessionContext.fatigueLevel || 'low';
        const mapping = {
            high: {
                label: 'Fatigue haute',
                className: 'fatigue-high'
            },
            moderate: {
                label: 'Fatigue modérée',
                className: 'fatigue-moderate'
            },
            low: {
                label: 'En forme',
                className: 'fatigue-low'
            }
        };

        return mapping[fatigueLevel] || mapping.low;
    }

    buildCoachFatigueExplanationItems(sessionContext = {}) {
        const items = [];
        const local = Math.round((sessionContext.maxPrimaryFatigue || 0) * 10) / 10;
        const hardSets = Math.round((sessionContext.primaryHardSets || 0) * 10) / 10;
        const systemic = Math.round((sessionContext.systemicFatigue || 0) * 10) / 10;
        const axial = Math.round((sessionContext.axialFatigue || 0) * 10) / 10;

        if (local > 0) {
            items.push({
                label: 'Muscle déjà entamé',
                text: local >= 4
                    ? `Le muscle principal a déjà beaucoup travaillé juste avant, donc le coach protège la qualité.`
                    : local >= 2.4
                        ? `Le muscle principal commence à fatiguer, donc le coach garde un peu de marge.`
                        : `Le muscle principal reste encore assez frais, donc la séance peut continuer normalement.`
            });
        }

        if (hardSets > 0) {
            items.push({
                label: 'Volume déjà fait',
                text: hardSets >= 4
                    ? `Tu as déjà accumulé pas mal de séries dures sur ce groupe, donc ajouter du volume devient moins rentable.`
                    : `Tu as déjà commencé à accumuler du travail utile, ce qui compte dans la recommandation.`
            });
        }

        if (systemic > 0) {
            items.push({
                label: 'Fatigue générale',
                text: systemic >= 4.5
                    ? `La séance commence à coûter cher globalement, pas seulement localement, donc le coach freine un peu.`
                    : `Pour l’instant, la fatigue générale reste sous contrôle.`
            });
        }

        if (axial > 0) {
            items.push({
                label: 'Charge sur le corps',
                text: axial >= 3.5
                    ? `L’exercice charge aussi fortement le corps dans son ensemble, donc le coach peut ajouter du repos ou limiter le volume.`
                    : `L’impact global de l’exercice reste modéré.`
            });
        }

        if (sessionContext.reasons?.length) {
            items.push({
                label: 'Ce qui a compté ici',
                text: sessionContext.reasons
                    .slice(0, 3)
                    .map(reason => reason.replace(/^fatigue locale/i, 'fatigue locale déjà présente'))
                    .join(' • ')
            });
        }

        return items;
    }

    formatCoachAdviceMessage(advice, slot = this.currentSlot, setPlan = this.buildCoachSetPlan(slot, advice)) {
        if (!advice) return '';

        let primary = '';
        if (advice.topSetProgression && advice.backOffWeight) {
            primary = `Aujourd'hui, on joue un <strong>top set propre</strong> puis un <strong>back-off maîtrisé</strong> pour pousser sans cramer la suite.`;
        } else if (advice.suggestedAssistanceKg != null) {
            primary = `Le focus du jour est une version <strong>assistée, fluide et propre</strong>, avec priorité à l'amplitude et au contrôle.`;
        } else if (advice.suggestedWeightLabel?.includes('PDC') || advice.suggestedWeight === 0) {
            primary = `Le coach veut une séance <strong>poids du corps ultra propre</strong>, sans chercher à forcer la charge aujourd'hui.`;
        } else if (advice.weightTrend === 'up') {
            primary = `Il y a de la marge: <strong>tu peux appuyer un peu plus fort</strong> si la technique reste solide du début à la fin.`;
        } else if (advice.weightTrend === 'down') {
            primary = `Le but est de <strong>protéger la qualité</strong> et d'éviter une série sale ou trop coûteuse.`;
        } else {
            primary = `Le coach veut une série <strong>maîtrisée, régulière et propre</strong>, sans gaspiller d'énergie inutile.`;
        }

        if (setPlan.reductionAccepted) {
            primary += ` Tu as validé un arrêt à <strong>${setPlan.activeTargetSets} série${setPlan.activeTargetSets > 1 ? 's' : ''}</strong> aujourd'hui.`;
        } else if (setPlan.showReductionPrompt) {
            primary += ` Le coach <strong>propose</strong> de s'arrêter à <strong>${setPlan.suggestedReductionSets} série${setPlan.suggestedReductionSets > 1 ? 's' : ''}</strong>, sans l'imposer.`;
        } else if (setPlan.hasOptionalIncrease) {
            primary += ` Une <strong>${setPlan.increaseCandidate.sets}e série</strong> reste possible si la qualité tient.`;
        }

        const supportingReason = advice.sessionContext?.fatigueLevel === 'high'
            ? `Fatigue du jour <strong>élevée</strong>, donc on protège la qualité.`
            : advice.sessionContext?.fatigueLevel === 'moderate'
                ? `La fatigue monte, donc on garde une marge utile.`
                : advice.decisionReasons?.[0]
                    ? `${advice.decisionReasons[0]}.`
                    : this.stripCoachMetaFromMessage(advice.message);

        const secondary = supportingReason
            ? `<span class="coaching-advice-note">${supportingReason}</span>`
            : '';

        return `
            <div class="coaching-summary-primary">${primary}</div>
            ${secondary}
        `;
    }

    toggleCoachAdviceDrawer(forceOpen = null) {
        const drawer = document.getElementById('coaching-advice-drawer');
        const body = document.getElementById('coaching-advice-drawer-body');
        const btn = document.getElementById('btn-coach-toggle-drawer');
        if (!drawer || !body || !btn) return;

        const isOpen = drawer.classList.contains('is-open');
        const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;
        drawer.classList.toggle('is-open', nextOpen);
        body.style.display = nextOpen ? 'block' : 'none';
        btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    }

    openCoachFatigueSheet() {
        const advice = this.currentCoachingAdvice;
        const sessionContext = advice?.sessionContext;
        const sheet = document.getElementById('sheet-coach-fatigue');
        const title = document.getElementById('coach-fatigue-sheet-title');
        const subtitle = document.getElementById('coach-fatigue-sheet-subtitle');
        const score = document.getElementById('coach-fatigue-sheet-score');
        const list = document.getElementById('coach-fatigue-sheet-list');
        if (!sheet || !title || !subtitle || !score || !list || !sessionContext) return;

        const fatiguePill = this.getCoachFatiguePill(advice);
        title.textContent = fatiguePill?.label || 'Lecture de récupération';
        subtitle.textContent = 'Le coach regarde surtout ce que tes muscles ont déjà pris dans la séance, ce que tu as déjà accumulé comme travail dur, et la fatigue globale du moment.';
        score.textContent = `Readiness ${sessionContext.readinessScore || '—'}/100`;
        const details = this.buildCoachFatigueExplanationItems(sessionContext);

        list.innerHTML = details.map(item => `
            <div class="coach-fatigue-sheet-item">
                <span class="coach-fatigue-sheet-item-label">${item.label}</span>
                <p>${item.text}</p>
            </div>
        `).join('');

        sheet.classList.add('active');
    }

    closeCoachFatigueSheet() {
        const sheet = document.getElementById('sheet-coach-fatigue');
        if (sheet) sheet.classList.remove('active');
    }

    getInlineCoachSetHint(advice, targetReps, suggestedWeight, isNextIncompleteSet, previousWeight = null) {
        if (!advice || !isNextIncompleteSet) return '';

        if (advice.suggestedAssistanceKg != null) {
            return `Le coach propose environ ${advice.suggestedAssistanceKg}kg d’assistance pour viser ${targetReps} reps propres. Ajuste si la qualité baisse.`;
        }

        const weightLabel = this.formatSuggestedWeightDisplay(advice);
        const bodyweightStyle = advice.suggestedWeightLabel?.includes('PDC') || advice.suggestedWeight === 0;

        if (bodyweightStyle) {
            return `Le coach suggère de rester sur ${weightLabel.toLowerCase()} et de viser ${targetReps} reps propres. Ajuste selon ton ressenti réel.`;
        }

        if (typeof suggestedWeight === 'number' && suggestedWeight > 0) {
            if (typeof previousWeight === 'number' && previousWeight > 0) {
                if (suggestedWeight < previousWeight) {
                    if (advice.sessionContext?.fatigueLevel === 'high' || advice.sessionContext?.fatigueLevel === 'moderate') {
                        return `Tu as déjà accumulé de la fatigue sur les séries précédentes. Le coach te propose ${suggestedWeight}kg pour garder environ ${targetReps} reps propres au lieu de forcer une série dégradée.`;
                    }
                    return `Le coach te propose ${suggestedWeight}kg pour retrouver environ ${targetReps} reps propres. Garde plus lourd seulement si la technique reste vraiment stable.`;
                }

                if (suggestedWeight > previousWeight) {
                    return `La série précédente semblait confortable. Tu peux tenter ${suggestedWeight}kg pour environ ${targetReps} reps sans le prendre comme une obligation.`;
                }

                return `Le coach garde ${suggestedWeight}kg comme base pour viser environ ${targetReps} reps propres. Ajuste seulement si ton ressenti réel raconte autre chose.`;
            }

            return `Le coach pose ${suggestedWeight}kg comme base pour viser ${targetReps} reps propres. Ajuste selon le RPE réel et la qualité d'exécution.`;
        }

        return `Objectif souple: environ ${targetReps} reps propres. Ajuste selon ton RPE, la technique et la fatigue du moment.`;
    }

    showCoachToast(message, status = 'hot', icon = '💡') {
        const existing = document.querySelector('.coach-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `coach-toast ${status}`;
        toast.innerHTML = `
            <span class="coach-toast-icon">${icon}</span>
            <span class="coach-toast-text">${message}</span>
        `;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('visible'), 50);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 4500);
    }

    areSlotsCompleted(slotIds = []) {
        if (!this.currentWorkout?.completedSlots?.length || slotIds.length === 0) return false;
        return slotIds.every(slotId => this.currentWorkout.completedSlots.includes(slotId));
    }

    isCurrentExerciseLocked() {
        if (!this.currentSlot) return false;
        if (this.isSupersetMode && this.supersetSlot) {
            return this.areSlotsCompleted([this.currentSlot.id, this.supersetSlot.id]);
        }
        return this.areSlotsCompleted([this.currentSlot.id]);
    }

    getSlotExerciseName(slotOrExercise) {
        if (!slotOrExercise) return '';
        if (typeof slotOrExercise === 'string') return slotOrExercise;
        return slotOrExercise.activeExercise || slotOrExercise.name || '';
    }

    getBodyweightAutoConfig(slotOrExercise) {
        const normalizedName = this.normalizeExerciseText(this.getSlotExerciseName(slotOrExercise));
        if (!normalizedName) {
            return {
                isBodyweightPattern: false,
                autoMode: false,
                allowExternalLoad: false,
                allowAssistance: false,
                weightedPattern: false,
                assistedPattern: false,
                family: 'generic'
            };
        }

        const family = this.inferBodyweightFamily(slotOrExercise);
        const bodyweightKeywords = [
            'poids du corps', 'bodyweight', 'pompe', 'pompes', 'push up', 'pushup',
            'traction', 'tractions', 'pull up', 'pullup', 'chin up', 'chinup',
            'dip', 'dips', 'muscle up', 'burpee', 'pistol squat'
        ];
        const weightedKeywords = ['leste', 'lesté', 'lestee', 'weighted', 'gilet', 'disque', 'chaine', 'chaîne', 'ceinture'];
        const assistanceKeywords = ['assiste', 'assisté', 'assistee', 'assisted', 'band', 'elastique', 'élastique'];
        const loadedNonBodyweightKeywords = ['crunch cable', 'cable crunch', 'abdos machine', 'machine crunch', 'poulie', 'pulldown', 'tirage', 'smith'];

        const isBodyweightPattern = bodyweightKeywords.some(keyword => normalizedName.includes(keyword)) || family !== 'generic';
        const weightedPattern = weightedKeywords.some(keyword => normalizedName.includes(keyword));
        const assistedPattern = assistanceKeywords.some(keyword => normalizedName.includes(keyword));
        const loadedPattern = loadedNonBodyweightKeywords.some(keyword => normalizedName.includes(keyword));
        const explicitBodyweightProfile = typeof slotOrExercise === 'object' &&
            (slotOrExercise.loadingProfile === 'bodyweight' || slotOrExercise.bodyweightMode === true || slotOrExercise.progressionMode === 'bodyweight');

        return {
            isBodyweightPattern,
            autoMode: (explicitBodyweightProfile || (isBodyweightPattern && !weightedPattern && !loadedPattern)),
            allowExternalLoad: weightedPattern,
            allowAssistance: assistedPattern,
            weightedPattern,
            assistedPattern,
            family
        };
    }

    isLikelyBodyweightExercise(slotOrExercise) {
        return this.getBodyweightAutoConfig(slotOrExercise).autoMode;
    }

    isBodyweightProgressionExercise(slotOrExercise, workouts = []) {
        if (slotOrExercise && typeof slotOrExercise === 'object' && typeof slotOrExercise.bodyweightMode === 'boolean') {
            return slotOrExercise.bodyweightMode;
        }

        const exerciseName = this.getSlotExerciseName(slotOrExercise);
        const detection = this.getBodyweightAutoConfig(exerciseName);
        if (!detection.isBodyweightPattern) return false;
        if (!workouts.length) return this.normalizeExerciseText(exerciseName).includes('poids du corps');

        const recentWorkouts = workouts.slice(0, 3);
        return recentWorkouts.every(workout =>
            workout.sets.every(set => (set.weight || 0) === 0)
        );
    }

    getBodyweightTechniqueCue(exerciseName) {
        const normalizedName = this.normalizeExerciseText(exerciseName);

        if (normalizedName.includes('dips') || normalizedName.includes('dip')) {
            return 'Si tu bloques sans lest, monte d’abord les reps, puis ajoute une pause de 1-2s en bas ou un tempo controle.';
        }

        if (normalizedName.includes('traction') || normalizedName.includes('pull up') || normalizedName.includes('chin up')) {
            return 'Si tu n’as pas de lest, vise plus de reps propres puis ajoute une pause en haut ou un excentrique plus lent.';
        }

        if (normalizedName.includes('pompe') || normalizedName.includes('push up')) {
            return 'Quand la plage devient facile, garde le poids du corps et passe sur une variante plus dure ou un tempo plus strict.';
        }

        return 'Quand tu ne peux pas charger, progresse d’abord via les reps, le tempo et l’amplitude.';
    }

    // Legacy fallback kept for backward compatibility only.
    // The routed progression engine now uses getBodyweightProgressionAdvice().
    // Deprecated legacy helper. The live coach uses getBodyweightProgressionAdvice().
    getBodyweightCoachingAdvice(slot, data = {}) {
        const {
            avgReps = 0,
            avgRpe = 8,
            targetReps = `${slot.repsMin}-${slot.repsMax}`,
            exerciseName
        } = data;

        const nextRepFloor = Math.max(slot.repsMin, slot.repsMax + 1);
        const repCeiling = Math.min(Math.max(slot.repsMax + 3, nextRepFloor), 20);
        const progressionRange = `${nextRepFloor}-${repCeiling}`;
        const cue = this.getBodyweightTechniqueCue(exerciseName || slot.activeExercise || slot.name);

        if (avgReps >= slot.repsMax && avgRpe <= 9) {
            return {
                type: 'maintain',
                icon: 'target',
                title: 'Progression poids du corps',
                message: `Au poids du corps, garde la charge externe a zero et gagne 1-2 reps par serie avant de complexifier. ${cue}`,
                suggestedWeight: 0,
                suggestedWeightLabel: 'PDC',
                suggestedReps: progressionRange,
                weightTrend: 'neutral'
            };
        }

        if (avgReps < slot.repsMin) {
            return {
                type: 'maintain',
                icon: 'target',
                title: 'Consolide le mouvement',
                message: `Reste au poids du corps et verrouille la technique dans la plage ${targetReps}. Si besoin, prends un peu plus de repos ou une assistance legere.`,
                suggestedWeight: 0,
                suggestedWeightLabel: 'PDC',
                suggestedReps: targetReps,
                weightTrend: 'neutral'
            };
        }

        return {
            type: 'maintain',
            icon: 'maintain',
            title: 'Accumule des reps',
            message: `Bonne base. Continue au poids du corps et cherche a ajouter une rep propre par serie. ${cue}`,
            suggestedWeight: 0,
            suggestedWeightLabel: 'PDC',
            suggestedReps: progressionRange,
            weightTrend: 'neutral'
        };
    }
    
    // Get LMS status class for styling
    getLMSStatusClass(lmsScore) {
        const classes = { 0: 'fresh', 1: 'ready', 2: 'sore', 3: 'wrecked' };
        return classes[lmsScore] || 'ready';
    }
    
    // Get stretch bias cue for an exercise
    getStretchBiasCue(exerciseName) {
        if (!exerciseName) return EXERCISE_LENGTH_PROFILES['default'];
        
        const nameLower = exerciseName.toLowerCase();
        
        // Check for matching exercise patterns
        for (const [key, profile] of Object.entries(EXERCISE_LENGTH_PROFILES)) {
            if (key !== 'default' && nameLower.includes(key)) {
                return profile;
            }
        }
        
        return EXERCISE_LENGTH_PROFILES['default'];
    }
    
    // Generate accessible coaching message based on context
    getAccessibleCoachingMessage(type, context = {}) {
        const { lmsScore, performanceTrend, avgRpe } = context;
        
        // Performance message
        if (type === 'progress') {
            if (performanceTrend === 'improved') return COACHING_MESSAGES.progress.excellent;
            if (performanceTrend === 'stable') return COACHING_MESSAGES.progress.stable;
            if (performanceTrend === 'regressed') return COACHING_MESSAGES.progress.declining;
            return COACHING_MESSAGES.progress.good;
        }
        
        // Volume message based on LMS
        if (type === 'volume') {
            if (lmsScore === 0) return COACHING_MESSAGES.volume.increase;
            if (lmsScore >= 2) return COACHING_MESSAGES.volume.decrease;
            return COACHING_MESSAGES.volume.maintain;
        }
        
        // Effort message based on RPE
        if (type === 'effort') {
            if (avgRpe === null || avgRpe < 7) return COACHING_MESSAGES.effort.pushMore;
            if (avgRpe >= 9) return COACHING_MESSAGES.effort.tooHard;
            return COACHING_MESSAGES.effort.onPoint;
        }
        
        return '';
    }

    async renderSlots() {
        const slots = await db.getSlotsBySession(this.currentSession.id);
        const container = document.getElementById('slots-list');
        container.innerHTML = '';

        // Build superset map (firstSlotId -> secondSlotId)
        const supersetMap = {};
        for (const slot of slots) {
            if (slot.supersetWith) {
                supersetMap[slot.id] = slot.supersetWith;
            }
        }

        // Assign colors to each superset pair
        const supersetColors = {};
        let colorIndex = 0;
        for (const firstSlotId of Object.keys(supersetMap)) {
            if (!supersetColors[firstSlotId]) {
                const secondSlotId = supersetMap[firstSlotId];
                const color = colorIndex % 6;
                supersetColors[firstSlotId] = color;
                supersetColors[secondSlotId] = color;
                colorIndex++;
            }
        }

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const isCompleted = this.currentWorkout?.completedSlots?.includes(slot.id);
            
            // Check if this slot is part of a superset
            const isInSuperset = slot.supersetWith || Object.values(supersetMap).includes(slot.id);
            const isFirstInSuperset = slot.supersetWith && !Object.values(supersetMap).includes(slot.id);
            const isSecondInSuperset = Object.values(supersetMap).includes(slot.id);
            
            // Find the first slot ID if this is the second in superset
            let firstSlotId = null;
            if (isSecondInSuperset) {
                firstSlotId = Object.keys(supersetMap).find(key => supersetMap[key] === slot.id);
            }
            
            // Get superset color
            const supersetColor = supersetColors[slot.id] !== undefined ? supersetColors[slot.id] : 0;
            
            const card = await this.createSlotCard(slot, isCompleted, isFirstInSuperset, isSecondInSuperset, firstSlotId, supersetColor);
            container.appendChild(card);
        }
        
        // Update progress bar
        this.updateSessionProgress(slots);
    }
    
    updateSessionProgress(slots) {
        const total = slots.length;
        const completed = this.currentWorkout?.completedSlots?.length || 0;
        const percentage = total > 0 ? (completed / total) * 100 : 0;
        
        document.getElementById('session-progress-fill').style.width = `${percentage}%`;
        document.getElementById('session-progress-text').textContent = `${completed}/${total} exercices`;
    }
    
    // ===== Performance Status (RPE-aware) =====
    async getExerciseStatus(slot) {
        const exerciseId = slot.activeExercise || slot.name;
        const failureThreshold = (await db.getSetting('failureCount')) ?? 3;
        
        // Get all set history for this exercise
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        
        if (allSetHistory.length === 0) {
            return { class: '', title: 'Nouveau' };
        }
        
        // Group by workout
        const workoutGroups = {};
        for (const set of allSetHistory) {
            if (!workoutGroups[set.workoutId]) {
                workoutGroups[set.workoutId] = {
                    date: set.date,
                    sets: [],
                    totalReps: 0,
                    maxWeight: 0
                };
            }
            workoutGroups[set.workoutId].sets.push(set);
            workoutGroups[set.workoutId].totalReps += set.reps || 0;
            workoutGroups[set.workoutId].maxWeight = Math.max(workoutGroups[set.workoutId].maxWeight, set.weight || 0);
        }
        
        // Calculate avgRpe only from real data
        for (const wId of Object.keys(workoutGroups)) {
            const sets = workoutGroups[wId].sets;
            const setsWithRpe = sets.filter(s => s.rpe != null);
            workoutGroups[wId].hasRealRpe = setsWithRpe.length > 0;
            workoutGroups[wId].avgRpe = setsWithRpe.length > 0 
                ? setsWithRpe.reduce((sum, s) => sum + s.rpe, 0) / setsWithRpe.length 
                : null;
            workoutGroups[wId].sets.sort((a, b) => a.setNumber - b.setNumber);
        }
        
        // Sort workouts by date (most recent first)
        const workouts = Object.values(workoutGroups).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        
        if (workouts.length < 2) {
            return { class: '', title: 'Continue !' };
        }
        
        // Smart progression check (Double Progression Dynamique)
        const current = workouts[0];
        const previous = workouts[1];
        
        // Check first set progression specifically
        const currFirst = current.sets[0];
        const prevFirst = previous.sets[0];
        const firstSetImproved = (currFirst?.reps || 0) > (prevFirst?.reps || 0) || 
                                  (currFirst?.weight || 0) > (prevFirst?.weight || 0);
        
        const repsImproved = current.totalReps > previous.totalReps;
        const weightImproved = current.maxWeight > previous.maxWeight;
        const hasProgression = firstSetImproved || repsImproved || weightImproved;
        
        if (hasProgression) {
            return { class: 'success', title: 'Progression !' };
        }
        
        // Count consecutive stagnation with RPE awareness (only if real RPE data exists)
        let consecutiveStagnation = 1;
        let lowEffortCount = (current.hasRealRpe && current.avgRpe !== null && current.avgRpe < 8) ? 1 : 0;
        
        for (let i = 1; i < Math.min(workouts.length - 1, failureThreshold + 1); i++) {
            const curr = workouts[i];
            const prev = workouts[i + 1];
            const currFirst = curr.sets[0];
            const prevFirst = prev.sets[0];
            
            const noProgress = 
                (currFirst?.reps || 0) <= (prevFirst?.reps || 0) && 
                (currFirst?.weight || 0) <= (prevFirst?.weight || 0) &&
                curr.totalReps <= prev.totalReps;
            
            if (noProgress) {
                consecutiveStagnation++;
                if (curr.hasRealRpe && curr.avgRpe !== null && curr.avgRpe < 8) lowEffortCount++;
            } else {
                break;
            }
        }
        
        // Intelligent status based on stagnation count and effort
        if (consecutiveStagnation >= failureThreshold) {
            return { class: 'danger', title: `Plateau (${consecutiveStagnation}x)` };
        } else if (consecutiveStagnation >= 2) {
            if (lowEffortCount >= 2) {
                return { class: 'warning', title: 'Effort insuffisant' };
            }
            return { class: 'warning', title: 'Deload suggéré' };
        } else {
            if (current.hasRealRpe && current.avgRpe !== null && current.avgRpe < 7.5) {
                return { class: 'warning', title: 'Pousse plus !' };
            }
            return { class: 'warning', title: 'Persévère' };
        }
    }

    async createSlotCard(slot, isCompleted, isFirstInSuperset = false, isSecondInSuperset = false, firstSlotId = null, supersetColor = 0) {
        const card = document.createElement('div');
        let cardClass = `slot-card ${isCompleted ? 'completed' : ''}`;
        if (isFirstInSuperset) cardClass += ' superset-start';
        if (isSecondInSuperset) cardClass += ' superset-end';
        card.className = cardClass;
        card.dataset.slotId = slot.id;
        const supersetPalette = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'];
        const supersetAccent = supersetPalette[supersetColor] || supersetPalette[0];
        card.style.setProperty('--superset-accent', supersetAccent);
        
        // Calculate performance status from history
        const status = await this.getExerciseStatus(slot);
        const isInSuperset = isFirstInSuperset || isSecondInSuperset;
        
        // Superset badge (only show when not completed)
        const supersetBadge = (!isCompleted && isInSuperset) 
            ? `<span class="superset-badge color-${supersetColor}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"></path>
                    </svg>
                    SuperSet
               </span>` 
            : '';

        const reopenBtn = isInSuperset
            ? `
                <button class="btn-edit-set btn-reopen-superset" data-slot-id="${isFirstInSuperset ? slot.id : (firstSlotId || slot.id)}" title="Modifier">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
              `
            : `
                <button class="btn-edit-set btn-reopen-completed" data-slot-id="${slot.id}" title="Modifier">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
              `;

        if (isCompleted) {
            card.innerHTML = `
                <div class="slot-header">
                    <div class="slot-title">
                        <span class="slot-id">${slot.slotId}</span>
                        <span class="slot-name">${slot.activeExercise || slot.name}</span>
                    </div>
                    <div class="slot-completed-actions">
                        ${reopenBtn}
                        <div class="completed-badge">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Terminé
                        </div>
                    </div>
                </div>
            `;
        } else {
            // For superset exercises, both have same buttons
            // Use firstSlotId if this is the second exercise, otherwise use slot.id
            const supersetStartId = isFirstInSuperset ? slot.id : (firstSlotId || slot.id);
            
            const launchBtns = isInSuperset 
                ? `
                    <button class="btn btn-primary btn-launch-superset" data-slot-id="${supersetStartId}">
                        ${this.getSupersetBoltIconSVG()}
                        Lancer le SuperSet
                    </button>
                    <button class="btn btn-secondary btn-launch-individual" data-slot-id="${slot.id}" title="Lancer cet exercice seul">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v20M2 12h20"/>
                        </svg>
                    </button>
                  `
                : `<button class="btn btn-primary btn-launch" data-slot-id="${slot.id}">Lancer l'exo</button>`;
            
            // Edit button only for non-superset exercises
            const editBtn = !isInSuperset ? `
                <button class="btn btn-edit-slot" data-slot-id="${slot.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
            ` : '';
            
            card.innerHTML = `
                <div class="slot-header">
                    <div class="slot-title">
                        <span class="slot-id">${slot.slotId}</span>
                        <span class="slot-name">${slot.activeExercise || slot.name}</span>
                        ${supersetBadge}
                    </div>
                    <div class="slot-status ${status.class}" title="${status.title}"></div>
                </div>
                <div class="slot-details">
                    <span class="slot-detail"><strong>${slot.sets}</strong> séries</span>
                    <span class="slot-detail"><strong>${slot.repsMin}-${slot.repsMax}</strong> reps</span>
                    <span class="slot-detail"><strong>${slot.rest}s</strong> repos</span>
                    <span class="slot-detail">RIR <strong>${slot.rir}</strong></span>
                </div>
                <div class="slot-actions">
                    ${launchBtns}
                    <button class="btn btn-pool-trigger" data-slot-id="${slot.id}" title="Changer d'exercice">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                            <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                        </svg>
                    </button>
                    ${editBtn}
                </div>
            `;
        }

        return card;
    }

    startSessionTimer() {
        const timerEl = document.getElementById('session-timer');
        this.stopSessionTimer();
        
        this.sessionTimer = setInterval(() => {
            const elapsed = Date.now() - this.sessionStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    stopSessionTimer() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }
    }

    // ===== Unilateral Exercise Detection =====
    isUnilateralExercise(exerciseName) {
        if (!exerciseName) return false;
        const name = exerciseName.toLowerCase();
        
        // Keywords indicating unilateral exercises
        const unilateralKeywords = [
            'unilatéral', 'unilateral', 'unilatérale',
            'un bras', 'une jambe', '1 bras', '1 jambe',
            'single arm', 'single leg',
            'à une main', 'à un bras',
            'bulgare', 'bulgarian',
            'pistol', 'one leg', 'one arm'
        ];
        
        // Check if any keyword is in the name
        return unilateralKeywords.some(keyword => name.includes(keyword));
    }
    
    // ===== Exercise Screen =====
    async openExercise(slotId) {
        this.currentSlot = await db.get('slots', slotId);
        this.currentSlot = this.normalizeSlotProgressionConfig(this.currentSlot);
        this.supersetSlot = null; // Reset superset
        this.isSupersetMode = false;
        this.isUnilateralMode = false; // Reset unilateral mode
        this.isReviewMode = this.areSlotsCompleted([slotId]);
        this.nextSetSuggestedWeight = null; // Reset intra-session weight suggestion
        this.userOverrideSets = false; // Reset deload override when changing exercise
        this.editingSetIndex = null; // Reset edit mode
        
        if (!this.currentSlot) return;
        this.ensureWorkoutCoachingState();
        
        // Check if this is a unilateral exercise
        const exerciseName = this.currentSlot.activeExercise || this.currentSlot.name;
        this.isUnilateralMode = this.isUnilateralExercise(exerciseName);

        // Initialize slot data in current workout if needed
        if (!this.currentWorkout.slots[slotId]) {
            this.currentWorkout.slots[slotId] = {
                sets: [],
                setsLeft: [],  // For unilateral: left side
                setsRight: [], // For unilateral: right side
                startTime: Date.now(),
                meta: this.buildSlotCoachMeta(this.currentSlot)
            };
            await db.saveCurrentWorkout(this.currentWorkout);
        }
        this.currentWorkout.slots[slotId].meta = this.buildSlotCoachMeta(this.currentSlot);
        await db.saveCurrentWorkout(this.currentWorkout);
        
        // Ensure unilateral arrays exist for existing workout data
        if (this.isUnilateralMode) {
            const slotData = this.currentWorkout.slots[slotId];
            if (!slotData.setsLeft) slotData.setsLeft = [];
            if (!slotData.setsRight) slotData.setsRight = [];
            await db.saveCurrentWorkout(this.currentWorkout);
        }

        document.getElementById('exercise-slot-label').textContent = this.currentSlot.slotId;
        document.getElementById('current-exercise-name').textContent = exerciseName;
        
        // Check for LMS volume adjustment
        const lmsData = await this.getLMSDataForSlot(this.currentSlot);
        this.currentLMSData = lmsData; // Store for later use
        document.getElementById('exercise-sets').textContent = this.currentSlot.sets;
        
        document.getElementById('exercise-reps').textContent = `${this.currentSlot.repsMin}-${this.currentSlot.repsMax}`;
        document.getElementById('exercise-rest').textContent = `${this.currentSlot.rest}s`;
        document.getElementById('exercise-rir').textContent = this.currentSlot.rir;
        
        // Update instructions for unilateral exercises
        if (this.isUnilateralMode) {
            document.getElementById('exercise-instructions').textContent = 'Exercice unilatéral : fais chaque côté séparément. Les poids et conseils sont indépendants.';
        } else {
            // Get stretch bias cue if available
            const stretchBias = this.getStretchBiasCue(exerciseName);
            let instructions = this.currentSlot.instructions || '';
            
            if (stretchBias && stretchBias.bias !== 'neutral') {
                const biasIcon = stretchBias.bias === 'lengthened' ? '🎯' : '💪';
                instructions = `${biasIcon} ${stretchBias.cue}` + (instructions ? `\n${instructions}` : '');
            }
            
            document.getElementById('exercise-instructions').textContent = instructions || 'Amplitude complète et contrôlée.';
        }

        // Hide all superset-specific containers and show standard ones
        document.getElementById('logbook-card-superset').style.display = 'none';
        document.getElementById('superset-coaching-container').style.display = 'none';
        document.getElementById('superset-logbook-container').style.display = 'none';
        document.getElementById('superset-progress-container').style.display = 'none';
        document.getElementById('superset-decision-card').style.display = 'none';
        document.getElementById('exercise-progress-card').style.display = 'none';
        document.getElementById('coach-decision-card').style.display = 'none';
        document.getElementById('exercise-notes').style.display = 'block';
        
        // Handle unilateral mode display
        const unilateralCoachingContainer = document.getElementById('unilateral-coaching-container');
        const unilateralLogbookContainer = document.getElementById('unilateral-logbook-container');
        
        if (this.isUnilateralMode) {
            document.getElementById('coaching-advice').style.display = 'none';
            document.getElementById('logbook-card').style.display = 'none';
            if (unilateralCoachingContainer) unilateralCoachingContainer.style.display = 'block';
            if (unilateralLogbookContainer) unilateralLogbookContainer.style.display = 'block';
            
            // Load logbook for both sides
            await this.loadUnilateralLogbook();
            
            // Calculate coaching for both sides
            await this.calculateUnilateralCoachingAdvice();
            this.showUnilateralCoachingAdvice();
            
            // Render unified unilateral logbook
            this.renderUnilateralLogbook();
            this.renderExerciseNotes();
            
            this.renderUnilateralSeries();
        } else {
            document.getElementById('logbook-card').style.display = 'block';
            if (unilateralCoachingContainer) unilateralCoachingContainer.style.display = 'none';
            if (unilateralLogbookContainer) unilateralLogbookContainer.style.display = 'none';
            
            // Load logbook (last session data)
            await this.loadLogbook();
            
            // Calculate and show coaching advice (store for use in renderSeries)
            this.currentCoachingAdvice = await this.getEnhancedCoachingAdvice(this.currentSlot);
            await this.showCoachingAdvice();
            this.renderExerciseProgressSparkline(this.exerciseProgressHistory);
            this.renderExerciseNotes();
            
            this.renderSeries();
        }
        
        this.showScreen('exercise');
        
        // Check if there's an active timer from before
        this.onAppResume();
    }
    
    // ===== Unilateral Logbook Loading =====
    async loadUnilateralLogbook() {
        const baseExerciseId = this.currentSlot.activeExercise || this.currentSlot.name;
        
        // Load for left side
        const leftExerciseId = `${baseExerciseId} (Gauche)`;
        this.lastUnilateralHistoryLeftAll = await this.loadSideHistoryAll(leftExerciseId);
        this.lastUnilateralHistoryLeft = this.lastUnilateralHistoryLeftAll[0] || null;
        
        // Load for right side
        const rightExerciseId = `${baseExerciseId} (Droite)`;
        this.lastUnilateralHistoryRightAll = await this.loadSideHistoryAll(rightExerciseId);
        this.lastUnilateralHistoryRight = this.lastUnilateralHistoryRightAll[0] || null;
    }
    
    async loadSideHistoryAll(exerciseId) {
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        
        const workoutGroups = {};
        for (const set of allSetHistory) {
            if (!workoutGroups[set.workoutId]) {
                workoutGroups[set.workoutId] = { date: set.date, sets: [], totalReps: 0, maxWeight: 0 };
            }
            workoutGroups[set.workoutId].sets.push(set);
            workoutGroups[set.workoutId].totalReps += set.reps || 0;
            workoutGroups[set.workoutId].maxWeight = Math.max(workoutGroups[set.workoutId].maxWeight, set.weight || 0);
        }
        
        const workoutIds = Object.keys(workoutGroups);
        if (workoutIds.length === 0) return [];
        
        workoutIds.sort((a, b) => new Date(workoutGroups[b].date) - new Date(workoutGroups[a].date));
        
        // Return last 3 workouts
        return workoutIds.slice(0, 3).map(wId => {
            const workout = workoutGroups[wId];
            workout.sets.sort((a, b) => a.setNumber - b.setNumber);
            return {
                date: workout.date,
                sets: workout.sets,
                totalReps: workout.totalReps,
                maxWeight: workout.maxWeight
            };
        });
    }
    
    // ===== Unilateral Coaching Advice =====
    // Scientific approach: Analyze each side independently for imbalance detection
    async calculateUnilateralCoachingAdvice() {
        const baseExerciseId = this.currentSlot.activeExercise || this.currentSlot.name;
        
        // Create a mock slot for left side with unilateral flag
        const leftSlot = { ...this.currentSlot, activeExercise: `${baseExerciseId} (Gauche)` };
        this.unilateralCoachingAdviceLeft = await this.getEnhancedCoachingAdviceForSlot(leftSlot, {
            isUnilateral: true,
            side: 'left'
        });
        
        // Create a mock slot for right side with unilateral flag
        const rightSlot = { ...this.currentSlot, activeExercise: `${baseExerciseId} (Droite)` };
        this.unilateralCoachingAdviceRight = await this.getEnhancedCoachingAdviceForSlot(rightSlot, {
            isUnilateral: true,
            side: 'right'
        });
        
        // Compare sides and add balance advice
        this.addUnilateralBalanceAdvice();
    }
    
    // Add specific advice about balance between sides
    addUnilateralBalanceAdvice() {
        const leftWeight = this.unilateralCoachingAdviceLeft?.suggestedWeight;
        const rightWeight = this.unilateralCoachingAdviceRight?.suggestedWeight;
        
        // If both sides have data and weights differ significantly
        if (leftWeight !== '?' && rightWeight !== '?' && leftWeight !== rightWeight) {
            const diff = Math.abs(leftWeight - rightWeight);
            const maxWeight = Math.max(leftWeight, rightWeight);
            const percentDiff = (diff / maxWeight) * 100;
            
            if (percentDiff > 10) {
                const weakerSide = leftWeight < rightWeight ? 'gauche' : 'droit';
                const strongerSide = leftWeight < rightWeight ? 'droit' : 'gauche';
                
                // Add balance warning to the weaker side
                const targetAdvice = leftWeight < rightWeight 
                    ? this.unilateralCoachingAdviceLeft 
                    : this.unilateralCoachingAdviceRight;
                
                targetAdvice.message = `⚠️ Déséquilibre détecté (${diff}kg de diff). Côté ${weakerSide} plus faible. ` + 
                    `Commence toujours par ce côté et utilise la même charge des deux côtés pour corriger.`;
                targetAdvice.type = 'balance_warning';
            }
        }
    }
    
    showUnilateralCoachingAdvice() {
        const container = document.getElementById('unilateral-coaching-container');
        if (!container) return;
        
        const exerciseName = this.currentSlot.activeExercise || this.currentSlot.name;
        
        // Left side
        document.getElementById('unilateral-advice-name-left').textContent = exerciseName;
        if (this.unilateralCoachingAdviceLeft) {
            document.getElementById('unilateral-advice-message-left').textContent = this.unilateralCoachingAdviceLeft.message;
            document.getElementById('unilateral-advice-weight-left').textContent =
                this.formatSuggestedWeightDisplay(this.unilateralCoachingAdviceLeft);
            document.getElementById('unilateral-advice-reps-left').textContent = this.unilateralCoachingAdviceLeft.suggestedReps;
        }
        
        // Right side
        document.getElementById('unilateral-advice-name-right').textContent = exerciseName;
        if (this.unilateralCoachingAdviceRight) {
            document.getElementById('unilateral-advice-message-right').textContent = this.unilateralCoachingAdviceRight.message;
            document.getElementById('unilateral-advice-weight-right').textContent =
                this.formatSuggestedWeightDisplay(this.unilateralCoachingAdviceRight);
            document.getElementById('unilateral-advice-reps-right').textContent = this.unilateralCoachingAdviceRight.suggestedReps;
        }
    }
    
    renderUnilateralLogbook() {
        const exerciseName = this.currentSlot.activeExercise || this.currentSlot.name;
        
        // Left side
        document.getElementById('unilateral-logbook-name-left').textContent = 'Côté Gauche';
        this.renderUnilateralLogbookContent('left', this.lastUnilateralHistoryLeftAll || [this.lastUnilateralHistoryLeft].filter(Boolean));
        
        // Right side
        document.getElementById('unilateral-logbook-name-right').textContent = 'Côté Droit';
        this.renderUnilateralLogbookContent('right', this.lastUnilateralHistoryRightAll || [this.lastUnilateralHistoryRight].filter(Boolean));
    }
    
    renderUnilateralLogbookContent(side, historyArray) {
        const dateEl = document.getElementById(`unilateral-logbook-date-${side}`);
        const contentEl = document.getElementById(`unilateral-logbook-content-${side}`);
        
        // Normalize to array
        const histories = Array.isArray(historyArray) ? historyArray : (historyArray ? [historyArray] : []);
        
        if (histories.length === 0 || !histories[0]?.sets || histories[0].sets.length === 0) {
            dateEl.textContent = '--';
            contentEl.innerHTML = '<div class="logbook-empty">Première fois</div>';
            return;
        }
        
        dateEl.textContent = this.formatLogbookDate(histories[0].date);
        
        let html = '';
        histories.forEach((history, idx) => {
            const dateText = this.formatLogbookDate(history.date);
            const isLatest = idx === 0;
            
            html += `<div class="unilateral-logbook-session ${isLatest ? '' : 'unilateral-logbook-session-older'}">`;
            html += `<div class="unilateral-logbook-session-header">
                <span class="logbook-session-label">${isLatest ? 'Dernière' : `S-${idx + 1}`}</span>
                <span class="logbook-session-date">${dateText}</span>
            </div>`;
            html += '<div class="unilateral-logbook-sets">';
            for (const set of history.sets) {
                html += `<span class="unilateral-logbook-set">${this.formatSetWeight(set.weight, set.exerciseId || this.currentSlot)}×${set.reps}</span>`;
            }
            html += '</div></div>';
        });
        
        contentEl.innerHTML = html;
    }
    
    // ===== SuperSet Exercise Screen =====
    async openSuperset(slotId) {
        this.currentSlot = await db.get('slots', slotId);
        this.currentSlot = this.normalizeSlotProgressionConfig(this.currentSlot);
        if (!this.currentSlot || !this.currentSlot.supersetWith) return;
        
        this.supersetSlot = await db.get('slots', this.currentSlot.supersetWith);
        this.supersetSlot = this.normalizeSlotProgressionConfig(this.supersetSlot);
        if (!this.supersetSlot) {
            // Fallback to regular exercise
            return this.openExercise(slotId);
        }
        
        this.isSupersetMode = true;
        this.isReviewMode = this.areSlotsCompleted([slotId, this.currentSlot.supersetWith]);
        this.supersetCoachingAdviceA = null;
        this.supersetCoachingAdviceB = null;
        this.ensureWorkoutCoachingState();

        // Initialize slot data for both exercises
        if (!this.currentWorkout.slots[slotId]) {
            this.currentWorkout.slots[slotId] = { sets: [], startTime: Date.now(), meta: this.buildSlotCoachMeta(this.currentSlot) };
        }
        if (!this.currentWorkout.slots[this.supersetSlot.id]) {
            this.currentWorkout.slots[this.supersetSlot.id] = { sets: [], startTime: Date.now(), meta: this.buildSlotCoachMeta(this.supersetSlot) };
        }
        this.currentWorkout.slots[slotId].meta = this.buildSlotCoachMeta(this.currentSlot);
        this.currentWorkout.slots[this.supersetSlot.id].meta = this.buildSlotCoachMeta(this.supersetSlot);
        await db.saveCurrentWorkout(this.currentWorkout);

        // Update header with superset badge
        document.getElementById('exercise-slot-label').textContent = `⚡ ${this.currentSlot.slotId} + ${this.supersetSlot.slotId}`;
        document.getElementById('current-exercise-name').textContent = 'SuperSet';
        
        // Use min sets between both exercises
        const sets = Math.min(this.currentSlot.sets, this.supersetSlot.sets);
        document.getElementById('exercise-sets').textContent = sets;
        document.getElementById('exercise-reps').textContent = 'Voir ci-dessous';
        document.getElementById('exercise-rest').textContent = `${this.currentSlot.rest}s`;
        document.getElementById('exercise-rir').textContent = `${this.currentSlot.rir}-${this.supersetSlot.rir}`;
        document.getElementById('exercise-instructions').textContent = 'Enchaîne les deux exercices sans pause entre eux. Repos uniquement après avoir fait les deux.';

        // Hide standard coaching and logbook, show superset versions
        document.getElementById('coaching-advice').style.display = 'none';
        document.getElementById('logbook-card').style.display = 'none';
        document.getElementById('logbook-card-superset').style.display = 'none';
        document.getElementById('superset-coaching-container').style.display = 'block';
        document.getElementById('superset-logbook-container').style.display = 'block';
        document.getElementById('superset-progress-container').style.display = 'grid';
        document.getElementById('superset-decision-card').style.display = 'block';
        document.getElementById('exercise-progress-card').style.display = 'none';
        document.getElementById('coach-decision-card').style.display = 'none';
        document.getElementById('exercise-notes').style.display = 'none';

        // Load logbook for both exercises
        await this.loadLogbook();
        await this.loadSupersetLogbook();
        
        // Calculate coaching advice for BOTH exercises
        await this.calculateSupersetCoachingAdvice();
        this.showSupersetCoachingAdvice();
        this.showScreen('exercise');

        // Render after the screen is visible so the progress canvases can measure correctly.
        this.renderUnifiedSupersetLogbook();
        this.renderSupersetSeries();
        window.requestAnimationFrame(() => this.renderSupersetInsights());
        
        // Check if there's an active timer from before
        this.onAppResume();
    }
    
    // Calculate coaching advice for both exercises in a superset
    // Scientific principle: SuperSets induce metabolic stress and pre-fatigue
    async calculateSupersetCoachingAdvice() {
        const originalSlot = this.currentSlot;
        
        // Calculate for exercise A (first exercise - full strength)
        this.supersetCoachingAdviceA = await this.getEnhancedCoachingAdviceForSlot(this.currentSlot, { 
            isSuperset: true, 
            supersetPosition: 'A',
            pairedExercise: this.supersetSlot
        });
        
        // Calculate for exercise B (second exercise - may be pre-fatigued)
        this.supersetCoachingAdviceB = await this.getEnhancedCoachingAdviceForSlot(this.supersetSlot, { 
            isSuperset: true, 
            supersetPosition: 'B',
            pairedExercise: this.currentSlot
        });
        
        this.currentSlot = originalSlot;
    }

    evaluateWorkoutAgainstTargets(workout, slot, options = {}) {
        if (!workout?.sets?.length) {
            return { successRate: 0, allSetsHitTargets: false, inEffortZone: true };
        }

        const repCeiling = options.repCeiling || slot.repsMax;
        const targetSetCount = Math.max(workout.targetSetCount || workout.sets.length, 1);
        const targetArray = this.genTargetReps(slot.repsMin, repCeiling, targetSetCount);
        const threshold = options.threshold ?? (slot.type === 'isolation' ? 1 : 0.75);
        const hits = workout.sets.reduce((count, set, index) => {
            return count + ((set.reps || 0) >= (targetArray[index] || repCeiling) ? 1 : 0);
        }, 0);
        const successRate = hits / targetSetCount;
        const avgRpe = workout.avgRpe ?? null;
        const inEffortZone = avgRpe == null || (avgRpe >= 7 && avgRpe <= 9.5);

        return {
            successRate,
            hits,
            threshold,
            allSetsHitTargets: successRate >= threshold,
            inEffortZone
        };
    }

    async buildProgressionContext(slot, options = {}) {
        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...slot });
        const exerciseId = normalizedSlot.activeExercise || normalizedSlot.name;
        const workouts = await this.getExerciseWorkoutHistory(exerciseId);
        const baseWeightIncrement = (await db.getSetting('weightIncrement')) ?? 2;
        const incrementKg = normalizedSlot.incrementKg ?? (normalizedSlot.type === 'isolation'
            ? Math.min(baseWeightIncrement, normalizedSlot.minIncrementKg || 1)
            : Math.max(baseWeightIncrement, normalizedSlot.minIncrementKg || 1));
        const weightIncrement = normalizedSlot.loadingProfile === 'machine_stack' && normalizedSlot.machineStepKg
            ? normalizedSlot.machineStepKg
            : incrementKg;

        const lastWorkout = workouts[0] || null;
        const prevWorkout = workouts[1] || null;
        const lastWeight = lastWorkout ? this.getReferenceWeight(lastWorkout, normalizedSlot) : 0;
        const avgReps = lastWorkout ? (lastWorkout.totalReps / Math.max(lastWorkout.sets.length, 1)) : 0;
        const avgRpe = lastWorkout?.avgRpe ?? null;
        const targetRepsArray = this.genTargetReps(normalizedSlot.repsMin, normalizedSlot.repsMax, normalizedSlot.sets);
        const targetReps = this.formatTargetReps(targetRepsArray);
        const nextLoadCandidate = this.roundToHalf(lastWeight + weightIncrement);
        const progressionMode = normalizedSlot.progressionMode === 'load' || normalizedSlot.progressionMode === 'bodyweight' || normalizedSlot.progressionMode === 'capped_load'
            ? normalizedSlot.progressionMode
            : (this.isBodyweightProgressionExercise(normalizedSlot, workouts) ? 'bodyweight' : 'load');
        const repUpperBound = this.getExtendedRepUpperBound(normalizedSlot, progressionMode);
        const lastExposure = lastWorkout ? this.evaluateWorkoutAgainstTargets(lastWorkout, normalizedSlot, { repCeiling: repUpperBound }) : null;
        const prevExposure = prevWorkout ? this.evaluateWorkoutAgainstTargets(prevWorkout, normalizedSlot, { repCeiling: repUpperBound }) : null;
        const consecutiveExposureSuccess = [lastExposure, prevExposure].filter(exposure => exposure?.allSetsHitTargets && exposure?.inEffortZone).length;
        const sessionContext = this.getSessionFatigueContextForSlot(normalizedSlot, options);
        const canIncreaseLoad = normalizedSlot.maxSelectableLoadKg == null || nextLoadCandidate <= normalizedSlot.maxSelectableLoadKg;
        const atCap = normalizedSlot.maxSelectableLoadKg != null && lastWeight >= normalizedSlot.maxSelectableLoadKg;

        return {
            slot: normalizedSlot,
            options,
            exerciseId,
            workouts,
            lastWorkout,
            prevWorkout,
            lastWeight,
            avgReps,
            avgRpe: avgRpe ?? 8,
            targetRepsArray,
            targetReps,
            weightIncrement,
            nextLoadCandidate,
            progressionMode,
            repUpperBound,
            lastExposure,
            prevExposure,
            consecutiveExposureSuccess,
            sessionContext,
            atCap,
            canIncreaseLoad
        };
    }

    syncCoachDerivedState(slot, context = {}) {
        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...slot });
        this.currentExerciseType = normalizedSlot.type === 'isolation' ? 'isolation' : 'compound';
        this.currentMaxSafeRpe = normalizedSlot.type === 'isolation' ? 10 : 9;

        const workouts = context.workouts || [];
        if (workouts.length >= 3) {
            const last3 = workouts.slice(0, 3);
            const avgFirstSetWeight = last3.reduce((sum, workout) => sum + (workout.sets[0]?.weight || 0), 0) / last3.length;
            const avgFirstSetReps = last3.reduce((sum, workout) => sum + (workout.sets[0]?.reps || 0), 0) / last3.length;
            this.avgPerformance = { weight: avgFirstSetWeight, reps: avgFirstSetReps };
        } else {
            this.avgPerformance = null;
        }

        this.currentHistoricalBestE1RM = workouts.length
            ? Math.max(
                ...workouts.flatMap(workout => workout.sets.map(set =>
                    this.calculateE1RM(set.weight || 0, set.reps || 0, set.rpe || 8)
                )),
                0
            )
            : 0;
    }

    getLoadProgressionAdvice(slot, context) {
        const { lastWorkout, lastWeight, avgReps, targetReps, weightIncrement } = context;

        if (!lastWorkout) {
            return {
                type: 'new',
                title: 'Premier essai',
                message: 'Commence léger pour calibrer ta charge de travail.',
                suggestedWeight: '?',
                suggestedReps: targetReps,
                weightTrend: 'neutral'
            };
        }

        if (avgReps >= slot.repsMax) {
            return {
                type: 'increase',
                title: 'Progression 📈',
                message: `Tu as validé le haut de fourchette. Monte à ${this.roundToHalf(lastWeight + weightIncrement)}kg.`,
                suggestedWeight: this.roundToHalf(lastWeight + weightIncrement),
                suggestedReps: targetReps,
                weightTrend: 'up'
            };
        }

        if (avgReps < slot.repsMin) {
            return {
                type: 'maintain',
                title: 'Consolide',
                message: `Reste à ${lastWeight}kg et remonte d'abord les reps dans la fourchette.`,
                suggestedWeight: lastWeight,
                suggestedReps: targetReps,
                weightTrend: 'neutral'
            };
        }

        return {
            type: 'maintain',
            title: 'Continue',
            message: `Bonne base. Vise le haut de la fourchette avant d'augmenter la charge.`,
            suggestedWeight: lastWeight,
            suggestedReps: targetReps,
            weightTrend: 'neutral'
        };
    }

    applySupersetSpecificAdjustments(advice, slot, context, options = {}) {
        if (!advice) return advice;

        const adjusted = { ...advice };
        const isSecondExercise = options.supersetPosition === 'B';
        if (!isSecondExercise) {
            adjusted.coachOverlay = 'superset_primary';
            return adjusted;
        }

        adjusted.coachOverlay = 'superset_secondary';
        const overlap = context.sessionContext?.reasons?.find(reason => reason.includes('pré-fatigue'));
        const note = overlap
            ? `Le coach tient compte de la pré-fatigue du superset sur cet exercice.`
            : `Le coach garde une marge car l'exercice B arrive déjà pré-fatigué.`;

        if (typeof adjusted.suggestedWeight === 'number' && slot.progressionMode === 'load' && context.sessionContext?.fatigueLevel !== 'low') {
            adjusted.suggestedWeight = this.roundToHalf(adjusted.suggestedWeight * 0.975);
            adjusted.weightTrend = adjusted.suggestedWeight < context.lastWeight ? 'down' : adjusted.weightTrend;
        }

        adjusted.message = `${this.stripCoachMetaFromMessage(adjusted.message)} ${note}`.trim();
        return adjusted;
    }

    applyUnilateralSpecificAdjustments(advice, slot, context, options = {}) {
        if (!advice) return advice;

        const adjusted = { ...advice };
        const sideLabel = options.side === 'left' ? 'gauche' : options.side === 'right' ? 'droit' : 'faible';
        adjusted.coachOverlay = 'unilateral';

        if (slot.progressionMode === 'load') {
            adjusted.message = `${this.stripCoachMetaFromMessage(adjusted.message)} Garde la même exigence technique sur chaque côté et commence par le côté ${sideLabel}.`.trim();
        }

        return adjusted;
    }

    getCappedLoadProgressionAdvice(slot, context) {
        const currentAxis = slot.progressionState?.primaryAxis || 'reps';
        const nextAxis = this.getNextProgressionAxis('capped_load', currentAxis, slot);
        const maxSets = slot.type === 'isolation' ? 6 : 5;
        const fatigueHigh = context.sessionContext?.fatigueLevel === 'high';
        const fatigueModerate = context.sessionContext?.fatigueLevel === 'moderate';

        if (!context.lastWorkout) {
            return {
                type: 'new',
                title: 'Premier essai',
                message: 'Commence dans la fourchette normale. Le mode charge plafonnée prendra le relais quand la machine sera saturée.',
                suggestedWeight: slot.maxSelectableLoadKg ? Math.min(slot.maxSelectableLoadKg, context.nextLoadCandidate || slot.maxSelectableLoadKg) : '?',
                suggestedReps: context.targetReps,
                weightTrend: 'neutral'
            };
        }

        if (!context.atCap && context.canIncreaseLoad && context.avgReps >= slot.repsMax && context.avgRpe <= 9) {
            return this.getLoadProgressionAdvice(slot, context);
        }

        if (!context.atCap && !context.canIncreaseLoad) {
            return {
                type: 'maintain',
                title: 'Cap machine détecté',
                message: `Le prochain palier dépasse ${slot.maxSelectableLoadKg}kg. On bascule sur une surcharge multi-axes: reps, séries, tempo puis variante.`,
                suggestedWeight: slot.maxSelectableLoadKg,
                suggestedReps: this.formatTargetReps(this.genTargetReps(slot.repsMin, context.repUpperBound, slot.sets)),
                weightTrend: 'neutral',
                progressionAxis: 'reps',
                nextProgressionAxis: nextAxis
            };
        }

        if (currentAxis === 'reps') {
            const cappedTargets = this.formatTargetReps(this.genTargetReps(slot.repsMin, context.repUpperBound, slot.sets));
            if (context.consecutiveExposureSuccess >= 2) {
                if (slot.sets < maxSets && !fatigueHigh && !fatigueModerate) {
                    return {
                        type: 'volume_up',
                        title: 'Cap validé, on ajoute du volume',
                        message: `Le plafond de charge est validé sur 2 expositions. Garde ${context.lastWeight}kg et passe à ${slot.sets + 1} séries.`,
                        suggestedWeight: context.lastWeight,
                        suggestedReps: this.formatTargetReps(this.genTargetReps(slot.repsMin, context.repUpperBound, slot.sets + 1)),
                        suggestedSets: slot.sets + 1,
                        weightTrend: 'neutral',
                        progressionAxis: 'sets',
                        nextProgressionAxis: 'tempo'
                    };
                }

                return {
                    type: 'maintain',
                    title: 'Cap validé, on durcit l’exécution',
                    message: `Charge max confirmée. Garde ${context.lastWeight}kg et passe au tempo suivant (2-0-2 → 3-0-2 → 3-1-2) avant de changer d'exercice.`,
                    suggestedWeight: context.lastWeight,
                    suggestedReps: cappedTargets,
                    weightTrend: 'neutral',
                    progressionAxis: 'tempo',
                    nextProgressionAxis: 'pause'
                };
            }

            return {
                type: 'maintain',
                title: 'Charge plafonnée',
                message: `Reste à ${context.lastWeight}kg et progresse d'abord en reps jusqu'à ${context.repUpperBound}. Ne cherche plus à ajouter de kilos.`,
                suggestedWeight: context.lastWeight,
                suggestedReps: cappedTargets,
                weightTrend: 'neutral',
                progressionAxis: 'reps',
                nextProgressionAxis: nextAxis
            };
        }

        if (currentAxis === 'sets') {
            const targetSets = Math.min(maxSets, slot.sets + 1);
            return {
                type: 'volume_up',
                title: 'Volume avant tout',
                message: fatigueHigh
                    ? 'Fatigue trop élevée pour ajouter une série aujourd’hui. Garde le volume actuel et privilégie la qualité.'
                    : `Le plafond est atteint. Garde la charge et vise ${targetSets} séries productives avant de passer au tempo.`,
                suggestedWeight: context.lastWeight,
                suggestedReps: this.formatTargetReps(this.genTargetReps(slot.repsMin, context.repUpperBound, fatigueHigh ? slot.sets : targetSets)),
                suggestedSets: fatigueHigh ? slot.sets : targetSets,
                weightTrend: 'neutral',
                progressionAxis: fatigueHigh ? 'sets' : 'tempo',
                nextProgressionAxis: fatigueHigh ? 'sets' : 'tempo'
            };
        }

        if (currentAxis === 'tempo') {
            return {
                type: 'maintain',
                title: 'Tempo progression',
                message: 'Conserve la charge et augmente la difficulté via le tempo: 2-0-2, puis 3-0-2, puis 3-1-2.',
                suggestedWeight: context.lastWeight,
                suggestedReps: this.formatTargetReps(this.genTargetReps(slot.repsMin, Math.max(slot.repsMin, slot.repsMax + 1), slot.sets)),
                weightTrend: 'neutral',
                progressionAxis: 'tempo',
                nextProgressionAxis: 'pause'
            };
        }

        if (currentAxis === 'pause' || currentAxis === 'rom' || currentAxis === 'density') {
            const nextLabel = currentAxis === 'pause'
                ? 'ajoute 1 à 2 secondes de pause en étirement'
                : currentAxis === 'rom'
                    ? 'impose une ROM complète et stricte'
                    : 'réduis le repos de 15s seulement si la technique reste propre';
            return {
                type: 'maintain',
                title: 'Surcharge sans kilos',
                message: `Charge max maintenue: ${nextLabel}. Si tout est déjà validé, la prochaine étape est une variante plus dure dans la pool.`,
                suggestedWeight: context.lastWeight,
                suggestedReps: context.targetReps,
                weightTrend: 'neutral',
                progressionAxis: currentAxis,
                nextProgressionAxis: this.getNextProgressionAxis('capped_load', currentAxis, slot)
            };
        }

        if (slot.pool?.length > 1) {
            return {
                type: 'switch',
                title: 'Variante plus dure',
                message: 'Tous les axes internes ont été testés. Passe sur une variante plus difficile de la pool avant un vrai switch global.',
                suggestedWeight: context.lastWeight,
                suggestedReps: context.targetReps,
                weightTrend: 'neutral',
                progressionAxis: 'variant',
                nextProgressionAxis: 'switch'
            };
        }

        return {
            type: 'switch',
            title: 'Nouveau stimulus',
            message: 'Tous les axes de surcharge sont épuisés sur cette machine. Il est pertinent de changer d’exercice.',
            suggestedWeight: context.lastWeight,
            suggestedReps: context.targetReps,
            weightTrend: 'neutral',
            progressionAxis: 'switch',
            nextProgressionAxis: 'switch'
        };
    }

    getBodyweightProgressionAdvice(slot, context) {
        const profile = slot.bodyweightProfile || {};
        const family = profile.family || 'generic';
        const currentAxis = slot.progressionState?.primaryAxis || 'reps';
        const nextAxis = this.getNextProgressionAxis('bodyweight', currentAxis, slot);
        const repUpperBound = this.getExtendedRepUpperBound(slot, 'bodyweight');
        const bodyweightTargets = this.formatTargetReps(this.genTargetReps(slot.repsMin, repUpperBound, slot.sets));
        const canAdvance = context.consecutiveExposureSuccess >= 2 && (!context.sessionContext || context.sessionContext.fatigueLevel !== 'high');
        const assistanceStepKg = profile.assistanceStepKg || 5;

        if (!context.lastWorkout) {
            return {
                type: 'new',
                title: 'Premier bloc poids du corps',
                message: 'Commence dans la fourchette normale. Le coach fera progresser reps, assistance, tempo ou variante selon ta famille de mouvement.',
                suggestedWeight: 0,
                suggestedWeightLabel: 'PDC',
                suggestedReps: context.targetReps,
                weightTrend: 'neutral'
            };
        }

        if (profile.allowAssistance) {
            if (canAdvance) {
                return {
                    type: 'maintain',
                    title: 'Moins d’assistance',
                    message: `Le mouvement est validé 2 fois. Réduis l’assistance d’un palier de ${assistanceStepKg}kg avant d’ajouter de nouvelles reps.`,
                    suggestedWeight: null,
                    suggestedAssistanceKg: Math.max(0, (profile.currentAssistanceKg || assistanceStepKg) - assistanceStepKg),
                    suggestedWeightLabel: 'Assistance',
                    suggestedReps: context.targetReps,
                    weightTrend: 'down',
                    progressionAxis: 'assistance',
                    nextProgressionAxis: nextAxis
                };
            }

            if (context.avgReps < slot.repsMin && context.avgRpe >= 9) {
                return {
                    type: 'maintain',
                    title: 'Assistance à stabiliser',
                    message: 'Reste au même niveau d’assistance pour revenir dans la plage. Si tu es très en dessous des reps, augmente légèrement l’assistance.',
                    suggestedWeight: null,
                    suggestedAssistanceKg: profile.currentAssistanceKg || assistanceStepKg,
                    suggestedWeightLabel: 'Assistance',
                    suggestedReps: context.targetReps,
                    weightTrend: 'neutral',
                    progressionAxis: 'assistance',
                    nextProgressionAxis: nextAxis
                };
            }
        }

        if (currentAxis === 'reps') {
            if (canAdvance) {
                if (profile.allowExternalLoad) {
                    return {
                        type: 'increase',
                        title: 'Prêt pour le lest',
                        message: 'Le haut de fourchette est validé 2 fois. Ajoute un léger lest au lieu de continuer à pousser les reps.',
                        suggestedWeight: Math.max(slot.incrementKg || 2.5, slot.minIncrementKg || 1),
                        suggestedWeightLabel: 'Lest',
                        suggestedReps: context.targetReps,
                        weightTrend: 'up',
                        progressionAxis: 'load',
                        nextProgressionAxis: nextAxis
                    };
                }

                return {
                    type: 'maintain',
                    title: 'Progression au poids du corps',
                    message: family === 'pushup'
                        ? 'Le haut de fourchette est validé 2 fois. Passe à une variante plus difficile avant d’allonger encore la plage de reps.'
                        : 'Le haut de fourchette est validé 2 fois. Passe au prochain axe: tempo, pause ou variante plus dure.',
                    suggestedWeight: 0,
                    suggestedWeightLabel: 'PDC',
                    suggestedReps: bodyweightTargets,
                    weightTrend: 'neutral',
                    progressionAxis: nextAxis,
                    nextProgressionAxis: nextAxis
                };
            }

            return {
                type: 'maintain',
                title: 'Accumule des reps utiles',
                message: `Reste au poids du corps et valide d'abord la plage étendue (${bodyweightTargets}) avant de changer d’axe.`,
                suggestedWeight: 0,
                suggestedWeightLabel: 'PDC',
                suggestedReps: bodyweightTargets,
                weightTrend: 'neutral',
                progressionAxis: 'reps',
                nextProgressionAxis: nextAxis
            };
        }

        if (currentAxis === 'variant') {
            return {
                type: 'switch',
                title: 'Variante plus dure',
                message: family === 'abs'
                    ? 'Passe à un levier plus long ou une variante plus dure avant d’ajouter de la charge.'
                    : 'Passe à une variante plus exigeante mécaniquement avant d’allonger encore les reps.',
                suggestedWeight: profile.allowExternalLoad ? null : 0,
                suggestedWeightLabel: profile.allowExternalLoad ? 'Variante' : 'PDC',
                suggestedReps: context.targetReps,
                weightTrend: 'neutral',
                progressionAxis: 'variant',
                nextProgressionAxis: nextAxis
            };
        }

        if (currentAxis === 'tempo' || currentAxis === 'pause' || currentAxis === 'rom') {
            const cue = currentAxis === 'tempo'
                ? 'ralentis l’excentrique ou ajoute un tempo plus strict'
                : currentAxis === 'pause'
                    ? 'ajoute une pause isométrique utile'
                    : 'renforce la ROM stricte ou le levier long';
            return {
                type: 'maintain',
                title: 'Surcharge technique',
                message: `Poids du corps sans charge externe: ${cue}. Si tout est validé, la prochaine étape est la variante ou le lest.`,
                suggestedWeight: profile.allowExternalLoad ? null : 0,
                suggestedWeightLabel: profile.allowExternalLoad ? 'Technique' : 'PDC',
                suggestedReps: context.targetReps,
                weightTrend: 'neutral',
                progressionAxis: currentAxis,
                nextProgressionAxis: nextAxis
            };
        }

        return {
            type: 'maintain',
            title: 'Poids du corps',
            message: 'Le coach garde le poids du corps comme base et choisit le meilleur axe de surcharge: reps, assistance, tempo, pause ou variante.',
            suggestedWeight: profile.allowExternalLoad ? null : 0,
            suggestedWeightLabel: profile.allowExternalLoad ? 'PDC / lest' : 'PDC',
            suggestedReps: context.targetReps,
            weightTrend: 'neutral',
            progressionAxis: currentAxis,
            nextProgressionAxis: nextAxis
        };
    }

    resolvePlateau(mode, slot, context) {
        if (mode === 'capped_load') {
            return this.getNextProgressionAxis('capped_load', slot.progressionState?.primaryAxis || 'reps', slot);
        }

        if (mode === 'bodyweight') {
            return this.getNextProgressionAxis('bodyweight', slot.progressionState?.primaryAxis || 'reps', slot);
        }

        return 'load';
    }

    enforceProgressionConstraints(advice, slot, context = {}) {
        if (!advice || !slot) return advice;

        const constrained = { ...advice };
        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...slot });

        if (normalizedSlot.progressionMode === 'capped_load' && typeof constrained.suggestedWeight === 'number' && normalizedSlot.maxSelectableLoadKg != null) {
            constrained.suggestedWeight = Math.min(constrained.suggestedWeight, normalizedSlot.maxSelectableLoadKg);
            if (constrained.suggestedWeight === normalizedSlot.maxSelectableLoadKg && advice.weightTrend === 'up' && context.atCap) {
                constrained.weightTrend = 'neutral';
            }
        }

        if (normalizedSlot.progressionMode === 'bodyweight') {
            if (!normalizedSlot.bodyweightProfile?.allowExternalLoad) {
                constrained.suggestedWeight = normalizedSlot.bodyweightProfile?.allowAssistance ? null : 0;
                constrained.suggestedWeightLabel ||= normalizedSlot.bodyweightProfile?.allowAssistance ? 'Assistance / PDC' : 'PDC';
                constrained.weightTrend = constrained.suggestedAssistanceKg != null ? 'down' : 'neutral';
            }
        }

        if (normalizedSlot.bodyweightProfile?.allowAssistance && constrained.suggestedAssistanceKg != null) {
            constrained.suggestedWeight = null;
            constrained.suggestedWeightLabel = `${constrained.suggestedAssistanceKg}kg assistance`;
        }

        return constrained;
    }

    async syncSlotProgressionStateFromAdvice(slot, advice, context = {}) {
        if (!slot?.id || !advice) return;

        const storedSlot = await db.get('slots', slot.id);
        if (!storedSlot) return;

        const normalizedSlot = this.normalizeSlotProgressionConfig(storedSlot);
        let changed = false;

        if (advice.progressionAxis && advice.progressionAxis !== 'switch' && normalizedSlot.progressionState?.primaryAxis !== advice.progressionAxis) {
            normalizedSlot.progressionState.primaryAxis = advice.progressionAxis;
            changed = true;
        }

        if ((normalizedSlot.progressionMode === 'capped_load' || context.atCap || context.canIncreaseLoad === false) && !normalizedSlot.capDetection?.userFlag) {
            const reasons = new Set(normalizedSlot.capDetection?.reasons || []);
            if (context.atCap) reasons.add('load_cap_reached');
            if (context.canIncreaseLoad === false) reasons.add('next_increment_exceeds_cap');

            const nextConfidence = Math.max(
                normalizedSlot.capDetection?.autoConfidence || 0,
                context.atCap ? 0.9 : (context.canIncreaseLoad === false ? 0.8 : 0.6)
            );

            if (nextConfidence !== normalizedSlot.capDetection.autoConfidence || reasons.size !== (normalizedSlot.capDetection?.reasons || []).length) {
                normalizedSlot.capDetection.autoConfidence = nextConfidence;
                normalizedSlot.capDetection.reasons = Array.from(reasons);
                normalizedSlot.capDetection.lastDetectedAt = new Date().toISOString();
                changed = true;
            }
        }

        if (context.consecutiveExposureSuccess >= 2 && advice.progressionAxis && advice.progressionAxis !== 'switch') {
            if (normalizedSlot.progressionState.lastSuccessfulAxis !== advice.progressionAxis) {
                normalizedSlot.progressionState.lastSuccessfulAxis = advice.progressionAxis;
                changed = true;
            }
        }

        if (!changed) return;

        await db.put('slots', normalizedSlot);

        if (this.currentSlot?.id === normalizedSlot.id) {
            this.currentSlot = normalizedSlot;
        }

        if (this.currentWorkout?.slots?.[normalizedSlot.id]) {
            this.currentWorkout.slots[normalizedSlot.id].meta = this.buildSlotCoachMeta(normalizedSlot);
            await db.saveCurrentWorkout(this.currentWorkout);
        }
    }
    
    // Calculate coaching advice for a specific slot (reusable)
    // Enhanced with scientific hypertrophy principles for supersets and unilateral exercises
    async calculateCoachingAdviceForSlot(slot, options = {}) {
        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...slot });
        const context = await this.buildProgressionContext(normalizedSlot, options);

        let advice;

        if (normalizedSlot.progressionMode === 'bodyweight') {
            advice = this.getBodyweightProgressionAdvice(normalizedSlot, context);
        } else if (normalizedSlot.progressionMode === 'capped_load') {
            advice = this.getCappedLoadProgressionAdvice(normalizedSlot, context);
        } else {
            advice = this.getLoadProgressionAdvice(normalizedSlot, context);
        }

        if (options.isSuperset) {
            advice = this.applySupersetSpecificAdjustments(advice, normalizedSlot, context, options);
        }

        if (options.isUnilateral) {
            advice = this.applyUnilateralSpecificAdjustments(advice, normalizedSlot, context, options);
        }

        const coachContext = await this.buildCoachContextForSlot(normalizedSlot, options);
        advice = this.applyContextualAdjustmentsToAdvice(advice, normalizedSlot, coachContext);
        advice = this.enforceProgressionConstraints(advice, normalizedSlot, context);
        await this.syncSlotProgressionStateFromAdvice(normalizedSlot, advice, context);

        return advice;
    }
    
    // Deprecated legacy helper. Superset-specific behavior now wraps the unified router.
    getSupersetCoachingAdvice(slot, data) {
        const { lastWeight, avgReps, avgRpe, targetReps, weightIncrement, supersetPosition, workouts } = data;
        
        // Determine if this is an agonist-antagonist superset (e.g., biceps/triceps) or same-muscle pre-exhaust
        const isSecondExercise = supersetPosition === 'B';
        
        // SCIENTIFIC PRINCIPLE: Second exercise in superset experiences ~8-15% strength reduction
        // due to accumulated fatigue and metabolic byproducts (lactate, H+ ions)
        const fatigueReduction = isSecondExercise ? 0.92 : 1.0; // 8% reduction for exercise B
        
        // Analyze progression over last 3 sessions
        const recentWorkouts = workouts.slice(0, 3);
        const isProgressing = recentWorkouts.length >= 2 && 
            recentWorkouts[0].maxWeight >= recentWorkouts[recentWorkouts.length - 1].maxWeight;
        
        // Check RPE trend - if consistently high (>9), may need recovery
        const highRpeTrend = recentWorkouts.filter(w => w.avgRpe >= 9).length >= 2;
        
        // ===== SUPERSET PROGRESSION DECISIONS =====
        
        // Case 1: High reps achieved → Progress weight
        if (avgReps >= slot.repsMax && avgRpe <= 9) {
            const newWeight = Math.round((lastWeight + weightIncrement) * fatigueReduction * 2) / 2;
            return {
                type: 'increase',
                title: isSecondExercise ? '📈 Progression (B)' : '📈 Progression (A)',
                message: isSecondExercise 
                    ? `SuperSet B : ${avgReps.toFixed(0)} reps atteintes ! Monte à ${newWeight}kg. La pré-fatigue maximise le stress métabolique 💪`
                    : `SuperSet A : Top du range atteint ! Monte le poids pour maintenir la tension mécanique.`,
                suggestedWeight: newWeight,
                suggestedReps: targetReps,
                weightTrend: 'up'
            };
        }
        
        // Case 2: High RPE trend → Maintain or slight reduction for recovery
        if (highRpeTrend) {
            return {
                type: 'maintain',
                title: '⚡ Consolidation',
                message: isSecondExercise
                    ? `RPE élevé détecté. Garde ${lastWeight}kg et focus sur le squeeze musculaire. La fatigue du SuperSet = stimulus maximal.`
                    : `Effort intense récent. Maintiens le poids et contrôle le tempo (3-1-2).`,
                suggestedWeight: lastWeight,
                suggestedReps: targetReps,
                weightTrend: 'neutral'
            };
        }
        
        // Case 3: Reps below minimum → Focus on technique
        if (avgReps < slot.repsMin) {
            const adjustedWeight = isSecondExercise 
                ? Math.round(lastWeight * 0.95 * 2) / 2 // 5% drop for second exercise
                : lastWeight;
            return {
                type: 'decrease',
                title: '🎯 Ajustement technique',
                message: isSecondExercise
                    ? `En SuperSet, le 2ème exo subit la pré-fatigue. Baisse légèrement (${adjustedWeight}kg) pour garder le contrôle et les reps.`
                    : `Vise la qualité : tempo contrôlé, full ROM. Garde ${lastWeight}kg et monte les reps.`,
                suggestedWeight: adjustedWeight,
                suggestedReps: targetReps,
                weightTrend: isSecondExercise ? 'down' : 'neutral'
            };
        }
        
        // Default: Good zone, maintain and push for more reps
        return {
            type: 'maintain',
            title: '💪 Zone optimale',
            message: isSecondExercise
                ? `SuperSet efficace ! Garde ${lastWeight}kg. La fatigue accumulée crée un stress métabolique optimal pour l'hypertrophie.`
                : `Bon range de reps. Pousse vers ${slot.repsMax} reps avant d'augmenter. Focus sur la connexion muscle-cerveau.`,
            suggestedWeight: lastWeight,
            suggestedReps: targetReps,
            weightTrend: 'neutral'
        };
    }
    
    // Deprecated legacy helper. Unilateral-specific behavior now wraps the unified router.
    getUnilateralCoachingAdvice(slot, data) {
        const { lastWeight, avgReps, avgRpe, targetReps, weightIncrement, side, workouts } = data;
        
        // SCIENTIFIC PRINCIPLE: Unilateral exercises require more stabilization
        // This can reduce max load by ~5-10% but increases motor unit recruitment
        
        // Get the other side's history for comparison
        const exerciseName = slot.activeExercise || slot.name;
        const baseName = exerciseName.replace(/ \((Gauche|Droite)\)$/, '');
        const otherSide = side === 'left' ? 'Droite' : 'Gauche';
        
        // Analyze progression
        const recentWorkouts = workouts.slice(0, 3);
        const avgWeight = recentWorkouts.length > 0 
            ? recentWorkouts.reduce((sum, w) => sum + w.maxWeight, 0) / recentWorkouts.length 
            : lastWeight;
        
        // ===== UNILATERAL PROGRESSION DECISIONS =====
        
        // Case 1: Good reps achieved → Progress
        if (avgReps >= slot.repsMax && avgRpe <= 9) {
            return {
                type: 'increase',
                title: '📈 Progression',
                message: `${slot.repsMax} reps atteintes ! Monte à ${lastWeight + weightIncrement}kg. L'unilatéral recrute plus de fibres stabilisatrices = meilleure activation.`,
                suggestedWeight: lastWeight + weightIncrement,
                suggestedReps: targetReps,
                weightTrend: 'up'
            };
        }
        
        // Case 2: Reps below target
        if (avgReps < slot.repsMin) {
            return {
                type: 'maintain',
                title: '🎯 Focus équilibre',
                message: `Garde ${lastWeight}kg et vise ${slot.repsMin}-${slot.repsMax} reps. L'unilatéral corrige les déséquilibres : même charge, même tempo des deux côtés.`,
                suggestedWeight: lastWeight,
                suggestedReps: targetReps,
                weightTrend: 'neutral'
            };
        }
        
        // Default: Good zone
        return {
            type: 'maintain',
            title: '💪 Équilibre',
            message: `Bon travail ! ${lastWeight}kg × ${targetReps}. Assure-toi que les deux côtés font exactement le même travail pour corriger les asymétries.`,
            suggestedWeight: lastWeight,
            suggestedReps: targetReps,
            weightTrend: 'neutral'
        };
    }
    
    // Display coaching advice for superset
    showSupersetCoachingAdvice() {
        const container = document.getElementById('superset-coaching-container');
        if (!container) return;
        container.className = 'coaching-advice coaching-advice-superset';
        
        // Exercise A
        const nameA = this.currentSlot.activeExercise || this.currentSlot.name;
        document.getElementById('superset-advice-name-a').textContent = nameA;
        
        if (this.supersetCoachingAdviceA) {
            document.getElementById('superset-advice-message-a').innerHTML = this.formatCoachAdviceMessage(this.supersetCoachingAdviceA, this.currentSlot);
            document.getElementById('superset-advice-weight-a').textContent =
                this.formatSuggestedWeightDisplay(this.supersetCoachingAdviceA);
            document.getElementById('superset-advice-reps-a').textContent = this.supersetCoachingAdviceA.suggestedReps;
        }
        
        // Exercise B
        const nameB = this.supersetSlot.activeExercise || this.supersetSlot.name;
        document.getElementById('superset-advice-name-b').textContent = nameB;
        
        if (this.supersetCoachingAdviceB) {
            document.getElementById('superset-advice-message-b').innerHTML = this.formatCoachAdviceMessage(this.supersetCoachingAdviceB, this.supersetSlot);
            document.getElementById('superset-advice-weight-b').textContent =
                this.formatSuggestedWeightDisplay(this.supersetCoachingAdviceB);
            document.getElementById('superset-advice-reps-b').textContent = this.supersetCoachingAdviceB.suggestedReps;
        }
    }
    
    // Render unified superset logbook
    renderUnifiedSupersetLogbook() {
        // Exercise A
        const nameA = this.currentSlot.activeExercise || this.currentSlot.name;
        document.getElementById('superset-logbook-name-a').textContent = nameA;
        this.renderSupersetLogbookContent('a', this.lastExerciseHistoryAll || [this.lastExerciseHistory].filter(Boolean));
        
        // Exercise B
        const nameB = this.supersetSlot.activeExercise || this.supersetSlot.name;
        document.getElementById('superset-logbook-name-b').textContent = nameB;
        this.renderSupersetLogbookContent('b', this.lastSupersetHistoryAll || [this.lastSupersetHistory].filter(Boolean));
    }
    
    // Render logbook content for a specific exercise in superset (supports array of sessions)
    renderSupersetLogbookContent(exerciseKey, historyArray) {
        const dateEl = document.getElementById(`superset-logbook-date-${exerciseKey}`);
        const contentEl = document.getElementById(`superset-logbook-content-${exerciseKey}`);
        const slotRef = exerciseKey === 'a' ? this.currentSlot : this.supersetSlot;
        
        // Normalize to array
        const histories = Array.isArray(historyArray) ? historyArray : (historyArray ? [historyArray] : []);
        
        if (histories.length === 0 || !histories[0]?.sets || histories[0].sets.length === 0) {
            dateEl.textContent = '--';
            contentEl.innerHTML = '<div class="logbook-empty">Première fois</div>';
            return;
        }
        
        dateEl.textContent = this.formatLogbookDate(histories[0].date);
        
        let html = '';
        histories.forEach((history, idx) => {
            const dateText = this.formatLogbookDate(history.date);
            const isLatest = idx === 0;
            
            html += `<div class="logbook-session ${isLatest ? 'logbook-session-latest' : 'logbook-session-older'} superset-logbook-session ${isLatest ? '' : 'superset-logbook-session-older'}">`;
            html += `<div class="superset-logbook-session-header">
                <span class="logbook-session-label">${isLatest ? 'Dernière séance' : `Séance -${idx + 1}`}</span>
                <span class="logbook-session-date">${dateText}</span>
            </div>`;
            html += '<div class="logbook-session-sets">';
            for (const set of history.sets) {
                html += `
                    <div class="logbook-set">
                        <span class="logbook-set-number">S${set.setNumber}</span>
                        <div class="logbook-set-data">
                            <span class="logbook-value"><strong>${this.formatSetWeight(set.weight, set.exerciseId || slotRef)}</strong></span>
                            <span class="logbook-value"><strong>${set.reps}</strong>reps</span>
                        </div>
                    </div>
                `;
            }
            html += '</div>';
            html += `
                <div class="logbook-summary">
                    <div class="logbook-summary-item">
                        <div class="logbook-summary-label">Total reps</div>
                        <div class="logbook-summary-value">${history.totalReps}</div>
                    </div>
                    <div class="logbook-summary-item">
                        <div class="logbook-summary-label">Charge max</div>
                        <div class="logbook-summary-value">${this.isPureBodyweightSlot(slotRef) && history.maxWeight === 0 ? 'PDC' : `${history.maxWeight} kg`}</div>
                    </div>
                </div>
            `;
            html += '</div>';
        });

        if (histories.length >= 2) {
            const latest = histories[0];
            const oldest = histories[histories.length - 1];
            const weightDiff = latest.maxWeight - oldest.maxWeight;
            const repsDiff = latest.totalReps - oldest.totalReps;

            let trendIcon = this.getLogbookTrendIconSVG('neutral');
            let trendClass = 'neutral';
            let trendText = 'Stable';

            if (weightDiff > 0 || repsDiff > 0) {
                trendIcon = this.getLogbookTrendIconSVG('positive');
                trendClass = 'positive';
                trendText = `${weightDiff > 0 ? this.formatLogbookTrendDelta(weightDiff, ' kg') : ''}${weightDiff > 0 && repsDiff > 0 ? ' / ' : ''}${repsDiff > 0 ? this.formatLogbookTrendDelta(repsDiff, ' reps') : ''} sur ${histories.length} séances`;
            } else if (weightDiff < 0 || repsDiff < 0) {
                trendIcon = this.getLogbookTrendIconSVG('negative');
                trendClass = 'negative';
                trendText = `${weightDiff < 0 ? this.formatLogbookTrendDelta(weightDiff, ' kg') : ''}${weightDiff < 0 && repsDiff < 0 ? ' / ' : ''}${repsDiff < 0 ? this.formatLogbookTrendDelta(repsDiff, ' reps') : ''} sur ${histories.length} séances`;
            }

            html += `
                <div class="logbook-trend logbook-trend-${trendClass}">
                    <span class="logbook-trend-icon">${trendIcon}</span>
                    <span class="logbook-trend-text">${trendText}</span>
                </div>
            `;
        }
        
        contentEl.innerHTML = html;
    }
    
    async loadSupersetLogbook() {
        if (!this.supersetSlot) return;
        
        const exerciseId = this.supersetSlot.activeExercise || this.supersetSlot.name;
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        
        const workoutGroups = {};
        for (const set of allSetHistory) {
            if (!workoutGroups[set.workoutId]) {
                workoutGroups[set.workoutId] = { date: set.date, sets: [] };
            }
            workoutGroups[set.workoutId].sets.push(set);
        }
        
        const workoutIds = Object.keys(workoutGroups);
        if (workoutIds.length === 0) {
            this.lastSupersetHistory = null;
            this.lastSupersetHistoryAll = [];
            this.supersetProgressHistory = [];
            this.renderSupersetLogbook(null);
            return;
        }
        
        workoutIds.sort((a, b) => new Date(workoutGroups[b].date) - new Date(workoutGroups[a].date));
        
        // Build history for the last 3 workouts and the last 6 for the sparkline
        const recentWorkouts = workoutIds.slice(0, 3);
        const trendWorkouts = workoutIds.slice(0, 6);
        this.lastSupersetHistoryAll = recentWorkouts.map(wId => {
            const workout = workoutGroups[wId];
            workout.sets.sort((a, b) => a.setNumber - b.setNumber);
            return {
                date: workout.date,
                sets: workout.sets,
                totalReps: workout.sets.reduce((sum, s) => sum + (s.reps || 0), 0),
                maxWeight: Math.max(...workout.sets.map(s => s.weight || 0))
            };
        });
        this.supersetProgressHistory = trendWorkouts.map(wId => {
            const workout = workoutGroups[wId];
            workout.sets.sort((a, b) => a.setNumber - b.setNumber);
            return {
                date: workout.date,
                sets: workout.sets,
                totalReps: workout.sets.reduce((sum, s) => sum + (s.reps || 0), 0),
                maxWeight: Math.max(...workout.sets.map(s => s.weight || 0))
            };
        });
        
        // Keep backward compatibility
        this.lastSupersetHistory = this.lastSupersetHistoryAll[0] || null;
        
        this.renderSupersetLogbook(this.lastSupersetHistory);
    }
    
    renderSupersetLogbook(history) {
        const logbookDate = document.getElementById('logbook-date-superset');
        const logbookContent = document.getElementById('logbook-content-superset');
        
        if (!history || !history.sets || history.sets.length === 0) {
            logbookDate.textContent = '--';
            logbookContent.innerHTML = '<div class="logbook-empty">Première fois sur cet exercice</div>';
            return;
        }
        
        // Format date
        const date = new Date(history.date);
        const daysAgo = Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
        let dateText = '';
        if (daysAgo === 0) {
            dateText = "Aujourd'hui";
        } else if (daysAgo === 1) {
            dateText = 'Hier';
        } else if (daysAgo < 7) {
            dateText = `Il y a ${daysAgo} jours`;
        } else {
            const options = { day: 'numeric', month: 'short' };
            dateText = date.toLocaleDateString('fr-FR', options);
        }
        
        logbookDate.textContent = dateText;
        
        // Render sets with summary
        let html = '<div class="logbook-sets">';
        for (const set of history.sets) {
            html += `
                <div class="logbook-set">
                    <span class="logbook-set-number">S${set.setNumber}</span>
                    <span class="logbook-set-data">${this.formatSetWeight(set.weight, set.exerciseId || this.supersetSlot)} × ${set.reps}</span>
                </div>
            `;
        }
        html += '</div>';
        
        // Add summary
        html += `
            <div class="logbook-summary">
                <div class="logbook-summary-item">
                    <span class="logbook-summary-label">TOTAL REPS</span>
                    <span class="logbook-summary-value">${history.totalReps}</span>
                </div>
                <div class="logbook-summary-item">
                    <span class="logbook-summary-label">CHARGE MAX</span>
                    <span class="logbook-summary-value">${history.maxWeight} kg</span>
                </div>
            </div>
        `;
        
        logbookContent.innerHTML = html;
    }
    
    renderSupersetSeries() {
        const container = document.getElementById('series-list');
        container.innerHTML = '';
        
        const sets = Math.min(this.currentSlot.sets, this.supersetSlot.sets);
        const slotAData = this.currentWorkout.slots[this.currentSlot.id] || { sets: [] };
        const slotBData = this.currentWorkout.slots[this.supersetSlot.id] || { sets: [] };
        
        const lastSetsA = this.lastExerciseHistory?.sets || [];
        const lastSetsB = this.lastSupersetHistory?.sets || [];
        
        // Get exercise names (full names)
        const nameA = this.currentSlot.activeExercise || this.currentSlot.name;
        const nameB = this.supersetSlot.activeExercise || this.supersetSlot.name;
        
        // Get coaching suggested weights
        const adviceA = this.supersetCoachingAdviceA;
        const adviceB = this.supersetCoachingAdviceB;
        const coachWeightA = adviceA?.suggestedWeight;
        const coachWeightB = adviceB?.suggestedWeight;
        const targetRepsAArray = this.getAdviceTargetRepsArray(
            adviceA,
            this.genTargetReps(this.currentSlot.repsMin, this.currentSlot.repsMax, sets)
        );
        const targetRepsBArray = this.getAdviceTargetRepsArray(
            adviceB,
            this.genTargetReps(this.supersetSlot.repsMin, this.supersetSlot.repsMax, sets)
        );
        const isBodyweightA = this.currentSlot.progressionMode === 'bodyweight' &&
            !this.currentSlot.bodyweightProfile?.allowExternalLoad &&
            !this.currentSlot.bodyweightProfile?.allowAssistance;
        const isBodyweightB = this.supersetSlot.progressionMode === 'bodyweight' &&
            !this.supersetSlot.bodyweightProfile?.allowExternalLoad &&
            !this.supersetSlot.bodyweightProfile?.allowAssistance;

        for (let i = 0; i < sets; i++) {
            const setAData = slotAData.sets[i] || {};
            const setBData = slotBData.sets[i] || {};
            const isCompleted = setAData.completed && setBData.completed;
            const completedBeforeA = slotAData.sets.filter(s => s?.completed).length;
            const completedBeforeB = slotBData.sets.filter(s => s?.completed).length;
            const isNextIncompleteA = !setAData.completed && completedBeforeA === i;
            const isNextIncompleteB = !setBData.completed && completedBeforeB === i;
            
            // Smart weight suggestions with coaching priority
            let suggestedWeightA = '';
            let suggestedWeightB = '';
            
            // For exercise A
            if (isNextIncompleteA && this.nextSetSuggestedWeight && !isBodyweightA) {
                suggestedWeightA = this.nextSetSuggestedWeight;
            } else if (i === 0 && coachWeightA && coachWeightA !== '?') {
                suggestedWeightA = coachWeightA;
            } else if (i > 0 && slotAData.sets[i-1]?.weight) {
                suggestedWeightA = slotAData.sets[i-1].weight;
            } else if (lastSetsA[i]?.weight) {
                suggestedWeightA = lastSetsA[i].weight;
            } else if (coachWeightA && coachWeightA !== '?') {
                suggestedWeightA = coachWeightA;
            }
            
            // For exercise B
            if (i === 0 && coachWeightB && coachWeightB !== '?') {
                suggestedWeightB = coachWeightB;
            } else if (i > 0 && slotBData.sets[i-1]?.weight) {
                suggestedWeightB = slotBData.sets[i-1].weight;
            } else if (lastSetsB[i]?.weight) {
                suggestedWeightB = lastSetsB[i].weight;
            } else if (coachWeightB && coachWeightB !== '?') {
                suggestedWeightB = coachWeightB;
            }
            
            const baselineWeightA = i > 0 && slotAData.sets[i - 1]?.weight
                ? slotAData.sets[i - 1].weight
                : (lastSetsA[i]?.weight || lastSetsA[0]?.weight || suggestedWeightA);
            const baselineWeightB = i > 0 && slotBData.sets[i - 1]?.weight
                ? slotBData.sets[i - 1].weight
                : (lastSetsB[i]?.weight || lastSetsB[0]?.weight || suggestedWeightB);
            const displayWeightA = isBodyweightA
                ? 0
                : this.getInputValueOrFallback(setAData.weight, isNextIncompleteA && suggestedWeightA ? suggestedWeightA : baselineWeightA);
            const displayWeightB = isBodyweightB
                ? 0
                : this.getInputValueOrFallback(setBData.weight, isNextIncompleteB && suggestedWeightB ? suggestedWeightB : baselineWeightB);
            
            // Detect coaching-suggested state for green "coach" label
            const isSuggestedA = !setAData.weight && !isBodyweightA && !!(suggestedWeightA || baselineWeightA);
            const isCoachingSuggestedA = !setAData.weight && isNextIncompleteA && !!adviceA;
            const isSuggestedB = !setBData.weight && !isBodyweightB && !!(suggestedWeightB || baselineWeightB);
            const isCoachingSuggestedB = !setBData.weight && isNextIncompleteB && !!adviceB;
            const targetRepsA = targetRepsAArray[i] || this.currentSlot.repsMax;
            const targetRepsB = targetRepsBArray[i] || this.supersetSlot.repsMax;
            const previousWeightA = [...slotAData.sets].slice(0, i).reverse().find(set => set?.completed && Number.isFinite(set.weight) && set.weight > 0)?.weight ?? null;
            const previousWeightB = [...slotBData.sets].slice(0, i).reverse().find(set => set?.completed && Number.isFinite(set.weight) && set.weight > 0)?.weight ?? null;
            const inlineHintA = this.getInlineCoachSetHint(
                adviceA,
                targetRepsA,
                isNextIncompleteA && suggestedWeightA ? suggestedWeightA : displayWeightA,
                isNextIncompleteA,
                previousWeightA
            );
            const inlineHintB = this.getInlineCoachSetHint(
                adviceB,
                targetRepsB,
                isNextIncompleteB && suggestedWeightB ? suggestedWeightB : displayWeightB,
                isNextIncompleteB,
                previousWeightB
            );
            
            const isEditingSuperset = isCompleted && this.editingSetIndex === i;
            const canEditValidatedSet = isCompleted;
            
            const card = document.createElement('div');
            card.className = `superset-series-card-new ${isCompleted && !isEditingSuperset ? 'completed' : ''} ${isEditingSuperset ? 'editing' : ''}`;
            card.dataset.setIndex = i;

            if (isCompleted && !isEditingSuperset) {
                card.innerHTML = `
                    <div class="superset-series-header">
                        <span class="superset-series-number">Série ${i + 1}</span>
                        <div class="superset-series-check">
                            ${canEditValidatedSet ? `
                            <button class="btn-edit-set" data-set-index="${i}" title="Modifier">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            ` : ''}
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                    </div>
                    
                    <div class="superset-completed-results">
                        <div class="superset-completed-exercise exercise-a">
                            <span class="superset-completed-badge badge-a">A</span>
                            <span class="superset-completed-name">${nameA}</span>
                            <span class="superset-completed-value">${this.formatSetWeight(setAData.weight, this.currentSlot)} × ${setAData.reps}</span>
                        </div>
                        <div class="superset-completed-exercise exercise-b">
                            <span class="superset-completed-badge badge-b">B</span>
                            <span class="superset-completed-name">${nameB}</span>
                            <span class="superset-completed-value">${this.formatSetWeight(setBData.weight, this.supersetSlot)} × ${setBData.reps}</span>
                        </div>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div class="superset-series-header">
                        <span class="superset-series-number">Série ${i + 1}</span>
                        <span class="superset-series-target">${targetRepsA} / ${targetRepsB} reps</span>
                    </div>
                    
                    <!-- Exercise A Block -->
                    <div class="superset-input-block block-a">
                        <div class="superset-input-header">
                            <span class="superset-input-badge badge-a">A</span>
                            <span class="superset-input-name">${nameA}</span>
                        </div>
                        <div class="superset-input-row">
                            <div class="superset-input-group ${isSuggestedA ? 'suggested' : ''} ${isCoachingSuggestedA ? 'coaching-suggested' : ''}">
                                <label>${this.getLoadFieldLabel(this.currentSlot)} ${isCoachingSuggestedA ? '<span class="suggested-label">coach</span>' : (isSuggestedA ? '<span class="suggested-label">base</span>' : '')}</label>
                                ${isBodyweightA ? `
                                    <div class="superset-static-value">PDC</div>
                                    <input type="hidden" class="input-weight-a superset-input-hidden" value="0" data-set-index="${i}">
                                ` : `
                                    <input type="number" inputmode="decimal" class="input-weight-a superset-input" 
                                           value="${displayWeightA}" placeholder="${suggestedWeightA || baselineWeightA || 'kg'}" data-set-index="${i}">
                                `}
                            </div>
                            <div class="superset-input-group">
                                <label>Reps ${isCoachingSuggestedA ? `<span class="suggested-label">coach: ${targetRepsA}</span>` : ''}</label>
                                <input type="number" inputmode="numeric" class="input-reps-a superset-input" 
                                       value="${setAData.reps || ''}" placeholder="${targetRepsA}" data-set-index="${i}">
                            </div>
                        </div>
                        ${inlineHintA ? `
                            <div class="series-coach-inline superset-coach-inline">
                                <span class="series-coach-inline-badge">Coach</span>
                                <span class="series-coach-inline-text">${inlineHintA}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- Superset Link Indicator -->
                    <div class="superset-link-visual">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 5v14M5 12h14"/>
                        </svg>
                    </div>
                    
                    <!-- Exercise B Block -->
                    <div class="superset-input-block block-b">
                        <div class="superset-input-header">
                            <span class="superset-input-badge badge-b">B</span>
                            <span class="superset-input-name">${nameB}</span>
                        </div>
                        <div class="superset-input-row">
                            <div class="superset-input-group ${isSuggestedB ? 'suggested' : ''} ${isCoachingSuggestedB ? 'coaching-suggested' : ''}">
                                <label>${this.getLoadFieldLabel(this.supersetSlot)} ${isCoachingSuggestedB ? '<span class="suggested-label">coach</span>' : (isSuggestedB ? '<span class="suggested-label">base</span>' : '')}</label>
                                ${isBodyweightB ? `
                                    <div class="superset-static-value">PDC</div>
                                    <input type="hidden" class="input-weight-b superset-input-hidden" value="0" data-set-index="${i}">
                                ` : `
                                    <input type="number" inputmode="decimal" class="input-weight-b superset-input" 
                                           value="${displayWeightB}" placeholder="${suggestedWeightB || baselineWeightB || 'kg'}" data-set-index="${i}">
                                `}
                            </div>
                            <div class="superset-input-group">
                                <label>Reps ${isCoachingSuggestedB ? `<span class="suggested-label">coach: ${targetRepsB}</span>` : ''}</label>
                                <input type="number" inputmode="numeric" class="input-reps-b superset-input" 
                                       value="${setBData.reps || ''}" placeholder="${targetRepsB}" data-set-index="${i}">
                            </div>
                        </div>
                        ${inlineHintB ? `
                            <div class="series-coach-inline superset-coach-inline">
                                <span class="series-coach-inline-badge">Coach</span>
                                <span class="series-coach-inline-text">${inlineHintB}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <button class="btn ${isEditingSuperset ? 'btn-save-edit-superset' : 'btn-superset-validate'}" data-set-index="${i}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        ${isEditingSuperset ? 'Sauvegarder' : 'Valider le SuperSet'}
                    </button>
                `;
            }

            container.appendChild(card);
        }

        // Check if all sets complete
        const completedA = slotAData.sets.filter(s => s.completed).length;
        const completedB = slotBData.sets.filter(s => s.completed).length;
        if (completedA >= sets && completedB >= sets && !this.isReviewMode) {
            this.showSupersetSummary();
        }
    }
    
    async completeSupersetSet(setIndex) {
        const weightA = parseFloat(document.querySelector(`.input-weight-a[data-set-index="${setIndex}"]`).value) || 0;
        const repsA = parseInt(document.querySelector(`.input-reps-a[data-set-index="${setIndex}"]`).value) || 0;
        const weightB = parseFloat(document.querySelector(`.input-weight-b[data-set-index="${setIndex}"]`).value) || 0;
        const repsB = parseInt(document.querySelector(`.input-reps-b[data-set-index="${setIndex}"]`).value) || 0;

        if (repsA === 0 || repsB === 0) {
            alert('Entre les reps pour les deux exercices');
            return;
        }

        // Save both sets
        const slotAData = this.currentWorkout.slots[this.currentSlot.id];
        const slotBData = this.currentWorkout.slots[this.supersetSlot.id];
        
        slotAData.sets[setIndex] = { weight: weightA, reps: repsA, completed: true, timestamp: Date.now() };
        slotBData.sets[setIndex] = { weight: weightB, reps: repsB, completed: true, timestamp: Date.now() };

        await db.saveCurrentWorkout(this.currentWorkout);

        // Add XP for both
        let xp = (await db.getSetting('xp')) ?? 0;
        xp += 20; // Double XP for superset
        await db.setSetting('xp', xp);

        await this.refreshWorkoutCoachingState();
        await this.calculateSupersetCoachingAdvice();
        this.showSupersetCoachingAdvice();
        this.renderSupersetSeries();

        // Check if all sets complete
        const sets = Math.min(this.currentSlot.sets, this.supersetSlot.sets);
        const completedA = slotAData.sets.filter(s => s.completed).length;
        const completedB = slotBData.sets.filter(s => s.completed).length;
        
        if (completedA >= sets && completedB >= sets) {
            setTimeout(() => this.showSupersetSummary(), 300);
        } else {
            this.startRestTimer(this.currentSlot.rest);
        }
    }
    
    async showSupersetSummary() {
        const slotAData = this.currentWorkout.slots[this.currentSlot.id];
        const slotBData = this.currentWorkout.slots[this.supersetSlot.id];
        this.editingSetIndex = null;
        
        const totalRepsA = slotAData.sets.reduce((sum, s) => sum + (s.reps || 0), 0);
        const totalRepsB = slotBData.sets.reduce((sum, s) => sum + (s.reps || 0), 0);
        const maxWeightA = Math.max(...slotAData.sets.map(s => s.weight || 0));
        const maxWeightB = Math.max(...slotBData.sets.map(s => s.weight || 0));

        document.getElementById('summary-total-reps').textContent = totalRepsA + totalRepsB;
        document.getElementById('summary-max-weight').textContent = `${Math.max(maxWeightA, maxWeightB)} kg`;
        
        document.getElementById('summary-icon').textContent = '⚡';
        document.getElementById('summary-title').textContent = 'SuperSet terminé !';
        
        document.getElementById('summary-comparison').innerHTML = `
            <div class="comparison-card positive">
                <span class="comparison-icon">🔥</span>
                <span class="comparison-text">2 exercices en un ! Efficacité max !</span>
            </div>
        `;

        document.getElementById('exercise-summary').classList.add('active');

        // Mark both slots as completed
        if (!this.currentWorkout.completedSlots.includes(this.currentSlot.id)) {
            this.currentWorkout.completedSlots.push(this.currentSlot.id);
        }
        if (!this.currentWorkout.completedSlots.includes(this.supersetSlot.id)) {
            this.currentWorkout.completedSlots.push(this.supersetSlot.id);
        }
        await db.saveCurrentWorkout(this.currentWorkout);
        
        this.triggerConfetti();
    }
    
    // ===== Logbook =====
    async loadLogbook() {
        const exerciseId = this.currentSlot.activeExercise || this.currentSlot.name;
        
        // Get all set history for this exercise
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        
        // Filter to get only sets from previous workouts (not current)
        const previousSets = allSetHistory.filter(s => {
            // Exclude sets from current workout if it exists
            return true;
        });
        
        // Group by workout and get the most recent workout's sets
        const workoutGroups = {};
        for (const set of previousSets) {
            if (!workoutGroups[set.workoutId]) {
                workoutGroups[set.workoutId] = {
                    date: set.date,
                    sets: []
                };
            }
            workoutGroups[set.workoutId].sets.push(set);
        }
        
        // Find the most recent workouts
        const workoutIds = Object.keys(workoutGroups);
        if (workoutIds.length === 0) {
            this.lastExerciseHistory = null;
            this.lastExerciseHistoryAll = [];
            this.exerciseProgressHistory = [];
            this.renderLogbook(null);
            return;
        }
        
        // Sort by date descending
        workoutIds.sort((a, b) => {
            return new Date(workoutGroups[b].date) - new Date(workoutGroups[a].date);
        });
        
        // Build history for the logbook (last 3) and trend sparkline (last 6)
        const recentWorkouts = workoutIds.slice(0, 3);
        const trendWorkouts = workoutIds.slice(0, 6);
        this.lastExerciseHistoryAll = recentWorkouts.map(wId => {
            const workout = workoutGroups[wId];
            workout.sets.sort((a, b) => a.setNumber - b.setNumber);
            const totalReps = workout.sets.reduce((sum, s) => sum + (s.reps || 0), 0);
            const maxWeight = Math.max(...workout.sets.map(s => s.weight || 0));
            return { date: workout.date, sets: workout.sets, totalReps, maxWeight };
        });
        this.exerciseProgressHistory = trendWorkouts.map(wId => {
            const workout = workoutGroups[wId];
            workout.sets.sort((a, b) => a.setNumber - b.setNumber);
            const totalReps = workout.sets.reduce((sum, s) => sum + (s.reps || 0), 0);
            const maxWeight = Math.max(...workout.sets.map(s => s.weight || 0));
            return { date: workout.date, sets: workout.sets, totalReps, maxWeight };
        });
        
        // Keep backward compatibility: lastExerciseHistory = most recent
        this.lastExerciseHistory = this.lastExerciseHistoryAll[0];
        
        this.renderLogbook(this.lastExerciseHistoryAll);
    }
    
    formatLogbookDate(dateStr) {
        const date = new Date(dateStr);
        const daysAgo = Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
        if (daysAgo === 0) return "Aujourd'hui";
        if (daysAgo === 1) return 'Hier';
        if (daysAgo < 7) return `Il y a ${daysAgo}j`;
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    formatLogbookTrendDelta(value, suffix = '') {
        const rounded = Math.round(value * 10) / 10;
        const formatted = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0$/, '');
        const sign = rounded > 0 ? '+' : '';
        return `${sign}${formatted}${suffix}`;
    }

    getLogbookTrendIconSVG(direction = 'neutral') {
        if (direction === 'positive') {
            return `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 16l5-5 4 4 7-8"></path>
                    <path d="M14 7h6v6"></path>
                </svg>
            `;
        }

        if (direction === 'negative') {
            return `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 8l5 5 4-4 7 8"></path>
                    <path d="M14 17h6v-6"></path>
                </svg>
            `;
        }

        return `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 12h14"></path>
                <path d="M15 8l4 4-4 4"></path>
            </svg>
        `;
    }
    
    renderLogbook(historyArray) {
        const logbookCard = document.getElementById('logbook-card');
        const logbookDate = document.getElementById('logbook-date');
        const logbookContent = document.getElementById('logbook-content');
        
        // Handle null or empty
        if (!historyArray || (Array.isArray(historyArray) && historyArray.length === 0)) {
            logbookDate.textContent = '--';
            logbookContent.innerHTML = '<div class="logbook-empty">Première fois sur cet exercice</div>';
            return;
        }
        
        // Backward compat: if single object passed, wrap in array
        const histories = Array.isArray(historyArray) ? historyArray : [historyArray];
        
        // Header date = most recent session
        logbookDate.textContent = this.formatLogbookDate(histories[0].date);
        
        let html = '';
        
        histories.forEach((history, idx) => {
            const dateText = this.formatLogbookDate(history.date);
            const isLatest = idx === 0;
            
            html += `<div class="logbook-session ${isLatest ? 'logbook-session-latest' : 'logbook-session-older'}">`;
            html += `<div class="logbook-session-header">
                <span class="logbook-session-label">${isLatest ? 'Dernière séance' : `Séance -${idx + 1}`}</span>
                <span class="logbook-session-date">${dateText}</span>
            </div>`;
            
            html += '<div class="logbook-session-sets">';
            for (const set of history.sets) {
                html += `
                    <div class="logbook-set">
                        <span class="logbook-set-number">S${set.setNumber}</span>
                        <div class="logbook-set-data">
                            <span class="logbook-value"><strong>${this.formatSetWeight(set.weight, set.exerciseId || this.currentSlot)}</strong></span>
                            <span class="logbook-value"><strong>${set.reps}</strong>reps</span>
                        </div>
                    </div>
                `;
            }
            html += '</div>';
            
            html += `
                <div class="logbook-summary">
                    <div class="logbook-summary-item">
                        <div class="logbook-summary-label">Total reps</div>
                        <div class="logbook-summary-value">${history.totalReps}</div>
                    </div>
                    <div class="logbook-summary-item">
                        <div class="logbook-summary-label">Charge max</div>
                        <div class="logbook-summary-value">${this.isPureBodyweightSlot(this.currentSlot) && history.maxWeight === 0 ? 'PDC' : `${history.maxWeight} kg`}</div>
                    </div>
                </div>
            `;
            
            html += '</div>';
        });
        
        // Add trend comparison if multiple sessions
        if (histories.length >= 2) {
            const latest = histories[0];
            const oldest = histories[histories.length - 1];
            const weightDiff = latest.maxWeight - oldest.maxWeight;
            const repsDiff = latest.totalReps - oldest.totalReps;
            
            let trendIcon = this.getLogbookTrendIconSVG('neutral');
            let trendClass = 'neutral';
            let trendText = 'Stable';
            
            if (weightDiff > 0 || repsDiff > 0) {
                trendIcon = this.getLogbookTrendIconSVG('positive');
                trendClass = 'positive';
                trendText = `${weightDiff > 0 ? this.formatLogbookTrendDelta(weightDiff, ' kg') : ''}${weightDiff > 0 && repsDiff > 0 ? ' / ' : ''}${repsDiff > 0 ? this.formatLogbookTrendDelta(repsDiff, ' reps') : ''} sur ${histories.length} séances`;
            } else if (weightDiff < 0 || repsDiff < 0) {
                trendIcon = this.getLogbookTrendIconSVG('negative');
                trendClass = 'negative';
                trendText = `${weightDiff < 0 ? this.formatLogbookTrendDelta(weightDiff, ' kg') : ''}${weightDiff < 0 && repsDiff < 0 ? ' / ' : ''}${repsDiff < 0 ? this.formatLogbookTrendDelta(repsDiff, ' reps') : ''} sur ${histories.length} séances`;
            }
            
            html += `
                <div class="logbook-trend logbook-trend-${trendClass}">
                    <span class="logbook-trend-icon">${trendIcon}</span>
                    <span class="logbook-trend-text">${trendText}</span>
                </div>
            `;
        }
        
        logbookContent.innerHTML = html;
    }

    calculateWorkoutQualityScore(sets = []) {
        if (!sets.length) return 0;
        const bestE1RM = Math.max(...sets.map(set => this.calculateE1RM(set.weight || 0, set.reps || 0, set.rpe || 8)), 0);
        const totalReps = sets.reduce((sum, set) => sum + (set.reps || 0), 0);
        return bestE1RM + (totalReps * 0.35);
    }

    getProgressInsight(historyArray = []) {
        const histories = (historyArray || []).filter(history => history?.sets?.length);
        if (histories.length < 2) return null;

        const ordered = [...histories].slice(0, 8).reverse();
        const values = ordered.map(history => this.calculateWorkoutQualityScore(history.sets));
        const latest = values[values.length - 1];
        const baseline = values[0] || latest || 0;
        const pct = baseline > 0 ? ((latest - baseline) / baseline) * 100 : 0;
        const tone = pct >= 1 ? 'positive' : pct <= -1 ? 'negative' : 'neutral';

        return {
            ordered,
            values,
            pct,
            tone,
            badgeText: tone === 'positive' ? 'En hausse' : tone === 'negative' ? 'À surveiller' : 'Stable',
            metaText: `${pct >= 0 ? '+' : ''}${Math.round(pct * 10) / 10}% sur ${ordered.length} séances`
        };
    }

    drawProgressSparkline(canvas, values = [], tone = 'neutral') {
        if (!canvas || values.length < 2) return;

        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const fallbackHeight = parseInt(canvas.getAttribute('height') || '', 10) || 56;
        const width = Math.round(rect.width || canvas.clientWidth || 0);
        const height = Math.round(rect.height || canvas.clientHeight || fallbackHeight);
        if (!ctx || width <= 0 || height <= 0) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(1, max - min);
        const padX = 6;
        const padY = 8;
        const stepX = values.length > 1 ? (width - padX * 2) / (values.length - 1) : 0;
        const strokeColor = tone === 'positive' ? '#22c55e' : tone === 'negative' ? '#f59e0b' : '#6366f1';
        const fillTop = tone === 'positive'
            ? 'rgba(34, 197, 94, 0.22)'
            : tone === 'negative'
                ? 'rgba(245, 158, 11, 0.22)'
                : 'rgba(99, 102, 241, 0.22)';

        const points = values.map((value, index) => ({
            x: padX + (stepX * index),
            y: height - padY - (((value - min) / range) * (height - padY * 2))
        }));

        ctx.beginPath();
        points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = strokeColor;
        ctx.stroke();

        ctx.beginPath();
        points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.lineTo(points[points.length - 1].x, height - padY);
        ctx.lineTo(points[0].x, height - padY);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, fillTop);
        gradient.addColorStop(1, 'rgba(15, 23, 42, 0.02)');
        ctx.fillStyle = gradient;
        ctx.fill();

        const latestPoint = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(latestPoint.x, latestPoint.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
    }

    renderProgressCard(cardId, badgeId, metaId, canvasId, historyArray = [], attempt = 0) {
        const card = document.getElementById(cardId);
        const badge = document.getElementById(badgeId);
        const meta = document.getElementById(metaId);
        const canvas = document.getElementById(canvasId);
        if (!card || !badge || !meta || !canvas) return;

        const insight = this.getProgressInsight(historyArray);
        if (!insight) {
            card.style.display = 'none';
            return;
        }

        card.style.display = 'block';
        const width = canvas.clientWidth || card.clientWidth || 0;
        if (width < 40 && attempt < 3) {
            window.requestAnimationFrame(() => {
                this.renderProgressCard(cardId, badgeId, metaId, canvasId, historyArray, attempt + 1);
            });
            return;
        }

        this.drawProgressSparkline(canvas, insight.values, insight.tone);
        badge.textContent = insight.badgeText;
        badge.className = `exercise-progress-badge ${insight.tone}`;
        meta.textContent = insight.metaText;
        card.style.display = 'block';
    }

    renderExerciseProgressSparkline(historyArray = []) {
        if (this.isSupersetMode || this.isUnilateralMode) return;
        this.renderProgressCard(
            'exercise-progress-card',
            'exercise-progress-badge',
            'exercise-progress-meta',
            'exercise-progress-sparkline',
            historyArray
        );
    }

    getReadableProgressionAxis(axis) {
        const labels = {
            load: 'Charge',
            reps: 'Reps',
            sets: 'Séries',
            tempo: 'Tempo',
            pause: 'Pause',
            rom: 'Amplitude',
            density: 'Densité',
            variant: 'Variante',
            assistance: 'Assistance',
            switch: 'Changement d’exercice'
        };
        return labels[axis] || axis || '—';
    }

    buildCoachDecisionItems(advice, slot = this.currentSlot) {
        if (!advice || !slot) return [];
        const items = [];
        const setPlan = this.buildCoachSetPlan(slot, advice);
        if (slot.progressionMode === 'capped_load') {
            items.push({
                label: 'Mode',
                value: slot.capDetection?.userFlag
                    ? `Tu as confirmé une <strong>machine au max</strong>. Le coach évite donc toute charge irréalisable.`
                    : `Le coach détecte une <strong>charge plafonnée</strong> et bascule sur reps, séries et tempo.`
            });
        } else if (slot.progressionMode === 'bodyweight') {
            items.push({
                label: 'Mode',
                value: slot.bodyweightProfile?.allowAssistance
                    ? `L'exercice est traité comme un <strong>poids du corps assisté</strong>.`
                    : slot.bodyweightProfile?.allowExternalLoad
                        ? `L'exercice est traité comme un <strong>poids du corps lestable</strong>.`
                        : `L'exercice est traité comme un <strong>poids du corps pur</strong>.`
            });
        } else {
            items.push({ label: 'Mode', value: `Le coach suit une <strong>progression par charge</strong> classique.` });
        }

        if (advice.progressionAxis) {
            items.push({ label: 'Axe actuel', value: `Aujourd'hui, on cherche surtout à progresser sur <strong>${this.getReadableProgressionAxis(advice.progressionAxis).toLowerCase()}</strong>.` });
        }
        if (advice.nextProgressionAxis) {
            items.push({ label: 'Prochain axe', value: `Si cet axe est validé, la prochaine étape sera <strong>${this.getReadableProgressionAxis(advice.nextProgressionAxis).toLowerCase()}</strong>.` });
        }
        if (advice.trendSummary?.headline) {
            items.push({ label: 'Historique', value: advice.trendSummary.trend === 'improved'
                ? `Tu es plutôt <strong>en hausse</strong>. ${advice.trendSummary.headline}`
                : advice.trendSummary.trend === 'regressed'
                    ? `La tendance est <strong>moins bonne</strong>. ${advice.trendSummary.headline}`
                    : `La tendance reste <strong>stable</strong>. ${advice.trendSummary.headline}` });
        }
        if (advice.sessionContext) {
            const readiness = advice.sessionContext.readinessScore
                ? `<strong>${advice.sessionContext.readinessScore}/100</strong>`
                : '—';
            const fatigueLabel = advice.sessionContext.fatigueLevel === 'high'
                ? 'récupération limitée'
                : advice.sessionContext.fatigueLevel === 'moderate'
                    ? 'récupération correcte mais surveillée'
                    : 'récupération correcte';
            items.push({ label: 'Récupération', value: `Le niveau du jour est <strong>${fatigueLabel}</strong>, avec une lecture autour de ${readiness}.` });
        }
        if (advice.sessionContext?.reasons?.length) {
            items.push({ label: 'Déclencheur', value: `Le conseil bouge surtout à cause de <strong>${advice.sessionContext.reasons.slice(0, 2).join(' • ')}</strong>.` });
        } else if (advice.decisionReasons?.length) {
            items.push({ label: 'Contexte', value: `Le coach s'appuie ici sur <strong>${advice.decisionReasons.slice(0, 2).join(' • ')}</strong>.` });
        } else if (slot.capDetection?.reasons?.length) {
            const reasonMap = {
                user_marked_max: 'machine plafonnée confirmée',
                load_cap_reached: 'charge max atteinte',
                next_increment_exceeds_cap: 'prochain palier irréalisable'
            };
            items.push({
                label: 'Déclencheur',
                value: `Le déclencheur principal est <strong>${slot.capDetection.reasons.map(reason => reasonMap[reason] || reason).join(' • ')}</strong>.`
            });
        }
        if (setPlan.reductionAccepted) {
            items.push({
                label: 'Volume',
                value: `Tu as accepté <strong>${setPlan.activeTargetSets} série${setPlan.activeTargetSets > 1 ? 's' : ''}</strong> au lieu de ${slot.sets} aujourd'hui.`
            });
        } else if (setPlan.showReductionPrompt) {
            items.push({
                label: 'Volume',
                value: `Le coach suggère <strong>${setPlan.suggestedReductionSets} série${setPlan.suggestedReductionSets > 1 ? 's' : ''}</strong> aujourd'hui, mais le plan de base reste ${slot.sets}.`
            });
        } else if (setPlan.hasOptionalIncrease) {
            items.push({
                label: 'Volume',
                value: `Le coach t'ouvre la porte à <strong>${setPlan.increaseCandidate.sets} séries</strong> si la qualité reste bonne.`
            });
        }

        return items.slice(0, 6);
    }

    renderCoachDecisionHistory(advice, slot = this.currentSlot) {
        const card = document.getElementById('coach-decision-card');
        const grid = document.getElementById('coach-decision-grid');
        const confidenceEl = document.getElementById('coach-decision-confidence');

        if (!card || !grid || !confidenceEl || !advice || !slot || this.isSupersetMode || this.isUnilateralMode) {
            if (card) card.style.display = 'none';
            return;
        }

        const items = this.buildCoachDecisionItems(advice, slot);

        grid.innerHTML = items.map(item => `
            <div class="coach-decision-item">
                <span class="coach-decision-item-label">${item.label}</span>
                <span class="coach-decision-item-value">${item.value}</span>
            </div>
        `).join('');

        confidenceEl.textContent = `Confiance ${Math.round((advice.contextConfidence || 0.6) * 100)}%`;
        card.style.display = items.length ? 'block' : 'none';
    }

    renderSupersetInsights() {
        const progressContainer = document.getElementById('superset-progress-container');
        const decisionCard = document.getElementById('superset-decision-card');
        const decisionGrid = document.getElementById('superset-decision-grid');
        const confidenceEl = document.getElementById('superset-decision-confidence');
        if (!progressContainer || !decisionCard || !decisionGrid || !confidenceEl || !this.isSupersetMode) return;

        const nameA = this.currentSlot?.activeExercise || this.currentSlot?.name || 'Exercice A';
        const nameB = this.supersetSlot?.activeExercise || this.supersetSlot?.name || 'Exercice B';
        const titleA = document.getElementById('superset-progress-title-a');
        const titleB = document.getElementById('superset-progress-title-b');
        if (titleA) titleA.textContent = nameA;
        if (titleB) titleB.textContent = nameB;

        this.renderProgressCard(
            'superset-progress-card-a',
            'superset-progress-badge-a',
            'superset-progress-meta-a',
            'superset-progress-sparkline-a',
            this.exerciseProgressHistory
        );
        this.renderProgressCard(
            'superset-progress-card-b',
            'superset-progress-badge-b',
            'superset-progress-meta-b',
            'superset-progress-sparkline-b',
            this.supersetProgressHistory
        );

        const hasProgressA = !!this.getProgressInsight(this.exerciseProgressHistory);
        const hasProgressB = !!this.getProgressInsight(this.supersetProgressHistory);
        progressContainer.style.display = hasProgressA || hasProgressB ? 'grid' : 'none';

        const sections = [
            {
                badge: 'A',
                slot: this.currentSlot,
                advice: this.supersetCoachingAdviceA,
                name: nameA,
                toneClass: 'badge-a'
            },
            {
                badge: 'B',
                slot: this.supersetSlot,
                advice: this.supersetCoachingAdviceB,
                name: nameB,
                toneClass: 'badge-b'
            }
        ].filter(section => section.slot && section.advice);

        if (!sections.length) {
            decisionCard.style.display = 'none';
            return;
        }

        decisionGrid.innerHTML = sections.map(section => {
            const items = this.buildCoachDecisionItems(section.advice, section.slot);
            if (!items.length) return '';

            return `
                <div class="superset-decision-panel">
                    <div class="superset-decision-panel-header">
                        <div class="superset-decision-panel-title">
                            <span class="superset-input-badge ${section.toneClass}">${section.badge}</span>
                            <span>${section.name}</span>
                        </div>
                        <span class="coach-decision-confidence">Confiance ${Math.round((section.advice.contextConfidence || 0.6) * 100)}%</span>
                    </div>
                    <div class="coach-decision-grid">
                        ${items.map(item => `
                            <div class="coach-decision-item">
                                <span class="coach-decision-item-label">${item.label}</span>
                                <span class="coach-decision-item-value">${item.value}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        confidenceEl.textContent = `${sections.length} lectures coach`;
        decisionCard.style.display = decisionGrid.innerHTML.trim() ? 'block' : 'none';
    }

    renderExerciseNotes() {
        const notesCard = document.getElementById('exercise-notes');
        const exerciseInput = document.getElementById('exercise-note-input');

        if (!notesCard || !exerciseInput) return;
        if (!this.currentWorkout || !this.currentSlot || this.isSupersetMode) {
            notesCard.style.display = 'none';
            return;
        }

        const slotData = this.currentWorkout.slots?.[this.currentSlot.id] || {};
        exerciseInput.value = slotData.exerciseNote || '';
        notesCard.style.display = 'block';
    }

    queueWorkoutNoteSave() {
        if (!this.currentWorkout) return;
        clearTimeout(this.noteSaveTimeout);
        this.noteSaveTimeout = setTimeout(() => {
            db.saveCurrentWorkout(this.currentWorkout);
        }, 180);
    }

    saveExerciseNote(value) {
        if (!this.currentWorkout || !this.currentSlot?.id) return;
        const slotData = this.currentWorkout.slots?.[this.currentSlot.id];
        if (!slotData) return;
        slotData.exerciseNote = value.trim();
        this.queueWorkoutNoteSave();
    }


    renderSeries() {
        const container = document.getElementById('series-list');
        container.innerHTML = '';

        const slotData = this.currentWorkout.slots[this.currentSlot.id] || { sets: [] };
        
        // Get suggested weights from last session
        const lastSets = this.lastExerciseHistory?.sets || [];
        
        // Get coaching advice for smart suggestions
        const advice = this.currentCoachingAdvice;
        const coachingSuggestedWeight = advice && advice.suggestedWeight !== '?' ? advice.suggestedWeight : null;
        const isPureBodyweight = this.isPureBodyweightSlot(this.currentSlot);
        const setPlan = this.buildCoachSetPlan(this.currentSlot, advice);
        const programmedSets = setPlan.programmedSets;
        const coachingSuggestedSets = setPlan.directSuggestedSets;
        const isDeloadAdvice = advice?.type === 'deload' || advice?.type === 'reactive_deload' || advice?.type === 'deload_mini' || advice?.isDeload;
        const activeTargetSets = setPlan.activeTargetSets;
        const displayedSets = setPlan.reductionAccepted ? activeTargetSets : programmedSets;
        
        // Store for use in completion check
        this.currentActiveTargetSets = activeTargetSets;
        this.coachingSuggestedSets = coachingSuggestedSets;
        this.isDeloadAdvice = isDeloadAdvice;

        const setsLabelEl = document.getElementById('exercise-sets');
        if (setsLabelEl) {
            if (setPlan.reductionAccepted && activeTargetSets !== programmedSets) {
                const delta = activeTargetSets - programmedSets;
                const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
                setsLabelEl.innerHTML = `${activeTargetSets} <small style="opacity:0.7">(${deltaLabel})</small>`;
            } else {
                setsLabelEl.textContent = programmedSets;
            }
        }
        
        // Use dynamic target reps from genTargetReps
        const { repsMin, repsMax } = this.currentSlot;
        const targetRepsArray = this.genTargetReps(repsMin, repsMax, displayedSets);
        const advisedTargetRepsArray = this.getAdviceTargetRepsArray(advice, targetRepsArray);
        const getTargetReps = (setIndex) => targetRepsArray[setIndex] || repsMax;

        for (let i = 0; i < displayedSets; i++) {
            const setData = slotData.sets[i] || {};
            const isCompleted = setData.completed;
            
            // Get suggested weight: intra-session adjustment > coaching advice > last session > previous set
            let suggestedWeight = '';
            const isNextIncompleteSet = !isCompleted && slotData.sets.filter(s => s?.completed).length === i;
            
            if (!setData.weight && !isCompleted) {
                // PRIORITY 1: Intra-session RPE-based adjustment for the NEXT set only
                if (isNextIncompleteSet && this.nextSetSuggestedWeight) {
                    suggestedWeight = this.nextSetSuggestedWeight;
                }
                // PRIORITY 1bis: live coaching adjustment based on cumulative fatigue
                else if (isNextIncompleteSet && advice?.liveLoadAdjustment && coachingSuggestedWeight) {
                    suggestedWeight = coachingSuggestedWeight;
                }
                // PRIORITY 2: Coaching suggestion for first set
                else if (coachingSuggestedWeight && i === 0) {
                    suggestedWeight = coachingSuggestedWeight;
                }
                // PRIORITY 3: Use weight from previous set in CURRENT session (maintain momentum)
                else if (i > 0 && slotData.sets[i-1]?.weight) {
                    suggestedWeight = slotData.sets[i-1].weight;
                }
                // PRIORITY 4: Use last session's weight for this specific set
                else if (lastSets[i]) {
                    suggestedWeight = lastSets[i].weight;
                }
                // PRIORITY 5: Coaching suggestion as fallback
                else if (coachingSuggestedWeight) {
                    suggestedWeight = coachingSuggestedWeight;
                }
                // PRIORITY 6: First set from last session
                else if (lastSets.length > 0) {
                    suggestedWeight = lastSets[0].weight;
                }
            }
            
            // Get suggested reps based on target
            const targetReps = advisedTargetRepsArray[i] || getTargetReps(i);

            const previousCompletedSet = [...slotData.sets]
                .slice(0, i)
                .reverse()
                .find(set => set?.completed && Number.isFinite(set.weight) && set.weight > 0);
            const previousCompletedWeight = previousCompletedSet?.weight ?? null;

            let baselineWeight = '';
            if (!setData.weight) {
                if (i > 0 && slotData.sets[i - 1]?.weight) {
                    baselineWeight = slotData.sets[i - 1].weight;
                } else if (lastSets[i]?.weight) {
                    baselineWeight = lastSets[i].weight;
                } else if (lastSets[0]?.weight) {
                    baselineWeight = lastSets[0].weight;
                } else if (i === 0 && suggestedWeight) {
                    baselineWeight = suggestedWeight;
                }
            }

            const preferredSuggestedWeight = isNextIncompleteSet && suggestedWeight
                ? suggestedWeight
                : baselineWeight;
            const displayWeight = this.getInputValueOrFallback(setData.weight, preferredSuggestedWeight);
            const weightPlaceholder = setData.weight || suggestedWeight || baselineWeight || '0';
            const displayReps = setData.reps || '';
            const isSuggested = !setData.weight && (suggestedWeight || baselineWeight);
            const isCoachingSuggested = !setData.weight && isNextIncompleteSet && !!advice;
            const coachReferenceWeight = isNextIncompleteSet && suggestedWeight ? suggestedWeight : displayWeight;
            const inlineCoachHint = this.getInlineCoachSetHint(
                advice,
                targetReps,
                coachReferenceWeight,
                isNextIncompleteSet,
                previousCompletedWeight
            );
            
            const isEditing = isCompleted && this.editingSetIndex === i;
            const canEditValidatedSet = isCompleted;
            
            const card = document.createElement('div');
            card.className = `series-card ${isCompleted && !isEditing ? 'completed' : ''} ${isEditing ? 'editing' : ''} ${isNextIncompleteSet && !isEditing ? 'next-up' : ''}`;
            card.dataset.setIndex = i;
            
            card.innerHTML = `
                <div class="series-header">
                    <span class="series-number">Série ${i + 1}</span>
                    ${isCompleted && !isEditing ? `
                        <div class="series-check-container">
                            <span class="series-result">${this.formatSetWeight(setData.weight, this.currentSlot)} × ${setData.reps}</span>
                            ${canEditValidatedSet ? `
                            <button class="btn-edit-set" data-set-index="${i}" title="Modifier">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            ` : ''}
                            <span class="series-check">✓</span>
                        </div>
                    ` : ''}
                </div>
                ${!isCompleted || isEditing ? `
                    <div class="series-inputs">
                        <div class="input-group ${isSuggested ? 'suggested' : ''} ${isCoachingSuggested ? 'coaching-suggested' : ''}">
                            <label>${this.getLoadFieldLabel(this.currentSlot)} ${isCoachingSuggested ? '<span class="suggested-label">coach</span>' : (isSuggested ? '<span class="suggested-label">base</span>' : '')}</label>
                            ${isPureBodyweight ? `
                                <div class="superset-static-value">PDC</div>
                                <input type="hidden" class="input-weight input-weight-hidden" value="0" data-set-index="${i}">
                            ` : `
                                <input type="number" inputmode="decimal" class="input-weight" 
                                       value="${displayWeight}" 
                                       placeholder="${weightPlaceholder}"
                                       data-set-index="${i}">
                            `}
                        </div>
                        <div class="input-group">
                            <label>Reps ${isCoachingSuggested ? `<span class="suggested-label">coach: ${targetReps}</span>` : `<span class="suggested-label">cible: ${targetReps}</span>`}</label>
                            <input type="number" inputmode="numeric" class="input-reps" 
                                   value="${displayReps}" 
                                   placeholder="${targetReps}"
                                   data-set-index="${i}">
                        </div>
                    </div>
                    ${inlineCoachHint ? `
                        <div class="series-coach-inline">
                            <span class="series-coach-inline-badge">Coach</span>
                            <span class="series-coach-inline-text">${inlineCoachHint}</span>
                        </div>
                    ` : ''}
                    <button class="btn ${isEditing ? 'btn-save-edit' : 'btn-series-done'}" data-set-index="${i}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        ${isEditing ? 'Sauvegarder' : 'Série terminée'}
                    </button>
                ` : ''}
            `;

            container.appendChild(card);
        }

        const completedSets = slotData.sets.filter(s => s.completed).length;
        const shouldShowReductionPrompt = setPlan.showReductionPrompt
            && setPlan.suggestedReductionSets
            && completedSets >= setPlan.suggestedReductionSets
            && completedSets < programmedSets;
        if (shouldShowReductionPrompt) {
            const nextProgrammedSet = Math.min(programmedSets, completedSets + 1);
            const nextProgrammedLabel = `Série ${nextProgrammedSet}`;
            const ghostCard = document.createElement('div');
            ghostCard.className = 'series-card series-card-ghost';
            ghostCard.innerHTML = `
                <div class="series-header">
                    <span class="series-number">Suggestion coach</span>
                    <span class="series-ghost-badge">Optionnelle</span>
                </div>
                <div class="series-ghost-copy">
                    <span class="series-ghost-title">Le coach propose de s'arrêter à ${setPlan.suggestedReductionSets} série${setPlan.suggestedReductionSets > 1 ? 's' : ''}</span>
                    <span class="series-ghost-note">${completedSets}/${programmedSets} faites • ${setPlan.reductionReason} • le plan reste à ${programmedSets} tant que tu n'acceptes pas.</span>
                </div>
                <div class="series-ghost-actions">
                    <button class="btn btn-secondary btn-ghost-continue" id="btn-continue-sets">
                        Continuer ${nextProgrammedLabel.toLowerCase()}
                    </button>
                    <button class="btn btn-primary btn-ghost-accept" id="btn-accept-set-reduction">
                        Accepter ${setPlan.suggestedReductionSets}/${programmedSets} aujourd'hui
                    </button>
                </div>
            `;
            container.appendChild(ghostCard);
        }
    }
    
    async continueSetsOverride() {
        const slotData = this.currentWorkout?.slots?.[this.currentSlot?.id];
        const setPlan = this.buildCoachSetPlan(this.currentSlot, this.currentCoachingAdvice);
        if (!slotData || !setPlan.suggestedReductionSets) return;

        this.userOverrideSets = true;
        slotData.coachVolumeDecision = {
            ...(slotData.coachVolumeDecision || {}),
            status: 'continue_programmed',
            dismissedSuggestedSets: setPlan.suggestedReductionSets,
            programmedSets: setPlan.programmedSets,
            suggestedSets: setPlan.suggestedReductionSets,
            source: setPlan.reductionCandidate?.source || null,
            reason: setPlan.reductionReason,
            decidedAt: Date.now()
        };

        await db.saveCurrentWorkout(this.currentWorkout);

        if (this.isUnilateralMode) {
            this.renderUnilateralSeries();
        } else {
            this.renderSeries();
        }
    }

    async acceptSuggestedSetReduction() {
        const slotData = this.currentWorkout?.slots?.[this.currentSlot?.id];
        const setPlan = this.buildCoachSetPlan(this.currentSlot, this.currentCoachingAdvice);
        if (!slotData || !setPlan.suggestedReductionSets) return;

        slotData.coachVolumeDecision = {
            ...(slotData.coachVolumeDecision || {}),
            status: 'accepted_reduction',
            acceptedTargetSets: setPlan.suggestedReductionSets,
            programmedSets: setPlan.programmedSets,
            suggestedSets: setPlan.suggestedReductionSets,
            source: setPlan.reductionCandidate?.source || null,
            reason: setPlan.reductionReason,
            decidedAt: Date.now(),
            protectedFromTrend: true
        };

        await db.saveCurrentWorkout(this.currentWorkout);

        const completedSets = slotData.sets.filter(s => s?.completed).length;
        if (completedSets >= setPlan.suggestedReductionSets && !this.isReviewMode) {
            setTimeout(() => this.showExerciseSummary(), 150);
            return;
        }

        this.renderSeries();
    }
    
    // ===== Unilateral Series Rendering =====
    renderUnilateralSeries() {
        const container = document.getElementById('series-list');
        container.innerHTML = '';
        
        const slotData = this.currentWorkout.slots[this.currentSlot.id] || { sets: [], setsLeft: [], setsRight: [] };
        const setsLeft = slotData.setsLeft || [];
        const setsRight = slotData.setsRight || [];
        
        const lastSetsLeft = this.lastUnilateralHistoryLeft?.sets || [];
        const lastSetsRight = this.lastUnilateralHistoryRight?.sets || [];
        
        const coachWeightLeft = this.unilateralCoachingAdviceLeft?.suggestedWeight;
        const coachWeightRight = this.unilateralCoachingAdviceRight?.suggestedWeight;
        
        const programmedSets = this.currentSlot.sets;
        const exerciseName = this.currentSlot.activeExercise || this.currentSlot.name;

        for (let i = 0; i < programmedSets; i++) {
            const setLeftData = setsLeft[i] || {};
            const setRightData = setsRight[i] || {};
            const isCompleted = setLeftData.completed && setRightData.completed;
            
            // Smart weight suggestions
            let suggestedWeightLeft = '';
            let suggestedWeightRight = '';
            
            // Left side suggestions
            if (i === 0 && coachWeightLeft && coachWeightLeft !== '?') {
                suggestedWeightLeft = coachWeightLeft;
            } else if (i > 0 && setsLeft[i-1]?.weight) {
                suggestedWeightLeft = setsLeft[i-1].weight;
            } else if (lastSetsLeft[i]?.weight) {
                suggestedWeightLeft = lastSetsLeft[i].weight;
            } else if (coachWeightLeft && coachWeightLeft !== '?') {
                suggestedWeightLeft = coachWeightLeft;
            }
            
            // Right side suggestions
            if (i === 0 && coachWeightRight && coachWeightRight !== '?') {
                suggestedWeightRight = coachWeightRight;
            } else if (i > 0 && setsRight[i-1]?.weight) {
                suggestedWeightRight = setsRight[i-1].weight;
            } else if (lastSetsRight[i]?.weight) {
                suggestedWeightRight = lastSetsRight[i].weight;
            } else if (coachWeightRight && coachWeightRight !== '?') {
                suggestedWeightRight = coachWeightRight;
            }
            
            const displayWeightLeft = this.getInputValueOrFallback(setLeftData.weight, suggestedWeightLeft);
            const displayWeightRight = this.getInputValueOrFallback(setRightData.weight, suggestedWeightRight);
            
            const isEditingUni = isCompleted && this.editingSetIndex === i;
            const canEditValidatedSet = isCompleted;
            
            const card = document.createElement('div');
            card.className = `unilateral-series-card ${isCompleted && !isEditingUni ? 'completed' : ''} ${isEditingUni ? 'editing' : ''}`;
            card.dataset.setIndex = i;

            if (isCompleted && !isEditingUni) {
                card.innerHTML = `
                    <div class="unilateral-series-header">
                        <span class="unilateral-series-number">Série ${i + 1}</span>
                        <div class="unilateral-series-check">
                            ${canEditValidatedSet ? `
                            <button class="btn-edit-set" data-set-index="${i}" title="Modifier">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            ` : ''}
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                    </div>
                    
                    <div class="unilateral-completed-results">
                        <div class="unilateral-completed-side side-left">
                            <span class="unilateral-input-badge badge-left">G</span>
                            <span class="unilateral-completed-label">Gauche</span>
                            <span class="unilateral-completed-value">${setLeftData.weight}kg × ${setLeftData.reps}</span>
                        </div>
                        <div class="unilateral-completed-side side-right">
                            <span class="unilateral-input-badge badge-right">D</span>
                            <span class="unilateral-completed-label">Droite</span>
                            <span class="unilateral-completed-value">${setRightData.weight}kg × ${setRightData.reps}</span>
                        </div>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div class="unilateral-series-header">
                        <span class="unilateral-series-number">Série ${i + 1}</span>
                        <span class="unilateral-series-target">${this.currentSlot.repsMin}-${this.currentSlot.repsMax} reps / côté</span>
                    </div>
                    
                    <!-- Left Side Block -->
                    <div class="unilateral-input-block block-left">
                        <div class="unilateral-input-header">
                            <span class="unilateral-input-badge badge-left">G</span>
                            <span class="unilateral-input-name">Côté Gauche</span>
                            ${setLeftData.completed && !isEditingUni ? '<span class="unilateral-side-done">✓</span>' : ''}
                        </div>
                        ${!setLeftData.completed || isEditingUni ? `
                        <div class="unilateral-input-row">
                            <div class="unilateral-input-group">
                                <label>Poids</label>
                                <input type="number" inputmode="decimal" class="input-weight-left unilateral-input" 
                                       value="${displayWeightLeft}" placeholder="kg" data-set-index="${i}">
                            </div>
                            <div class="unilateral-input-group">
                                <label>Reps</label>
                                <input type="number" inputmode="numeric" class="input-reps-left unilateral-input" 
                                       value="${setLeftData.reps || ''}" placeholder="${this.currentSlot.repsMin}-${this.currentSlot.repsMax}" data-set-index="${i}">
                            </div>
                        </div>
                        ` : `
                        <div class="unilateral-side-result">
                            <span>${setLeftData.weight}kg × ${setLeftData.reps} reps</span>
                        </div>
                        `}
                    </div>
                    
                    <!-- Switch Sides Indicator -->
                    <div class="unilateral-switch-visual">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                            <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                        </svg>
                        <span>Change de côté</span>
                    </div>
                    
                    <!-- Right Side Block -->
                    <div class="unilateral-input-block block-right">
                        <div class="unilateral-input-header">
                            <span class="unilateral-input-badge badge-right">D</span>
                            <span class="unilateral-input-name">Côté Droit</span>
                            ${setRightData.completed && !isEditingUni ? '<span class="unilateral-side-done">✓</span>' : ''}
                        </div>
                        ${!setRightData.completed || isEditingUni ? `
                        <div class="unilateral-input-row">
                            <div class="unilateral-input-group">
                                <label>Poids</label>
                                <input type="number" inputmode="decimal" class="input-weight-right unilateral-input" 
                                       value="${displayWeightRight}" placeholder="kg" data-set-index="${i}">
                            </div>
                            <div class="unilateral-input-group">
                                <label>Reps</label>
                                <input type="number" inputmode="numeric" class="input-reps-right unilateral-input" 
                                       value="${setRightData.reps || ''}" placeholder="${this.currentSlot.repsMin}-${this.currentSlot.repsMax}" data-set-index="${i}">
                            </div>
                        </div>
                        ` : `
                        <div class="unilateral-side-result">
                            <span>${setRightData.weight}kg × ${setRightData.reps} reps</span>
                        </div>
                        `}
                    </div>
                    
                    <button class="btn ${isEditingUni ? 'btn-save-edit-unilateral' : 'btn-unilateral-validate'}" data-set-index="${i}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        ${isEditingUni ? 'Sauvegarder' : 'Valider les 2 côtés'}
                    </button>
                `;
            }

            container.appendChild(card);
        }

        // Check if all sets complete
        const completedSets = Math.min(
            setsLeft.filter(s => s?.completed).length,
            setsRight.filter(s => s?.completed).length
        );
        if (completedSets >= programmedSets && !this.isReviewMode) {
            this.showUnilateralSummary();
        }
    }
    
    async completeUnilateralSet(setIndex) {
        const weightLeft = parseFloat(document.querySelector(`.input-weight-left[data-set-index="${setIndex}"]`)?.value) || 0;
        const repsLeft = parseInt(document.querySelector(`.input-reps-left[data-set-index="${setIndex}"]`)?.value) || 0;
        const weightRight = parseFloat(document.querySelector(`.input-weight-right[data-set-index="${setIndex}"]`)?.value) || 0;
        const repsRight = parseInt(document.querySelector(`.input-reps-right[data-set-index="${setIndex}"]`)?.value) || 0;

        if (repsLeft === 0 || repsRight === 0) {
            alert('Entre les reps pour les deux côtés');
            return;
        }

        // Save both sides
        const slotData = this.currentWorkout.slots[this.currentSlot.id];
        if (!slotData.setsLeft) slotData.setsLeft = [];
        if (!slotData.setsRight) slotData.setsRight = [];
        
        slotData.setsLeft[setIndex] = { weight: weightLeft, reps: repsLeft, completed: true, timestamp: Date.now() };
        slotData.setsRight[setIndex] = { weight: weightRight, reps: repsRight, completed: true, timestamp: Date.now() };

        await db.saveCurrentWorkout(this.currentWorkout);

        // Add XP for both sides
        let xp = (await db.getSetting('xp')) ?? 0;
        xp += 20; // Double XP for unilateral (both sides)
        await db.setSetting('xp', xp);

        await this.refreshWorkoutCoachingState();
        await this.calculateUnilateralCoachingAdvice();
        this.showUnilateralCoachingAdvice();
        this.renderUnilateralSeries();

        // Check if all sets complete
        const programmedSets = this.currentSlot.sets;
        const completedLeft = slotData.setsLeft.filter(s => s?.completed).length;
        const completedRight = slotData.setsRight.filter(s => s?.completed).length;
        
        if (completedLeft >= programmedSets && completedRight >= programmedSets) {
            setTimeout(() => this.showUnilateralSummary(), 300);
        } else {
            this.startRestTimer(this.currentSlot.rest);
        }
    }
    
    async showUnilateralSummary() {
        const slotData = this.currentWorkout.slots[this.currentSlot.id];
        const setsLeft = slotData.setsLeft || [];
        const setsRight = slotData.setsRight || [];
        this.editingSetIndex = null;
        
        const totalRepsLeft = setsLeft.reduce((sum, s) => sum + (s?.reps || 0), 0);
        const totalRepsRight = setsRight.reduce((sum, s) => sum + (s?.reps || 0), 0);
        const maxWeightLeft = Math.max(...setsLeft.map(s => s?.weight || 0));
        const maxWeightRight = Math.max(...setsRight.map(s => s?.weight || 0));

        document.getElementById('summary-total-reps').textContent = totalRepsLeft + totalRepsRight;
        document.getElementById('summary-max-weight').textContent = `${Math.max(maxWeightLeft, maxWeightRight)} kg`;
        
        document.getElementById('summary-icon').textContent = '🔄';
        document.getElementById('summary-title').textContent = 'Exercice unilatéral terminé !';
        
        // Compare left vs right
        const leftStronger = maxWeightLeft > maxWeightRight;
        const rightStronger = maxWeightRight > maxWeightLeft;
        const balanced = maxWeightLeft === maxWeightRight;
        
        let comparisonHTML = '';
        if (balanced) {
            comparisonHTML = `
                <div class="comparison-card positive">
                    <span class="comparison-icon">⚖️</span>
                    <span class="comparison-text">Équilibre parfait entre les deux côtés !</span>
                </div>
            `;
        } else {
            const diff = Math.abs(maxWeightLeft - maxWeightRight);
            const strongerSide = leftStronger ? 'Gauche' : 'Droite';
            comparisonHTML = `
                <div class="comparison-card neutral">
                    <span class="comparison-icon">📊</span>
                    <span class="comparison-text">Côté ${strongerSide} plus fort (+${diff}kg)</span>
                </div>
            `;
        }
        
        document.getElementById('summary-comparison').innerHTML = comparisonHTML;
        document.getElementById('exercise-summary').classList.add('active');

        // Mark slot as completed
        if (!this.currentWorkout.completedSlots.includes(this.currentSlot.id)) {
            this.currentWorkout.completedSlots.push(this.currentSlot.id);
        }
        await db.saveCurrentWorkout(this.currentWorkout);
        
        this.triggerConfetti();
    }

    async completeSet(setIndex) {
        const weightInput = document.querySelector(`.input-weight[data-set-index="${setIndex}"]`);
        const repsInput = document.querySelector(`.input-reps[data-set-index="${setIndex}"]`);
        
        const weight = parseFloat(weightInput.value) || 0;
        const reps = parseInt(repsInput.value) || 0;

        if (reps === 0) {
            repsInput.focus();
            return;
        }

        // Save set data (RPE will be added during rest timer)
        const slotData = this.currentWorkout.slots[this.currentSlot.id];
        slotData.sets[setIndex] = {
            weight,
            reps,
            completed: true,
            timestamp: Date.now(),
            rpe: null, // Will be set during rest timer if user provides it
            rpeSource: null
        };
        
        // Track last completed set for RPE capture
        this.lastCompletedSetIndex = setIndex;
        this.lastCompletedSetWeight = weight;
        this.lastCompletedSetReps = reps;
        this.nextSetSuggestedWeight = null;

        await db.saveCurrentWorkout(this.currentWorkout);

        // Add XP
        let xp = (await db.getSetting('xp')) ?? 0;
        xp += 10;
        await db.setSetting('xp', xp);
        
        // Hot/Cold detection after first set
        if (setIndex === 0 && this.avgPerformance) {
            const currentSetData = { weight, reps };
            const dayStatus = this.getDayStatus(currentSetData, this.avgPerformance);
            this.currentDayStatus = dayStatus;
        }

        this.renderSeries();

        // Check if all sets are complete against the accepted target only
        const completedSets = slotData.sets.filter(s => s.completed).length;
        const targetSets = this.getActiveTargetSets(this.currentSlot, slotData);
        if (completedSets >= targetSets) {
            // Show summary after a brief delay
            setTimeout(() => this.showExerciseSummary(), 300);
        } else {
            // Start rest timer (with RPE capture + Hot/Cold feedback)
            this.resetRpeSlider();
            this.startRestTimer(this.currentSlot.rest);
        }
    }

    // ===== Edit Validated Sets =====
    editSet(setIndex) {
        this.editingSetIndex = setIndex;
        if (this.isSupersetMode) {
            this.renderSupersetSeries();
        } else if (this.isUnilateralMode) {
            this.renderUnilateralSeries();
        } else {
            this.renderSeries();
        }
    }
    
    async saveEditSet(setIndex) {
        const weightInput = document.querySelector(`.input-weight[data-set-index="${setIndex}"]`);
        const repsInput = document.querySelector(`.input-reps[data-set-index="${setIndex}"]`);
        
        const weight = parseFloat(weightInput.value) || 0;
        const reps = parseInt(repsInput.value) || 0;
        
        if (reps === 0) {
            repsInput.focus();
            return;
        }
        
        const slotData = this.currentWorkout.slots[this.currentSlot.id];
        slotData.sets[setIndex].weight = weight;
        slotData.sets[setIndex].reps = reps;
        
        await db.saveCurrentWorkout(this.currentWorkout);
        
        this.editingSetIndex = null;
        await this.refreshWorkoutCoachingState();
        this.currentCoachingAdvice = await this.getEnhancedCoachingAdvice(this.currentSlot);
        await this.showCoachingAdvice();
        this.renderSeries();
    }
    
    async saveEditSupersetSet(setIndex) {
        const weightA = parseFloat(document.querySelector(`.input-weight-a[data-set-index="${setIndex}"]`).value) || 0;
        const repsA = parseInt(document.querySelector(`.input-reps-a[data-set-index="${setIndex}"]`).value) || 0;
        const weightB = parseFloat(document.querySelector(`.input-weight-b[data-set-index="${setIndex}"]`).value) || 0;
        const repsB = parseInt(document.querySelector(`.input-reps-b[data-set-index="${setIndex}"]`).value) || 0;
        
        if (repsA === 0 || repsB === 0) {
            alert('Entre les reps pour les deux exercices');
            return;
        }
        
        const slotAData = this.currentWorkout.slots[this.currentSlot.id];
        const slotBData = this.currentWorkout.slots[this.supersetSlot.id];
        
        slotAData.sets[setIndex].weight = weightA;
        slotAData.sets[setIndex].reps = repsA;
        slotBData.sets[setIndex].weight = weightB;
        slotBData.sets[setIndex].reps = repsB;
        
        await db.saveCurrentWorkout(this.currentWorkout);
        
        this.editingSetIndex = null;
        await this.refreshWorkoutCoachingState();
        await this.calculateSupersetCoachingAdvice();
        this.showSupersetCoachingAdvice();
        this.renderSupersetSeries();
    }

    async saveEditUnilateralSet(setIndex) {
        const weightLeft = parseFloat(document.querySelector(`.input-weight-left[data-set-index="${setIndex}"]`)?.value) || 0;
        const repsLeft = parseInt(document.querySelector(`.input-reps-left[data-set-index="${setIndex}"]`)?.value) || 0;
        const weightRight = parseFloat(document.querySelector(`.input-weight-right[data-set-index="${setIndex}"]`)?.value) || 0;
        const repsRight = parseInt(document.querySelector(`.input-reps-right[data-set-index="${setIndex}"]`)?.value) || 0;
        
        if (repsLeft === 0 || repsRight === 0) {
            alert('Entre les reps pour les deux côtés');
            return;
        }
        
        const slotData = this.currentWorkout.slots[this.currentSlot.id];
        slotData.setsLeft[setIndex].weight = weightLeft;
        slotData.setsLeft[setIndex].reps = repsLeft;
        slotData.setsRight[setIndex].weight = weightRight;
        slotData.setsRight[setIndex].reps = repsRight;
        
        await db.saveCurrentWorkout(this.currentWorkout);
        
        this.editingSetIndex = null;
        await this.refreshWorkoutCoachingState();
        await this.calculateUnilateralCoachingAdvice();
        this.showUnilateralCoachingAdvice();
        this.renderUnilateralSeries();
    }

    // ===== Rest Timer =====
    startRestTimer(seconds) {
        // Store end timestamp instead of countdown
        this.restTimeTotal = seconds;
        this.restTimerEndTime = Date.now() + (seconds * 1000);
        localStorage.setItem('restTimerEndTime', this.restTimerEndTime);
        
        const overlay = document.getElementById('timer-overlay');
        const countdown = document.getElementById('timer-countdown');
        
        overlay.classList.add('active');
        countdown.classList.remove('ending');
        
        // Vibrate on start (if supported)
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        // Start update loop
        this.updateRestTimer();
        this.restTimer = setInterval(() => this.updateRestTimer(), 100);
    }
    
    updateRestTimer() {
        const countdown = document.getElementById('timer-countdown');
        const remaining = Math.max(0, Math.ceil((this.restTimerEndTime - Date.now()) / 1000));
        this.restTimeLeft = remaining;
        
        countdown.textContent = remaining;
        this.updateTimerProgress();
        
        // Add ending animation when < 5 seconds
        if (remaining <= 5 && remaining > 0) {
            countdown.classList.add('ending');
            if (navigator.vibrate && !this.lastVibrateAt) {
                navigator.vibrate(30);
                this.lastVibrateAt = Date.now();
            } else if (this.lastVibrateAt && Date.now() - this.lastVibrateAt > 1000) {
                this.lastVibrateAt = null;
            }
        }
        
        if (remaining <= 0) {
            this.onTimerComplete();
        }
    }
    
    updateTimerProgress() {
        const progressRing = document.getElementById('timer-ring-progress');
        if (!progressRing) return;
        
        const circumference = 2 * Math.PI * 90; // r=90
        const progress = this.restTimeLeft / this.restTimeTotal;
        const offset = circumference * (1 - progress);
        progressRing.style.strokeDashoffset = offset;
    }
    
    onTimerComplete() {
        this.stopRestTimer();
        
        // Vibrate pattern on complete
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100, 50, 100]);
        }
        
        // Visual feedback
        const countdown = document.getElementById('timer-countdown');
        countdown.textContent = '0';
        countdown.classList.add('timer-done');
        
        setTimeout(() => {
            countdown.classList.remove('timer-done');
        }, 500);
    }

    stopRestTimer() {
        if (this.restTimer) {
            clearInterval(this.restTimer);
            this.restTimer = null;
        }
        
        // Capture RPE from slider and save to last completed set
        this.saveRpeToLastSet();
        
        this.restTimerEndTime = null;
        this.lastVibrateAt = null;
        localStorage.removeItem('restTimerEndTime');
        document.getElementById('timer-overlay').classList.remove('active');
        document.getElementById('timer-countdown').classList.remove('ending');
        
        // Reset RPE slider for next set
        this.resetRpeSlider();
    }
    
    // ===== RPE Management =====
    updateRpeDisplay(rpe) {
        const rpeDescriptions = {
            6: { text: 'Facile • ~4 reps en réserve', emoji: '😎' },
            7: { text: 'Modéré • ~3 reps en réserve', emoji: '🙂' },
            8: { text: 'Série normale • tu es allé au bout proprement', emoji: '😤' },
            9: { text: 'Très dur • ~1 rep en réserve', emoji: '🥵' },
            10: { text: 'Échec musculaire • 0 rep en réserve', emoji: '💀' }
        };
        
        const desc = rpeDescriptions[rpe] || rpeDescriptions[8];
        document.getElementById('rpe-feedback').innerHTML = `
            <span class="rpe-value">RPE ${rpe} ${desc.emoji}</span>
            <span class="rpe-description">${desc.text}</span>
        `;
        
        // Update active emoji
        document.querySelectorAll('.rpe-labels span').forEach(span => {
            span.classList.toggle('active', parseInt(span.dataset.rpe) === rpe);
        });
        
        // Update section border color
        document.getElementById('rpe-section').dataset.rpe = rpe;
    }
    
    resetRpeSlider() {
        const slider = document.getElementById('rpe-slider');
        slider.value = 8;
        slider.dataset.touched = 'false';
        const rpeSection = document.getElementById('rpe-section');
        if (rpeSection) {
            rpeSection.dataset.touched = 'false';
        }
        this.updateRpeDisplay(8);
    }
    
    async saveRpeToLastSet() {
        if (this.lastCompletedSetIndex === undefined || !this.currentSlot) return;
        
        const slider = document.getElementById('rpe-slider');
        const rpe = parseInt(slider.value);
        const rpeTouched = slider.dataset.touched === 'true';
        const rpeSource = rpeTouched ? 'user' : 'default';
        const slotData = this.currentWorkout.slots[this.currentSlot.id];
        const reps = this.lastCompletedSetReps;
        const weight = this.lastCompletedSetWeight;
        const targetSets = this.getActiveTargetSets(this.currentSlot, slotData);
        const isLastSet = this.lastCompletedSetIndex >= targetSets - 1;
        
        if (slotData && slotData.sets[this.lastCompletedSetIndex]) {
            slotData.sets[this.lastCompletedSetIndex].rpe = rpe;
            slotData.sets[this.lastCompletedSetIndex].rpeSource = rpeSource;
            await db.saveCurrentWorkout(this.currentWorkout);
            
            // === INTRA-SESSION WEIGHT ADJUSTMENTS ===
            if (!isLastSet && rpeTouched) {
                // HIGH RPE (>= 9): Suggest weight reduction for next sets
                if (rpe >= 9) {
                    await this.checkAutoBackoff(rpe);
                }
                // LOW RPE (<= 7) + high reps: Suggest weight increase for next set
                else if (rpe <= 7 && reps >= this.currentSlot.repsMax - 1) {
                    await this.suggestIntraSessionIncrease(rpe, reps, weight);
                }
            }
            
            // === HOT/COLD DAY DETECTION after set 1 ===
            if (this.lastCompletedSetIndex === 0 && this.avgPerformance && rpeTouched) {
                this.detectDayStatus(rpe);
            }

            if (!isLastSet) {
                await this.refreshLiveCoachingAfterSet();
            }
        }
    }
    
    async suggestIntraSessionIncrease(rpe, reps, weight) {
        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...this.currentSlot });
        const exerciseName = normalizedSlot?.activeExercise || normalizedSlot?.name;
        const isBodyweightExercise = this.isBodyweightProgressionExercise(normalizedSlot) ||
            (typeof normalizedSlot?.bodyweightMode !== 'boolean' &&
                this.isLikelyBodyweightExercise(exerciseName) &&
                weight === 0);

        if (isBodyweightExercise) {
            const existing = document.querySelector('.coach-toast');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.className = 'coach-toast hot';
            const bodyweightHint = normalizedSlot?.bodyweightProfile?.allowAssistance
                ? 'Réduis légèrement l’assistance ou ajoute 1 rep propre sur la prochaine série'
                : normalizedSlot?.bodyweightProfile?.allowExternalLoad
                    ? 'Tu peux ajouter 1 rep propre maintenant, puis envisager un léger lest à la prochaine séance'
                    : 'Garde le poids du corps et ajoute 1 rep propre ou un tempo plus strict sur la prochaine série';
            toast.innerHTML = `
                <span class="coach-toast-icon">🔥</span>
                <span class="coach-toast-text">${bodyweightHint}</span>
            `;
            document.body.appendChild(toast);

            setTimeout(() => toast.classList.add('visible'), 50);
            setTimeout(() => {
                toast.classList.remove('visible');
                setTimeout(() => toast.remove(), 300);
            }, 5000);
            return;
        }

        const isIsolation = normalizedSlot?.type === 'isolation';
        const baseIncrement = (await db.getSetting('weightIncrement')) ?? 2;
        const increment = isIsolation ? Math.min(baseIncrement, 1) : baseIncrement;
        
        // === SMART INTRA-SESSION ANALYSIS ===
        // Check what the coaching advice suggested as the target weight
        const coachingWeight = this.currentCoachingAdvice?.suggestedWeight;
        const currentSetIndex = this.lastCompletedSetIndex || 0;
        
        // Don't suggest increase if this is set 1 and we're already above coaching suggestion
        if (currentSetIndex === 0 && coachingWeight && typeof coachingWeight === 'number' && weight >= coachingWeight) {
            // Already at or above target - be conservative, don't suggest increase after just 1 set
            return;
        }
        
        // Check if previous sets in this session had issues (dropped weight)
        const currentSets = this.currentWorkout?.slots?.[this.currentSlot.id]?.sets || [];
        const completedSets = currentSets.filter(s => s.completed);
        
        // If this is not the first set, check the pattern
        if (completedSets.length >= 2) {
            const weights = completedSets.map(s => s.weight);
            const hasDroppedBefore = weights.some((w, i) => i > 0 && w < weights[i-1]);
            
            // If user already dropped weight this session, don't suggest increasing
            if (hasDroppedBefore) {
                return;
            }
        }
        
        // Calculate suggested weight with conservative increment
        let suggestedWeight = Math.round((weight + increment) * 2) / 2;
        suggestedWeight = this.enforceProgressionConstraints(
            { suggestedWeight, weightTrend: 'up' },
            normalizedSlot,
            { atCap: normalizedSlot.maxSelectableLoadKg != null && weight >= normalizedSlot.maxSelectableLoadKg }
        )?.suggestedWeight ?? suggestedWeight;

        if (normalizedSlot?.progressionMode === 'capped_load' && normalizedSlot?.maxSelectableLoadKg != null) {
            suggestedWeight = Math.min(suggestedWeight, normalizedSlot.maxSelectableLoadKg);
            if (suggestedWeight <= weight) {
                const existing = document.querySelector('.coach-toast');
                if (existing) existing.remove();

                const toast = document.createElement('div');
                toast.className = 'coach-toast hot';
                toast.innerHTML = `
                    <span class="coach-toast-icon">🎯</span>
                    <span class="coach-toast-text">Charge max atteinte: ajoute 1 rep propre ou garde le même poids avec un tempo plus strict</span>
                `;
                document.body.appendChild(toast);
                setTimeout(() => toast.classList.add('visible'), 50);
                setTimeout(() => {
                    toast.classList.remove('visible');
                    setTimeout(() => toast.remove(), 300);
                }, 5000);
                return;
            }
        }
        
        // === CEILING CHECK ===
        // Don't suggest going above what caused problems before
        if (coachingWeight && typeof coachingWeight === 'number') {
            // If coaching suggested a specific weight, don't exceed it much
            const maxSuggested = coachingWeight + increment;
            suggestedWeight = Math.min(suggestedWeight, maxSuggested);
        }
        
        // Don't suggest if it's the same as current
        if (suggestedWeight <= weight) return;
        
        // STORE the suggested weight for next set so renderSeries can use it
        this.nextSetSuggestedWeight = suggestedWeight;
        
        // Re-render series to show updated suggestion
        this.renderSeries();
        
        // Show suggestion toast
        const existing = document.querySelector('.coach-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'coach-toast hot';
        toast.innerHTML = `
            <span class="coach-toast-icon">🔥</span>
            <span class="coach-toast-text">RPE ${rpe} avec ${reps} reps = trop facile ! Tente <strong>${suggestedWeight}kg</strong> sur la prochaine série</span>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('visible'), 50);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
    
    async checkAutoBackoff(rpe) {
        const slot = this.normalizeSlotProgressionConfig({ ...this.currentSlot });
        const isCompound = slot?.type === 'compound';
        const weight = this.lastCompletedSetWeight;
        const reps = this.lastCompletedSetReps || 0;
        
        // Only suggest back-off for compound exercises or very high RPE
        if (!isCompound && rpe < 10) return;

        if (slot.progressionMode === 'bodyweight') {
            const bodyweightHint = slot.bodyweightProfile?.allowAssistance
                ? 'RPE haut: garde l’assistance actuelle ou ajoute un peu d’aide pour rester propre.'
                : 'RPE haut: reste au poids du corps et accepte le bas de fourchette plutôt que de forcer.';
            this.showCoachToast(bodyweightHint, 'backoff', '💡');
            return;
        }
        
        // === SMART BACKOFF CALCULATION ===
        // Base backoff on how far below target reps we are
        let backoffPercent = 10; // Default
        
        if (slot) {
            const repsDeficit = slot.repsMin - reps;
            if (repsDeficit > 3) {
                backoffPercent = 15; // Big deficit = bigger backoff
            } else if (repsDeficit <= 0) {
                backoffPercent = 5; // Hit target but RPE too high = small backoff
            }
        }
        
        // Calculate suggested weight
        let suggestedWeight = Math.round(weight * (1 - backoffPercent / 100) * 2) / 2;
        suggestedWeight = this.enforceProgressionConstraints(
            { suggestedWeight, weightTrend: 'down' },
            slot,
            { atCap: slot.maxSelectableLoadKg != null && weight >= slot.maxSelectableLoadKg }
        )?.suggestedWeight ?? suggestedWeight;
        
        // === FLOOR CHECK ===
        // Don't suggest going below what worked well before
        const coachingWeight = this.currentCoachingAdvice?.suggestedWeight;
        if (coachingWeight && typeof coachingWeight === 'number') {
            // Don't go more than 10% below coaching suggestion
            const minSuggested = Math.round(coachingWeight * 0.9 * 2) / 2;
            suggestedWeight = Math.max(suggestedWeight, minSuggested);
        }
        
        // Don't suggest if it's the same as current
        if (suggestedWeight >= weight) return;
        
        // STORE the suggested weight for next set so renderSeries can use it
        this.nextSetSuggestedWeight = suggestedWeight;
        
        // Re-render series to show updated suggestion
        this.renderSeries();
        
        // Show subtle inline suggestion (not a modal)
        this.showBackoffSuggestion(suggestedWeight, rpe);
    }
    
    showBackoffSuggestion(suggestedWeight, rpe) {
        // Create a subtle toast notification
        const existing = document.querySelector('.coach-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'coach-toast backoff';
        toast.innerHTML = `
            <span class="coach-toast-icon">💡</span>
            <span class="coach-toast-text">RPE ${rpe} • Baisse à <strong>${suggestedWeight}kg</strong> pour maintenir tes reps</span>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('visible'), 50);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    
    detectDayStatus(rpe) {
        const weight = this.lastCompletedSetWeight;
        const reps = this.lastCompletedSetReps;
        
        if (!this.avgPerformance) return;
        
        // Use e1RM-based comparison (more robust)
        const currentSet = { weight, reps };
        const status = this.getDayStatus(currentSet, this.avgPerformance);
        
        if (status === 'cold') {
            this.showDayStatusToast('cold');
        } else if (status === 'hot') {
            this.showDayStatusToast('hot');
        }
        // 'normal' = no toast
    }
    
    showDayStatusToast(status) {
        const existing = document.querySelector('.coach-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = `coach-toast ${status}`;
        
        if (status === 'cold') {
            toast.innerHTML = `
                <span class="coach-toast-icon">❄️</span>
                <span class="coach-toast-text">Forme basse • Mode maintenance, on ne force pas</span>
            `;
        } else {
            toast.innerHTML = `
                <span class="coach-toast-icon">🔥</span>
                <span class="coach-toast-text">En feu ! Tente un record sur ta dernière série</span>
            `;
        }
        
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('visible'), 50);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    adjustRestTimer(seconds) {
        this.restTimerEndTime = this.restTimerEndTime + (seconds * 1000);
        localStorage.setItem('restTimerEndTime', this.restTimerEndTime);
        this.restTimeLeft = Math.max(0, this.restTimeLeft + seconds);
        this.restTimeTotal = Math.max(this.restTimeTotal, this.restTimeLeft);
        this.updateRestTimer();
    }

    // ===== Exercise Summary =====
    async showExerciseSummary() {
        const slotData = this.currentWorkout.slots[this.currentSlot.id];
        const totalReps = slotData.sets.reduce((sum, s) => sum + (s.reps || 0), 0);
        const maxWeight = Math.max(...slotData.sets.map(s => s.weight || 0));
        const currentBestSet = slotData.sets.reduce((best, set) => {
            if (!set?.completed) return best;
            const currentScore = this.calculateE1RM(set.weight || 0, set.reps || 0, set.rpe || 8);
            const bestScore = best ? this.calculateE1RM(best.weight || 0, best.reps || 0, best.rpe || 8) : -Infinity;
            return currentScore > bestScore ? set : best;
        }, null);
        this.editingSetIndex = null;

        document.getElementById('summary-total-reps').textContent = totalReps;
        document.getElementById('summary-max-weight').textContent = this.isPureBodyweightSlot(this.currentSlot)
            ? 'PDC'
            : `${maxWeight} kg`;
        
        // Get comparison with last session
        const comparison = document.getElementById('summary-comparison');
        const summaryIcon = document.getElementById('summary-icon');
        const summaryTitle = document.getElementById('summary-title');
        
        if (this.lastExerciseHistory && this.lastExerciseHistory.totalReps > 0) {
            const lastTotalReps = this.lastExerciseHistory.totalReps;
            const lastMaxWeight = this.lastExerciseHistory.maxWeight;
            const repsDiff = totalReps - lastTotalReps;
            const weightDiff = maxWeight - lastMaxWeight;
            const previousBestSet = this.lastExerciseHistory.sets.reduce((best, set) => {
                const currentScore = this.calculateE1RM(set.weight || 0, set.reps || 0, set.rpe || 8);
                const bestScore = best ? this.calculateE1RM(best.weight || 0, best.reps || 0, best.rpe || 8) : -Infinity;
                return currentScore > bestScore ? set : best;
            }, null);
            const currentE1RM = currentBestSet ? this.calculateE1RM(currentBestSet.weight || 0, currentBestSet.reps || 0, currentBestSet.rpe || 8) : 0;
            const previousE1RM = previousBestSet ? this.calculateE1RM(previousBestSet.weight || 0, previousBestSet.reps || 0, previousBestSet.rpe || 8) : 0;
            const e1rmDiffPct = previousE1RM > 0 ? ((currentE1RM - previousE1RM) / previousE1RM) * 100 : 0;
            
            let comparisonClass = 'neutral';
            let icon = '🟠';
            let text = '';
            
            if (e1rmDiffPct >= 2 || (weightDiff > 0 && repsDiff >= -2)) {
                comparisonClass = 'positive';
                icon = '🚀';
                summaryIcon.textContent = '🎉';
                summaryTitle.textContent = 'Progression !';
                
                if (weightDiff > 0 && repsDiff < 0) {
                    text = `Plus lourd aujourd’hui (<span>+${weightDiff}kg</span>) avec un peu moins de reps, ce qui reste cohérent. Force estimée: <span>${e1rmDiffPct >= 0 ? '+' : ''}${Math.round(e1rmDiffPct * 10) / 10}%<\/span>.`;
                } else if (repsDiff > 0 && weightDiff > 0) {
                    text = `<span>+${repsDiff}</span> reps et <span>+${weightDiff}kg</span> vs dernière fois. Très solide.`;
                } else if (repsDiff > 0) {
                    text = `<span>+${repsDiff}</span> reps vs dernière fois. Belle consolidation.`;
                } else {
                    text = `<span>+${weightDiff}kg</span> vs dernière fois. La charge monte dans le bon sens.`;
                }
                
                // Trigger confetti!
                this.triggerConfetti();
            } else if (repsDiff < 0 && weightDiff <= 0 && e1rmDiffPct <= -3) {
                comparisonClass = 'neutral';
                icon = '💪';
                summaryIcon.textContent = '✅';
                summaryTitle.textContent = 'Exercice terminé';
                text = `Séance un peu plus dure que la précédente. Rien d’alarmant: récupère bien et reviens propre la prochaine fois.`;
            } else {
                comparisonClass = 'neutral';
                icon = '🟠';
                summaryIcon.textContent = '✅';
                summaryTitle.textContent = 'Exercice terminé';
                text = 'Performance stable et propre. Tu empiles du travail utile.';
            }
            
            comparison.innerHTML = `
                <div class="comparison-card ${comparisonClass}">
                    <span class="comparison-icon">${icon}</span>
                    <span class="comparison-text">${text}</span>
                </div>
            `;
        } else {
            summaryIcon.textContent = '✅';
            summaryTitle.textContent = 'Exercice terminé !';
            comparison.innerHTML = `
                <div class="comparison-card neutral">
                    <span class="comparison-icon">🌟</span>
                    <span class="comparison-text">Première fois sur cet exercice !</span>
                </div>
            `;
        }

        document.getElementById('exercise-summary').classList.add('active');

        // Mark slot as completed
        if (!this.currentWorkout.completedSlots.includes(this.currentSlot.id)) {
            this.currentWorkout.completedSlots.push(this.currentSlot.id);
            await db.saveCurrentWorkout(this.currentWorkout);
        }
    }

    hideExerciseSummary() {
        document.getElementById('exercise-summary').classList.remove('active');
    }
    
    // ===== Confetti Effect =====
    triggerConfetti() {
        const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
        const confettiCount = 50;
        
        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.top = Math.random() * 50 + 50 + 'vh';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = (Math.random() * 1 + 0.5) + 's';
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 2000);
        }
    }

    // ===== Finish Session =====
    async showFinishModal() {
        const slots = await db.getSlotsBySession(this.currentSession.id);
        const remaining = slots.length - (this.currentWorkout?.completedSlots?.length || 0);
        
        const message = remaining > 0 
            ? `Il reste ${remaining} exercice${remaining > 1 ? 's' : ''} non fait${remaining > 1 ? 's' : ''}. Tu peux terminer quand même.`
            : 'Tu as complété tous les exercices ! 💪';
        
        document.getElementById('finish-message').textContent = message;
        document.getElementById('modal-finish').classList.add('active');
    }

    hideFinishModal() {
        document.getElementById('modal-finish').classList.remove('active');
    }

    setFinishButtonLoading(isLoading) {
        const confirmBtn = document.getElementById('btn-confirm-finish');
        if (!confirmBtn) return;

        confirmBtn.disabled = isLoading;
        confirmBtn.textContent = isLoading ? 'Sauvegarde...' : 'Terminer';
    }

    async confirmFinishSession() {
        if (this.isFinishingSession || !this.currentWorkout || !this.currentSession) return;

        this.isFinishingSession = true;
        this.setFinishButtonLoading(true);
        this.stopSessionTimer();
        this.hideFinishModal();

        try {
            const stimulusScore = await this.calculateStimulusScore();
            const saveKey = `${this.currentSession.id}-${this.sessionStartTime}`;
            const saveDate = new Date().toISOString();

            const workoutRecord = {
                sessionId: this.currentSession.id,
                date: saveDate,
                duration: Date.now() - this.sessionStartTime,
                slots: this.currentWorkout.slots,
                completedSlots: this.currentWorkout.completedSlots,
                stimulusScore: stimulusScore.total,
                sessionNote: this.currentWorkout.sessionNote || '',
                saveKey
            };

            const existingWorkout = (await db.getAll('workoutHistory')).find(workout => workout.saveKey === saveKey);
            let workoutId;

            if (existingWorkout) {
                workoutId = existingWorkout.id;
                await db.put('workoutHistory', { ...existingWorkout, ...workoutRecord, id: workoutId });

                const existingSets = await db.getByIndex('setHistory', 'workoutId', workoutId);
                for (const existingSet of existingSets) {
                    await db.delete('setHistory', existingSet.id);
                }
            } else {
                workoutId = await db.add('workoutHistory', workoutRecord);
            }

            for (const [slotId, slotData] of Object.entries(this.currentWorkout.slots)) {
                const slot = await db.get('slots', slotId);
                if (!slot) continue;

                const baseExerciseId = slot.activeExercise || slot.name;
                const targetState = this.getSlotTargetState(slot, slotData);
                const volumeDecision = slotData.coachVolumeDecision || null;
                const targetSetCount = targetState.activeTargetSets || slot.sets || 0;
                const programmedSetCount = targetState.programmedSets || slot.sets || 0;
                const volumeDecisionType = volumeDecision?.status || 'programmed';
                const volumeProtected = volumeDecision?.protectedFromTrend === true;
                const hasUnilateralData = slotData.setsLeft && slotData.setsRight &&
                    (slotData.setsLeft.some(set => set?.completed) || slotData.setsRight.some(set => set?.completed));

                if (hasUnilateralData) {
                    for (let i = 0; i < slotData.setsLeft.length; i++) {
                        const setData = slotData.setsLeft[i];
                        if (!setData || !setData.completed) continue;

                        await db.add('setHistory', {
                            slotId,
                            exerciseId: `${baseExerciseId} (Gauche)`,
                            workoutId,
                            setNumber: i + 1,
                            weight: setData.weight,
                            reps: setData.reps,
                            rpe: setData.rpe ?? 8,
                            rpeSource: setData.rpeSource || (setData.rpe != null ? 'legacy' : 'default'),
                            targetSetCount,
                            programmedSetCount,
                            volumeDecisionType,
                            volumeProtected,
                            exerciseNote: slotData.exerciseNote || '',
                            sessionNote: this.currentWorkout.sessionNote || '',
                            date: saveDate
                        });
                    }

                    for (let i = 0; i < slotData.setsRight.length; i++) {
                        const setData = slotData.setsRight[i];
                        if (!setData || !setData.completed) continue;

                        await db.add('setHistory', {
                            slotId,
                            exerciseId: `${baseExerciseId} (Droite)`,
                            workoutId,
                            setNumber: i + 1,
                            weight: setData.weight,
                            reps: setData.reps,
                            rpe: setData.rpe ?? 8,
                            rpeSource: setData.rpeSource || (setData.rpe != null ? 'legacy' : 'default'),
                            targetSetCount,
                            programmedSetCount,
                            volumeDecisionType,
                            volumeProtected,
                            exerciseNote: slotData.exerciseNote || '',
                            sessionNote: this.currentWorkout.sessionNote || '',
                            date: saveDate
                        });
                    }

                    continue;
                }

                const standardSets = slotData.sets || [];
                for (let i = 0; i < standardSets.length; i++) {
                    const setData = standardSets[i];
                    if (!setData || !setData.completed) continue;

                    await db.add('setHistory', {
                        slotId,
                        exerciseId: baseExerciseId,
                        workoutId,
                        setNumber: i + 1,
                        weight: setData.weight,
                        reps: setData.reps,
                        rpe: setData.rpe ?? 8,
                        rpeSource: setData.rpeSource || (setData.rpe != null ? 'legacy' : 'default'),
                        targetSetCount,
                        programmedSetCount,
                        volumeDecisionType,
                        volumeProtected,
                        exerciseNote: slotData.exerciseNote || '',
                        sessionNote: this.currentWorkout.sessionNote || '',
                        date: saveDate
                    });
                }
            }

            const sessions = await db.getSessions();
            const historyForSuggestion = await db.getAll('workoutHistory');
            const storedIndex = (await db.getSetting('nextSessionIndex')) ?? 0;
            const nextIndex = this.getSuggestedSessionIndex(sessions, historyForSuggestion, storedIndex);
            await db.setSetting('nextSessionIndex', nextIndex);

            const streakDataBefore = await streakEngine.getStreakData();
            const wasGoalMetBefore = streakDataBefore.currentWeekSessions >= streakDataBefore.weeklyGoal;

            await streakEngine.recordWorkoutForStreak();
            await db.setSetting('lastWorkoutDate', saveDate);

            const streakDataAfter = await streakEngine.getStreakData();
            const isGoalMetNow = streakDataAfter.currentWeekSessions >= streakDataAfter.weeklyGoal;
            const justMetWeeklyGoal = !wasGoalMetBefore && isGoalMetNow;

            if (this.isDeloadMode) {
                await db.setSetting('isDeloadMode', false);
                this.isDeloadMode = false;
            }

            const duration = Math.round((Date.now() - this.sessionStartTime) / 60000);
            let totalSets = 0;
            for (const slotData of Object.values(this.currentWorkout.slots)) {
                totalSets += (slotData.sets || []).filter(set => set && set.completed).length;
                if (slotData.setsLeft) totalSets += slotData.setsLeft.filter(set => set && set.completed).length;
                if (slotData.setsRight) totalSets += slotData.setsRight.filter(set => set && set.completed).length;
            }
            const sessionName = this.currentSession.name;

            await db.clearCurrentWorkout();
            this.currentWorkout = null;
            this.currentSlot = null;
            this.supersetSlot = null;
            this.editingSetIndex = null;

            await this.showStimulusScoreAnimation(stimulusScore);

            gamification.celebrateWorkoutComplete(sessionName, {
                totalSets,
                duration,
                xpGain: Math.round(stimulusScore.total * 2)
            });

            if (justMetWeeklyGoal) {
                setTimeout(() => {
                    gamification.celebrateWeeklyGoal();
                }, 3000);
            }
        } catch (error) {
            console.error('Erreur lors de la sauvegarde de la séance:', error);
            alert('La séance n’a pas pu être sauvegardée correctement. Rien n’a été effacé, tu peux réessayer.');
            this.startSessionTimer();
            this.showScreen('session');
        } finally {
            this.isFinishingSession = false;
            this.setFinishButtonLoading(false);
        }
    }
    
    async calculateStimulusScore() {
        let score = 0;
        let hardSets = 0;
        let junkSets = 0;
        let dangerSets = 0;
        let prBonus = 0;
        
        for (const [slotId, slotData] of Object.entries(this.currentWorkout.slots)) {
            const slot = await db.get('slots', slotId);
            const isCompound = slot?.type === 'compound';
            
            // Get last session data to check for PR
            const exerciseId = slot?.activeExercise || slot?.name;
            const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
            const lastWeight = allSetHistory.length > 0 ? Math.max(...allSetHistory.map(s => s.weight || 0)) : 0;
            const lastReps = allSetHistory.length > 0 ? Math.max(...allSetHistory.map(s => s.reps || 0)) : 0;
            
            for (let i = 0; i < slotData.sets.length; i++) {
                const set = slotData.sets[i];
                if (!set || !set.completed) continue;
                
                const rpe = set.rpe || 8;
                
                // Hard Set: RPE 7-9.5 = 1 point
                if (rpe >= 7 && rpe <= 9.5) {
                    hardSets++;
                    score += 1;
                }
                
                // Junk Volume: RPE < 6 = 0 points (already not counted)
                if (rpe < 6) {
                    junkSets++;
                }
                
                // Ego/Danger penalty: RPE 10 on compound = -2 points
                if (rpe === 10 && isCompound) {
                    dangerSets++;
                    score -= 2;
                }
                
                // PR Bonus: First set beats previous best weight or reps = +5 points
                if (i === 0) {
                    if (set.weight > lastWeight || set.reps > lastReps) {
                        prBonus += 5;
                        score += 5;
                    }
                }
            }
        }
        
        // Normalize score (aim for 0-100 scale based on expected workout)
        const expectedSets = Object.keys(this.currentWorkout.slots).length * 3; // ~3 sets per exercise
        const normalizedScore = Math.min(100, Math.round((score / expectedSets) * 100));
        
        return {
            total: Math.max(0, score),
            normalized: normalizedScore,
            hardSets,
            junkSets,
            dangerSets,
            prBonus
        };
    }
    
    async showStimulusScoreAnimation(score) {
        return new Promise((resolve) => {
            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'stimulus-score-overlay';
            
            // Determine score quality
            let quality, emoji, message;
            if (score.normalized >= 80) {
                quality = 'excellent';
                emoji = '🔥';
                message = 'Séance parfaite !';
            } else if (score.normalized >= 60) {
                quality = 'good';
                emoji = '💪';
                message = 'Bonne séance !';
            } else if (score.normalized >= 40) {
                quality = 'ok';
                emoji = '👍';
                message = 'Séance correcte';
            } else {
                quality = 'low';
                emoji = '🎯';
                message = 'Marge de progression';
            }
            
            overlay.innerHTML = `
                <div class="stimulus-score-content">
                    <div class="stimulus-score-emoji">${emoji}</div>
                    <div class="stimulus-score-label">Stimulus Score</div>
                    <div class="stimulus-score-value ${quality}">
                        <span class="score-number">0</span>
                    </div>
                    <div class="stimulus-score-message">${message}</div>
                    <div class="stimulus-score-details">
                        <div class="score-detail">
                            <span class="detail-value">${score.hardSets}</span>
                            <span class="detail-label">Hard Sets</span>
                        </div>
                        ${score.prBonus > 0 ? `
                        <div class="score-detail pr">
                            <span class="detail-value">+${score.prBonus}</span>
                            <span class="detail-label">PR Bonus</span>
                        </div>
                        ` : ''}
                        ${score.dangerSets > 0 ? `
                        <div class="score-detail danger">
                            <span class="detail-value">-${score.dangerSets * 2}</span>
                            <span class="detail-label">RPE 10 Compound</span>
                        </div>
                        ` : ''}
                    </div>
                    <button class="btn btn-primary btn-large stimulus-score-btn">Continuer</button>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            // Animate score counter
            setTimeout(() => {
                overlay.classList.add('visible');
                const scoreEl = overlay.querySelector('.score-number');
                this.animateCounter(scoreEl, 0, score.total, 1500);
            }, 50);
            
            // Button click
            overlay.querySelector('.stimulus-score-btn').onclick = () => {
                overlay.classList.remove('visible');
                setTimeout(() => {
                    overlay.remove();
                    this.renderHome();
                    resolve();
                }, 300);
            };
        });
    }
    
    animateCounter(element, start, end, duration) {
        const startTime = performance.now();
        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * easeOut);
            element.textContent = current;
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };
        requestAnimationFrame(update);
    }

    // ===== Load Current Workout =====
    async loadCurrentWorkout() {
        const saved = await db.getCurrentWorkout();
        if (saved) {
            this.currentWorkout = saved;
            this.sessionStartTime = saved.startTime;
            const session = await db.get('sessions', saved.sessionId);
            if (session) {
                this.currentSession = session;
            }
        }
    }

    // ===== Change Session Sheet =====
    async showChangeSessionSheet() {
        const sessions = await db.getSessions();
        const history = await db.getAll('workoutHistory');
        const storedIndex = (await db.getSetting('nextSessionIndex')) ?? 0;
        const nextIndex = this.getSuggestedSessionIndex(sessions, history, storedIndex);
        const container = document.getElementById('session-options');
        container.innerHTML = '';

        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            const isCurrent = i === nextIndex;
            
            const btn = document.createElement('button');
            btn.className = `session-option ${isCurrent ? 'current' : ''}`;
            btn.innerHTML = `
                <span class="session-option-name">${session.name}</span>
                ${isCurrent ? '<span class="session-option-meta">Suggérée</span>' : ''}
            `;
            btn.onclick = async () => {
                this.currentSession = session;
                document.getElementById('session-name').textContent = session.name;
                const slots = await db.getSlotsBySession(session.id);
                document.getElementById('session-slots').textContent = `${slots.length} exercices`;
                document.getElementById('session-duration').textContent = `~${session.estimatedDuration} min`;
                
                await db.setSetting('nextSessionIndex', i);
                
                this.hideChangeSessionSheet();
            };
            container.appendChild(btn);
        }

        document.getElementById('sheet-change-session').classList.add('active');
    }

    hideChangeSessionSheet() {
        document.getElementById('sheet-change-session').classList.remove('active');
    }

    // ===== Edit Sessions Sheet =====
    async showEditSessionsSheet() {
        const sessions = await db.getSessions();
        const container = document.getElementById('edit-session-list');
        
        container.innerHTML = `
            <div class="edit-sessions-header">
                <button class="btn btn-primary" id="btn-add-session">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Créer une séance
                </button>
            </div>
            <div class="sessions-reorder-list" id="sessions-reorder-list">
                ${sessions.map((session, index) => `
                    <div class="session-reorder-item" data-session-id="${session.id}" data-order="${session.order}" draggable="true">
                        <div class="drag-handle">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 5h2M9 12h2M9 19h2M15 5h2M15 12h2M15 19h2"/>
                            </svg>
                        </div>
                        <div class="session-reorder-content" data-session-id="${session.id}">
                            <div class="session-reorder-name">${session.name}</div>
                            <div class="session-reorder-meta">${index + 1}/${sessions.length} dans le cycle</div>
                        </div>
                        <button class="btn-icon-small btn-delete-session" data-session-id="${session.id}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;

        this.initDragAndDrop();
        document.getElementById('sheet-edit-sessions').classList.add('active');
    }

    hideEditSessionsSheet() {
        document.getElementById('sheet-edit-sessions').classList.remove('active');
    }

    // ===== Drag & Drop Sessions =====
    initDragAndDrop() {
        const list = document.getElementById('sessions-reorder-list');
        if (!list) return;

        let draggedElement = null;
        let touchStartY = 0;
        let touchCurrentY = 0;
        let isDragging = false;

        // Mouse/Drag events
        list.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('session-reorder-item')) {
                draggedElement = e.target;
                e.target.style.opacity = '0.5';
            }
        });

        list.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('session-reorder-item')) {
                e.target.style.opacity = '1';
            }
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(list, e.clientY);
            if (afterElement == null) {
                list.appendChild(draggedElement);
            } else {
                list.insertBefore(draggedElement, afterElement);
            }
        });

        list.addEventListener('drop', async (e) => {
            e.preventDefault();
            await this.saveSessionsOrder();
        });

        // Touch events for iOS
        list.addEventListener('touchstart', (e) => {
            const item = e.target.closest('.session-reorder-item');
            if (item) {
                draggedElement = item;
                touchStartY = e.touches[0].clientY;
                isDragging = false;
            }
        }, { passive: true });

        list.addEventListener('touchmove', (e) => {
            if (!draggedElement) return;
            
            touchCurrentY = e.touches[0].clientY;
            const moveDistance = Math.abs(touchCurrentY - touchStartY);
            
            if (moveDistance > 10 && !isDragging) {
                isDragging = true;
                draggedElement.style.opacity = '0.5';
                draggedElement.style.transform = 'scale(1.02)';
            }
            
            if (isDragging) {
                e.preventDefault();
                const afterElement = this.getDragAfterElement(list, touchCurrentY);
                if (afterElement == null) {
                    list.appendChild(draggedElement);
                } else {
                    list.insertBefore(draggedElement, afterElement);
                }
            }
        });

        list.addEventListener('touchend', async (e) => {
            if (draggedElement && isDragging) {
                draggedElement.style.opacity = '1';
                draggedElement.style.transform = '';
                await this.saveSessionsOrder();
            }
            draggedElement = null;
            isDragging = false;
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.session-reorder-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async saveSessionsOrder() {
        const items = document.querySelectorAll('.session-reorder-item');
        const updates = [];

        items.forEach((item, index) => {
            const sessionId = item.dataset.sessionId;
            updates.push({ id: sessionId, order: index });
        });

        for (const update of updates) {
            const session = await db.get('sessions', update.id);
            if (session) {
                session.order = update.order;
                await db.put('sessions', session);
            }
        }

        await this.showEditSessionsSheet();
    }

    // ===== Create Session =====
    async createSession() {
        const sessions = await db.getSessions();
        const newOrder = sessions.length;
        
        const newSession = {
            id: `session-${Date.now()}`,
            name: 'Nouvelle séance',
            order: newOrder,
            estimatedDuration: 45
        };

        await db.put('sessions', newSession);
        await this.showEditSessionsSheet();
        
        // Ouvrir directement l'édition de la nouvelle séance
        setTimeout(() => {
            this.hideEditSessionsSheet();
            this.showEditSessionDetailSheet(newSession.id);
        }, 100);
    }

    // ===== Delete Session =====
    async deleteSession(sessionId) {
        const session = await db.get('sessions', sessionId);
        if (!session) return;

        if (!confirm(`Supprimer la séance "${session.name}" et tous ses exercices ?\n\nCette action est irréversible.`)) {
            return;
        }

        // Supprimer tous les slots de cette séance
        const slots = await db.getSlotsBySession(sessionId);
        for (const slot of slots) {
            await db.delete('slots', slot.id);
        }

        // Supprimer la séance
        await db.delete('sessions', sessionId);

        // Réorganiser les ordres
        const remainingSessions = await db.getSessions();
        for (let i = 0; i < remainingSessions.length; i++) {
            remainingSessions[i].order = i;
            await db.put('sessions', remainingSessions[i]);
        }

        await this.showEditSessionsSheet();
    }

    // ===== Edit Slot Sheet =====
    async showEditSlotSheet(slotId) {
        const slot = await db.get('slots', slotId);
        if (!slot) return;
        this.normalizeSlotProgressionConfig(slot);

        const sheet = document.getElementById('sheet-edit-slot');
        const form = document.getElementById('edit-slot-form');
        const progressionMode = slot.progressionMode || (slot.bodyweightMode ? 'bodyweight' : 'load');
        const loadingProfile = slot.loadingProfile || (progressionMode === 'bodyweight' ? 'bodyweight' : 'free_weight');
        const bodyweightProfile = slot.bodyweightProfile || {};
        
        form.innerHTML = `
            <div class="form-group">
                <label>Nom du slot</label>
                <input type="text" id="edit-slot-name" value="${slot.name}" class="form-input">
            </div>
            <div class="form-group">
                <label>Exercice actif</label>
                <input type="text" id="edit-slot-active" value="${slot.activeExercise}" class="form-input">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Séries</label>
                    <input type="number" id="edit-slot-sets" value="${slot.sets}" class="form-input" min="1" max="10">
                </div>
                <div class="form-group">
                    <label>Reps min</label>
                    <input type="number" id="edit-slot-reps-min" value="${slot.repsMin}" class="form-input" min="1" max="50">
                </div>
                <div class="form-group">
                    <label>Reps max</label>
                    <input type="number" id="edit-slot-reps-max" value="${slot.repsMax}" class="form-input" min="1" max="50">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Repos (secondes)</label>
                    <input type="number" id="edit-slot-rest" value="${slot.rest}" class="form-input" min="30" max="300" step="15">
                </div>
                <div class="form-group">
                    <label>RIR</label>
                    <input type="number" id="edit-slot-rir" value="${slot.rir}" class="form-input" min="0" max="5">
                </div>
            </div>
            <div class="form-group">
                <label>Type d'exercice</label>
                <div class="type-selector">
                    <button type="button" class="type-btn ${slot.type === 'compound' ? 'active' : ''}" data-type="compound">
                        <span class="type-icon">🏋️</span>
                        <span class="type-label">Composé</span>
                    </button>
                    <button type="button" class="type-btn ${slot.type === 'isolation' ? 'active' : ''}" data-type="isolation">
                        <span class="type-icon">💪</span>
                        <span class="type-label">Isolation</span>
                    </button>
                </div>
                <input type="hidden" id="edit-slot-type" value="${slot.type || 'compound'}">
            </div>
            <div class="form-group">
                <label>Groupe musculaire principal</label>
                <select id="edit-slot-muscle-group" class="form-input form-select">
                    <option value="">-- Sélectionner --</option>
                    ${MUSCLE_GROUPS.map(mg => `
                        <option value="${mg.id}" ${slot.muscleGroup === mg.id ? 'selected' : ''}>
                            ${mg.icon} ${mg.name}
                        </option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Mode de progression</label>
                <select id="edit-slot-progression-mode" class="form-input form-select">
                    <option value="load" ${progressionMode === 'load' ? 'selected' : ''}>Charge</option>
                    <option value="capped_load" ${progressionMode === 'capped_load' ? 'selected' : ''}>Charge plafonnée</option>
                    <option value="bodyweight" ${progressionMode === 'bodyweight' ? 'selected' : ''}>Poids du corps</option>
                </select>
                <small style="opacity:0.7">Force le mode "charge plafonnée" quand tu es au max de la machine. Le poids du corps est détecté automatiquement mais reste éditable.</small>
            </div>
            <div class="form-group">
                <label>Profil de charge</label>
                <select id="edit-slot-loading-profile" class="form-input form-select">
                    <option value="free_weight" ${loadingProfile === 'free_weight' ? 'selected' : ''}>Charge libre</option>
                    <option value="machine_stack" ${loadingProfile === 'machine_stack' ? 'selected' : ''}>Machine à stack</option>
                    <option value="plate_stack" ${loadingProfile === 'plate_stack' ? 'selected' : ''}>Machine à plaques</option>
                    <option value="bodyweight" ${loadingProfile === 'bodyweight' ? 'selected' : ''}>Poids du corps</option>
                </select>
            </div>
            <div data-progress-section="machine">
                <div class="form-row">
                    <div class="form-group">
                        <label>Incrément local (kg)</label>
                        <input type="number" id="edit-slot-increment-kg" value="${slot.incrementKg ?? ''}" class="form-input" min="0" step="0.5" placeholder="Auto">
                    </div>
                    <div class="form-group">
                        <label>Incrément minimal (kg)</label>
                        <input type="number" id="edit-slot-min-increment-kg" value="${slot.minIncrementKg ?? ''}" class="form-input" min="0" step="0.5" placeholder="0.5 ou 1">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Charge max machine (kg)</label>
                        <input type="number" id="edit-slot-max-load-kg" value="${slot.maxSelectableLoadKg ?? ''}" class="form-input" min="0" step="0.5" placeholder="Ex: 80">
                    </div>
                    <div class="form-group">
                        <label>Pas machine (kg)</label>
                        <input type="number" id="edit-slot-machine-step-kg" value="${slot.machineStepKg ?? ''}" class="form-input" min="0" step="0.5" placeholder="Ex: 5">
                    </div>
                </div>
                <div class="form-group">
                    <div class="settings-toggle-container">
                        <label class="toggle-switch">
                            <input type="checkbox" id="edit-slot-cap-user-flag" ${slot.capDetection?.userFlag ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <span class="toggle-label">Machine au max / charge plafonnée</span>
                    </div>
                </div>
            </div>
            <div data-progress-section="bodyweight">
                <div class="form-group">
                    <label>Famille poids du corps</label>
                    <select id="edit-slot-bodyweight-family" class="form-input form-select">
                        <option value="pullup" ${bodyweightProfile.family === 'pullup' ? 'selected' : ''}>Pull-up / Chin-up</option>
                        <option value="dip" ${bodyweightProfile.family === 'dip' ? 'selected' : ''}>Dip</option>
                        <option value="pushup" ${bodyweightProfile.family === 'pushup' ? 'selected' : ''}>Push-up</option>
                        <option value="abs" ${bodyweightProfile.family === 'abs' ? 'selected' : ''}>Abdos</option>
                        <option value="generic" ${!bodyweightProfile.family || bodyweightProfile.family === 'generic' ? 'selected' : ''}>Générique</option>
                    </select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Assistance par palier (kg)</label>
                        <input type="number" id="edit-slot-assistance-step-kg" value="${bodyweightProfile.assistanceStepKg ?? ''}" class="form-input" min="0" step="0.5" placeholder="Ex: 5">
                    </div>
                    <div class="form-group">
                        <label>Variante actuelle</label>
                        <input type="number" id="edit-slot-variant-index" value="${bodyweightProfile.currentVariantIndex ?? 0}" class="form-input" min="0" step="1">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Tempo actuel</label>
                        <input type="number" id="edit-slot-tempo-level" value="${bodyweightProfile.currentTempoLevel ?? 0}" class="form-input" min="0" step="1">
                    </div>
                    <div class="form-group">
                        <label>Pause actuelle</label>
                        <input type="number" id="edit-slot-pause-level" value="${bodyweightProfile.currentPauseLevel ?? 0}" class="form-input" min="0" step="1">
                    </div>
                    <div class="form-group">
                        <label>ROM actuel</label>
                        <input type="number" id="edit-slot-rom-level" value="${bodyweightProfile.currentROMLevel ?? 0}" class="form-input" min="0" step="1">
                    </div>
                </div>
                <div class="form-group">
                    <div class="settings-toggle-container">
                        <label class="toggle-switch">
                            <input type="checkbox" id="edit-slot-allow-external-load" ${bodyweightProfile.allowExternalLoad ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <span class="toggle-label">Autoriser le lest</span>
                    </div>
                </div>
                <div class="form-group">
                    <div class="settings-toggle-container">
                        <label class="toggle-switch">
                            <input type="checkbox" id="edit-slot-allow-assistance" ${bodyweightProfile.allowAssistance ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <span class="toggle-label">Autoriser l'assistance</span>
                    </div>
                </div>
            </div>
            <div class="form-group">
                <label>Consignes d'exécution</label>
                <textarea id="edit-slot-instructions" class="form-textarea" rows="3" placeholder="Consignes techniques...">${slot.instructions || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Pool d'exercices variantes</label>
                <div class="pool-editor" id="pool-editor">
                    ${slot.pool.map((ex, i) => `
                        <div class="pool-item-edit" data-index="${i}">
                            <input type="text" class="pool-input" value="${ex}" placeholder="Nom de l'exercice">
                            <button type="button" class="btn-icon-small btn-remove-pool-item" data-index="${i}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" class="btn btn-ghost btn-add-pool-item" id="btn-add-pool-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Ajouter une variante
                </button>
            </div>
            <button class="btn btn-primary btn-large" id="btn-save-slot" data-slot-id="${slotId}">
                Enregistrer
            </button>
        `;

        sheet.classList.add('active');
        this.bindPoolEditorEvents();
        this.bindTypeSelector();
        this.bindProgressionModeEditor();
    }
    
    bindTypeSelector() {
        const typeSelector = document.querySelector('.type-selector');
        if (!typeSelector) return;
        
        typeSelector.onclick = (e) => {
            const btn = e.target.closest('.type-btn');
            if (!btn) return;
            
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('edit-slot-type').value = btn.dataset.type;
        };
    }

    bindProgressionModeEditor() {
        const modeInput = document.getElementById('edit-slot-progression-mode');
        const loadingProfileInput = document.getElementById('edit-slot-loading-profile');
        if (!modeInput || !loadingProfileInput) return;

        const syncVisibility = () => {
            const mode = modeInput.value;
            const showMachine = mode === 'capped_load' || loadingProfileInput.value === 'machine_stack' || loadingProfileInput.value === 'plate_stack';
            const showBodyweight = mode === 'bodyweight';

            document.querySelectorAll('[data-progress-section="machine"]').forEach(node => {
                node.style.display = showMachine ? '' : 'none';
            });
            document.querySelectorAll('[data-progress-section="bodyweight"]').forEach(node => {
                node.style.display = showBodyweight ? '' : 'none';
            });

            if (mode === 'bodyweight') {
                loadingProfileInput.value = 'bodyweight';
            }
        };

        modeInput.onchange = syncVisibility;
        loadingProfileInput.onchange = syncVisibility;
        syncVisibility();
    }

    syncExerciseProgressionControls(advice = null) {
        const modeChip = document.getElementById('coaching-mode-chip');
        const modeNote = document.getElementById('coaching-mode-note');
        const toggleBtn = document.getElementById('btn-coach-toggle-cap');
        const toggleWrap = document.getElementById('coach-cap-toggle-wrap');
        const toggleTitle = document.getElementById('coaching-cap-toggle-title');
        const toggleStatus = document.getElementById('coaching-cap-toggle-status');
        const metaRow = document.getElementById('coaching-progress-meta');
        if (!modeChip || !modeNote || !toggleBtn || !toggleWrap || !toggleTitle || !toggleStatus || !metaRow || !this.currentSlot) return;

        const slot = this.normalizeSlotProgressionConfig({ ...this.currentSlot });
        const modeLabels = {
            load: 'Progression charge',
            capped_load: 'Progression charge plafonnée',
            bodyweight: 'Progression poids du corps'
        };

        modeChip.textContent = modeLabels[slot.progressionMode] || 'Progression intelligente';
        modeNote.textContent = advice?.progressionAxis
            ? `Axe actif: ${this.getReadableProgressionAxis(advice.progressionAxis)}.`
            : slot.progressionMode === 'bodyweight'
                ? 'Le coach joue sur reps, assistance, tempo ou variante.'
                : slot.progressionMode === 'capped_load'
                    ? 'Le coach évite toute charge irréalisable.'
                    : 'Active le mode plafonné si la machine ne peut plus monter.';

        const isBodyweight = slot.progressionMode === 'bodyweight';
        toggleWrap.style.display = isBodyweight ? 'none' : '';
        toggleBtn.checked = slot.progressionMode === 'capped_load';
        toggleTitle.textContent = 'Machine au max';
        toggleStatus.textContent = slot.progressionMode === 'capped_load' ? 'Activé' : 'Désactivé';
        toggleWrap.classList.toggle('is-active', slot.progressionMode === 'capped_load');

        metaRow.style.display = '';
    }

    async toggleCurrentSlotCapMode(forceEnabled = null) {
        if (!this.currentSlot?.id) return;

        const storedSlot = await db.get('slots', this.currentSlot.id);
        if (!storedSlot) return;

        const slot = this.normalizeSlotProgressionConfig(storedSlot);
        const shouldEnable = typeof forceEnabled === 'boolean'
            ? forceEnabled
            : slot.progressionMode !== 'capped_load';

        let inferredCapLoad = null;
        const currentSets = this.currentWorkout?.slots?.[slot.id]?.sets || [];
        const completedSets = currentSets.filter(set => set?.completed && Number.isFinite(set.weight) && set.weight > 0);
        if (completedSets.length) {
            inferredCapLoad = completedSets[completedSets.length - 1].weight;
        } else if (typeof this.currentCoachingAdvice?.suggestedWeight === 'number' && this.currentCoachingAdvice.suggestedWeight > 0) {
            inferredCapLoad = this.currentCoachingAdvice.suggestedWeight;
        } else {
            const context = await this.buildProgressionContext(slot);
            if (context.lastWeight > 0) {
                inferredCapLoad = context.lastWeight;
            }
        }

        if (shouldEnable) {
            slot.progressionMode = 'capped_load';
            slot.loadingProfile = slot.loadingProfile === 'bodyweight' ? 'machine_stack' : (slot.loadingProfile || 'machine_stack');
            slot.capDetection = {
                ...(slot.capDetection || {}),
                userFlag: true,
                autoConfidence: Math.max(slot.capDetection?.autoConfidence || 0, 1),
                lastDetectedAt: new Date().toISOString(),
                reasons: Array.from(new Set([...(slot.capDetection?.reasons || []), 'user_marked_max']))
            };
            if (inferredCapLoad > 0 && slot.maxSelectableLoadKg == null) {
                slot.maxSelectableLoadKg = inferredCapLoad;
            }
            if (slot.machineStepKg == null) {
                slot.machineStepKg = slot.incrementKg || slot.minIncrementKg || (await db.getSetting('weightIncrement')) || 2;
            }
            slot.progressionState = {
                ...(slot.progressionState || {}),
                primaryAxis: 'reps'
            };
            this.showCoachToast(
                `Plafond confirmé${slot.maxSelectableLoadKg ? ` à ${slot.maxSelectableLoadKg}kg` : ''}. Le coach bascule sur reps, séries et tempo.`,
                'hot',
                '🎯'
            );
        } else {
            slot.capDetection = {
                ...(slot.capDetection || {}),
                userFlag: false,
                reasons: (slot.capDetection?.reasons || []).filter(reason => reason !== 'user_marked_max')
            };
            slot.progressionMode = this.isLikelyBodyweightExercise(slot) ? 'bodyweight' : 'load';
            slot.progressionState = {
                ...(slot.progressionState || {}),
                primaryAxis: slot.progressionMode === 'bodyweight' ? 'reps' : 'load'
            };
            this.showCoachToast('Le mode plafonné est retiré. Le coach repasse sur la progression standard.', 'cold', '↩️');
        }

        this.normalizeSlotProgressionConfig(slot);
        await db.put('slots', slot);

        this.currentSlot = slot;
        if (this.currentWorkout?.slots?.[slot.id]) {
            this.currentWorkout.slots[slot.id].meta = this.buildSlotCoachMeta(slot);
            await db.saveCurrentWorkout(this.currentWorkout);
        }

        this.currentCoachingAdvice = await this.getEnhancedCoachingAdvice(this.currentSlot);
        await this.showCoachingAdvice();
        this.renderSeries();
    }

    hideEditSlotSheet() {
        document.getElementById('sheet-edit-slot').classList.remove('active');
        
        // Si on vient de l'édition de session détaillée, la rouvrir
        if (this.editingSessionId) {
            setTimeout(() => {
                this.showEditSessionDetailSheet(this.editingSessionId);
            }, 100);
        }
    }

    async saveSlot(slotId) {
        const slot = await db.get('slots', slotId);
        if (!slot) return;
        this.normalizeSlotProgressionConfig(slot);

        // Validate inputs
        const name = document.getElementById('edit-slot-name').value.trim();
        const activeExercise = document.getElementById('edit-slot-active').value.trim();
        
        if (!name || !activeExercise) {
            alert('Le nom du slot et l\'exercice actif sont obligatoires');
            return;
        }

        slot.name = name;
        slot.activeExercise = activeExercise;
        slot.sets = parseInt(document.getElementById('edit-slot-sets').value) || 3;
        slot.repsMin = parseInt(document.getElementById('edit-slot-reps-min').value) || 8;
        slot.repsMax = parseInt(document.getElementById('edit-slot-reps-max').value) || 12;
        slot.rest = parseInt(document.getElementById('edit-slot-rest').value) || 90;
        slot.rir = parseInt(document.getElementById('edit-slot-rir').value) || 2;
        slot.type = document.getElementById('edit-slot-type').value || 'compound';
        slot.muscleGroup = document.getElementById('edit-slot-muscle-group').value || '';
        slot.progressionMode = document.getElementById('edit-slot-progression-mode').value || 'load';
        slot.loadingProfile = document.getElementById('edit-slot-loading-profile').value || 'free_weight';
        slot.incrementKg = parseFloat(document.getElementById('edit-slot-increment-kg')?.value);
        slot.minIncrementKg = parseFloat(document.getElementById('edit-slot-min-increment-kg')?.value);
        slot.maxSelectableLoadKg = parseFloat(document.getElementById('edit-slot-max-load-kg')?.value);
        slot.machineStepKg = parseFloat(document.getElementById('edit-slot-machine-step-kg')?.value);
        slot.bodyweightMode = slot.progressionMode === 'bodyweight';
        slot.capDetection = {
            ...(slot.capDetection || {}),
            userFlag: document.getElementById('edit-slot-cap-user-flag')?.checked || false
        };
        slot.bodyweightProfile = {
            ...(slot.bodyweightProfile || {}),
            family: document.getElementById('edit-slot-bodyweight-family')?.value || this.inferBodyweightFamily(slot),
            allowExternalLoad: document.getElementById('edit-slot-allow-external-load')?.checked || false,
            allowAssistance: document.getElementById('edit-slot-allow-assistance')?.checked || false,
            assistanceStepKg: parseFloat(document.getElementById('edit-slot-assistance-step-kg')?.value),
            currentVariantIndex: parseInt(document.getElementById('edit-slot-variant-index')?.value) || 0,
            currentTempoLevel: parseInt(document.getElementById('edit-slot-tempo-level')?.value) || 0,
            currentPauseLevel: parseInt(document.getElementById('edit-slot-pause-level')?.value) || 0,
            currentROMLevel: parseInt(document.getElementById('edit-slot-rom-level')?.value) || 0
        };
        slot.progressionState = {
            ...(slot.progressionState || {}),
            primaryAxis: slot.progressionMode === 'load'
                ? (slot.progressionState?.primaryAxis || 'load')
                : (slot.progressionState?.primaryAxis || 'reps')
        };
        slot.instructions = document.getElementById('edit-slot-instructions').value.trim();

        slot.incrementKg = Number.isFinite(slot.incrementKg) ? slot.incrementKg : null;
        slot.minIncrementKg = Number.isFinite(slot.minIncrementKg) ? slot.minIncrementKg : null;
        slot.maxSelectableLoadKg = Number.isFinite(slot.maxSelectableLoadKg) ? slot.maxSelectableLoadKg : null;
        slot.machineStepKg = Number.isFinite(slot.machineStepKg) ? slot.machineStepKg : null;
        slot.bodyweightProfile.assistanceStepKg = Number.isFinite(slot.bodyweightProfile.assistanceStepKg)
            ? slot.bodyweightProfile.assistanceStepKg
            : null;

        this.normalizeSlotProgressionConfig(slot);
        
        // Get pool from individual inputs
        const poolInputs = document.querySelectorAll('.pool-input');
        slot.pool = Array.from(poolInputs)
            .map(input => input.value.trim())
            .filter(val => val.length > 0);
        
        if (slot.pool.length === 0) {
            alert('Vous devez avoir au moins un exercice dans la pool');
            return;
        }
        
        // Ensure activeExercise is in the pool
        if (!slot.pool.includes(slot.activeExercise)) {
            slot.pool.unshift(slot.activeExercise);
        }

        await db.put('slots', slot);
        this.hideEditSlotSheet();
        
        // Rafraîchir l'interface selon l'écran actuel
        if (this.currentScreen === 'session') {
            await this.renderSlots();
        } else if (this.currentScreen === 'exercise' && this.currentSlot && this.currentSlot.id === slotId) {
            // Mettre à jour le slot actuel et rafraîchir l'écran exercice
            this.currentSlot = slot;
            this.isUnilateralMode = this.isUnilateralExercise(slot.activeExercise || slot.name);
            document.getElementById('current-exercise-name').textContent = slot.activeExercise || slot.name;
            document.getElementById('exercise-sets').textContent = slot.sets;
            document.getElementById('exercise-reps').textContent = `${slot.repsMin}-${slot.repsMax}`;
            document.getElementById('exercise-rest').textContent = `${slot.rest}s`;
            document.getElementById('exercise-rir').textContent = slot.rir;
            document.getElementById('exercise-instructions').textContent = slot.instructions || '--';
            await this.loadLogbook();
            this.renderSeries();
        }
        
        // Si on vient de l'écran d'édition de séance détaillé, rafraîchir cette vue
        const detailSheet = document.getElementById('sheet-edit-session-detail');
        if (detailSheet.classList.contains('active') && this.editingSessionId) {
            await this.showEditSessionDetailSheet(this.editingSessionId);
        }
    }

    // ===== Edit Session Detailed =====
    async showEditSessionDetailSheet(sessionId) {
        this.editingSessionId = sessionId;
        const session = await db.get('sessions', sessionId);
        const slots = await db.getSlotsBySession(sessionId);
        
        const sheet = document.getElementById('sheet-edit-session-detail');
        const content = document.getElementById('edit-session-detail-content');
        
        // Build superset map
        const supersetMap = {};
        for (const slot of slots) {
            if (slot.supersetWith) {
                supersetMap[slot.id] = slot.supersetWith;
            }
        }
        
        content.innerHTML = `
            <div class="edit-session-header">
                <div class="edit-session-title-group">
                    <input type="text" class="edit-session-name-input" id="edit-session-name" value="${session.name}" placeholder="Nom de la séance">
                    <button class="btn btn-ghost btn-save-session-name" id="btn-save-session-name" data-session-id="${sessionId}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </button>
                </div>
                <button class="btn btn-outline" id="btn-add-slot-to-session" data-session-id="${sessionId}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Ajouter un exercice
                </button>
            </div>
            <div class="edit-slots-detail-list" id="edit-slots-detail-list">
                ${slots.map((slot, index) => {
                    const isFirstInSuperset = slot.supersetWith && !Object.values(supersetMap).includes(slot.id);
                    const isSecondInSuperset = Object.values(supersetMap).includes(slot.id);
                    const supersetPartner = isFirstInSuperset ? slots.find(s => s.id === slot.supersetWith) : null;
                    const supersetBadge = (isFirstInSuperset || isSecondInSuperset) 
                        ? '<span class="superset-badge">⚡ SuperSet</span>' 
                        : '';
                    const cardClass = isFirstInSuperset ? 'superset-start' : (isSecondInSuperset ? 'superset-end' : '');
                    
                    return `
                    <div class="edit-slot-detail-card ${cardClass}" data-slot-id="${slot.id}" data-order="${slot.order}" draggable="true">
                        <div class="drag-handle-slot">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 5h2M9 12h2M9 19h2M15 5h2M15 12h2M15 19h2"/>
                            </svg>
                        </div>
                        <div class="slot-detail-content">
                            <div class="slot-detail-header">
                                <div>
                                    <span class="slot-id-badge">${slot.slotId}</span>
                                    <strong>${slot.activeExercise || slot.name}</strong>
                                    ${supersetBadge}
                                </div>
                                <div class="slot-detail-actions">
                                    ${!isSecondInSuperset && index < slots.length - 1 && !slots[index + 1].supersetWith ? `
                                        <button class="btn-icon-small btn-link-superset ${isFirstInSuperset ? 'linked' : ''}" 
                                                data-slot-id="${slot.id}" 
                                                data-next-slot-id="${slots[index + 1]?.id || ''}"
                                                title="${isFirstInSuperset ? 'Délier le superset' : 'Lier en superset avec le suivant'}">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                            </svg>
                                        </button>
                                    ` : ''}
                                    <button class="btn-icon-small btn-edit-slot-detail" data-slot-id="${slot.id}">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                    </button>
                                    <button class="btn-icon-small btn-delete-slot" data-slot-id="${slot.id}">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div class="slot-detail-info">
                                ${slot.sets} séries · ${slot.repsMin}-${slot.repsMax} reps · ${slot.rest}s repos · RIR ${slot.rir}
                            </div>
                        </div>
                    </div>
                `}).join('')}
            </div>
        `;

        this.initSlotsDragAndDrop();
        sheet.classList.add('active');
    }

    hideEditSessionDetailSheet() {
        document.getElementById('sheet-edit-session-detail').classList.remove('active');
        this.editingSessionId = null;
    }

    // ===== Drag & Drop Slots =====
    initSlotsDragAndDrop() {
        const list = document.getElementById('edit-slots-detail-list');
        if (!list) return;

        let draggedElement = null;
        let touchStartY = 0;
        let touchCurrentY = 0;
        let isDragging = false;

        // Mouse/Drag events
        list.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('edit-slot-detail-card')) {
                draggedElement = e.target;
                e.target.style.opacity = '0.5';
            }
        });

        list.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('edit-slot-detail-card')) {
                e.target.style.opacity = '1';
            }
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElementSlot(list, e.clientY);
            if (afterElement == null) {
                list.appendChild(draggedElement);
            } else {
                list.insertBefore(draggedElement, afterElement);
            }
        });

        list.addEventListener('drop', async (e) => {
            e.preventDefault();
            await this.saveSlotsOrder();
        });

        // Touch events for iOS
        list.addEventListener('touchstart', (e) => {
            const item = e.target.closest('.edit-slot-detail-card');
            if (item) {
                draggedElement = item;
                touchStartY = e.touches[0].clientY;
                isDragging = false;
            }
        }, { passive: true });

        list.addEventListener('touchmove', (e) => {
            if (!draggedElement) return;
            
            touchCurrentY = e.touches[0].clientY;
            const moveDistance = Math.abs(touchCurrentY - touchStartY);
            
            if (moveDistance > 10 && !isDragging) {
                isDragging = true;
                draggedElement.style.opacity = '0.5';
                draggedElement.style.transform = 'scale(1.02)';
            }
            
            if (isDragging) {
                e.preventDefault();
                const afterElement = this.getDragAfterElementSlot(list, touchCurrentY);
                if (afterElement == null) {
                    list.appendChild(draggedElement);
                } else {
                    list.insertBefore(draggedElement, afterElement);
                }
            }
        });

        list.addEventListener('touchend', async (e) => {
            if (draggedElement && isDragging) {
                draggedElement.style.opacity = '1';
                draggedElement.style.transform = '';
                await this.saveSlotsOrder();
            }
            draggedElement = null;
            isDragging = false;
        });
    }

    getDragAfterElementSlot(container, y) {
        const draggableElements = [...container.querySelectorAll('.edit-slot-detail-card:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async saveSlotsOrder() {
        const items = document.querySelectorAll('.edit-slot-detail-card');
        const updates = [];

        items.forEach((item, index) => {
            const slotId = item.dataset.slotId;
            updates.push({ id: slotId, order: index });
        });

        for (const update of updates) {
            const slot = await db.get('slots', update.id);
            if (slot) {
                slot.order = update.order;
                // Mettre à jour le slotId (A1, A2, etc.)
                slot.slotId = String.fromCharCode(65 + update.order) + (update.order + 1);
                await db.put('slots', slot);
            }
        }

        // Rafraîchir la vue avec la session en cours d'édition
        if (this.editingSessionId) {
            await this.showEditSessionDetailSheet(this.editingSessionId);
        }
    }

    async deleteSlot(slotId) {
        if (!confirm('Supprimer cet exercice ?')) return;
        
        // Also unlink any superset
        const slot = await db.get('slots', slotId);
        if (slot && slot.supersetWith) {
            const linkedSlot = await db.get('slots', slot.supersetWith);
            if (linkedSlot) {
                delete linkedSlot.supersetWith;
                await db.put('slots', linkedSlot);
            }
        }
        
        // Check if another slot links to this one
        const allSlots = await db.getAll('slots');
        for (const s of allSlots) {
            if (s.supersetWith === slotId) {
                delete s.supersetWith;
                await db.put('slots', s);
            }
        }
        
        await db.delete('slots', slotId);
        
        if (this.editingSessionId) {
            await this.showEditSessionDetailSheet(this.editingSessionId);
        }
    }
    
    // ===== SuperSet Toggle =====
    async toggleSuperset(slotId, nextSlotId) {
        const slot = await db.get('slots', slotId);
        if (!slot) return;
        
        if (slot.supersetWith) {
            // Unlink superset
            delete slot.supersetWith;
            await db.put('slots', slot);
        } else if (nextSlotId) {
            // Link superset
            slot.supersetWith = nextSlotId;
            await db.put('slots', slot);
        }
        
        // Refresh the edit view
        if (this.editingSessionId) {
            await this.showEditSessionDetailSheet(this.editingSessionId);
        }
    }

    async addSlotToSession(sessionId) {
        const slots = await db.getSlotsBySession(sessionId);
        const nextOrder = slots.length;
        const nextSlotId = String.fromCharCode(65 + nextOrder);
        
        const newSlot = {
            id: `${sessionId}-${Date.now()}`,
            sessionId: sessionId,
            slotId: nextSlotId + (nextOrder + 1),
            name: 'Nouvel exercice',
            order: nextOrder,
            sets: 3,
            repsMin: 8,
            repsMax: 12,
            rest: 90,
            rir: 2,
            instructions: '',
            activeExercise: 'Nouvel exercice',
            pool: ['Nouvel exercice']
        };

        this.normalizeSlotProgressionConfig(newSlot);

        await db.put('slots', newSlot);
        await this.showEditSessionDetailSheet(sessionId);
    }

    // ===== Save Session Name =====
    async saveSessionName(sessionId) {
        const session = await db.get('sessions', sessionId);
        if (!session) return;

        const newName = document.getElementById('edit-session-name').value.trim();
        if (!newName) {
            alert('Le nom de la séance ne peut pas être vide');
            return;
        }

        session.name = newName;
        await db.put('sessions', session);
        
        // Rafraîchir l'interface
        await this.showEditSessionDetailSheet(sessionId);
    }

    // ===== Export/Import =====
    async exportData() {
        const data = await db.exportData();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `muscu-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    async importData(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const counts = await db.importData(data);
            await this.renderHome();
            
            const msg = `✅ Import terminé avec succès!\n\n` +
                `• ${counts.sessions} séances\n` +
                `• ${counts.slots} exercices\n` +
                `• ${counts.workouts} entraînements\n` +
                `• ${counts.sets} séries\n` +
                `• ${counts.settings} paramètres\n` +
                `• ${counts.currentWorkout} séance en cours`;
            
            alert(msg);
        } catch (e) {
            alert('Erreur lors de l\'import: ' + e.message);
        }
    }

    // ===== Event Bindings =====
    bindEvents() {
        // Home screen
        document.getElementById('btn-start-session').onclick = () => {
            if (this.currentSession) {
                this.startSession(this.currentSession);
            }
        };

        document.getElementById('btn-change-session').onclick = () => this.showChangeSessionSheet();
        document.getElementById('btn-edit-sessions').onclick = () => this.showEditSessionsSheet();
        document.getElementById('btn-settings').onclick = () => this.showSettingsSheet();
        document.getElementById('btn-export').onclick = () => this.exportData();
        document.getElementById('history-calendar-prev').onclick = () => {
            this.shiftCalendarMonth(-1);
            this.renderHome();
        };
        document.getElementById('history-calendar-next').onclick = () => {
            const now = new Date();
            const selected = this.currentCalendarDate instanceof Date
                ? this.currentCalendarDate
                : new Date();
            const isCurrentMonth = selected.getFullYear() === now.getFullYear() && selected.getMonth() === now.getMonth();
            if (isCurrentMonth) return;

            this.shiftCalendarMonth(1);
            this.renderHome();
        };
        
        document.getElementById('btn-import').onclick = () => {
            document.getElementById('import-file').click();
        };

        window.addEventListener('resize', () => {
            if (this.currentScreen === 'home') {
                this.scheduleHomeChartsRender();
            }
        });
        
        document.getElementById('import-file').onchange = (e) => {
            if (e.target.files[0]) {
                this.importData(e.target.files[0]);
            }
        };

        // Session screen
        document.getElementById('btn-back-home').onclick = () => this.showQuitSessionModal();
        document.getElementById('btn-finish-session').onclick = () => this.showFinishModal();
        
        // Modal resume session
        document.getElementById('btn-resume-session').onclick = () => this.resumeSession();
        document.getElementById('btn-discard-session').onclick = () => this.discardSession();
        document.querySelector('#modal-resume-session .modal-backdrop').onclick = () => this.discardSession();
        
        // Modal quit session
        document.getElementById('btn-cancel-quit').onclick = () => this.hideQuitSessionModal();
        document.getElementById('btn-confirm-quit').onclick = () => this.confirmQuitSession();
        document.querySelector('#modal-quit-session .modal-backdrop').onclick = () => this.hideQuitSessionModal();

        document.getElementById('slots-list').onclick = (e) => {
            const launchBtn = e.target.closest('.btn-launch');
            if (launchBtn) {
                this.openExercise(launchBtn.dataset.slotId);
            }
            
            const launchSupersetBtn = e.target.closest('.btn-launch-superset');
            if (launchSupersetBtn) {
                this.openSuperset(launchSupersetBtn.dataset.slotId);
            }
            
            const launchIndividualBtn = e.target.closest('.btn-launch-individual');
            if (launchIndividualBtn) {
                this.openExercise(launchIndividualBtn.dataset.slotId);
            }

            const reopenCompletedBtn = e.target.closest('.btn-reopen-completed');
            if (reopenCompletedBtn) {
                this.openExercise(reopenCompletedBtn.dataset.slotId);
            }

            const reopenSupersetBtn = e.target.closest('.btn-reopen-superset');
            if (reopenSupersetBtn) {
                this.openSuperset(reopenSupersetBtn.dataset.slotId);
            }
            
            const poolBtn = e.target.closest('.btn-pool-trigger');
            if (poolBtn) {
                this.showPoolSheet(poolBtn.dataset.slotId);
            }
            
            const editBtn = e.target.closest('.btn-edit-slot');
            if (editBtn) {
                this.showEditSlotSheet(editBtn.dataset.slotId);
            }
        };

        // Modal finish
        document.getElementById('btn-cancel-finish').onclick = () => this.hideFinishModal();
        document.getElementById('btn-confirm-finish').onclick = () => this.confirmFinishSession();
        document.querySelector('#modal-finish .modal-backdrop').onclick = () => this.hideFinishModal();

        // Exercise screen
        document.getElementById('btn-back-session').onclick = () => {
            this.stopRestTimer();
            this.hideExerciseSummary();
            this.isReviewMode = false;
            this.renderSlots();
            this.showScreen('session');
        };

        const coachDrawerBtn = document.getElementById('btn-coach-toggle-drawer');
        if (coachDrawerBtn) {
            coachDrawerBtn.onclick = () => this.toggleCoachAdviceDrawer();
        }

        const coachFatigueBtn = document.getElementById('btn-coach-fatigue-info');
        if (coachFatigueBtn) {
            coachFatigueBtn.onclick = () => this.openCoachFatigueSheet();
        }

        const closeCoachFatigueBtn = document.getElementById('btn-close-coach-fatigue');
        if (closeCoachFatigueBtn) {
            closeCoachFatigueBtn.onclick = () => this.closeCoachFatigueSheet();
        }

        const coachFatigueBackdrop = document.querySelector('#sheet-coach-fatigue .sheet-backdrop');
        if (coachFatigueBackdrop) {
            coachFatigueBackdrop.onclick = () => this.closeCoachFatigueSheet();
        }

        document.getElementById('series-list').onclick = (e) => {
            // Edit set button (standard, superset, unilateral)
            const editBtn = e.target.closest('.btn-edit-set');
            if (editBtn) {
                this.editSet(parseInt(editBtn.dataset.setIndex));
                return;
            }
            
            // Save edit button (standard)
            const saveEditBtn = e.target.closest('.btn-save-edit');
            if (saveEditBtn) {
                this.saveEditSet(parseInt(saveEditBtn.dataset.setIndex));
                return;
            }
            
            // Save edit button (superset)
            const saveEditSupersetBtn = e.target.closest('.btn-save-edit-superset');
            if (saveEditSupersetBtn) {
                this.saveEditSupersetSet(parseInt(saveEditSupersetBtn.dataset.setIndex));
                return;
            }
            
            // Save edit button (unilateral)
            const saveEditUniBtn = e.target.closest('.btn-save-edit-unilateral');
            if (saveEditUniBtn) {
                this.saveEditUnilateralSet(parseInt(saveEditUniBtn.dataset.setIndex));
                return;
            }
            
            // Unilateral validate button
            const unilateralValidateBtn = e.target.closest('.btn-unilateral-validate');
            if (unilateralValidateBtn) {
                this.completeUnilateralSet(parseInt(unilateralValidateBtn.dataset.setIndex));
                return;
            }
            
            // New superset validate button
            const supersetValidateBtn = e.target.closest('.btn-superset-validate');
            if (supersetValidateBtn) {
                this.completeSupersetSet(parseInt(supersetValidateBtn.dataset.setIndex));
                return;
            }
            
            // Legacy superset done button
            const supersetDoneBtn = e.target.closest('.btn-superset-done');
            if (supersetDoneBtn) {
                this.completeSupersetSet(parseInt(supersetDoneBtn.dataset.setIndex));
                return;
            }
            
            const doneBtn = e.target.closest('.btn-series-done');
            if (doneBtn) {
                this.completeSet(parseInt(doneBtn.dataset.setIndex));
                return;
            }
            
            const continueBtn = e.target.closest('#btn-continue-sets');
            if (continueBtn) {
                this.continueSetsOverride();
                return;
            }

            const acceptReductionBtn = e.target.closest('#btn-accept-set-reduction');
            if (acceptReductionBtn) {
                this.acceptSuggestedSetReduction();
                return;
            }
        };

        // Auto-save on input change (including superset inputs)
        document.getElementById('series-list').oninput = async (e) => {
            // Standard exercise inputs
            if (e.target.matches('.input-weight, .input-reps')) {
                const setIndex = parseInt(e.target.dataset.setIndex);
                const slotData = this.currentWorkout.slots[this.currentSlot.id];
                
                if (!slotData.sets[setIndex]) {
                    slotData.sets[setIndex] = {};
                }
                
                if (e.target.matches('.input-weight')) {
                    slotData.sets[setIndex].weight = parseFloat(e.target.value) || 0;
                } else {
                    slotData.sets[setIndex].reps = parseInt(e.target.value) || 0;
                }
                
                await db.saveCurrentWorkout(this.currentWorkout);
            }
            
            // Superset inputs (exercise A)
            if (e.target.matches('.input-weight-a, .input-reps-a') && this.isSupersetMode) {
                const setIndex = parseInt(e.target.dataset.setIndex);
                const slotData = this.currentWorkout.slots[this.currentSlot.id];
                
                if (!slotData.sets[setIndex]) {
                    slotData.sets[setIndex] = {};
                }
                
                if (e.target.matches('.input-weight-a')) {
                    slotData.sets[setIndex].weight = parseFloat(e.target.value) || 0;
                } else {
                    slotData.sets[setIndex].reps = parseInt(e.target.value) || 0;
                }
                
                await db.saveCurrentWorkout(this.currentWorkout);
            }
            
            // Superset inputs (exercise B)
            if (e.target.matches('.input-weight-b, .input-reps-b') && this.isSupersetMode && this.supersetSlot) {
                const setIndex = parseInt(e.target.dataset.setIndex);
                const slotData = this.currentWorkout.slots[this.supersetSlot.id];
                
                if (!slotData.sets[setIndex]) {
                    slotData.sets[setIndex] = {};
                }
                
                if (e.target.matches('.input-weight-b')) {
                    slotData.sets[setIndex].weight = parseFloat(e.target.value) || 0;
                } else {
                    slotData.sets[setIndex].reps = parseInt(e.target.value) || 0;
                }
                
                await db.saveCurrentWorkout(this.currentWorkout);
            }
            
            // Unilateral inputs (left side)
            if (e.target.matches('.input-weight-left, .input-reps-left') && this.isUnilateralMode) {
                const setIndex = parseInt(e.target.dataset.setIndex);
                const slotData = this.currentWorkout.slots[this.currentSlot.id];
                
                if (!slotData.setsLeft) slotData.setsLeft = [];
                if (!slotData.setsLeft[setIndex]) slotData.setsLeft[setIndex] = {};
                
                if (e.target.matches('.input-weight-left')) {
                    slotData.setsLeft[setIndex].weight = parseFloat(e.target.value) || 0;
                } else {
                    slotData.setsLeft[setIndex].reps = parseInt(e.target.value) || 0;
                }
                
                await db.saveCurrentWorkout(this.currentWorkout);
            }
            
            // Unilateral inputs (right side)
            if (e.target.matches('.input-weight-right, .input-reps-right') && this.isUnilateralMode) {
                const setIndex = parseInt(e.target.dataset.setIndex);
                const slotData = this.currentWorkout.slots[this.currentSlot.id];
                
                if (!slotData.setsRight) slotData.setsRight = [];
                if (!slotData.setsRight[setIndex]) slotData.setsRight[setIndex] = {};
                
                if (e.target.matches('.input-weight-right')) {
                    slotData.setsRight[setIndex].weight = parseFloat(e.target.value) || 0;
                } else {
                    slotData.setsRight[setIndex].reps = parseInt(e.target.value) || 0;
                }
                
                await db.saveCurrentWorkout(this.currentWorkout);
            }
        };

        // Timer controls
        document.getElementById('btn-timer-skip').onclick = () => this.stopRestTimer();
        document.getElementById('btn-timer-minus').onclick = () => this.adjustRestTimer(-15);
        document.getElementById('btn-timer-plus').onclick = () => this.adjustRestTimer(15);
        document.getElementById('btn-timer-stop').onclick = () => this.stopRestTimer();
        
        // RPE Slider
        const rpeSlider = document.getElementById('rpe-slider');
        rpeSlider.oninput = () => {
            rpeSlider.dataset.touched = 'true';
            const rpeSection = document.getElementById('rpe-section');
            if (rpeSection) {
                rpeSection.dataset.touched = 'true';
            }
            this.updateRpeDisplay(parseInt(rpeSlider.value));
        };
        
        // RPE emoji clicks
        document.querySelectorAll('.rpe-labels span').forEach(span => {
            span.onclick = () => {
                const rpe = parseInt(span.dataset.rpe);
                rpeSlider.value = rpe;
                rpeSlider.dataset.touched = 'true';
                const rpeSection = document.getElementById('rpe-section');
                if (rpeSection) {
                    rpeSection.dataset.touched = 'true';
                }
                this.updateRpeDisplay(rpe);
            };
        });

        // Summary
        document.getElementById('btn-back-to-session').onclick = () => {
            this.hideExerciseSummary();
            this.isReviewMode = false;
            this.renderSlots();
            this.showScreen('session');
        };

        const coachCapBtn = document.getElementById('btn-coach-toggle-cap');
        if (coachCapBtn) {
            coachCapBtn.onchange = () => this.toggleCurrentSlotCapMode(coachCapBtn.checked);
        }

        const exerciseNoteInput = document.getElementById('exercise-note-input');
        if (exerciseNoteInput) {
            exerciseNoteInput.oninput = () => this.saveExerciseNote(exerciseNoteInput.value);
        }

        // Sheets
        document.querySelector('#sheet-change-session .sheet-backdrop').onclick = () => this.hideChangeSessionSheet();
        document.querySelector('#sheet-edit-sessions .sheet-backdrop').onclick = () => this.hideEditSessionsSheet();
        
        // Edit slot sheet
        document.getElementById('sheet-edit-slot').onclick = (e) => {
            if (e.target.classList.contains('sheet-backdrop')) {
                this.hideEditSlotSheet();
            }
            const saveBtn = e.target.closest('#btn-save-slot');
            if (saveBtn) {
                this.saveSlot(saveBtn.dataset.slotId);
            }
        };

        // Edit session detail sheet
        document.getElementById('sheet-edit-session-detail').onclick = (e) => {
            if (e.target.classList.contains('sheet-backdrop')) {
                this.hideEditSessionDetailSheet();
            }
            
            const linkBtn = e.target.closest('.btn-link-superset');
            if (linkBtn) {
                this.toggleSuperset(linkBtn.dataset.slotId, linkBtn.dataset.nextSlotId);
            }
            
            const editBtn = e.target.closest('.btn-edit-slot-detail');
            if (editBtn) {
                this.hideEditSessionDetailSheet();
                this.showEditSlotSheet(editBtn.dataset.slotId);
            }
            
            const deleteBtn = e.target.closest('.btn-delete-slot');
            if (deleteBtn) {
                this.deleteSlot(deleteBtn.dataset.slotId);
            }
            
            const addBtn = e.target.closest('#btn-add-slot-to-session');
            if (addBtn) {
                this.addSlotToSession(addBtn.dataset.sessionId);
            }
        };

        // Edit sessions list - click to edit detail
        document.getElementById('edit-session-list').onclick = (e) => {
            const sessionContent = e.target.closest('.session-reorder-content');
            if (sessionContent && sessionContent.dataset.sessionId) {
                this.hideEditSessionsSheet();
                this.showEditSessionDetailSheet(sessionContent.dataset.sessionId);
                return;
            }
            
            const deleteBtn = e.target.closest('.btn-delete-session');
            if (deleteBtn) {
                this.deleteSession(deleteBtn.dataset.sessionId);
                return;
            }
            
            const addBtn = e.target.closest('#btn-add-session');
            if (addBtn) {
                this.createSession();
                return;
            }
        };
        
        // Save session name
        document.getElementById('sheet-edit-session-detail').addEventListener('click', (e) => {
            const saveNameBtn = e.target.closest('#btn-save-session-name');
            if (saveNameBtn) {
                this.saveSessionName(saveNameBtn.dataset.sessionId);
            }
        });
        
        // Pool sheet
        document.querySelector('#sheet-pool .sheet-backdrop').onclick = () => this.hidePoolSheet();
        document.getElementById('btn-pool-ignore').onclick = () => this.hidePoolSheet();
        
        // Settings sheet
        document.querySelector('#sheet-settings .sheet-backdrop').onclick = () => this.hideSettingsSheet();
        document.getElementById('btn-save-settings').onclick = () => this.saveSettings();
        document.getElementById('btn-manual-cleanup').onclick = () => this.manualCleanup();
        this.bindSettingsSliders();
        
        document.getElementById('pool-list').onclick = (e) => {
            const selectBtn = e.target.closest('.btn-pool-select');
            if (selectBtn) {
                this.selectPoolExercise(selectBtn.dataset.exercise);
            }
        };
    }
    
    // ===== Pool Editor Events =====
    bindPoolEditorEvents() {
        const addBtn = document.getElementById('btn-add-pool-item');
        if (addBtn) {
            addBtn.onclick = () => this.addPoolItem();
        }
        
        const poolEditor = document.getElementById('pool-editor');
        if (poolEditor) {
            poolEditor.onclick = (e) => {
                const removeBtn = e.target.closest('.btn-remove-pool-item');
                if (removeBtn) {
                    this.removePoolItem(parseInt(removeBtn.dataset.index));
                }
            };
        }
    }
    
    addPoolItem() {
        const poolEditor = document.getElementById('pool-editor');
        if (!poolEditor) return;
        
        const currentItems = poolEditor.querySelectorAll('.pool-item-edit');
        const newIndex = currentItems.length;
        
        const newItem = document.createElement('div');
        newItem.className = 'pool-item-edit';
        newItem.dataset.index = newIndex;
        newItem.innerHTML = `
            <input type="text" class="pool-input" value="" placeholder="Nom de l'exercice">
            <button type="button" class="btn-icon-small btn-remove-pool-item" data-index="${newIndex}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;
        
        poolEditor.appendChild(newItem);
        newItem.querySelector('.pool-input').focus();
    }
    
    removePoolItem(index) {
        const poolEditor = document.getElementById('pool-editor');
        if (!poolEditor) return;
        
        const items = poolEditor.querySelectorAll('.pool-item-edit');
        if (items.length <= 1) {
            alert('Vous devez garder au moins un exercice dans la pool');
            return;
        }
        
        items[index].remove();
        
        // Re-index remaining items
        const remainingItems = poolEditor.querySelectorAll('.pool-item-edit');
        remainingItems.forEach((item, i) => {
            item.dataset.index = i;
            const removeBtn = item.querySelector('.btn-remove-pool-item');
            if (removeBtn) {
                removeBtn.dataset.index = i;
            }
        });
    }
    
    // ===== Pool Sheet =====
    async showPoolSheet(slotId, showStagnationAlert = false) {
        const slot = await db.get('slots', slotId);
        if (!slot) return;
        
        this.poolSlotId = slotId;
        
        const poolHeader = document.getElementById('pool-header');
        const poolList = document.getElementById('pool-list');
        
        // Show stagnation alert if needed
        if (showStagnationAlert) {
            poolHeader.innerHTML = `
                <div class="pool-alert">
                    <span class="pool-alert-icon">⚠️</span>
                    <span class="pool-alert-text">Stagnation détectée (2 échecs). Switch recommandé.</span>
                </div>
            `;
        } else {
            poolHeader.innerHTML = '';
        }
        
        // Render pool exercises
        let html = '';
        for (const exercise of slot.pool) {
            const isCurrent = exercise === slot.activeExercise;
            html += `
                <div class="pool-item ${isCurrent ? 'current' : ''}">
                    <span class="pool-item-name">${exercise}</span>
                    ${isCurrent ? `
                        <span class="pool-item-badge">Actuel</span>
                    ` : `
                        <button class="btn btn-primary btn-pool-select" data-exercise="${exercise}">
                            Choisir
                        </button>
                    `}
                </div>
            `;
        }
        
        poolList.innerHTML = html;
        document.getElementById('sheet-pool').classList.add('active');
    }
    
    hidePoolSheet() {
        document.getElementById('sheet-pool').classList.remove('active');
        this.poolSlotId = null;
    }
    
    async selectPoolExercise(exerciseName) {
        if (!this.poolSlotId) return;
        
        const slot = await db.get('slots', this.poolSlotId);
        if (!slot) return;
        
        // Si l'exercice est différent, demander confirmation
        if (slot.activeExercise !== exerciseName) {
            this.showExerciseChangeConfirmation(slot, exerciseName);
        } else {
            this.hidePoolSheet();
        }
    }
    
    showExerciseChangeConfirmation(slot, newExerciseName) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'modal-exercise-change';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <h3>Changer d'exercice</h3>
                <p>Tu passes de <strong>${slot.activeExercise}</strong> à <strong>${newExerciseName}</strong>.</p>
                <p>Veux-tu garder les mêmes paramètres ?</p>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="btn-change-reset">Réinitialiser les paramètres</button>
                    <button class="btn btn-primary" id="btn-change-keep">Garder les paramètres</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const keepBtn = modal.querySelector('#btn-change-keep');
        const resetBtn = modal.querySelector('#btn-change-reset');
        const backdrop = modal.querySelector('.modal-backdrop');
        
        keepBtn.onclick = async () => {
            await this.applyExerciseChange(slot, newExerciseName, false);
            modal.remove();
        };
        
        resetBtn.onclick = async () => {
            await this.applyExerciseChange(slot, newExerciseName, true);
            modal.remove();
        };
        
        backdrop.onclick = () => {
            modal.remove();
        };
    }
    
    async applyExerciseChange(slot, newExerciseName, resetParams) {
        // Update active exercise
        slot.activeExercise = newExerciseName;
        
        // Reset parameters if requested
        if (resetParams) {
            // Get default values from the first exercise in pool or use standard defaults
            slot.sets = 3;
            slot.repsMin = 8;
            slot.repsMax = 12;
            slot.rest = 90;
            slot.rir = 2;
            slot.instructions = '';
        }
        
        await db.put('slots', slot);
        
        this.hidePoolSheet();
        
        // Si on a réinitialisé les paramètres, ouvrir l'édition pour les configurer
        if (resetParams) {
            setTimeout(() => {
                this.showEditSlotSheet(slot.id);
            }, 200);
        } else {
            // Refresh UI based on current screen
            if (this.currentScreen === 'session') {
                await this.renderSlots();
            } else if (this.currentScreen === 'exercise' && this.currentSlot?.id === this.poolSlotId) {
                this.currentSlot = slot;
                document.getElementById('current-exercise-name').textContent = newExerciseName;
                document.getElementById('exercise-sets').textContent = slot.sets;
                document.getElementById('exercise-reps').textContent = `${slot.repsMin}-${slot.repsMax}`;
                document.getElementById('exercise-rest').textContent = `${slot.rest}s`;
                document.getElementById('exercise-rir').textContent = slot.rir;
                document.getElementById('exercise-instructions').textContent = slot.instructions || '--';
                await this.loadLogbook();
                this.renderSeries();
            }
        }
    }
    
    // ===== Settings Management =====
    async showSettingsSheet() {
        // Load current settings
        const weeklyGoal = (await db.getSetting('weeklyGoal')) ?? 3;
        const failureCount = (await db.getSetting('failureCount')) ?? 5;
        const deloadPercent = (await db.getSetting('deloadPercent')) ?? 10;
        const weightIncrement = (await db.getSetting('weightIncrement')) ?? 2;
        const lockWeeks = (await db.getSetting('lockWeeks')) ?? 4;
        const streakCount = (await db.getSetting('streakCount')) ?? 0;
        
        // Periodization settings
        const cycleLength = (await db.getSetting('cycleLength')) ?? 5;
        const autoDeloadEnabled = (await db.getSetting('autoDeloadEnabled')) ?? true;
        const deloadVolumeReduction = (await db.getSetting('deloadVolumeReduction')) ?? 50;
        
        // Set slider values
        document.getElementById('setting-weekly-goal').value = weeklyGoal;
        document.getElementById('setting-weekly-goal-value').textContent = weeklyGoal;
        
        document.getElementById('setting-failure-count').value = failureCount;
        document.getElementById('setting-failure-count-value').textContent = failureCount;
        
        document.getElementById('setting-deload-percent').value = deloadPercent;
        document.getElementById('setting-deload-percent-value').textContent = deloadPercent;
        
        document.getElementById('setting-weight-increment').value = weightIncrement;
        document.getElementById('setting-weight-increment-value').textContent = weightIncrement;
        
        document.getElementById('setting-lock-weeks').value = lockWeeks;
        document.getElementById('setting-lock-weeks-value').textContent = lockWeeks;
        
        // Periodization settings
        document.getElementById('setting-cycle-length').value = cycleLength;
        document.getElementById('setting-cycle-length-value').textContent = cycleLength;
        
        document.getElementById('setting-auto-deload').checked = autoDeloadEnabled;
        
        document.getElementById('setting-deload-volume').value = deloadVolumeReduction;
        document.getElementById('setting-deload-volume-value').textContent = deloadVolumeReduction;

        const cheatStreakInput = document.getElementById('setting-cheat-streak');
        cheatStreakInput.value = streakCount;
        cheatStreakInput.dataset.currentValue = String(streakCount);
        document.getElementById('setting-cheat-streak-current').textContent = streakCount;
        
        // Display storage information
        await this.updateStorageStats();
        
        document.getElementById('sheet-settings').classList.add('active');
    }
    
    async updateStorageStats() {
        try {
            const storageInfo = await db.getStorageInfo();
            const oldWorkoutCount = await db.getOldWorkoutCount();
            
            if (storageInfo.quota && storageInfo.usage) {
                const usedMB = (storageInfo.usage / 1024 / 1024).toFixed(2);
                const quotaMB = (storageInfo.quota / 1024 / 1024).toFixed(2);
                const percentUsed = Math.round((storageInfo.usage / storageInfo.quota) * 100);
                
                const infoElement = document.getElementById('storage-stats-info');
                const barFill = document.getElementById('storage-bar-fill');
                
                infoElement.textContent = `${usedMB} MB utilisés sur ${quotaMB} MB disponibles (${percentUsed}%)`;
                barFill.style.width = `${percentUsed}%`;
                
                // Color coding based on usage
                barFill.classList.remove('warning', 'danger');
                if (percentUsed >= 90) {
                    barFill.classList.add('danger');
                } else if (percentUsed >= 70) {
                    barFill.classList.add('warning');
                }
            } else {
                document.getElementById('storage-stats-info').textContent = 'Informations de stockage non disponibles';
            }
            
            // Update cleanup status
            const statusElement = document.getElementById('cleanup-status');
            if (oldWorkoutCount > 0) {
                statusElement.textContent = `${oldWorkoutCount} séance(s) de plus de 90 jours peuvent être nettoyées`;
                statusElement.style.color = '#f59e0b';
            } else {
                statusElement.textContent = 'Aucune donnée ancienne à nettoyer';
                statusElement.style.color = '#22c55e';
            }
        } catch (error) {
            console.error('Erreur lors de la mise à jour des stats de stockage:', error);
        }
    }
    
    async manualCleanup() {
        const oldWorkoutCount = await db.getOldWorkoutCount();
        
        if (oldWorkoutCount === 0) {
            alert('Aucune donnée ancienne à nettoyer.');
            return;
        }
        
        const confirmMsg = `Vous allez nettoyer ${oldWorkoutCount} séance(s) de plus de 90 jours.\n\nLes meilleures performances seront conservées pour les tendances.\n\nContinuer ?`;
        
        if (!confirm(confirmMsg)) return;
        
        try {
            document.getElementById('btn-manual-cleanup').textContent = '🧹 Nettoyage en cours...';
            document.getElementById('btn-manual-cleanup').disabled = true;
            
            const result = await db.cleanupOldData();
            
            await this.updateStorageStats();
            
            const msg = `✅ Nettoyage terminé!\n\n` +
                `• ${result.deletedWorkouts} séances supprimées\n` +
                `• ${result.deletedSets} séries supprimées\n` +
                `• ${result.preservedWorkouts} séances conservées (données essentielles)`;
            
            alert(msg);
        } catch (error) {
            console.error('Erreur lors du nettoyage:', error);
            alert('Erreur lors du nettoyage: ' + error.message);
        } finally {
            document.getElementById('btn-manual-cleanup').textContent = '🧹 Nettoyer maintenant';
            document.getElementById('btn-manual-cleanup').disabled = false;
        }
    }
    
    hideSettingsSheet() {
        document.getElementById('sheet-settings').classList.remove('active');
    }
    
    bindSettingsSliders() {
        const sliders = [
            { id: 'setting-weekly-goal', valueId: 'setting-weekly-goal-value' },
            { id: 'setting-failure-count', valueId: 'setting-failure-count-value' },
            { id: 'setting-deload-percent', valueId: 'setting-deload-percent-value' },
            { id: 'setting-weight-increment', valueId: 'setting-weight-increment-value' },
            { id: 'setting-lock-weeks', valueId: 'setting-lock-weeks-value' },
            { id: 'setting-cycle-length', valueId: 'setting-cycle-length-value' },
            { id: 'setting-deload-volume', valueId: 'setting-deload-volume-value' }
        ];
        
        sliders.forEach(({ id, valueId }) => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.oninput = (e) => {
                    document.getElementById(valueId).textContent = e.target.value;
                };
            }
        });
    }
    
    async saveSettings() {
        const weeklyGoal = parseInt(document.getElementById('setting-weekly-goal').value);
        const failureCount = parseInt(document.getElementById('setting-failure-count').value);
        const deloadPercent = parseInt(document.getElementById('setting-deload-percent').value);
        const weightIncrement = parseFloat(document.getElementById('setting-weight-increment').value);
        const lockWeeks = parseInt(document.getElementById('setting-lock-weeks').value);
        const cheatStreakInput = document.getElementById('setting-cheat-streak');
        const currentStreakCount = parseInt(cheatStreakInput.dataset.currentValue ?? '0', 10) || 0;
        const cheatStreakRaw = cheatStreakInput.value.trim();
        const parsedCheatStreak = parseInt(cheatStreakRaw, 10);
        const forcedStreakCount = cheatStreakRaw === ''
            ? currentStreakCount
            : (Number.isFinite(parsedCheatStreak) ? Math.max(0, parsedCheatStreak) : currentStreakCount);
        
        // Periodization settings
        const cycleLength = parseInt(document.getElementById('setting-cycle-length').value);
        const autoDeloadEnabled = document.getElementById('setting-auto-deload').checked;
        const deloadVolumeReduction = parseInt(document.getElementById('setting-deload-volume').value);

        cheatStreakInput.value = forcedStreakCount;

        if (forcedStreakCount !== currentStreakCount) {
            const targetLabel = forcedStreakCount === 0
                ? '0 (reset du streak)'
                : `${forcedStreakCount} semaine${forcedStreakCount > 1 ? 's' : ''}`;
            const confirmCheat = confirm(
                `Tu es sur de vouloir tricher et fixer le streak a ${targetLabel} ?\n\n` +
                `Valeur actuelle : ${currentStreakCount}\n` +
                `Cette action modifie directement le score streak.`
            );
            if (!confirmCheat) return;
        }
        
        await db.setSetting('weeklyGoal', weeklyGoal);
        await db.setSetting('failureCount', failureCount);
        await db.setSetting('deloadPercent', deloadPercent);
        await db.setSetting('weightIncrement', weightIncrement);
        await db.setSetting('lockWeeks', lockWeeks);
        
        // Periodization settings
        await db.setSetting('cycleLength', cycleLength);
        await db.setSetting('autoDeloadEnabled', autoDeloadEnabled);
        await db.setSetting('deloadVolumeReduction', deloadVolumeReduction);
        await db.setSetting('streakCount', forcedStreakCount);
        
        // Initialize cycle start date if not set
        const cycleStartDate = await db.getSetting('cycleStartDate');
        if (!cycleStartDate) {
            await db.setSetting('cycleStartDate', new Date().toISOString());
        }
        
        this.hideSettingsSheet();
        
        // Refresh streak system display with new goal
        await this.renderStreakSystem();
    }
    
    // ===== ADVANCED HYPERTROPHY ENGINE =====
    // Bio-Algorithmic Coaching System based on:
    // - Beardsley Effective Reps Model
    // - Israetel Volume Landmarks (MEV/MRV/MAV)
    // - Tuchscherer RPE/e1RM Autoregulation
    // - Stimulus-to-Fatigue Ratio Optimization
    
    // === CORE: Calculate e1RM with RPE-awareness (Tuchscherer Protocol) ===
    // More accurate than basic Epley formula - accounts for submaximal effort
    calculateE1RM(weight, reps, rpe = 10) {
        if (!weight || weight <= 0 || !reps || reps <= 0) return 0;
        
        // RIR = Reps In Reserve
        const rir = Math.max(0, 10 - (rpe || 10));
        const totalPotentialReps = reps + rir;
        
        // Modified Brzycki formula for RPE context
        // e1RM = Weight / (1.0278 - 0.0278 × TotalReps)
        if (totalPotentialReps >= 37) {
            // Formula breaks down above ~37 reps, use linear approximation
            return weight * (1 + totalPotentialReps * 0.025);
        }
        
        const e1rm = weight / (1.0278 - 0.0278 * totalPotentialReps);
        return Math.round(e1rm * 10) / 10; // Round to 0.1kg
    }
    
    // === Get target load from e1RM for specific reps/RPE ===
    getTargetLoadFromE1RM(e1rm, targetReps, targetRpe = 8) {
        if (!e1rm || e1rm <= 0) return null;
        
        // Find closest rep count in table
        const repKeys = Object.keys(E1RM_PERCENTAGE_TABLE).map(Number).sort((a, b) => a - b);
        let closestReps = repKeys[0];
        for (const r of repKeys) {
            if (Math.abs(r - targetReps) < Math.abs(closestReps - targetReps)) {
                closestReps = r;
            }
        }
        
        // Get percentage from table
        const rpeKey = Math.min(10, Math.max(7, Math.round(targetRpe * 2) / 2));
        const percentage = E1RM_PERCENTAGE_TABLE[closestReps]?.[rpeKey] || 70;
        
        const targetLoad = e1rm * (percentage / 100);
        return Math.round(targetLoad * 2) / 2; // Round to 0.5kg
    }
    
    // === Calculate Effective Volume Score for a set (Beardsley Framework) ===
    calculateEffectiveVolumeScore(reps, rpe, weight = null, e1rmRef = null) {
        if (rpe == null || rpe < 5) return 0; // Below threshold = junk volume
        
        // Get base score from RPE table
        const rpeKey = Math.round(rpe * 2) / 2; // Round to nearest 0.5
        let baseScore = RPE_VOLUME_SCORE[rpeKey];
        if (baseScore === undefined) {
            // Interpolate if not exact match
            const lowerKey = Math.floor(rpe * 2) / 2;
            const upperKey = Math.ceil(rpe * 2) / 2;
            const lowerScore = RPE_VOLUME_SCORE[lowerKey] || 0;
            const upperScore = RPE_VOLUME_SCORE[upperKey] || 0;
            baseScore = (lowerScore + upperScore) / 2;
        }
        
        // Heavy load bonus: >80% 1RM = all reps recruit HTMUs from rep 1
        if (weight && e1rmRef && e1rmRef > 0) {
            const intensity = weight / e1rmRef;
            if (intensity >= 0.85) {
                // Very heavy: full credit regardless of RPE (mechanical tension dominant)
                baseScore = Math.max(baseScore, 1.0);
            } else if (intensity >= 0.75) {
                // Moderately heavy: bonus to score
                baseScore = Math.min(1.2, baseScore * 1.15);
            }
        }
        
        // Low rep sets with high effort = full effective
        if (reps <= 5 && rpe >= 7) {
            baseScore = Math.max(baseScore, 1.0);
        }
        
        return baseScore;
    }
    
    // === Calculate total Effective Sets from a workout ===
    calculateEffectiveSets(sets, e1rmRef = null) {
        if (!sets || sets.length === 0) return { effectiveSets: 0, details: [] };
        
        let totalEffective = 0;
        const details = [];
        
        for (const set of sets) {
            const score = this.calculateEffectiveVolumeScore(
                set.reps, 
                set.rpe, 
                set.weight, 
                e1rmRef
            );
            totalEffective += score;
            details.push({
                reps: set.reps,
                weight: set.weight,
                rpe: set.rpe,
                effectiveScore: score,
                classification: score >= 0.8 ? 'effective' : score >= 0.5 ? 'partial' : 'junk'
            });
        }
        
        return { 
            effectiveSets: Math.round(totalEffective * 10) / 10,
            details 
        };
    }
    
    // === SANDBAGGING DETECTION (Ghost Variables Inference) ===
    detectSandbagging(sets, historicalE1RM = null) {
        const flags = {
            detected: false,
            confidence: 0,
            reasons: [],
            suggestedAction: null
        };
        
        if (!sets || sets.length < 2) return flags;
        
        // Heuristic 1: Linearity Check
        // If all sets are identical (same reps, same weight, all RPE 10), it's suspicious
        const allSetsIdentical = sets.every(s => 
            s.reps === sets[0].reps && 
            Math.abs(s.weight - sets[0].weight) < 1
        );
        const allRpe10 = sets.every(s => s.rpe >= 9.5);
        
        if (allSetsIdentical && allRpe10 && sets.length >= 3) {
            // Physiologically impossible to do 3+ identical sets all at RPE 10
            flags.detected = true;
            flags.confidence += 0.4;
            flags.reasons.push('Performance identique sur toutes les séries avec RPE 10 = physiologiquement improbable');
        }
        
        // Heuristic 2: No rep drop-off despite "max effort"
        if (allRpe10) {
            const firstReps = sets[0]?.reps || 0;
            const lastReps = sets[sets.length - 1]?.reps || 0;
            const expectedDrop = firstReps * 0.15; // Expect at least 15% drop at true failure
            
            if (firstReps - lastReps < expectedDrop && sets.length >= 3) {
                flags.detected = true;
                flags.confidence += 0.3;
                flags.reasons.push(`Aucune baisse de reps malgré RPE 10 (attendu: -${Math.round(expectedDrop)} reps)`);
            }
        }
        
        // Heuristic 3: e1RM deviation from historical
        if (historicalE1RM && historicalE1RM > 0) {
            const currentE1RM = this.calculateE1RM(sets[0].weight, sets[0].reps, sets[0].rpe);
            const deviation = (historicalE1RM - currentE1RM) / historicalE1RM;
            
            if (deviation > 0.15 && sets[0].rpe >= 9) {
                // Current performance >15% below historical despite "max effort"
                flags.confidence += 0.3;
                flags.reasons.push(`e1RM actuel ${Math.round(deviation * 100)}% sous ton record malgré effort max`);
                
                // Could be sandbagging OR genuine fatigue - check trend
                if (flags.detected) {
                    flags.suggestedAction = 'amrap_test';
                }
            }
        }
        
        // Final assessment
        if (flags.confidence >= 0.5) {
            flags.detected = true;
            flags.suggestedAction = flags.suggestedAction || 'force_linear_increase';
        }
        
        return flags;
    }
    
    // === FATIGUE PHENOTYPE INFERENCE ===
    inferFatiguePhenotype(workoutHistory) {
        if (!workoutHistory || workoutHistory.length < 3) {
            return { phenotype: 'MODERATE_RESPONDER', confidence: 'low', data: null };
        }
        
        // Analyze rep drop-off patterns across multiple sessions
        const dropOffRates = [];
        
        for (const workout of workoutHistory.slice(0, 10)) {
            if (!workout.sets || workout.sets.length < 2) continue;
            
            const firstReps = workout.sets[0]?.reps || 0;
            const lastReps = workout.sets[workout.sets.length - 1]?.reps || 0;
            
            if (firstReps > 0) {
                const dropRate = (firstReps - lastReps) / firstReps;
                dropOffRates.push(dropRate);
            }
        }
        
        if (dropOffRates.length < 3) {
            return { phenotype: 'MODERATE_RESPONDER', confidence: 'low', data: null };
        }
        
        const avgDropOff = dropOffRates.reduce((a, b) => a + b, 0) / dropOffRates.length;
        
        let phenotype, confidence;
        if (avgDropOff > 0.25) {
            phenotype = 'HIGH_RESPONDER';
            confidence = avgDropOff > 0.35 ? 'high' : 'moderate';
        } else if (avgDropOff < 0.15) {
            phenotype = 'LOW_RESPONDER';
            confidence = avgDropOff < 0.10 ? 'high' : 'moderate';
        } else {
            phenotype = 'MODERATE_RESPONDER';
            confidence = 'moderate';
        }
        
        return {
            phenotype,
            confidence,
            data: {
                avgDropOff: Math.round(avgDropOff * 100),
                samples: dropOffRates.length,
                recommendation: FATIGUE_PHENOTYPES[phenotype]
            }
        };
    }
    
    // === STIMULUS-TO-FATIGUE RATIO (SFR) CALCULATION ===
    calculateSFR(exerciseName, sets, e1rmRef = null) {
        const effectiveData = this.calculateEffectiveSets(sets, e1rmRef);
        const stimulus = effectiveData.effectiveSets;
        
        if (stimulus <= 0) return { sfr: 0, stimulus: 0, fatigue: 0 };
        
        // Get axial loading coefficient
        let axialCoeff = AXIAL_LOADING_COEFFICIENTS['isolation_default'];
        const nameLower = (exerciseName || '').toLowerCase();
        
        for (const [key, coeff] of Object.entries(AXIAL_LOADING_COEFFICIENTS)) {
            if (nameLower.includes(key.toLowerCase())) {
                axialCoeff = coeff;
                break;
            }
        }
        
        // If compound type not found in name, use default
        if (axialCoeff === AXIAL_LOADING_COEFFICIENTS['isolation_default']) {
            // Check if it's likely a compound movement
            const compoundKeywords = ['développé', 'squat', 'press', 'row', 'dips', 'tirage', 'soulevé'];
            if (compoundKeywords.some(kw => nameLower.includes(kw))) {
                axialCoeff = AXIAL_LOADING_COEFFICIENTS['compound_default'];
            }
        }
        
        // Calculate average intensity
        const avgWeight = sets.reduce((sum, s) => sum + (s.weight || 0), 0) / sets.length;
        const intensityFactor = e1rmRef ? (avgWeight / e1rmRef) : 0.75;
        
        // Fatigue = Effective Sets × Axial Coeff × Intensity
        const fatigue = stimulus * axialCoeff * intensityFactor;
        
        // SFR = Stimulus / Fatigue (higher is better)
        const sfr = fatigue > 0 ? stimulus / fatigue : 0;
        
        return {
            sfr: Math.round(sfr * 100) / 100,
            stimulus: Math.round(stimulus * 10) / 10,
            fatigue: Math.round(fatigue * 10) / 10,
            axialCoeff,
            interpretation: sfr >= 1.5 ? 'excellent' : sfr >= 1.0 ? 'good' : sfr >= 0.7 ? 'moderate' : 'poor'
        };
    }
    
    // === VOLUME ADJUSTMENT MATRIX (Israetel Logic) ===
    getVolumeAdjustment(performanceTrend, avgRpe, currentSets, maxSets) {
        // Determine effort level
        let effortLevel;
        if (avgRpe === null || avgRpe < 7) {
            effortLevel = 'low';
        } else if (avgRpe <= 8.5) {
            effortLevel = 'moderate';
        } else {
            effortLevel = 'high';
        }
        
        // Build matrix key
        let matrixKey;
        if (performanceTrend === 'regressed') {
            matrixKey = 'regressed_any';
        } else {
            matrixKey = `${performanceTrend}_${effortLevel}`;
        }
        
        const adjustment = VOLUME_ADJUSTMENT_MATRIX[matrixKey] || VOLUME_ADJUSTMENT_MATRIX['stalled_moderate'];
        
        // Calculate new sets respecting limits
        let newSets = currentSets + adjustment.setChange;
        newSets = Math.max(2, Math.min(maxSets, newSets)); // Clamp to valid range
        
        return {
            ...adjustment,
            currentSets,
            suggestedSets: newSets,
            atVolumeLimit: newSets >= maxSets,
            effortLevel
        };
    }
    
    // === e1RM TREND ANALYSIS ===
    analyzeE1RMTrend(workoutHistory, windowSize = 5) {
        if (!workoutHistory || workoutHistory.length < 2) {
            return { trend: 'insufficient_data', slope: 0, r2: 0 };
        }
        
        // Extract e1RM from each session
        const e1rmHistory = [];
        for (const workout of workoutHistory.slice(0, windowSize)) {
            if (!workout.sets || workout.sets.length === 0) continue;
            
            // Find best e1RM in session
            let bestE1RM = 0;
            for (const set of workout.sets) {
                const e1rm = this.calculateE1RM(set.weight, set.reps, set.rpe || 8);
                if (e1rm > bestE1RM) bestE1RM = e1rm;
            }
            
            if (bestE1RM > 0) {
                e1rmHistory.push({
                    date: new Date(workout.date),
                    e1rm: bestE1RM
                });
            }
        }
        
        if (e1rmHistory.length < 2) {
            return { trend: 'insufficient_data', slope: 0, r2: 0 };
        }
        
        // Simple linear regression
        const n = e1rmHistory.length;
        const xValues = e1rmHistory.map((_, i) => i);
        const yValues = e1rmHistory.map(h => h.e1rm);
        
        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
        const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const avgY = sumY / n;
        
        // Determine trend
        const slopePercent = (slope / avgY) * 100;
        let trend;
        if (slopePercent > 1) {
            trend = 'improving';
        } else if (slopePercent < -1) {
            trend = 'declining';
        } else {
            trend = 'stable';
        }
        
        return {
            trend,
            slope: Math.round(slope * 100) / 100,
            slopePercent: Math.round(slopePercent * 10) / 10,
            currentE1RM: e1rmHistory[0]?.e1rm || 0,
            bestE1RM: Math.max(...yValues),
            samples: n
        };
    }
    
    // === REACTIVE DELOAD DETECTION ===
    shouldTriggerReactiveDeload(workoutHistory, fatigueScore = null) {
        if (!workoutHistory || workoutHistory.length < 3) return { shouldDeload: false };
        
        const signals = {
            e1rmDecline: false,
            highFatigue: false,
            consecutiveStalls: false,
            rpeCreep: false
        };
        
        // Signal 1: e1RM declining
        const e1rmTrend = this.analyzeE1RMTrend(workoutHistory);
        if (e1rmTrend.trend === 'declining' && e1rmTrend.slopePercent < -2) {
            signals.e1rmDecline = true;
        }
        
        // Signal 2: High fatigue score
        if (fatigueScore && fatigueScore.level === 'high') {
            signals.highFatigue = true;
        }
        
        // Signal 3: Consecutive stalls (3+ sessions no progress)
        let stalls = 0;
        for (let i = 0; i < Math.min(4, workoutHistory.length - 1); i++) {
            const curr = workoutHistory[i];
            const prev = workoutHistory[i + 1];
            
            const currBestE1RM = Math.max(...(curr.sets || []).map(s => 
                this.calculateE1RM(s.weight, s.reps, s.rpe || 8)
            ), 0);
            const prevBestE1RM = Math.max(...(prev.sets || []).map(s => 
                this.calculateE1RM(s.weight, s.reps, s.rpe || 8)
            ), 0);
            
            if (currBestE1RM <= prevBestE1RM) stalls++;
        }
        if (stalls >= 3) signals.consecutiveStalls = true;
        
        // Signal 4: RPE creep (same weight feels harder over time)
        if (workoutHistory.length >= 3) {
            const recentRPEs = workoutHistory.slice(0, 3)
                .map(w => w.avgRpe)
                .filter(r => r != null);
            
            if (recentRPEs.length >= 3 && 
                recentRPEs[0] > recentRPEs[2] + 0.5 &&
                recentRPEs[0] >= 9) {
                signals.rpeCreep = true;
            }
        }
        
        // Count active signals
        const activeSignals = Object.values(signals).filter(Boolean).length;
        
        return {
            shouldDeload: activeSignals >= 2,
            urgency: activeSignals >= 3 ? 'high' : activeSignals >= 2 ? 'moderate' : 'low',
            signals,
            recommendation: activeSignals >= 2 
                ? 'Deload recommandé: fatigue systémique détectée'
                : 'Continue l\'entraînement normal'
        };
    }
    
    // === ADVANCED: Generate Comprehensive Exercise Analysis ===
    async generateExerciseAnalysis(exerciseId, slot) {
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        
        // Group by workout
        const workoutGroups = {};
        for (const set of allSetHistory) {
            if (!workoutGroups[set.workoutId]) {
                workoutGroups[set.workoutId] = {
                    date: set.date,
                    sets: [],
                    totalReps: 0,
                    maxWeight: 0
                };
            }
            workoutGroups[set.workoutId].sets.push(set);
            workoutGroups[set.workoutId].totalReps += set.reps || 0;
            workoutGroups[set.workoutId].maxWeight = Math.max(
                workoutGroups[set.workoutId].maxWeight, 
                set.weight || 0
            );
        }
        
        // Process each workout
        for (const wId of Object.keys(workoutGroups)) {
            const w = workoutGroups[wId];
            w.sets.sort((a, b) => a.setNumber - b.setNumber);
            
            const setsWithRpe = w.sets.filter(s => s.rpe != null);
            w.hasRealRpe = setsWithRpe.length > 0;
            w.avgRpe = setsWithRpe.length > 0 
                ? setsWithRpe.reduce((sum, s) => sum + s.rpe, 0) / setsWithRpe.length 
                : null;
        }
        
        const workouts = Object.values(workoutGroups)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (workouts.length === 0) {
            return { hasData: false };
        }
        
        // Calculate comprehensive metrics
        const lastWorkout = workouts[0];
        const bestE1RM = Math.max(...lastWorkout.sets.map(s => 
            this.calculateE1RM(s.weight, s.reps, s.rpe || 8)
        ), 0);
        
        // Historical best e1RM
        let historicalBestE1RM = 0;
        for (const w of workouts) {
            for (const s of w.sets) {
                const e = this.calculateE1RM(s.weight, s.reps, s.rpe || 8);
                if (e > historicalBestE1RM) historicalBestE1RM = e;
            }
        }
        
        // Effective sets calculation
        const effectiveData = this.calculateEffectiveSets(lastWorkout.sets, historicalBestE1RM);
        
        // Sandbagging check
        const sandbaggingCheck = this.detectSandbagging(lastWorkout.sets, historicalBestE1RM);
        
        // SFR calculation
        const sfrData = this.calculateSFR(
            slot.activeExercise || slot.name, 
            lastWorkout.sets, 
            historicalBestE1RM
        );
        
        // Fatigue phenotype
        const phenotype = this.inferFatiguePhenotype(workouts);
        
        // e1RM trend
        const e1rmTrend = this.analyzeE1RMTrend(workouts);
        
        // Reactive deload check
        const fatigueScore = await this.calculateFatigueScore(exerciseId, workouts);
        const deloadCheck = this.shouldTriggerReactiveDeload(workouts, fatigueScore);
        
        // Performance trend determination
        let performanceTrend = 'stalled';
        if (workouts.length >= 2) {
            const currE1RM = bestE1RM;
            const prevE1RM = Math.max(...workouts[1].sets.map(s => 
                this.calculateE1RM(s.weight, s.reps, s.rpe || 8)
            ), 0);
            
            if (currE1RM > prevE1RM * 1.01) {
                performanceTrend = 'improved';
            } else if (currE1RM < prevE1RM * 0.97) {
                performanceTrend = 'regressed';
            }
        }
        
        // Volume adjustment recommendation
        const maxSets = slot.type === 'isolation' ? 6 : 5;
        const volumeAdjustment = this.getVolumeAdjustment(
            performanceTrend,
            lastWorkout.avgRpe,
            slot.sets,
            maxSets
        );
        
        return {
            hasData: true,
            workouts,
            lastWorkout,
            metrics: {
                currentE1RM: bestE1RM,
                historicalBestE1RM,
                e1rmPercentOfBest: historicalBestE1RM > 0 
                    ? Math.round((bestE1RM / historicalBestE1RM) * 100) 
                    : 100,
                effectiveSets: effectiveData.effectiveSets,
                effectiveDetails: effectiveData.details,
                avgRpe: lastWorkout.avgRpe,
                totalSets: lastWorkout.sets.length
            },
            analysis: {
                sandbagging: sandbaggingCheck,
                sfr: sfrData,
                phenotype,
                e1rmTrend,
                performanceTrend,
                volumeAdjustment,
                fatigueScore,
                deloadRecommendation: deloadCheck
            }
        };
    }

    // ===== Coaching Intelligence =====
    
    // Generate dynamic target reps based on fatigue curve
    genTargetReps(repsMin, repsMax, sets) {
        if (!sets || sets <= 0) return [];
        if (sets === 1) return [repsMax];

        const range = repsMax - repsMin;
        const slope = repsMax <= 12 ? 1 : 2; // fatigue plus forte sur plages longues
        const dropTotal = Math.min(range, (sets - 1) * slope);
        const lastTarget = repsMax - dropTotal;
        const anchorHigh = sets >= 4 ? 2 : 1;

        const targets = [];
        for (let i = 0; i < sets; i++) {
            let t;
            if (i < anchorHigh) {
                t = repsMax;
            } else {
                const remaining = sets - anchorHigh;
                const k = (i - anchorHigh + 1) / remaining;
                t = Math.round(repsMax + (lastTarget - repsMax) * k);
            }
            t = Math.max(repsMin, Math.min(repsMax, t));
            if (i > 0) t = Math.min(t, targets[i - 1]);
            targets.push(t);
        }
        return targets;
    }
    
    // Format target reps array as string
    formatTargetReps(targets) {
        return targets.join(' / ');
    }
    
    // Calculate effective reps from a single set (hypertrophy-relevant reps)
    // REFACTORED: Heavy load exception - all reps count when load >85% 1RM (low reps + high effort)
    effectiveRepsFromSet(reps, rpe, weight = null, e1rmRef = null) {
        if (rpe == null) return null;
        const rir = Math.max(0, 10 - rpe);
        const actualReps = reps || 0;
        
        // HEAVY LOAD EXCEPTION (Scientific basis: >80-85% 1RM recruits all motor units from rep 1)
        // If reps ≤5 AND effort high (RIR ≤3), ALL reps are effective (mechanical tension dominant)
        if (actualReps <= 5 && rir <= 3) {
            return actualReps;
        }
        
        // MODERATE LOAD: Check if we can estimate intensity from e1RM
        // If working at >80% e1RM, more reps count as effective
        if (weight && e1rmRef && e1rmRef > 0) {
            const intensity = weight / e1rmRef;
            if (intensity >= 0.80) {
                // High intensity: only subtract RIR, not the +5 buffer
                return Math.max(0, actualReps - rir);
            }
        }
        
        // STANDARD MODEL (Beardsley): Moderate/high reps, subtract lead-in reps
        // But apply non-linear decay for very low effort (RPE < 6 = junk volume risk)
        if (rpe < 6) {
            // Sub-threshold effort: exponential penalty
            const penaltyFactor = Math.pow((rpe - 4) / 2, 2); // 0 at RPE 4, 1 at RPE 6
            return Math.max(0, Math.floor((actualReps - (rir + 5)) * Math.max(0, penaltyFactor)));
        }
        
        return Math.max(0, actualReps - (rir + 5));
    }
    
    // Estimate 1RM for Hot/Cold comparison
    e1rm(weight, reps) {
        return (weight || 0) * (1 + (reps || 0) / 30);
    }
    
    // Determine day status (hot/cold/normal) based on first set performance
    // REFACTORED: Widened thresholds (±2% → ±6%) to avoid false positives from normal biological variance
    // Scientific basis: Daily 1RM variance in natural lifters is typically 5-10% (CV studies)
    getDayStatus(currentSet, avgPerformance) {
        if (!currentSet || !avgPerformance) return null;
        const cur = this.e1rm(currentSet.weight, currentSet.reps);
        const ref = this.e1rm(avgPerformance.weight, avgPerformance.reps);
        if (ref <= 0) return null;

        const delta = (cur - ref) / ref;
        
        // WIDENED THRESHOLDS: ±6% (scientific: filters normal daily noise, flags real fatigue)
        // "Very hot": >10% = exceptional day, can push harder
        // "Hot": >6% = good day, optimize volume
        // "Normal": ±6% = standard variance, stick to plan
        // "Cold": <-6% = potential fatigue, monitor but don't panic
        // "Very cold": <-10% = significant fatigue, consider autoregulation
        if (delta > 0.10) return 'very_hot';
        if (delta > 0.06) return 'hot';
        if (delta < -0.10) return 'very_cold';
        if (delta < -0.06) return 'cold';
        return 'normal';
    }
    
    // Detect if workout uses ramping (ascending weights)
    isRampingWorkout(sets) {
        if (sets.length < 2) return false;
        const weights = sets.map(s => s.weight || 0).filter(w => w > 0);
        if (weights.length < 2) return false;
        const maxW = Math.max(...weights);
        const minW = Math.min(...weights);
        return (maxW - minW) > 2; // Écart > 2kg = ramping
    }
    
    // === SMART WORKOUT PATTERN ANALYSIS ===
    // Analyzes a workout to understand what really happened
    analyzeWorkoutPattern(sets, slot) {
        if (!sets || sets.length === 0) return null;
        
        const validSets = sets.filter(s => s.weight > 0 && s.reps > 0);
        if (validSets.length === 0) return null;
        
        const weights = validSets.map(s => s.weight);
        const reps = validSets.map(s => s.reps);
        const firstWeight = weights[0];
        const restWeights = weights.slice(1);
        
        // Calculate weight statistics
        const maxWeight = Math.max(...weights);
        const minWeight = Math.min(...weights);
        const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
        
        // Find most common weight (mode)
        const weightCounts = {};
        weights.forEach(w => { weightCounts[w] = (weightCounts[w] || 0) + 1; });
        const modeWeight = parseFloat(Object.entries(weightCounts).sort((a, b) => b[1] - a[1])[0][0]);
        const modeCount = weightCounts[modeWeight];
        
        // Pattern detection
        let pattern = 'stable'; // Default: same weight throughout
        let referenceWeight = firstWeight;
        let analysis = { firstSetTooHeavy: false, droppedMidSession: false, rampingUp: false };
        
        // Check if weights are all the same (or within 1kg)
        const isStable = (maxWeight - minWeight) <= 1;
        
        if (!isStable && validSets.length >= 2) {
            // Pattern 1: DROP MID-SESSION - First set heavier, then dropped
            // Example: 38kg x 8, then 34kg x 10 x 3
            const avgRestWeight = restWeights.length > 0 ? restWeights.reduce((a, b) => a + b, 0) / restWeights.length : firstWeight;
            const droppedFromFirst = firstWeight > avgRestWeight + 1;
            const restIsStable = restWeights.length > 0 && (Math.max(...restWeights) - Math.min(...restWeights)) <= 2;
            
            if (droppedFromFirst && restIsStable && restWeights.length >= 1) {
                pattern = 'dropped';
                // The REAL working weight is what they stabilized at
                referenceWeight = modeWeight;
                analysis.droppedMidSession = true;
                analysis.firstSetTooHeavy = true;
                analysis.originalFirstWeight = firstWeight;
                analysis.stabilizedWeight = modeWeight;
                
                // Check if first set was actually too heavy (low reps)
                const firstReps = reps[0];
                const avgRestReps = reps.slice(1).reduce((a, b) => a + b, 0) / reps.slice(1).length;
                analysis.firstSetStruggled = firstReps < avgRestReps;
            }
            
            // Pattern 2: RAMPING UP - Progressive increase (warm-up style)
            let isAscending = true;
            for (let i = 1; i < weights.length; i++) {
                if (weights[i] < weights[i-1] - 1) {
                    isAscending = false;
                    break;
                }
            }
            if (isAscending && maxWeight > minWeight + 2) {
                pattern = 'ramping';
                // For ramping, reference is the top set that hit reps target
                const validTopSets = validSets.filter(s => s.reps >= slot.repsMin);
                if (validTopSets.length > 0) {
                    referenceWeight = Math.max(...validTopSets.map(s => s.weight));
                } else {
                    referenceWeight = maxWeight;
                }
                analysis.rampingUp = true;
            }
            
            // Pattern 3: INCONSISTENT - Random weights, use mode
            if (pattern === 'stable' && !isStable) {
                pattern = 'inconsistent';
                referenceWeight = modeWeight;
            }
        }
        
        // Calculate effective performance at reference weight
        const setsAtReference = validSets.filter(s => Math.abs(s.weight - referenceWeight) <= 1);
        const avgRepsAtReference = setsAtReference.length > 0 
            ? setsAtReference.reduce((sum, s) => sum + s.reps, 0) / setsAtReference.length 
            : reps[0];
        
        // Count how many sets hit their targets at reference weight
        let setsHitTargetAtRef = 0;
        setsAtReference.forEach((s, i) => {
            const targetForSet = slot.repsMax; // Simplified - could use genTargetReps
            if (s.reps >= targetForSet) setsHitTargetAtRef++;
        });
        
        return {
            pattern,
            referenceWeight,
            modeWeight,
            modeCount,
            maxWeight,
            minWeight,
            avgWeight,
            totalSets: validSets.length,
            setsAtReference: setsAtReference.length,
            avgRepsAtReference,
            setsHitTargetAtRef,
            analysis,
            // For debugging
            weights,
            reps
        };
    }
    
    // Get reference weight from workout using smart pattern analysis
    getReferenceWeight(workout, slot) {
        const sets = workout.sets;
        const analysis = this.analyzeWorkoutPattern(sets, slot);
        
        if (analysis) {
            return analysis.referenceWeight;
        }
        
        // Fallback to first set weight
        return sets[0]?.weight || workout.maxWeight;
    }

    buildSlotCoachMeta(slot) {
        if (!slot) return null;
        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...slot });

        return {
            slotId: normalizedSlot.id,
            exerciseName: normalizedSlot.activeExercise || normalizedSlot.name || '',
            type: normalizedSlot.type || 'compound',
            repsMin: normalizedSlot.repsMin || 0,
            repsMax: normalizedSlot.repsMax || 0,
            sets: normalizedSlot.sets || 0,
            rest: normalizedSlot.rest || 0,
            progressionMode: normalizedSlot.progressionMode,
            loadingProfile: normalizedSlot.loadingProfile,
            incrementKg: normalizedSlot.incrementKg,
            minIncrementKg: normalizedSlot.minIncrementKg,
            maxSelectableLoadKg: normalizedSlot.maxSelectableLoadKg,
            machineStepKg: normalizedSlot.machineStepKg,
            bodyweightMode: normalizedSlot.bodyweightMode,
            bodyweightProfile: normalizedSlot.bodyweightProfile,
            progressionState: normalizedSlot.progressionState,
            capDetection: normalizedSlot.capDetection
        };
    }

    inferBodyweightFamily(slotOrExercise) {
        const normalizedName = this.normalizeExerciseText(this.getSlotExerciseName(slotOrExercise));
        if (!normalizedName) return 'generic';

        if (
            normalizedName.includes('traction') ||
            normalizedName.includes('pull up') ||
            normalizedName.includes('pullup') ||
            normalizedName.includes('chin up') ||
            normalizedName.includes('chinup')
        ) {
            return 'pullup';
        }

        if (normalizedName.includes('dip') || normalizedName.includes('dips')) {
            return 'dip';
        }

        if (normalizedName.includes('pompe') || normalizedName.includes('push up') || normalizedName.includes('pushup')) {
            return 'pushup';
        }

        if (
            normalizedName.includes('abdo') ||
            normalizedName.includes('crunch') ||
            normalizedName.includes('leg raise') ||
            normalizedName.includes('sit up') ||
            normalizedName.includes('hollow')
        ) {
            return 'abs';
        }

        return 'generic';
    }

    normalizeSlotProgressionConfig(slot) {
        if (!slot) return slot;

        const bodyweightConfig = this.getBodyweightAutoConfig(slot);
        const bodyweightDetected = slot.bodyweightMode === true ||
            slot.loadingProfile === 'bodyweight' ||
            (!slot.progressionMode && bodyweightConfig.autoMode);
        const explicitMode = typeof slot.progressionMode === 'string' ? slot.progressionMode : null;
        const progressionMode = bodyweightDetected && explicitMode !== 'capped_load'
            ? 'bodyweight'
            : (explicitMode || 'load');

        slot.progressionMode = progressionMode;
        slot.bodyweightMode = progressionMode === 'bodyweight' || slot.bodyweightMode === true;
        slot.loadingProfile ||= progressionMode === 'bodyweight'
            ? 'bodyweight'
            : (slot.maxSelectableLoadKg != null ? 'machine_stack' : 'free_weight');

        if (slot.progressionMode === 'bodyweight') {
            slot.loadingProfile = 'bodyweight';
        }

        slot.incrementKg = Number.isFinite(slot.incrementKg) ? Number(slot.incrementKg) : null;
        slot.minIncrementKg = Number.isFinite(slot.minIncrementKg)
            ? Number(slot.minIncrementKg)
            : (slot.type === 'isolation' ? 0.5 : 1);
        slot.maxSelectableLoadKg = Number.isFinite(slot.maxSelectableLoadKg) ? Number(slot.maxSelectableLoadKg) : null;
        slot.machineStepKg = Number.isFinite(slot.machineStepKg) ? Number(slot.machineStepKg) : null;

        slot.bodyweightProfile = {
            family: bodyweightConfig.family,
            allowExternalLoad: bodyweightConfig.allowExternalLoad,
            allowAssistance: bodyweightConfig.allowAssistance,
            assistanceStepKg: null,
            currentVariantIndex: 0,
            currentTempoLevel: 0,
            currentPauseLevel: 0,
            currentROMLevel: 0,
            ...(slot.bodyweightProfile || {})
        };

        slot.progressionState = {
            primaryAxis: progressionMode === 'load' ? 'load' : 'reps',
            plateauCount: 0,
            capReachedCount: 0,
            lastSuccessfulAxis: null,
            lastCapReachedAt: null,
            densityLevel: 0,
            romConstraint: null,
            ...(slot.progressionState || {})
        };

        slot.capDetection = {
            userFlag: false,
            autoConfidence: 0,
            lastDetectedAt: null,
            reasons: [],
            ...(slot.capDetection || {})
        };

        if (slot.progressionMode === 'bodyweight') {
            slot.progressionState.primaryAxis ||= 'reps';
        }

        return slot;
    }

    getWeightIncrementForSlot(slot) {
        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...slot });
        const localIncrement = Number.isFinite(normalizedSlot.incrementKg) ? normalizedSlot.incrementKg : null;
        if (localIncrement != null && localIncrement > 0) return localIncrement;

        if (normalizedSlot.loadingProfile === 'machine_stack' && normalizedSlot.machineStepKg) {
            return normalizedSlot.machineStepKg;
        }

        return normalizedSlot.type === 'isolation' ? normalizedSlot.minIncrementKg || 0.5 : Math.max(normalizedSlot.minIncrementKg || 1, 1);
    }

    getNextProgressionAxis(mode, currentAxis, slot) {
        const bodyweightFamily = slot?.bodyweightProfile?.family || 'generic';
        const ladders = {
            capped_load: ['reps', 'sets', 'tempo', 'pause', 'rom', 'density', 'variant', 'switch'],
            bodyweight_pullup: ['reps', slot?.bodyweightProfile?.allowExternalLoad ? 'load' : (slot?.bodyweightProfile?.allowAssistance ? 'assistance' : 'tempo'), 'tempo', 'pause', 'variant', 'switch'],
            bodyweight_dip: ['reps', slot?.bodyweightProfile?.allowExternalLoad ? 'load' : (slot?.bodyweightProfile?.allowAssistance ? 'assistance' : 'tempo'), 'tempo', 'pause', 'variant', 'switch'],
            bodyweight_pushup: ['reps', 'variant', 'tempo', 'pause', slot?.bodyweightProfile?.allowExternalLoad ? 'load' : 'rom', 'switch'],
            bodyweight_abs: ['reps', 'variant', 'tempo', 'pause', slot?.bodyweightProfile?.allowExternalLoad ? 'load' : 'rom', 'switch'],
            bodyweight_generic: ['reps', slot?.bodyweightProfile?.allowAssistance ? 'assistance' : 'tempo', 'tempo', 'pause', 'variant', 'switch']
        };

        const ladder = mode === 'bodyweight'
            ? (ladders[`bodyweight_${bodyweightFamily}`] || ladders.bodyweight_generic)
            : (ladders[mode] || ['load', 'sets', 'switch']);
        const currentIndex = ladder.indexOf(currentAxis);
        if (currentIndex === -1) return ladder[0];
        return ladder[Math.min(currentIndex + 1, ladder.length - 1)];
    }

    getExtendedRepUpperBound(slot, mode = 'load') {
        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...slot });
        if (mode === 'capped_load') {
            if (normalizedSlot.muscleGroup === 'abdominaux' || normalizedSlot.bodyweightProfile?.family === 'abs') {
                return normalizedSlot.repsMax + 6;
            }
            return normalizedSlot.type === 'isolation'
                ? normalizedSlot.repsMax + 4
                : normalizedSlot.repsMax + 2;
        }

        if (mode === 'bodyweight') {
            if (normalizedSlot.bodyweightProfile?.family === 'abs') return normalizedSlot.repsMax + 6;
            return normalizedSlot.repsMax + 3;
        }

        return normalizedSlot.repsMax;
    }

    ensureWorkoutCoachingState() {
        if (!this.currentWorkout) return null;

        if (!this.currentWorkout.coachingState || this.currentWorkout.coachingState.version !== 2) {
            this.currentWorkout.coachingState = {
                version: 2,
                updatedAt: Date.now(),
                systemicFatigue: 0,
                axialFatigue: 0,
                setCount: 0,
                hardSetsTotal: 0,
                localFatigue: {},
                stimulusByMuscle: {},
                hardSetsByMuscle: {},
                slotState: {},
                lastWorkedMuscles: []
            };
        }

        return this.currentWorkout.coachingState;
    }

    roundToHalf(value) {
        return Math.round((value || 0) * 2) / 2;
    }

    getSetRpeSource(set) {
        if (!set) return 'estimated';
        if (set.rpe != null) {
            return set.rpeSource || 'legacy';
        }
        return 'estimated';
    }

    hasExplicitRpe(set) {
        if (!set || set.rpe == null) return false;
        const source = this.getSetRpeSource(set);
        return source !== 'default' && source !== 'estimated';
    }

    getFatigueSignalWeight(set) {
        switch (this.getSetRpeSource(set)) {
            case 'user':
                return 1;
            case 'legacy':
                return 0.8;
            case 'default':
                return 0.5;
            case 'estimated':
            default:
                return 0.4;
        }
    }

    getSetRpeForFatigue(set, slotMeta = null) {
        return {
            rpe: set?.rpe != null ? set.rpe : this.estimateSetRpe(set, slotMeta),
            source: this.getSetRpeSource(set),
            fatigueWeight: this.getFatigueSignalWeight(set)
        };
    }

    getSlotCoachVolumeDecision(slotId = this.currentSlot?.id) {
        if (!slotId || !this.currentWorkout?.slots) return null;
        return this.currentWorkout.slots[slotId]?.coachVolumeDecision || null;
    }

    getSlotTargetState(slot = this.currentSlot, slotData = null) {
        const programmedSets = Math.max(0, Number(slot?.sets) || 0);
        const resolvedSlotData = slotData || (slot?.id ? this.currentWorkout?.slots?.[slot.id] : null) || null;
        const decision = resolvedSlotData?.coachVolumeDecision || null;
        const acceptedTargetSets = Number.isFinite(Number(decision?.acceptedTargetSets))
            && Number(decision.acceptedTargetSets) > 0
            ? Number(decision.acceptedTargetSets)
            : null;

        return {
            programmedSets,
            activeTargetSets: acceptedTargetSets || programmedSets,
            decision
        };
    }

    getActiveTargetSets(slot = this.currentSlot, slotData = null) {
        return this.getSlotTargetState(slot, slotData).activeTargetSets;
    }

    async getExerciseWorkoutHistory(exerciseId) {
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        const workoutGroups = {};

        for (const set of allSetHistory) {
            if (!workoutGroups[set.workoutId]) {
                workoutGroups[set.workoutId] = {
                    date: set.date,
                    sets: [],
                    totalReps: 0,
                    maxWeight: 0,
                    avgRpe: null,
                    hasRealRpe: false,
                    targetSetCount: 0,
                    programmedSetCount: 0,
                    volumeDecisionType: null,
                    volumeProtected: false
                };
            }

            workoutGroups[set.workoutId].sets.push(set);
            workoutGroups[set.workoutId].totalReps += set.reps || 0;
            workoutGroups[set.workoutId].maxWeight = Math.max(workoutGroups[set.workoutId].maxWeight, set.weight || 0);
            workoutGroups[set.workoutId].targetSetCount = Math.max(
                workoutGroups[set.workoutId].targetSetCount,
                Number(set.targetSetCount) || 0
            );
            workoutGroups[set.workoutId].programmedSetCount = Math.max(
                workoutGroups[set.workoutId].programmedSetCount,
                Number(set.programmedSetCount) || 0
            );
            if (!workoutGroups[set.workoutId].volumeDecisionType && set.volumeDecisionType) {
                workoutGroups[set.workoutId].volumeDecisionType = set.volumeDecisionType;
            }
            if (set.volumeProtected) {
                workoutGroups[set.workoutId].volumeProtected = true;
            }
        }

        for (const workout of Object.values(workoutGroups)) {
            workout.sets.sort((a, b) => a.setNumber - b.setNumber);
            workout.targetSetCount = Math.max(workout.targetSetCount || 0, workout.sets.length);
            workout.programmedSetCount = Math.max(workout.programmedSetCount || 0, workout.targetSetCount);
            const setsWithExplicitRpe = workout.sets.filter(set => this.hasExplicitRpe(set));
            workout.hasRealRpe = setsWithExplicitRpe.length > 0;
            workout.avgRpe = setsWithExplicitRpe.length > 0
                ? setsWithExplicitRpe.reduce((sum, set) => sum + set.rpe, 0) / setsWithExplicitRpe.length
                : null;
        }

        return Object.values(workoutGroups).sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    buildExerciseTrendSummary(workouts, slot) {
        if (!workouts || workouts.length === 0) {
            return {
                trend: 'stable',
                confidence: 0,
                e1rmDelta: 0,
                targetDelta: 0,
                headline: 'Pas encore assez de données.'
            };
        }

        const recent = workouts.slice(0, 5).map(workout => {
            const targetSetCount = Math.max(workout.targetSetCount || workout.sets.length, 1);
            const targetArray = this.genTargetReps(slot.repsMin, slot.repsMax, targetSetCount);
            const targetHits = workout.sets.reduce((count, set, index) => {
                return count + ((set.reps || 0) >= (targetArray[index] || slot.repsMax) ? 1 : 0);
            }, 0);

            return {
                topE1RM: Math.max(...workout.sets.map(set => this.calculateE1RM(set.weight, set.reps, set.rpe || 8)), 0),
                targetHitRate: targetSetCount ? targetHits / targetSetCount : 0,
                avgRpe: workout.avgRpe,
                hasRealRpe: workout.hasRealRpe,
                volumeProtected: workout.volumeProtected
            };
        });

        if (recent.length === 1) {
            return {
                trend: 'stable',
                confidence: 0.25,
                e1rmDelta: 0,
                targetDelta: 0,
                headline: 'Une seule séance de référence.'
            };
        }

        const current = recent[0];
        const baselineSlice = recent.slice(1);
        const weightTotal = baselineSlice.reduce((sum, _, index) => sum + (baselineSlice.length - index), 0) || 1;
        const baselineE1RM = baselineSlice.reduce((sum, item, index) => {
            return sum + item.topE1RM * (baselineSlice.length - index);
        }, 0) / weightTotal;
        const baselineTargetRate = baselineSlice.reduce((sum, item, index) => {
            return sum + item.targetHitRate * (baselineSlice.length - index);
        }, 0) / weightTotal;
        const baselineRpeValues = baselineSlice.filter(item => item.avgRpe != null).map(item => item.avgRpe);
        const baselineRpe = baselineRpeValues.length > 0
            ? baselineRpeValues.reduce((sum, value) => sum + value, 0) / baselineRpeValues.length
            : null;

        const e1rmDelta = baselineE1RM > 0 ? (current.topE1RM - baselineE1RM) / baselineE1RM : 0;
        const targetDelta = current.targetHitRate - baselineTargetRate;
        const rpeDelta = current.avgRpe != null && baselineRpe != null ? current.avgRpe - baselineRpe : 0;
        const trendScore = (e1rmDelta * 0.7) + (targetDelta * 0.3) - (Math.max(0, rpeDelta - 0.3) * 0.05);

        let trend = 'stable';
        if (trendScore >= 0.03 || e1rmDelta >= 0.015) {
            trend = 'improved';
        } else if (trendScore <= -0.04 || e1rmDelta <= -0.02 || (rpeDelta > 0.5 && targetDelta <= -0.1)) {
            trend = 'regressed';
        }

        const realRpeSessions = recent.filter(item => item.hasRealRpe).length;
        const confidence = Math.min(0.95, 0.3 + ((recent.length - 1) * 0.12) + (realRpeSessions * 0.05));
        const e1rmPct = Math.round(e1rmDelta * 1000) / 10;

        let headline = 'Historique stable.';
        if (trend === 'improved') {
            headline = `Historique en hausse (${e1rmPct >= 0 ? '+' : ''}${e1rmPct}% e1RM).`;
        } else if (trend === 'regressed') {
            headline = `Historique sous la ligne (${e1rmPct}% e1RM).`;
        }

        return {
            trend,
            confidence,
            e1rmDelta,
            targetDelta,
            rpeDelta,
            headline
        };
    }

    getExerciseAxialLoadCoefficient(exerciseName, slotMeta = null) {
        const normalizedName = this.normalizeExerciseText(exerciseName);
        const sortedEntries = Object.entries(AXIAL_LOADING_COEFFICIENTS)
            .map(([key, value]) => [this.normalizeExerciseText(key), value])
            .sort((a, b) => b[0].length - a[0].length);

        for (const [key, value] of sortedEntries) {
            if (key && normalizedName.includes(key)) {
                return value;
            }
        }

        return slotMeta?.type === 'isolation'
            ? AXIAL_LOADING_COEFFICIENTS.isolation_default
            : AXIAL_LOADING_COEFFICIENTS.compound_default;
    }

    getExerciseMuscleContributions(exerciseName) {
        const mapping = this.getExerciseMuscleMapping(exerciseName);
        const contributions = [];
        const seen = new Set();

        if (mapping) {
            mapping.primary.forEach(muscleId => {
                seen.add(muscleId);
                contributions.push({ muscleId, role: 'primary', weight: 1 });
            });
            mapping.secondary.forEach(muscleId => {
                if (seen.has(muscleId)) return;
                seen.add(muscleId);
                contributions.push({ muscleId, role: 'secondary', weight: 0.5 });
            });
        }

        if (contributions.length > 0) {
            return contributions;
        }

        const normalizedName = this.normalizeExerciseText(exerciseName);
        for (const [muscleId, keywords] of Object.entries(this.getMuscleKeywordsMap())) {
            if (keywords.some(keyword => normalizedName.includes(this.normalizeExerciseText(keyword)))) {
                contributions.push({ muscleId, role: 'primary', weight: 1 });
            }
        }

        return contributions;
    }

    estimateSetRpe(set, slotMeta = null) {
        if (set?.rpe != null) return set.rpe;

        const reps = set?.reps || 0;
        const repsMin = slotMeta?.repsMin || Math.max(4, reps - 2);
        const repsMax = slotMeta?.repsMax || Math.max(repsMin + 2, reps);

        if (reps === 0) return 7;
        if (reps < repsMin) return 9;
        if (reps >= repsMax) return 8.5;
        if (reps >= repsMax - 1) return 8;
        if (reps <= repsMin + 1) return 8.5;
        return 7.5;
    }

    getCompletedSessionSets(options = {}) {
        if (!this.currentWorkout?.slots) return [];

        const { excludeSlotId = null } = options;
        const completed = [];

        for (const [slotId, slotData] of Object.entries(this.currentWorkout.slots)) {
            if (excludeSlotId && String(slotId) === String(excludeSlotId)) continue;

            const meta = slotData.meta || null;
            const standardSets = slotData.sets || [];
            standardSets.forEach((set, index) => {
                if (!set?.completed) return;
                completed.push({ slotId, meta, set, setIndex: index, side: null });
            });

            const setsLeft = slotData.setsLeft || [];
            setsLeft.forEach((set, index) => {
                if (!set?.completed) return;
                completed.push({ slotId, meta, set, setIndex: index, side: 'left' });
            });

            const setsRight = slotData.setsRight || [];
            setsRight.forEach((set, index) => {
                if (!set?.completed) return;
                completed.push({ slotId, meta, set, setIndex: index, side: 'right' });
            });
        }

        return completed.sort((a, b) => (a.set.timestamp || 0) - (b.set.timestamp || 0));
    }

    buildSessionFatigueState(options = {}) {
        const completedSets = this.getCompletedSessionSets(options);
        const now = Date.now();
        const state = {
            systemicFatigue: 0,
            axialFatigue: 0,
            setCount: completedSets.length,
            hardSetsTotal: 0,
            localFatigue: {},
            stimulusByMuscle: {},
            hardSetsByMuscle: {},
            slotState: {},
            lastWorkedMuscles: []
        };

        completedSets.forEach(entry => {
            const slotMeta = entry.meta || {};
            const exerciseName = slotMeta.exerciseName || '';
            const { rpe, fatigueWeight } = this.getSetRpeForFatigue(entry.set, slotMeta);
            const effectiveScore = this.calculateEffectiveVolumeScore(entry.set.reps, rpe, entry.set.weight, null) * fatigueWeight;
            const effortScore = Math.max(0.25, ((rpe - 5) / 5) * fatigueWeight);
            const failureProximity = Math.max(0, (1 - ((10 - rpe) / 4)) * fatigueWeight);
            const ageMinutes = Math.max(0, (now - (entry.set.timestamp || now)) / 60000);
            const localDecay = Math.max(0.45, Math.exp(-ageMinutes / 80));
            const systemicDecay = Math.max(0.4, Math.exp(-ageMinutes / 110));
            const axialCoeff = this.getExerciseAxialLoadCoefficient(exerciseName, slotMeta);
            const localBase = 0.35 + (effectiveScore * 0.6) + (effortScore * 0.22) + (failureProximity * 0.16);
            const systemicBase = 0.16 + (effortScore * 0.28) + (axialCoeff * 0.35) + (((entry.set.reps || 0) >= 12 ? 0.06 : 0) * fatigueWeight);
            const contributions = this.getExerciseMuscleContributions(exerciseName);

            state.systemicFatigue += systemicBase * systemicDecay;
            state.axialFatigue += axialCoeff * systemicDecay;
            if (rpe >= 8) {
                state.hardSetsTotal += fatigueWeight;
            }

            state.slotState[entry.slotId] = state.slotState[entry.slotId] || {
                setCount: 0,
                axialFatigue: 0,
                fatigue: 0,
                hardSets: 0
            };
            state.slotState[entry.slotId].setCount += 1;
            state.slotState[entry.slotId].axialFatigue += axialCoeff * systemicDecay;
            if (rpe >= 8) {
                state.slotState[entry.slotId].hardSets += fatigueWeight;
            }

            contributions.forEach(({ muscleId, weight }) => {
                const localCost = localBase * weight * localDecay;
                const stimulus = Math.max(0.15, effectiveScore) * weight;
                const hardSetValue = (rpe >= 8 ? 1 : rpe >= 7 ? 0.5 : 0) * weight * fatigueWeight;

                state.localFatigue[muscleId] = (state.localFatigue[muscleId] || 0) + localCost;
                state.stimulusByMuscle[muscleId] = (state.stimulusByMuscle[muscleId] || 0) + stimulus;
                state.hardSetsByMuscle[muscleId] = (state.hardSetsByMuscle[muscleId] || 0) + hardSetValue;
                state.slotState[entry.slotId].fatigue += localCost;
            });

            const lastThreeMuscles = contributions.slice(0, 2).map(item => item.muscleId);
            state.lastWorkedMuscles.push(...lastThreeMuscles);
        });

        state.lastWorkedMuscles = state.lastWorkedMuscles.slice(-6);
        return state;
    }

    estimateExerciseOverlap(targetSlot, pairedExercise) {
        if (!targetSlot || !pairedExercise) {
            return { overlapScore: 0, sharedMuscles: [], axialCoeff: 0 };
        }

        const target = this.getExerciseMuscleContributions(targetSlot.activeExercise || targetSlot.name);
        const paired = this.getExerciseMuscleContributions(pairedExercise.activeExercise || pairedExercise.name);
        const pairedMap = new Map(paired.map(item => [item.muscleId, item]));
        const sharedMuscles = [];
        let overlapScore = 0;

        target.forEach(item => {
            const pairedContribution = pairedMap.get(item.muscleId);
            if (!pairedContribution) return;
            sharedMuscles.push(item.muscleId);
            overlapScore += item.weight * pairedContribution.weight;
        });

        return {
            overlapScore,
            sharedMuscles,
            axialCoeff: this.getExerciseAxialLoadCoefficient(
                pairedExercise.activeExercise || pairedExercise.name,
                this.buildSlotCoachMeta(pairedExercise)
            )
        };
    }

    getSessionFatigueContextForSlot(slot, options = {}) {
        const state = this.buildSessionFatigueState(options);
        const contributions = this.getExerciseMuscleContributions(slot.activeExercise || slot.name);
        const primaryMuscles = contributions.filter(item => item.role === 'primary').map(item => item.muscleId);
        const secondaryMuscles = contributions.filter(item => item.role === 'secondary').map(item => item.muscleId);
        const primaryFatigue = primaryMuscles.map(muscleId => state.localFatigue[muscleId] || 0);
        const secondaryFatigue = secondaryMuscles.map(muscleId => state.localFatigue[muscleId] || 0);
        const primaryHardSets = primaryMuscles.reduce((sum, muscleId) => sum + (state.hardSetsByMuscle[muscleId] || 0), 0);
        const secondaryHardSets = secondaryMuscles.reduce((sum, muscleId) => sum + (state.hardSetsByMuscle[muscleId] || 0), 0);
        const currentSlotState = state.slotState?.[slot.id] || { setCount: 0, hardSets: 0 };
        const completedOtherSlots = Object.entries(state.slotState || {})
            .filter(([slotId, slotState]) => String(slotId) !== String(slot.id) && (slotState?.setCount || 0) > 0)
            .length;
        const isFirstExerciseWindow = completedOtherSlots === 0;

        let avgPrimaryFatigue = primaryFatigue.length
            ? primaryFatigue.reduce((sum, value) => sum + value, 0) / primaryFatigue.length
            : 0;
        let maxPrimaryFatigue = primaryFatigue.length ? Math.max(...primaryFatigue) : 0;
        const avgSecondaryFatigue = secondaryFatigue.length
            ? secondaryFatigue.reduce((sum, value) => sum + value, 0) / secondaryFatigue.length
            : 0;
        let systemicFatigue = state.systemicFatigue;
        const reasonParts = [];

        if (options.isSuperset && options.supersetPosition === 'B' && options.pairedExercise) {
            const overlap = this.estimateExerciseOverlap(slot, options.pairedExercise);
            if (overlap.overlapScore > 0) {
                const syntheticLocal = overlap.overlapScore * (overlap.axialCoeff >= 1.2 ? 1.5 : 1.0);
                avgPrimaryFatigue += syntheticLocal;
                maxPrimaryFatigue += syntheticLocal;
                systemicFatigue += Math.max(0.6, overlap.axialCoeff * 0.4);
                reasonParts.push(`pré-fatigue ${overlap.sharedMuscles.join('/')}`);
            }
        }

        const overlapScore = avgPrimaryFatigue + (maxPrimaryFatigue * 0.35) + (avgSecondaryFatigue * 0.4) + (primaryHardSets * 0.3) + (secondaryHardSets * 0.15);
        let fatigueLevel = 'low';
        let loadAdjustPercent = 0;
        let setChange = 0;
        let repsDelta = 0;
        let restAddSeconds = 0;

        if (overlapScore >= 5.4 || systemicFatigue >= 7.2 || state.axialFatigue >= 5.2) {
            fatigueLevel = 'high';
            loadAdjustPercent = maxPrimaryFatigue >= 5.2 ? -5 : -2.5;
            setChange = primaryHardSets >= 5 ? -1 : 0;
            repsDelta = -1;
            restAddSeconds = state.axialFatigue >= 4 ? 20 : 15;
        } else if (overlapScore >= 3.4 || systemicFatigue >= 5.2) {
            fatigueLevel = 'moderate';
            loadAdjustPercent = (avgPrimaryFatigue >= 3.6 || primaryHardSets >= 4.5) ? -2.5 : 0;
            setChange = primaryHardSets >= 7 ? -1 : 0;
            repsDelta = maxPrimaryFatigue >= 4.2 ? -1 : 0;
            restAddSeconds = state.axialFatigue >= 3.6 ? 15 : 10;
        }

        if (isFirstExerciseWindow) {
            // Guardrail: the first exercise should not be auto-cut after 1-2 normal sets.
            setChange = 0;
            if (currentSlotState.setCount <= 2) {
                fatigueLevel = 'low';
                loadAdjustPercent = 0;
                repsDelta = 0;
                restAddSeconds = currentSlotState.setCount >= 2 ? Math.max(restAddSeconds, 10) : 0;
            }
        }

        if (maxPrimaryFatigue >= 3.6) {
            reasonParts.push(`fatigue locale ${Math.round(maxPrimaryFatigue * 10) / 10}`);
        }
        if (primaryHardSets >= 4) {
            reasonParts.push(`${Math.round(primaryHardSets * 10) / 10} séries dures déjà faites`);
        }
        if (systemicFatigue >= 5.5) {
            reasonParts.push('fatigue systémique en hausse');
        }

        const readinessScore = Math.max(
            45,
            Math.min(100, Math.round(100 - (overlapScore * 7) - (systemicFatigue * 3) - (state.axialFatigue * 1.5)))
        );

        return {
            fatigueLevel,
            readinessScore,
            overlapScore,
            avgPrimaryFatigue,
            maxPrimaryFatigue,
            avgSecondaryFatigue,
            primaryHardSets,
            secondaryHardSets,
            systemicFatigue,
            axialFatigue: state.axialFatigue,
            loadAdjustPercent,
            setChange,
            repsDelta,
            restAddSeconds,
            shortReason: reasonParts[0] || '',
            reasons: reasonParts,
            snapshot: state
        };
    }

    async refreshWorkoutCoachingState() {
        if (!this.currentWorkout) return null;

        const nextState = this.buildSessionFatigueState();
        const coachingState = this.ensureWorkoutCoachingState();
        Object.assign(coachingState, {
            ...nextState,
            updatedAt: Date.now()
        });

        await db.saveCurrentWorkout(this.currentWorkout);
        return coachingState;
    }

    async buildCoachContextForSlot(slot, options = {}) {
        const exerciseId = slot.activeExercise || slot.name;
        const workouts = await this.getExerciseWorkoutHistory(exerciseId);
        const trendSummary = this.buildExerciseTrendSummary(workouts, slot);
        const sessionContext = this.getSessionFatigueContextForSlot(slot, options);
        const lmsData = await this.getLMSDataForSlot(slot, {
            performanceTrend: trendSummary.trend,
            sessionContext
        });

        return {
            workouts,
            trendSummary,
            sessionContext,
            lmsData
        };
    }

    applyContextualAdjustmentsToAdvice(advice, slot, context = {}) {
        if (!advice || !slot) return advice;

        const adjusted = { ...advice };
        const { trendSummary, sessionContext, lmsData } = context;
        const reasons = [];
        const isDeloadAdvice = adjusted.type === 'deload'
            || adjusted.type === 'reactive_deload'
            || adjusted.type === 'deload_mini'
            || adjusted.isDeload;
        let volumeSuggestionSource = isDeloadAdvice ? 'deload' : null;

        if (lmsData) {
            this.currentLMSData = lmsData;
            if (lmsData.adjustedSets !== lmsData.originalSets) {
                adjusted.suggestedSets = Math.min(
                    adjusted.suggestedSets || lmsData.adjustedSets,
                    lmsData.adjustedSets
                );
                volumeSuggestionSource = volumeSuggestionSource || 'lms';
            }
        }

        if (trendSummary?.confidence >= 0.35) {
            reasons.push(trendSummary.headline.replace(/\.$/, ''));
        }

        if (sessionContext) {
            if (typeof adjusted.suggestedWeight === 'number' && sessionContext.loadAdjustPercent !== 0) {
                const baseWeight = adjusted.suggestedWeight;
                const nextWeight = this.roundToHalf(baseWeight * (1 + (sessionContext.loadAdjustPercent / 100)));

                if (nextWeight > 0 && Math.abs(nextWeight - baseWeight) >= 0.5) {
                    adjusted.suggestedWeight = nextWeight;
                    adjusted.weightTrend = nextWeight < baseWeight ? 'down' : nextWeight > baseWeight ? 'up' : adjusted.weightTrend;
                    adjusted.liveLoadAdjustment = true;

                    if (sessionContext.fatigueLevel === 'high' && adjusted.type === 'increase') {
                        adjusted.type = 'maintain';
                        adjusted.title = 'Gestion de fatigue';
                    }
                }
            }

            if (sessionContext.setChange < 0 && !volumeSuggestionSource) {
                const baseSets = adjusted.suggestedSets || adjusted.deloadSets || slot.sets;
                const nextSets = Math.max(2, Math.min(6, baseSets + sessionContext.setChange));
                if (nextSets < baseSets) {
                    adjusted.suggestedSets = nextSets;
                    volumeSuggestionSource = 'fatigue';
                }
            }

            if (sessionContext.repsDelta < 0) {
                const setCount = adjusted.suggestedSets || slot.sets;
                const targets = this.genTargetReps(slot.repsMin, slot.repsMax, setCount)
                    .map(rep => Math.max(slot.repsMin, rep + sessionContext.repsDelta));
                adjusted.suggestedReps = this.formatTargetReps(targets);
            }

            if (sessionContext.restAddSeconds > 0) {
                adjusted.restRecommendation = `${slot.rest + sessionContext.restAddSeconds}s`;
            }

            if (sessionContext.reasons.length > 0 && sessionContext.fatigueLevel !== 'low') {
                reasons.push(sessionContext.reasons.join(', '));
            }
        }

        adjusted.decisionReasons = reasons.slice(0, 3);
        adjusted.autoAdjustSets = false;
        adjusted.volumeSuggestionSource = volumeSuggestionSource;
        adjusted.volumeSuggestionOnly = Boolean(volumeSuggestionSource);

        adjusted.contextConfidence = Math.round((((trendSummary?.confidence || 0.35) + ((sessionContext?.readinessScore || 70) / 100)) / 2) * 100) / 100;
        adjusted.sessionContext = sessionContext || null;
        adjusted.trendSummary = trendSummary || null;

        if (typeof adjusted.backOffWeight === 'number' && sessionContext?.loadAdjustPercent) {
            adjusted.backOffWeight = this.roundToHalf(
                adjusted.backOffWeight * (1 + (sessionContext.loadAdjustPercent / 100))
            );
        }

        return adjusted;
    }

    async getEnhancedCoachingAdvice(slot = this.currentSlot) {
        if (!slot) return null;

        const normalizedSlot = this.normalizeSlotProgressionConfig({ ...slot });
        const progressionContext = await this.buildProgressionContext(normalizedSlot);
        this.syncCoachDerivedState(normalizedSlot, progressionContext);

        const context = await this.buildCoachContextForSlot(normalizedSlot);
        this.currentExerciseTrendSummary = context.trendSummary;
        this.currentSessionFatigueContext = context.sessionContext;

        return this.calculateCoachingAdviceForSlot(normalizedSlot);
    }

    async getEnhancedCoachingAdviceForSlot(slot, options = {}) {
        if (!slot) return null;
        return this.calculateCoachingAdviceForSlot(slot, options);
    }

    async refreshLiveCoachingAfterSet() {
        if (!this.currentSlot || this.isSupersetMode || this.isUnilateralMode) return;

        await this.refreshWorkoutCoachingState();
        this.currentCoachingAdvice = await this.getEnhancedCoachingAdvice(this.currentSlot);

        const nextWeight = this.currentCoachingAdvice?.suggestedWeight;
        if (this.nextSetSuggestedWeight == null && typeof nextWeight === 'number' && this.currentCoachingAdvice?.liveLoadAdjustment) {
            this.nextSetSuggestedWeight = nextWeight;
        }

        await this.showCoachingAdvice();
        this.renderSeries();
    }
    
    async showCoachingAdvice() {
        const adviceCard = document.getElementById('coaching-advice');
        const metaRow = document.getElementById('coaching-progress-meta');
        const decisionCard = document.getElementById('coach-decision-card');
        const statusRow = document.getElementById('coaching-status-row');
        const fatiguePill = document.getElementById('coaching-fatigue-pill');
        const fatigueInfoBtn = document.getElementById('btn-coach-fatigue-info');
        if (!this.currentSlot) {
            adviceCard.style.display = 'none';
            if (metaRow) metaRow.style.display = 'none';
            if (decisionCard) decisionCard.style.display = 'none';
            return;
        }
        
        // Use stored advice or calculate if not available
        const advice = this.currentCoachingAdvice || await this.getEnhancedCoachingAdvice(this.currentSlot);
        
        if (!advice) {
            adviceCard.style.display = 'none';
            if (metaRow) metaRow.style.display = 'none';
            if (decisionCard) decisionCard.style.display = 'none';
            return;
        }

        this.currentCoachingAdvice = advice;
        const currentSlot = this.normalizeSlotProgressionConfig({ ...this.currentSlot });
        const setPlan = this.buildCoachSetPlan(currentSlot, advice);
        this.toggleCoachAdviceDrawer(false);
        
        // Remove all advice classes and add the new one
        adviceCard.className = 'coaching-advice advice-' + advice.type;
        adviceCard.style.display = 'block';
        
        // Update icon and title
        const iconEl = document.getElementById('coaching-advice-icon');
        iconEl.innerHTML = this.getAdviceIconSVG(advice.icon || advice.type);

        document.getElementById('coaching-advice-title').textContent = advice.title;
        document.getElementById('coaching-advice-message').innerHTML = this.formatCoachAdviceMessage(advice, currentSlot, setPlan);
        const adviceChip = document.getElementById('coaching-advice-chip');
        if (adviceChip) {
            adviceChip.textContent = this.getCoachCardChipText(advice, currentSlot, setPlan);
        }

        const fatigueMeta = this.getCoachFatiguePill(advice);
        if (statusRow && fatiguePill && fatigueInfoBtn) {
            if (fatigueMeta) {
                statusRow.style.display = 'flex';
                fatiguePill.textContent = fatigueMeta.label;
                fatiguePill.className = `coaching-status-pill ${fatigueMeta.className}`;
                fatigueInfoBtn.style.display = 'inline-flex';
            } else {
                statusRow.style.display = 'none';
            }
        }

        const weightLabelEl = document.getElementById('coaching-suggested-weight-label');
        if (weightLabelEl) {
            weightLabelEl.textContent = currentSlot.progressionMode === 'bodyweight'
                ? currentSlot.bodyweightProfile?.allowAssistance
                    ? 'Assistance cible'
                    : currentSlot.bodyweightProfile?.allowExternalLoad
                        ? 'Lest cible'
                        : 'Mode'
                : 'Charge cible';
        }
        
        // Update suggested weight with trend arrow
        document.getElementById('coaching-suggested-weight').textContent = this.formatSuggestedWeightDisplay(advice);
        
        const trendEl = document.getElementById('coaching-weight-trend');
        const displayTrend = advice.weightTrend === 'neutral' ? 'same' : (advice.weightTrend || 'same');
        const isBodyweightNoLoad = currentSlot.progressionMode === 'bodyweight'
            && !currentSlot.bodyweightProfile?.allowExternalLoad
            && !currentSlot.bodyweightProfile?.allowAssistance;
        trendEl.className = 'coaching-weight-trend trend-' + displayTrend;
        trendEl.innerHTML = this.getTrendArrowSVG(displayTrend);
        trendEl.style.display = isBodyweightNoLoad ? 'none' : 'inline-flex';
        
        // Update suggested reps
        document.getElementById('coaching-suggested-reps').textContent = advice.suggestedReps;
        this.syncExerciseProgressionControls(advice);
        
        const setsContainer = document.getElementById('coaching-suggested-sets-container');
        const setsLabel = document.getElementById('coaching-suggested-sets-label');
        if (setsContainer) {
            if (setPlan.reductionAccepted) {
                setsContainer.style.display = 'block';
                if (setsLabel) setsLabel.textContent = 'Volume validé';
                const deltaLabel = `${setPlan.displayDelta}`;
                document.getElementById('coaching-suggested-sets').innerHTML =
                    `${setPlan.activeTargetSets} séries <span class="volume-adjustment-badge decrease">${deltaLabel}</span>`;
            } else if (setPlan.showReductionPrompt) {
                setsContainer.style.display = 'block';
                if (setsLabel) setsLabel.textContent = 'Suggestion coach';
                const deltaLabel = `${setPlan.displayDelta}`;
                document.getElementById('coaching-suggested-sets').innerHTML =
                    `${setPlan.suggestedReductionSets} séries suggérées <span class="volume-adjustment-badge decrease">${deltaLabel}</span>`;
            } else if (setPlan.hasOptionalIncrease) {
                setsContainer.style.display = 'block';
                if (setsLabel) setsLabel.textContent = 'Volume possible';
                const deltaLabel = `+${setPlan.optionalDelta}`;
                document.getElementById('coaching-suggested-sets').innerHTML =
                    `${setPlan.increaseCandidate.sets} séries <span class="volume-adjustment-badge increase">${deltaLabel}</span>`;
            } else {
                setsContainer.style.display = 'none';
            }
        }
        
        const backoffContainer = document.getElementById('coaching-backoff-container');
        if (backoffContainer) {
            if (advice.backOffWeight && advice.topSetProgression) {
                backoffContainer.style.display = 'block';
                document.getElementById('coaching-backoff-weight').textContent = advice.backOffWeight + ' kg';
            } else {
                backoffContainer.style.display = 'none';
            }
        }
        const suggestionGrid = document.getElementById('coaching-suggestion-grid');
        if (suggestionGrid) {
            const hasVisibleExtras = (setsContainer && setsContainer.style.display !== 'none')
                || (backoffContainer && backoffContainer.style.display !== 'none');
            suggestionGrid.classList.toggle('coaching-suggestion-grid-compact', !hasVisibleExtras);
        }

        this.renderCoachDecisionHistory(advice, currentSlot);
    }
    
    getTrendArrowSVG(trend) {
        if (trend === 'up') {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>`;
        } else if (trend === 'down') {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>`;
        } else {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M5 12h14"/>
            </svg>`;
        }
    }

    getAdviceIconSVG(iconKey) {
        switch (iconKey) {
            case 'new':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"/>
                    <circle cx="12" cy="12" r="9"/>
                </svg>`;
            case 'increase':
            case 'up':
            case 'volume_up':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>`;
            case 'celebrate':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2l2.09 4.24L18 7l-3 3 1 4-4-2-4 2 1-4-3-3 3.91-.76L12 2z"/>
                </svg>`;
            case 'decrease':
            case 'down':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>`;
            case 'warning':
            case 'deload_mini':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 9v4"/>
                    <path d="M12 17h.01"/>
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                </svg>`;
            case 'target':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="8"/>
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
                </svg>`;
            case 'switch':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 12h7l-3 3 3 3H2z"/>
                    <path d="M22 12h-7l3-3-3-3h7z"/>
                </svg>`;
            case 'intensify':
            case 'lightning':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>`;
            case 'very_hot':
            case 'fire':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2c0 4-4 6-4 10a4 4 0 108 0c0-4-4-6-4-10z"/>
                    <path d="M12 12c0 2-2 3-2 5a2 2 0 104 0c0-2-2-3-2-5z"/>
                </svg>`;
            case 'very_cold':
            case 'snowflake':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v20M2 12h20"/>
                    <path d="M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>`;
            case 'maintain':
            default:
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12h18"/>
                    <path d="M7 8v8"/>
                    <path d="M17 8v8"/>
                </svg>`;
        }
    }
    
    async calculateCoachingAdvice() {
        // Legacy entry point kept for compatibility only.
        // The unified progression router now owns all live coaching decisions.
        if (this.currentSlot) {
            return this.calculateCoachingAdviceForSlot(this.currentSlot);
        }

        const slot = this.normalizeSlotProgressionConfig({ ...this.currentSlot });
        this.currentSlot = slot;
        const exerciseId = slot.activeExercise || slot.name;
        const isIsolation = slot.type === 'isolation';
        
        // Get settings with ?? to handle 0 values correctly
        const failureThreshold = (await db.getSetting('failureCount')) ?? 5;
        const deloadPercent = (await db.getSetting('deloadPercent')) ?? 10;
        const baseWeightIncrement = (await db.getSetting('weightIncrement')) ?? 2;
        
        // Check if deload mode is active
        const isDeloadMode = this.isDeloadMode || (await db.getSetting('isDeloadMode')) || false;
        const deloadIntensityReduction = (await db.getSetting('deloadPercent')) ?? 10;
        
        // === LMS INTEGRATION: Get local muscle soreness data ===
        const lmsData = await this.getLMSDataForSlot(slot);
        this.currentLMSData = lmsData; // Store for UI display
        
        // === HYPERTROPHY-OPTIMIZED PARAMETERS ===
        // Isolation: micro-loading (+0.5-1kg), Compound: +2.5kg
        const weightIncrement = isIsolation ? Math.min(baseWeightIncrement, 1) : baseWeightIncrement;
        // Isolation: RPE 10 allowed, Compound: max RPE 9 for safety
        const maxSafeRpe = isIsolation ? 10 : 9;
        
        // VOLUME MANAGEMENT: Track current slot sets for potential volume ramp
        // Apply LMS adjustment if available
        let currentProgrammedSets = slot.sets || 3;
        if (lmsData && lmsData.adjustedSets !== undefined) {
            currentProgrammedSets = lmsData.adjustedSets;
        }
        const maxSetsPerExercise = isIsolation ? 6 : 5; // MRV caps (scientific: diminishing returns)
        const minSetsPerExercise = 2; // MEV floor
        
        // Get all set history for this exercise
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        
        // Group by workout with per-set analysis
        const workoutGroups = {};
        for (const set of allSetHistory) {
            if (!workoutGroups[set.workoutId]) {
                workoutGroups[set.workoutId] = {
                    date: set.date,
                    sets: [],
                    totalReps: 0,
                    maxWeight: 0
                };
            }
            workoutGroups[set.workoutId].sets.push(set);
            workoutGroups[set.workoutId].totalReps += set.reps || 0;
            workoutGroups[set.workoutId].maxWeight = Math.max(workoutGroups[set.workoutId].maxWeight, set.weight || 0);
        }
        
        // Calculate metrics for each workout
        for (const wId of Object.keys(workoutGroups)) {
            const sets = workoutGroups[wId].sets;
            // Check if any set has real RPE data (not fallback)
            const setsWithRpe = sets.filter(s => s.rpe != null);
            workoutGroups[wId].hasRealRpe = setsWithRpe.length > 0;
            
            // Calculate avgRpe only from real data, or null if none
            if (setsWithRpe.length > 0) {
                workoutGroups[wId].avgRpe = setsWithRpe.reduce((sum, s) => sum + s.rpe, 0) / setsWithRpe.length;
            } else {
                workoutGroups[wId].avgRpe = null;
            }
            
            // Sort sets by setNumber
            sets.sort((a, b) => a.setNumber - b.setNumber);
        }
        
        // Sort workouts by date (most recent first)
        const workouts = Object.values(workoutGroups).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        
        // Build dynamic target reps based on slot.sets
        const targetRepsArray = this.genTargetReps(slot.repsMin, slot.repsMax, slot.sets);
        const targetReps = this.formatTargetReps(targetRepsArray);
        
        // Store exercise type info
        this.currentExerciseType = isIsolation ? 'isolation' : 'compound';
        this.currentMaxSafeRpe = maxSafeRpe;
        
        // === HOT/COLD DAY DETECTION (store average for use after set 1) ===
        if (workouts.length >= 3) {
            const last3Workouts = workouts.slice(0, 3);
            const avgFirstSetWeight = last3Workouts.reduce((sum, w) => sum + (w.sets[0]?.weight || 0), 0) / 3;
            const avgFirstSetReps = last3Workouts.reduce((sum, w) => sum + (w.sets[0]?.reps || 0), 0) / 3;
            this.avgPerformance = { weight: avgFirstSetWeight, reps: avgFirstSetReps };
        } else {
            this.avgPerformance = null;
        }
        
        // ===================================================================
        // === ADVANCED HYPERTROPHY ENGINE INTEGRATION ===
        // ===================================================================
        
        // Calculate historical best e1RM for reference
        let historicalBestE1RM = 0;
        for (const w of workouts) {
            for (const s of w.sets) {
                const e = this.calculateE1RM(s.weight, s.reps, s.rpe || 8);
                if (e > historicalBestE1RM) historicalBestE1RM = e;
            }
        }
        
        // Store for later use
        this.currentHistoricalBestE1RM = historicalBestE1RM;
        
        // Run advanced analysis if we have enough data
        let advancedAnalysis = null;
        if (workouts.length >= 2) {
            const lastWorkout = workouts[0];
            
            // Calculate current session e1RM
            const currentE1RM = Math.max(...lastWorkout.sets.map(s => 
                this.calculateE1RM(s.weight, s.reps, s.rpe || 8)
            ), 0);
            
            // Effective sets analysis
            const effectiveData = this.calculateEffectiveSets(lastWorkout.sets, historicalBestE1RM);
            
            // Sandbagging detection
            const sandbaggingCheck = this.detectSandbagging(lastWorkout.sets, historicalBestE1RM);
            
            // SFR calculation
            const sfrData = this.calculateSFR(exerciseId, lastWorkout.sets, historicalBestE1RM);
            
            // Fatigue phenotype
            const phenotype = this.inferFatiguePhenotype(workouts);
            
            // e1RM trend analysis
            const e1rmTrend = this.analyzeE1RMTrend(workouts);
            
            // Reactive deload check
            const fatigueScore = await this.calculateFatigueScore(exerciseId, workouts);
            const deloadCheck = this.shouldTriggerReactiveDeload(workouts, fatigueScore);
            
            // Performance trend
            let performanceTrend = 'stalled';
            if (workouts.length >= 2) {
                const prevE1RM = Math.max(...workouts[1].sets.map(s => 
                    this.calculateE1RM(s.weight, s.reps, s.rpe || 8)
                ), 0);
                
                if (currentE1RM > prevE1RM * 1.01) {
                    performanceTrend = 'improved';
                } else if (currentE1RM < prevE1RM * 0.97) {
                    performanceTrend = 'regressed';
                }
            }
            
            // Volume adjustment recommendation (Israetel Matrix)
            const volumeAdjustment = this.getVolumeAdjustment(
                performanceTrend,
                lastWorkout.avgRpe,
                currentProgrammedSets,
                maxSetsPerExercise
            );
            
            advancedAnalysis = {
                currentE1RM,
                historicalBestE1RM,
                e1rmPercentOfBest: historicalBestE1RM > 0 ? Math.round((currentE1RM / historicalBestE1RM) * 100) : 100,
                effectiveSets: effectiveData.effectiveSets,
                effectiveDetails: effectiveData.details,
                sandbagging: sandbaggingCheck,
                sfr: sfrData,
                phenotype,
                e1rmTrend,
                performanceTrend,
                volumeAdjustment,
                fatigueScore,
                deloadRecommendation: deloadCheck
            };
        }
        
        // Store advanced analysis for display
        this.currentAdvancedAnalysis = advancedAnalysis;
        
        // === REACTIVE DELOAD CHECK (Priority 1) ===
        // If multiple fatigue signals detected, recommend deload BEFORE other advice
        if (advancedAnalysis?.deloadRecommendation?.shouldDeload && !isDeloadMode) {
            const signals = advancedAnalysis.deloadRecommendation.signals;
            const activeCount = Object.values(signals).filter(Boolean).length;
            const signalMessages = [];
            if (signals.e1rmDecline) signalMessages.push('e1RM en baisse');
            if (signals.highFatigue) signalMessages.push('fatigue chronique');
            if (signals.consecutiveStalls) signalMessages.push('3+ séances stagnantes');
            if (signals.rpeCreep) signalMessages.push('effort croissant');
            
            return {
                type: 'reactive_deload',
                icon: 'warning',
                title: '🔋 Semaine légère conseillée',
                message: `Ton corps montre des signes de fatigue. Fais ${Math.max(2, Math.ceil(slot.sets * 0.5))} séries au lieu de ${slot.sets} pour récupérer et revenir plus fort.`,
                suggestedWeight: workouts[0]?.maxWeight || '?',
                weightTrend: 'same',
                suggestedReps: targetReps,
                suggestedSets: Math.max(2, Math.ceil(slot.sets * 0.5)),
                advancedData: advancedAnalysis
            };
        }
        
        // === SANDBAGGING OVERRIDE ===
        // If sandbagging detected with high confidence, force progression
        if (advancedAnalysis?.sandbagging?.detected && advancedAnalysis.sandbagging.confidence >= 0.5) {
            const reasons = advancedAnalysis.sandbagging.reasons;
            const action = advancedAnalysis.sandbagging.suggestedAction;
            
            if (action === 'amrap_test') {
                return {
                    type: 'amrap_test',
                    icon: 'lightning',
                    title: '⚡ Pousse tes limites !',
                    message: `Ta dernière série : fais le maximum de reps possible pour voir ton vrai niveau.`,
                    suggestedWeight: workouts[0]?.maxWeight || '?',
                    weightTrend: 'same',
                    suggestedReps: `${targetReps} puis MAX`,
                    amrapSet: true,
                    advancedData: advancedAnalysis
                };
            } else {
                // Force linear increase
                const forceWeight = Math.round((workouts[0]?.maxWeight || 0) * 1.05 * 2) / 2;
                return {
                    type: 'force_increase',
                    icon: 'lightning',
                    title: '⚡ Challenge !',
                    message: `Tu as de la marge ! Essaie ${forceWeight}kg. Si c'est trop dur, tu peux revenir en arrière.`,
                    suggestedWeight: forceWeight,
                    weightTrend: 'up',
                    suggestedReps: targetReps,
                    advancedData: advancedAnalysis
                };
            }
        }
        
        // === CASE 1: First time on this exercise ===
        if (workouts.length === 0) {
            return {
                type: 'new',
                icon: 'new',
                title: 'Nouvel exercice',
                message: `Première fois ! Commence léger, maîtrise la technique. Vise ${slot.repsMax} reps.`,
                suggestedWeight: '?',
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        const lastWorkout = workouts[0];
        const lastSets = lastWorkout.sets;
        // Use reference weight (top set for ramp, first set otherwise)
        let lastWeight = this.getReferenceWeight(lastWorkout, slot);
        const progressionContext = await this.buildProgressionContext(slot);

        if (slot.progressionMode === 'bodyweight') {
            const advice = this.getBodyweightProgressionAdvice(slot, progressionContext);
            const constrainedAdvice = this.enforceProgressionConstraints(advice, slot, progressionContext);
            await this.syncSlotProgressionStateFromAdvice(slot, constrainedAdvice, progressionContext);
            return constrainedAdvice;
        }

        if (slot.progressionMode === 'capped_load') {
            const advice = this.getCappedLoadProgressionAdvice(slot, progressionContext);
            const constrainedAdvice = this.enforceProgressionConstraints(advice, slot, progressionContext);
            await this.syncSlotProgressionStateFromAdvice(slot, constrainedAdvice, progressionContext);
            return constrainedAdvice;
        }
        
        // === SMART PATTERN ANALYSIS ===
        const patternAnalysis = this.analyzeWorkoutPattern(lastSets, slot);
        const wasDroppedMidSession = patternAnalysis?.analysis?.droppedMidSession || false;
        const firstSetWasTooHeavy = patternAnalysis?.analysis?.firstSetTooHeavy || false;
        const stabilizedWeight = patternAnalysis?.analysis?.stabilizedWeight;
        const originalFirstWeight = patternAnalysis?.analysis?.originalFirstWeight;
        
        // === CRITICAL: Handle "dropped mid-session" pattern ===
        // This is when user started heavier but had to drop weight to maintain reps
        // Example: 38kg x 8, then 34kg x 10 x 3 → real working weight is 34kg
        if (wasDroppedMidSession && stabilizedWeight && originalFirstWeight) {
            // Analyze performance at the STABILIZED weight (not the failed first set)
            const setsAtStabilized = lastSets.filter(s => Math.abs(s.weight - stabilizedWeight) <= 1);
            const avgRepsAtStabilized = setsAtStabilized.length > 0 
                ? setsAtStabilized.reduce((sum, s) => sum + s.reps, 0) / setsAtStabilized.length 
                : 0;
            const allStabilizedHitMax = setsAtStabilized.every(s => s.reps >= slot.repsMax);
            const mostStabilizedHitMax = setsAtStabilized.filter(s => s.reps >= slot.repsMax).length >= Math.ceil(setsAtStabilized.length * 0.75);
            
            // If they hit targets at stabilized weight, suggest staying there or small increase
            if (allStabilizedHitMax && setsAtStabilized.length >= 2) {
                // Great performance at lower weight - try a SMALL increase next time
                const conservativeIncrement = isIsolation ? 1 : weightIncrement;
                const newWeight = Math.round((stabilizedWeight + conservativeIncrement) * 2) / 2;
                return {
                    type: 'increase',
                    icon: 'increase',
                    title: 'Ajustement validé 👍',
                    message: `Tu as baissé après la première série (${originalFirstWeight}kg → ${stabilizedWeight}kg) et tu as tenu les cibles. On teste un petit plus: ${newWeight}kg sur TOUTES les séries pour confirmer.`,
                    suggestedWeight: newWeight,
                    weightTrend: 'up',
                    suggestedReps: targetReps
                };
            } else if (mostStabilizedHitMax) {
                // Good performance - maintain the stabilized weight
                return {
                    type: 'maintain',
                    icon: 'target',
                    title: 'Bonne adaptation 💪',
                    message: `${stabilizedWeight}kg était le bon choix après ${originalFirstWeight}kg. Reste à ${stabilizedWeight}kg pour TOUTES les séries et vise ${targetReps}.`,
                    suggestedWeight: stabilizedWeight,
                    weightTrend: 'same',
                    suggestedReps: targetReps
                };
            } else {
                // Still struggling at stabilized weight
                return {
                    type: 'maintain',
                    icon: 'target',
                    title: 'Stabilise d\'abord',
                    message: `Tu as ajusté à ${stabilizedWeight}kg. Reste à ce poids sur TOUTES les séries jusqu'à valider ${targetReps} avant d'augmenter.`,
                    suggestedWeight: stabilizedWeight,
                    weightTrend: 'same',
                    suggestedReps: targetReps
                };
            }
        }
        
        // === DELOAD MODE: SCIENTIFIC APPROACH - Maintain intensity, reduce VOLUME ===
        // Research shows: intensity maintenance preserves strength, volume reduction allows recovery
        if (isDeloadMode) {
            // KEEP INTENSITY (weight), REDUCE VOLUME (sets by 40-50%)
            const deloadSets = Math.max(2, Math.ceil(slot.sets * 0.5));
            const deloadReps = this.formatTargetReps(this.genTargetReps(slot.repsMin, slot.repsMax, deloadSets));
            
            return {
                type: 'deload',
                icon: 'maintain',
                title: '🔋 Semaine de récupération',
                message: `GARDE la charge (${lastWeight}kg) mais fais seulement ${deloadSets} séries. L'intensité préserve tes acquis, le volume réduit permet la surcompensation.`,
                suggestedWeight: lastWeight, // MAINTAIN intensity!
                weightTrend: 'same',
                suggestedReps: deloadReps,
                isDeload: true,
                deloadSets: deloadSets,
                scienceNote: 'Maintenir l\'intensité, réduire le volume = récupération optimale sans désentraînement'
            };
        }
        const hasRealRpe = lastWorkout.hasRealRpe;
        const lastAvgRpe = lastWorkout.avgRpe;
        
        // === EFFECTIVE REPS CALCULATION (only if RPE data exists) ===
        let effectiveRepsPerSet = null;
        if (hasRealRpe) {
            const setsWithRpe = lastSets.filter(s => s.rpe != null);
            // Calculate e1RM reference from best set for intensity-based effective reps
            const bestSet = lastSets.reduce((best, s) => {
                const e1rm = this.e1rm(s.weight, s.reps);
                return e1rm > (best?.e1rm || 0) ? { ...s, e1rm } : best;
            }, null);
            const e1rmRef = bestSet?.e1rm || null;
            
            const totalEffective = setsWithRpe.reduce((sum, s) => {
                // Pass weight and e1RM for intensity-aware effective reps calculation
                return sum + (this.effectiveRepsFromSet(s.reps, s.rpe, s.weight, e1rmRef) || 0);
            }, 0);
            effectiveRepsPerSet = setsWithRpe.length > 0 ? totalEffective / setsWithRpe.length : null;
        }
        
        // Effort thresholds for effective reps
        const LOW_EFF = 1.5;  // per set average - too easy
        const HIGH_EFF = 3.0; // per set average - hard effort
        
        // === ANALYZE SETS WITH TARGET REPS (not just repsMax) ===
        const firstSet = lastSets[0];
        const firstSetReps = firstSet?.reps || 0;
        const firstSetRpe = firstSet?.rpe;
        const firstSetHitMax = firstSetReps >= slot.repsMax;
        const firstSetBelowMin = firstSetReps < slot.repsMin;
        
        // Check if sets hit their TARGET reps (from genTargetReps, e.g. 10/10/9/7)
        const enoughSets = lastSets.length >= slot.sets;
        const allSetsHitMax = enoughSets && lastSets.every(s => (s.reps || 0) >= slot.repsMax);
        
        // NEW: Check if sets hit their individual targets (more realistic)
        let setsHitTargets = 0;
        let totalTargetDeficit = 0;
        for (let i = 0; i < lastSets.length; i++) {
            const setReps = lastSets[i]?.reps || 0;
            const targetForSet = targetRepsArray[i] || slot.repsMax;
            if (setReps >= targetForSet) {
                setsHitTargets++;
            }
            totalTargetDeficit += Math.max(0, targetForSet - setReps);
        }
        const allSetsHitTargets = enoughSets && setsHitTargets >= slot.sets;
        const mostSetsHitTargets = enoughSets && setsHitTargets >= Math.ceil(slot.sets * 0.75); // 75%+
        
        // RPE-based progression signals
        const avgRpeForSession = hasRealRpe && lastAvgRpe !== null ? lastAvgRpe : 8;
        const isLowEffort = avgRpeForSession <= 7;
        const isHighInRange = firstSetReps >= slot.repsMax - 1; // Within 1 rep of max
        
        // === CASE 2: Only one workout ===
        if (workouts.length === 1) {
            // Priority 1: All sets hit targets OR all sets hit max → increase
            if (allSetsHitTargets || allSetsHitMax) {
                let increment = weightIncrement;
                if (isLowEffort) {
                    increment = isIsolation ? weightIncrement : weightIncrement * 1.5;
                }
                const newWeight = Math.round((lastWeight + increment) * 2) / 2;
                return {
                    type: 'increase',
                    icon: 'increase',
                    title: 'Objectifs atteints ! 🎯',
                    message: `Toutes les cibles validées${isLowEffort ? ' et effort modéré' : ''} ! Passe à ${newWeight}kg.`,
                    suggestedWeight: newWeight,
                    weightTrend: 'up',
                    suggestedReps: targetReps
                };
            }
            
            // Priority 2: Low effort + high in range → increase anyway
            if (isLowEffort && isHighInRange) {
                const newWeight = Math.round((lastWeight + weightIncrement) * 2) / 2;
                return {
                    type: 'increase',
                    icon: 'increase',
                    title: 'Trop facile ! 💪',
                    message: `RPE ${avgRpeForSession} avec ${firstSetReps} reps = marge de progression. Tente ${newWeight}kg !`,
                    suggestedWeight: newWeight,
                    weightTrend: 'up',
                    suggestedReps: targetReps
                };
            }
            
            // Priority 3: Below minimum with high effort → decrease
            if (firstSetBelowMin) {
                if (hasRealRpe && firstSetRpe != null && firstSetRpe >= 9) {
                    const newWeight = Math.round(lastWeight * (1 - deloadPercent / 100) * 2) / 2;
                    return {
                        type: 'decrease',
                        icon: 'warning',
                        title: 'Charge trop élevée',
                        message: `Sous ${slot.repsMin} reps malgré effort max. Baisse à ${newWeight}kg.`,
                        suggestedWeight: newWeight,
                        weightTrend: 'down',
                        suggestedReps: targetReps
                    };
                } else if (hasRealRpe && firstSetRpe != null && firstSetRpe < 8) {
                    return {
                        type: 'maintain',
                        icon: 'target',
                        title: 'Pousse plus fort !',
                        message: `Reps basses mais effort faible. Engage-toi plus vers RPE 8-9 !`,
                        suggestedWeight: lastWeight,
                        weightTrend: 'same',
                        suggestedReps: targetReps
                    };
                } else {
                    const newWeight = Math.round(lastWeight * (1 - deloadPercent / 100) * 2) / 2;
                    return {
                        type: 'decrease',
                        icon: 'warning',
                        title: 'Ajuste la charge',
                        message: `Sous ${slot.repsMin} reps. Essaie ${newWeight}kg.`,
                        suggestedWeight: newWeight,
                        weightTrend: 'down',
                        suggestedReps: targetReps
                    };
                }
            }
            
            return {
                type: 'maintain',
                icon: 'target',
                title: 'Continue comme ça',
                message: `Objectif : atteindre les cibles (${targetReps}) avec RPE 8-9.`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        // === CASE 3: Multiple workouts - SMART MULTI-SESSION ANALYSIS ===
        const prevWorkout = workouts[1];
        const prevSets = prevWorkout.sets;
        const prevWeight = this.getReferenceWeight(prevWorkout, slot);
        const prevFirstSet = prevSets[0];
        const prevFirstReps = prevFirstSet?.reps || 0;
        
        // Analyze previous session pattern too
        const prevPatternAnalysis = this.analyzeWorkoutPattern(prevSets, slot);
        const prevWasDropped = prevPatternAnalysis?.analysis?.droppedMidSession || false;
        
        // === MULTI-SESSION TREND ANALYSIS ===
        // Look at the last 3-5 sessions to understand the real trend
        let consistentWeight = null;
        let weightTrend = 'stable'; // 'increasing', 'decreasing', 'stable', 'volatile'
        
        if (workouts.length >= 3) {
            const recentWeights = workouts.slice(0, Math.min(5, workouts.length)).map(w => {
                const analysis = this.analyzeWorkoutPattern(w.sets, slot);
                return analysis?.referenceWeight || w.sets[0]?.weight || 0;
            }).filter(w => w > 0);
            
            if (recentWeights.length >= 3) {
                // Check if weights are consistent (within 2kg)
                const maxRecent = Math.max(...recentWeights);
                const minRecent = Math.min(...recentWeights);
                
                if (maxRecent - minRecent <= 2) {
                    consistentWeight = recentWeights[0]; // Most recent
                    weightTrend = 'stable';
                } else {
                    // Check direction
                    const increasing = recentWeights[0] > recentWeights[recentWeights.length - 1];
                    const decreasing = recentWeights[0] < recentWeights[recentWeights.length - 1];
                    weightTrend = increasing ? 'increasing' : (decreasing ? 'decreasing' : 'volatile');
                }
            }
        }
        
        // === DETECT REPEATED DROPS: User keeps starting too heavy ===
        if (wasDroppedMidSession && prevWasDropped) {
            // User has dropped weight mid-session 2x in a row - they're consistently starting too heavy
            const suggestedStart = stabilizedWeight || lastWeight;
            return {
                type: 'maintain',
                icon: 'warning',
                title: 'Pattern détecté 📊',
                message: `Tu commences trop lourd 2 séances de suite. Démarre directement à ${suggestedStart}kg pour toutes les séries.`,
                suggestedWeight: suggestedStart,
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        // === DETECT FAILED INCREASE: Weight went up but reps dropped significantly ===
        const weightIncreased = lastWeight > prevWeight;
        const repsDropped = firstSetReps < prevFirstReps - 2; // Dropped by more than 2 reps
        const belowMinAfterIncrease = weightIncreased && firstSetBelowMin;
        
        if (belowMinAfterIncrease || (weightIncreased && repsDropped && firstSetReps < slot.repsMin + 1)) {
            // The increase was too aggressive - suggest going back
            return {
                type: 'decrease',
                icon: 'decrease',
                title: 'Augmentation trop rapide',
                message: `L'augmentation à ${lastWeight}kg était ambitieuse. Reviens à ${prevWeight}kg et valide les cibles avant de remonter.`,
                suggestedWeight: prevWeight,
                weightTrend: 'down',
                suggestedReps: targetReps
            };
        }
        
        // === SIGNAL VS NOISE: Check if previous session also hit targets (trend confirmation) ===
        let prevSessionHitTargets = false;
        if (workouts.length >= 2) {
            const prevSets = prevWorkout.sets;
            let prevSetsHitTargets = 0;
            for (let i = 0; i < prevSets.length; i++) {
                const setReps = prevSets[i]?.reps || 0;
                const targetForSet = targetRepsArray[i] || slot.repsMax;
                if (setReps >= targetForSet) prevSetsHitTargets++;
            }
            prevSessionHitTargets = prevSets.length >= slot.sets && prevSetsHitTargets >= Math.ceil(slot.sets * 0.75);
        }
        
        // For compounds: require 2 consecutive sessions of hitting targets (signal confirmation)
        // For isolation: 1 session is enough (can be more aggressive)
        const signalConfirmed = isIsolation || prevSessionHitTargets || workouts.length === 1;
        
        // === PRIORITY 1: Check if targets are hit → INCREASE ===
        if (allSetsHitTargets || allSetsHitMax) {
            let increment = weightIncrement;
            if (isLowEffort) {
                increment = isIsolation ? weightIncrement : weightIncrement * 1.5;
            }
            const newWeight = Math.round((lastWeight + increment) * 2) / 2;
            
            // For compounds without signal confirmation: suggest maintaining but encourage
            if (!signalConfirmed) {
                return {
                    type: 'maintain',
                    icon: 'target',
                    title: 'Bien joué ! 👍',
                    message: `Cibles atteintes ! Refais ${lastWeight}kg la prochaine fois pour confirmer, puis on augmente.`,
                    suggestedWeight: lastWeight,
                    weightTrend: 'same',
                    suggestedReps: targetReps
                };
            }
            
            return {
                type: 'increase',
                icon: 'celebrate',
                title: 'Progression validée ! 🎉',
                message: `Cibles atteintes${!isIsolation && prevSessionHitTargets ? ' 2x de suite' : ''} à ${lastWeight}kg ! Passe à ${newWeight}kg.`,
                suggestedWeight: newWeight,
                weightTrend: 'up',
                suggestedReps: targetReps
            };
        }
        
        // === PRIORITY 2: Low effort + high in range → INCREASE (more aggressive for isolation) ===
        if (isLowEffort && isHighInRange) {
            const newWeight = Math.round((lastWeight + weightIncrement) * 2) / 2;
            
            // For isolation: always increase on low effort
            // For compounds: only if we have signal confirmation OR it's really too easy (RPE <= 6)
            if (isIsolation || signalConfirmed || avgRpeForSession <= 6) {
                return {
                    type: 'increase',
                    icon: 'increase',
                    title: 'C\'est trop facile ! 💪',
                    message: `RPE ${avgRpeForSession} avec ${firstSetReps} reps = marge de progression. Monte à ${newWeight}kg !`,
                    suggestedWeight: newWeight,
                    weightTrend: 'up',
                    suggestedReps: targetReps
                };
            }
        }
        
        // === PRIORITY 3: Most sets hit targets + decent effort → INCREASE (with signal check) ===
        if (mostSetsHitTargets && !isLowEffort) {
            const newWeight = Math.round((lastWeight + weightIncrement) * 2) / 2;
            
            // For compounds without confirmation: encourage maintaining
            if (!isIsolation && !signalConfirmed) {
                return {
                    type: 'maintain',
                    icon: 'target',
                    title: 'Presque ! 💪',
                    message: `${setsHitTargets}/${slot.sets} séries validées. Confirme à ${lastWeight}kg puis on augmente !`,
                    suggestedWeight: lastWeight,
                    weightTrend: 'same',
                    suggestedReps: targetReps
                };
            }
            
            return {
                type: 'increase',
                icon: 'increase',
                title: 'Quasi parfait ! 🚀',
                message: `${setsHitTargets}/${slot.sets} séries validées. Tente ${newWeight}kg !`,
                suggestedWeight: newWeight,
                weightTrend: 'up',
                suggestedReps: targetReps
            };
        }
        
        // === PRIORITY 4: TOP-SET PROGRESSION (Reverse Pyramid Style) ===
        // Scientific basis: Allows higher mechanical tension on fresh muscles
        // User can push S1 heavier, then use back-off sets for volume
        const s1WasAtReferenceWeight = Math.abs(firstSet.weight - lastWeight) < 1;
        const s1HadGoodEffort = !hasRealRpe || (firstSetRpe != null && firstSetRpe >= 7);
        
        if (firstSetHitMax && s1WasAtReferenceWeight) {
            const newTopSetWeight = Math.round((lastWeight + weightIncrement) * 2) / 2;
            const backOffWeight = lastWeight; // Keep current weight for back-off sets
            
            // For ISOLATION: more aggressive, can increase on S1 alone
            if (isIsolation) {
                return {
                    type: 'increase',
                    icon: 'increase',
                    title: '🚀 Top set validée !',
                    message: `${slot.repsMax} reps sur S1 = prêt pour ${newTopSetWeight}kg. Tu peux faire tes autres séries à ${backOffWeight}kg si besoin (back-off).`,
                    suggestedWeight: newTopSetWeight,
                    weightTrend: 'up',
                    suggestedReps: targetReps,
                    topSetProgression: true,
                    backOffWeight: backOffWeight
                };
            }
            // For COMPOUNDS: Top-set first, back-off sets formalized
            else if (s1HadGoodEffort && setsHitTargets >= Math.ceil(slot.sets * 0.5)) {
                return {
                    type: 'increase',
                    icon: 'increase',
                    title: '🎯 Progression Top-Set',
                    message: `S1 à ${slot.repsMax} reps ! Monte à ${newTopSetWeight}kg sur S1 (top set), puis ${backOffWeight}kg sur S2-S${slot.sets} (back-off -10%). C'est du Reverse Pyramid !`,
                    suggestedWeight: newTopSetWeight,
                    weightTrend: 'up',
                    suggestedReps: targetReps,
                    topSetProgression: true,
                    backOffWeight: backOffWeight,
                    scienceNote: 'Top set = tension max sur muscles frais, back-off = volume additionnel'
                };
            }
        }
        
        // === PRIORITY 5: Below minimum → DECREASE ===
        if (firstSetBelowMin) {
            const shouldDecrease = !hasRealRpe || (firstSetRpe != null && firstSetRpe >= 8);
            if (shouldDecrease) {
                const newWeight = Math.round(lastWeight * (1 - deloadPercent / 100) * 2) / 2;
                return {
                    type: 'decrease',
                    icon: 'decrease',
                    title: 'Ajustement nécessaire',
                    message: `Sous ${slot.repsMin} reps malgré l'effort. Baisse à ${newWeight}kg pour progresser dans la bonne plage.`,
                    suggestedWeight: newWeight,
                    weightTrend: 'down',
                    suggestedReps: targetReps
                };
            } else {
                return {
                    type: 'maintain',
                    icon: 'target',
                    title: 'Engage-toi plus ! 💪',
                    message: `Reps basses mais effort modéré. Pousse vers RPE 8-9 pour valider la charge !`,
                    suggestedWeight: lastWeight,
                    weightTrend: 'same',
                    suggestedReps: targetReps
                };
            }
        }
        
        // === STAGNATION DETECTION (only if no increase/decrease condition met) ===
        // (prevFirstSet and prevFirstReps already declared above)
        
        // Progression indicators
        const firstSetRepsImproved = firstSetReps > prevFirstReps;
        const firstSetWeightImproved = lastWeight > prevWeight;
        const overallRepsImproved = lastWorkout.totalReps > prevWorkout.totalReps;
        
        const hasProgression = firstSetRepsImproved || firstSetWeightImproved || overallRepsImproved;
        
        // Count stagnation only if NOT progressing
        let consecutiveStagnation = 0;
        
        if (!hasProgression) {
            consecutiveStagnation = 1;
            
            // Check history for consecutive stagnation
            for (let i = 1; i < Math.min(workouts.length - 1, 5); i++) {
                const curr = workouts[i];
                const prev = workouts[i + 1];
                if (!prev) break;
                
                const currFirst = curr.sets[0];
                const prevFirst = prev.sets[0];
                
                const noProgressHere = 
                    (currFirst?.reps || 0) <= (prevFirst?.reps || 0) && 
                    (currFirst?.weight || 0) <= (prevFirst?.weight || 0) &&
                    curr.totalReps <= prev.totalReps;
                
                if (noProgressHere) {
                    consecutiveStagnation++;
                } else {
                    break;
                }
            }
        }
        
        // === STAGNATION RESPONSES - VOLUME-FIRST APPROACH FOR HYPERTROPHY ===
        // Scientific basis: Volume is PRIMARY driver of hypertrophy (Schoenfeld, Israetel)
        // Progressive overload via VOLUME before switching exercises
        
        if (consecutiveStagnation >= 1 && consecutiveStagnation <= 2) {
            // Light stagnation - first check if we can add volume
            const canAddVolume = currentProgrammedSets < maxSetsPerExercise;
            const deficitMsg = totalTargetDeficit > 0 
                ? `Il te manque ${totalTargetDeficit} reps pour valider. ` 
                : '';
            
            // STAGNATION 2: Suggest adding 1 set (volume ramp) if possible
            if (consecutiveStagnation === 2 && canAddVolume) {
                const newSets = currentProgrammedSets + 1;
                const newTargetReps = this.formatTargetReps(this.genTargetReps(slot.repsMin, slot.repsMax, newSets));
                return {
                    type: 'volume_up',
                    icon: 'increase',
                    title: '📈 Augmente le volume !',
                    message: `2 séances sans progression = signal d'adaptation. Passe à ${newSets} séries pour forcer une nouvelle réponse. Le volume est le levier #1 pour la masse.`,
                    suggestedWeight: lastWeight,
                    weightTrend: 'same',
                    suggestedReps: newTargetReps,
                    suggestedSets: newSets,
                    volumeAction: 'add_set',
                    scienceNote: 'Volume = driver principal d\'hypertrophie (MEV → MRV)'
                };
            }
            
            return {
                type: 'maintain',
                icon: 'target',
                title: consecutiveStagnation === 1 ? '💪 Presque !' : '🎯 Continue !',
                message: `${deficitMsg}Vise ${targetReps} avec RPE 8-9. Chaque rep te rapproche de la progression !`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        if (consecutiveStagnation === 3) {
            // 3 sessions: Try volume increase FIRST, not deload
            const canAddVolume = currentProgrammedSets < maxSetsPerExercise;
            
            if (canAddVolume) {
                const newSets = currentProgrammedSets + 1;
                const newTargetReps = this.formatTargetReps(this.genTargetReps(slot.repsMin, slot.repsMax, newSets));
                return {
                    type: 'volume_up',
                    icon: 'increase',
                    title: '📈 Volume = Progression',
                    message: `3 séances au même niveau. Ajoute 1 série (${newSets} total) : plus de stimulus = plus de croissance. Tu n'as pas encore atteint ton MRV.`,
                    suggestedWeight: lastWeight,
                    weightTrend: 'same',
                    suggestedReps: newTargetReps,
                    suggestedSets: newSets,
                    volumeAction: 'add_set'
                };
            }
            
            // At MRV: mini-deload then reset volume
            const deloadReps = this.formatTargetReps(this.genTargetReps(slot.repsMin, slot.repsMax, minSetsPerExercise));
            return {
                type: 'deload_mini',
                icon: 'warning',
                title: '🔋 Mini-deload stratégique',
                message: `Volume max atteint (${currentProgrammedSets} séries). Fais ${minSetsPerExercise} séries cette fois, puis reprends à 3 séries avec un poids légèrement supérieur.`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: deloadReps,
                suggestedSets: minSetsPerExercise,
                volumeAction: 'reset_cycle'
            };
        }
        
        if (consecutiveStagnation === 4) {
            // 4 sessions: Try intensification technique (drop sets, rest-pause)
            const alternateReps = slot.repsMin >= 8 
                ? `5-8 reps (charge +10%)` 
                : `10-15 reps (charge -15%)`;
            return {
                type: 'intensify',
                icon: 'warning',
                title: '⚡ Technique d\'intensification',
                message: `Essaie une technique d'intensification : drop set sur la dernière série, ou change de plage (${alternateReps}) pendant 2-3 séances.`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps,
                intensificationSuggestion: true
            };
        }
        
        // Stagnation 5x+ : THEN suggest exercise switch
        if (consecutiveStagnation >= 5) {
            return {
                type: 'switch',
                icon: 'switch',
                title: `🔄 Nouveau stimulus nécessaire`,
                message: `${consecutiveStagnation} séances sans progression malgré le volume et l'intensité. Change d'exercice pour un nouveau stimulus mécanique. Tu reviendras sur celui-ci plus tard.`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps,
                consecutiveStagnation: consecutiveStagnation
            };
        }
        
        // === DEFAULT: Keep building (no stagnation detected, targets not yet hit) ===
        return {
            type: 'maintain',
            icon: 'maintain',
            title: 'Continue comme ça 💪',
            message: `Vise les cibles (${targetReps}) avec RPE 8-9. Dès que tu les atteins, on augmente !`,
            suggestedWeight: lastWeight,
            weightTrend: 'same',
            suggestedReps: targetReps
        };
    }
    
    // Get coaching suggestion for next sets based on current session performance
    // ENHANCED: Granular day status with actionable advice + phenotype integration
    async getIntraSessionAdvice(currentSetIndex, currentSetData) {
        if (!this.currentSlot || !this.avgPerformance) return null;
        
        const slot = this.currentSlot;
        const dayStatus = this.getDayStatus(currentSetData, this.avgPerformance);
        
        // Calculate velocity proxy: compare actual vs expected reps
        const expectedReps = slot.repsMax;
        const actualReps = currentSetData.reps || 0;
        const actualRpe = currentSetData.rpe;
        const repsDelta = actualReps - expectedReps;
        
        // === INTRA-SESSION SET-BY-SET GUIDANCE ===
        // After first set: assess day quality
        if (currentSetIndex === 0) {
            // VERY HOT: Exceptional performance (+10%)
            if (dayStatus === 'very_hot') {
                return {
                    type: 'very_hot',
                    title: '🔥 Journée exceptionnelle !',
                    message: `Performance +10% vs moyenne ! C'est le moment de pousser : vise le haut de ta plage ou ajoute une série bonus pour capitaliser.`,
                    actionable: 'Ajoute 1 série ou +2-3 reps par série',
                    scienceNote: 'Pics de performance = fenêtre d\'adaptation maximale'
                };
            }
            
            // HOT: Good day (+6-10%)
            if (dayStatus === 'hot') {
                return {
                    type: 'hot',
                    title: '💪 Bonne forme !',
                    message: `Tu es au-dessus de ta moyenne. Vise le haut de la plage (${slot.repsMax} reps) sur chaque série.`,
                    actionable: `Pousse vers ${slot.repsMax} reps`
                };
            }
            
            // COLD: Subpar day (-6 to -10%)
            if (dayStatus === 'cold') {
                return {
                    type: 'cold',
                    title: '📊 Journée modérée',
                    message: `Légèrement sous ta moyenne, mais c'est normal (variance biologique). Vise ${slot.repsMin}-${slot.repsMin + 2} reps, garde la technique propre.`,
                    actionable: `Cible ${slot.repsMin} reps minimum, qualité > quantité`
                };
            }
            
            // VERY COLD: Significant fatigue (-10%+)
            if (dayStatus === 'very_cold') {
                return {
                    type: 'very_cold',
                    title: '⚠️ Fatigue détectée',
                    message: `Performance -10% = fatigue accumulée probable. Aujourd'hui : réduis à ${Math.max(2, slot.sets - 1)} séries, garde la charge. Récupération > volume.`,
                    actionable: `Fais ${Math.max(2, slot.sets - 1)} séries seulement`,
                    warning: true,
                    scienceNote: 'Fatigue chronique vs aiguë : mieux vaut un mini-deload que forcer'
                };
            }
        }
        
        // === AFTER SET 1: RPE-BASED BACKOFF GUIDANCE ===
        if (currentSetIndex >= 1 && actualRpe !== null) {
            // If RPE too high (≥9.5), suggest weight reduction for remaining sets
            if (actualRpe >= 9.5) {
                const backoffWeight = Math.round(currentSetData.weight * 0.95 * 2) / 2;
                return {
                    type: 'backoff',
                    title: '⚠️ Backoff recommandé',
                    message: `RPE ${actualRpe} = proche de l'échec. Baisse à ${backoffWeight}kg pour les séries restantes afin de maintenir le volume sans compromettre la qualité.`,
                    actionable: `${backoffWeight}kg pour séries ${currentSetIndex + 2}+`,
                    backoffWeight,
                    scienceNote: 'Maintenir le volume > forcer chaque série à l\'échec'
                };
            }
            
            // If RPE suspiciously low on later sets (potential sandbagging)
            if (actualRpe <= 6 && actualReps >= expectedReps) {
                const bumpWeight = Math.round(currentSetData.weight * 1.05 * 2) / 2;
                return {
                    type: 'push_harder',
                    title: '💪 Monte l\'intensité !',
                    message: `RPE ${actualRpe} avec ${actualReps} reps = marge inexploitée. Essaie ${bumpWeight}kg sur les prochaines séries pour maximiser le stimulus.`,
                    actionable: `Tente ${bumpWeight}kg`,
                    bumpWeight
                };
            }
        }
        
        return null;
    }
    
    // === ADVANCED: Real-time load prescription based on e1RM ===
    getE1RMBasedPrescription(targetReps, targetRpe = 8) {
        if (!this.currentHistoricalBestE1RM || this.currentHistoricalBestE1RM <= 0) {
            return null;
        }
        
        const prescribedLoad = this.getTargetLoadFromE1RM(
            this.currentHistoricalBestE1RM,
            targetReps,
            targetRpe
        );
        
        return {
            e1rm: this.currentHistoricalBestE1RM,
            targetReps,
            targetRpe,
            prescribedLoad,
            prescription: `${prescribedLoad}kg × ${targetReps} @ RPE ${targetRpe}`
        };
    }
    
    // === PHENOTYPE-ADJUSTED RECOMMENDATIONS ===
    getPhenotypeAdjustedAdvice(baseAdvice, phenotypeData) {
        if (!phenotypeData || phenotypeData.confidence === 'low') {
            return baseAdvice;
        }
        
        const phenotype = phenotypeData.phenotype;
        const adjustedAdvice = { ...baseAdvice };
        
        if (phenotype === 'HIGH_RESPONDER') {
            // Fast-twitch dominant: fewer sets, more rest, lower rep ranges
            if (adjustedAdvice.suggestedSets) {
                adjustedAdvice.suggestedSets = Math.max(2, adjustedAdvice.suggestedSets - 1);
            }
            adjustedAdvice.phenotypeNote = 'Ton profil (fatigue rapide) suggère moins de séries mais plus intenses';
            adjustedAdvice.restRecommendation = '2-3 min de repos entre séries';
        } else if (phenotype === 'LOW_RESPONDER') {
            // Slow-twitch dominant: more sets tolerated, shorter rest OK
            if (adjustedAdvice.suggestedSets && adjustedAdvice.suggestedSets < 6) {
                adjustedAdvice.suggestedSets = adjustedAdvice.suggestedSets + 1;
            }
            adjustedAdvice.phenotypeNote = 'Ton profil (endurance) te permet plus de volume';
            adjustedAdvice.restRecommendation = '60-90s de repos suffisent';
        }
        
        return adjustedAdvice;
    }
    
    // === MESOCYCLE POSITION TRACKING ===
    async getMesocyclePosition() {
        const cycleStartDate = await db.getSetting('cycleStartDate');
        if (!cycleStartDate) return null;
        
        const start = new Date(cycleStartDate);
        const now = new Date();
        const daysSinceStart = Math.floor((now - start) / (1000 * 60 * 60 * 24));
        const weekInCycle = Math.floor(daysSinceStart / 7) + 1;
        const cycleLength = DEFAULT_PERIODIZATION.cycleLength || 5;
        
        // Position in mesocycle affects volume recommendations
        let phase, volumeMultiplier, rpeTarget;
        
        if (weekInCycle === 1) {
            phase = 'introduction';
            volumeMultiplier = 0.8;  // Start at ~MEV
            rpeTarget = 7;
        } else if (weekInCycle === cycleLength) {
            phase = 'deload';
            volumeMultiplier = 0.5;  // Drop to MV
            rpeTarget = 6;
        } else if (weekInCycle >= cycleLength - 1) {
            phase = 'overreach';
            volumeMultiplier = 1.1;  // Push toward MRV
            rpeTarget = 9;
        } else {
            phase = 'accumulation';
            volumeMultiplier = 1.0 + (weekInCycle - 1) * 0.05; // Gradual ramp
            rpeTarget = 8;
        }
        
        return {
            weekInCycle,
            cycleLength,
            phase,
            volumeMultiplier,
            rpeTarget,
            daysSinceStart,
            recommendation: this.getMesocyclePhaseRecommendation(phase)
        };
    }
    
    getMesocyclePhaseRecommendation(phase) {
        const recommendations = {
            introduction: 'Semaine d\'introduction : établis tes charges de travail, RPE modéré',
            accumulation: 'Phase d\'accumulation : augmente progressivement le volume',
            overreach: 'Semaine intensive : pousse vers ton MRV, fatigue attendue',
            deload: 'Semaine de récupération : volume réduit, maintiens l\'intensité'
        };
        return recommendations[phase] || '';
    }
    
    // === WEEKLY VOLUME TRACKING PER MUSCLE GROUP ===
    async calculateWeeklyMuscleVolume(muscleGroup) {
        const landmarks = VOLUME_LANDMARKS[muscleGroup] || VOLUME_LANDMARKS['default'];
        
        // Get this week's workouts
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
        startOfWeek.setHours(0, 0, 0, 0);
        
        const allHistory = await db.getAll('workoutHistory');
        const thisWeekWorkouts = allHistory.filter(w => new Date(w.date) >= startOfWeek);
        
        // Get all sets from this week
        let totalEffectiveSets = 0;
        let totalRawSets = 0;
        const exerciseBreakdown = {};
        
        for (const workout of thisWeekWorkouts) {
            // Get slots for this workout's session
            const slots = await db.getByIndex('slots', 'sessionId', workout.sessionId);
            
            for (const slot of slots) {
                const exerciseName = slot.activeExercise || slot.name;
                const contributions = this.getExerciseMuscleContributions(exerciseName);
                if (contributions.length === 0 && slot.muscleGroup) {
                    contributions.push({ muscleId: slot.muscleGroup, role: 'primary', weight: 1 });
                }
                const targetContribution = contributions.find(item => item.muscleId === muscleGroup);
                if (!targetContribution) continue;
                
                // Get sets for this exercise in this workout
                const exerciseId = exerciseName;
                const setHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
                const workoutSets = setHistory.filter(s => s.workoutId === workout.id);
                
                if (workoutSets.length === 0) continue;
                
                // Calculate effective sets
                const slotMeta = this.buildSlotCoachMeta(slot);
                const effectiveSets = workoutSets.reduce((sum, set) => {
                    const inferredRpe = set.rpe != null ? set.rpe : this.estimateSetRpe(set, slotMeta);
                    const effectiveScore = set.rpe != null
                        ? this.calculateEffectiveVolumeScore(set.reps, inferredRpe, set.weight, null)
                        : Math.min(0.75, this.calculateEffectiveVolumeScore(set.reps, inferredRpe, set.weight, null));
                    return sum + (effectiveScore * targetContribution.weight);
                }, 0);

                totalEffectiveSets += effectiveSets;
                totalRawSets += workoutSets.length * targetContribution.weight;
                
                if (!exerciseBreakdown[exerciseName]) {
                    exerciseBreakdown[exerciseName] = { raw: 0, effective: 0 };
                }
                exerciseBreakdown[exerciseName].raw += workoutSets.length * targetContribution.weight;
                exerciseBreakdown[exerciseName].effective += effectiveSets;
            }
        }
        
        // Determine volume status relative to landmarks
        let volumeStatus, recommendation;
        if (totalEffectiveSets < landmarks.MV) {
            volumeStatus = 'under_maintenance';
            recommendation = `Volume insuffisant (${totalEffectiveSets.toFixed(1)}/${landmarks.MV} MV). Risque de désentraînement.`;
        } else if (totalEffectiveSets < landmarks.MEV) {
            volumeStatus = 'maintenance';
            recommendation = `Volume de maintenance (${totalEffectiveSets.toFixed(1)}/${landmarks.MEV} MEV). Ajoute des séries pour progresser.`;
        } else if (totalEffectiveSets <= landmarks.MAV) {
            volumeStatus = 'optimal';
            recommendation = `Volume optimal (${totalEffectiveSets.toFixed(1)} séries, zone MAV). Continue comme ça !`;
        } else if (totalEffectiveSets <= landmarks.MRV) {
            volumeStatus = 'high';
            recommendation = `Volume élevé (${totalEffectiveSets.toFixed(1)}/${landmarks.MRV} MRV). Surveille ta récupération.`;
        } else {
            volumeStatus = 'excessive';
            recommendation = `⚠️ Volume excessif (${totalEffectiveSets.toFixed(1)} > MRV ${landmarks.MRV}). Risque de surentraînement !`;
        }
        
        return {
            muscleGroup,
            totalRawSets,
            totalEffectiveSets: Math.round(totalEffectiveSets * 10) / 10,
            landmarks,
            volumeStatus,
            recommendation,
            exerciseBreakdown,
            percentOfMRV: Math.round((totalEffectiveSets / landmarks.MRV) * 100)
        };
    }
    
    getMuscleKeywords(muscleGroup) {
        const keywordMap = {
            'pectoraux': ['pec', 'chest', 'développé', 'écarté', 'dips', 'pompes', 'push'],
            'dos': ['dos', 'back', 'row', 'tirage', 'pull', 'lat', 'tractions'],
            'epaules': ['épaule', 'shoulder', 'delto', 'élévation', 'lateral', 'military', 'overhead'],
            'biceps': ['biceps', 'curl', 'flexion'],
            'triceps': ['triceps', 'extension', 'pushdown', 'dips', 'skull', 'barre au front'],
            'quadriceps': ['quad', 'squat', 'leg press', 'extension jambe', 'fente', 'lunge'],
            'ischio-jambiers': ['ischio', 'hamstring', 'leg curl', 'soulevé de terre', 'deadlift'],
            'mollets': ['mollet', 'calf', 'calves'],
            'abdominaux': ['abdo', 'crunch', 'planche', 'core'],
            'fessiers': ['fessier', 'glute', 'hip thrust']
        };
        return keywordMap[muscleGroup] || [muscleGroup];
    }
    
    // === SFR-BASED EXERCISE OPTIMIZATION ===
    async analyzeSFRForExerciseSwap(exerciseId, slot) {
        const analysis = await this.generateExerciseAnalysis(exerciseId, slot);
        if (!analysis.hasData) return null;
        
        const sfr = analysis.analysis.sfr;
        
        // If SFR is poor, suggest alternatives
        if (sfr.interpretation === 'poor' || sfr.interpretation === 'moderate') {
            const alternatives = this.getSFROptimizedAlternatives(slot, sfr);
            
            return {
                currentSFR: sfr,
                recommendation: sfr.interpretation === 'poor' 
                    ? `SFR faible (${sfr.sfr}) : cet exercice génère beaucoup de fatigue pour peu de stimulus`
                    : `SFR modéré (${sfr.sfr}) : des alternatives pourraient être plus efficaces`,
                alternatives,
                suggestSwap: sfr.interpretation === 'poor'
            };
        }
        
        return {
            currentSFR: sfr,
            recommendation: `SFR ${sfr.interpretation} (${sfr.sfr}) : bon ratio stimulus/fatigue`,
            suggestSwap: false
        };
    }
    
    getSFROptimizedAlternatives(slot, currentSFR) {
        // Suggest exercises with lower axial loading (better SFR)
        const alternatives = [];
        
        if (slot.pool && slot.pool.length > 1) {
            for (const exercise of slot.pool) {
                const nameLower = exercise.toLowerCase();
                let estimatedCoeff = AXIAL_LOADING_COEFFICIENTS['isolation_default'];
                
                for (const [key, coeff] of Object.entries(AXIAL_LOADING_COEFFICIENTS)) {
                    if (nameLower.includes(key.toLowerCase())) {
                        estimatedCoeff = coeff;
                        break;
                    }
                }
                
                if (estimatedCoeff < currentSFR.axialCoeff) {
                    alternatives.push({
                        name: exercise,
                        estimatedAxialCoeff: estimatedCoeff,
                        sfrImprovement: `+${Math.round((currentSFR.axialCoeff / estimatedCoeff - 1) * 100)}%`
                    });
                }
            }
        }
        
        // Sort by best improvement
        alternatives.sort((a, b) => a.estimatedAxialCoeff - b.estimatedAxialCoeff);
        
        return alternatives.slice(0, 3);
    }
    
    // === PROGRESSIVE OVERLOAD TRACKING ===
    async getProgressionSummary(exerciseId) {
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        if (allSetHistory.length === 0) return null;
        
        // Group by workout and calculate e1RM progression
        const workoutE1RMs = {};
        for (const set of allSetHistory) {
            if (!workoutE1RMs[set.workoutId]) {
                workoutE1RMs[set.workoutId] = {
                    date: set.date,
                    bestE1RM: 0,
                    totalVolume: 0
                };
            }
            const e1rm = this.calculateE1RM(set.weight, set.reps, set.rpe || 8);
            if (e1rm > workoutE1RMs[set.workoutId].bestE1RM) {
                workoutE1RMs[set.workoutId].bestE1RM = e1rm;
            }
            workoutE1RMs[set.workoutId].totalVolume += (set.weight || 0) * (set.reps || 0);
        }
        
        const sortedWorkouts = Object.values(workoutE1RMs)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (sortedWorkouts.length < 2) return null;
        
        // Calculate progression metrics
        const firstE1RM = sortedWorkouts[0].bestE1RM;
        const lastE1RM = sortedWorkouts[sortedWorkouts.length - 1].bestE1RM;
        const peakE1RM = Math.max(...sortedWorkouts.map(w => w.bestE1RM));
        
        const totalGain = lastE1RM - firstE1RM;
        const totalGainPercent = firstE1RM > 0 ? (totalGain / firstE1RM) * 100 : 0;
        
        // Calculate weekly progression rate
        const daysBetween = (new Date(sortedWorkouts[sortedWorkouts.length - 1].date) - new Date(sortedWorkouts[0].date)) / (1000 * 60 * 60 * 24);
        const weeksBetween = Math.max(1, daysBetween / 7);
        const weeklyProgressionRate = totalGainPercent / weeksBetween;
        
        // Assess progression quality
        let progressionQuality, recommendation;
        if (weeklyProgressionRate > 1.5) {
            progressionQuality = 'excellent';
            recommendation = 'Progression excellente ! Continue sur cette lancée.';
        } else if (weeklyProgressionRate > 0.5) {
            progressionQuality = 'good';
            recommendation = 'Bonne progression. Assure-toi de maintenir ce rythme.';
        } else if (weeklyProgressionRate > 0) {
            progressionQuality = 'slow';
            recommendation = 'Progression lente. Considère d\'ajouter du volume ou varier l\'intensité.';
        } else {
            progressionQuality = 'stalled';
            recommendation = 'Pas de progression récente. Changement de stimulus recommandé.';
        }
        
        return {
            exerciseId,
            sessions: sortedWorkouts.length,
            firstE1RM: Math.round(firstE1RM * 10) / 10,
            lastE1RM: Math.round(lastE1RM * 10) / 10,
            peakE1RM: Math.round(peakE1RM * 10) / 10,
            totalGainKg: Math.round(totalGain * 10) / 10,
            totalGainPercent: Math.round(totalGainPercent * 10) / 10,
            weeklyProgressionRate: Math.round(weeklyProgressionRate * 100) / 100,
            progressionQuality,
            recommendation,
            atPeak: lastE1RM >= peakE1RM * 0.98 // Within 2% of peak
        };
    }
    
    // === GENERATE COMPREHENSIVE WORKOUT INTELLIGENCE REPORT ===
    async generateIntelligenceReport() {
        const report = {
            timestamp: new Date().toISOString(),
            mesocycle: await this.getMesocyclePosition(),
            muscleVolume: {},
            exerciseAnalysis: [],
            overallRecommendations: []
        };
        
        // Analyze volume for each muscle group
        for (const muscleId of Object.keys(VOLUME_LANDMARKS)) {
            if (muscleId === 'default') continue;
            try {
                const volumeData = await this.calculateWeeklyMuscleVolume(muscleId);
                if (volumeData.totalRawSets > 0) {
                    report.muscleVolume[muscleId] = volumeData;
                }
            } catch (e) {
                // Skip if error
            }
        }
        
        // Generate overall recommendations
        const undertrainedMuscles = Object.entries(report.muscleVolume)
            .filter(([_, data]) => data.volumeStatus === 'under_maintenance' || data.volumeStatus === 'maintenance')
            .map(([muscle, _]) => muscle);
        
        const overtrainedMuscles = Object.entries(report.muscleVolume)
            .filter(([_, data]) => data.volumeStatus === 'excessive')
            .map(([muscle, _]) => muscle);
        
        if (undertrainedMuscles.length > 0) {
            report.overallRecommendations.push({
                type: 'undertrained',
                priority: 'medium',
                message: `Muscles sous-entraînés cette semaine : ${undertrainedMuscles.join(', ')}. Ajoute du volume ou de la fréquence.`
            });
        }
        
        if (overtrainedMuscles.length > 0) {
            report.overallRecommendations.push({
                type: 'overtrained',
                priority: 'high',
                message: `⚠️ Volume excessif détecté : ${overtrainedMuscles.join(', ')}. Réduis les séries ou prends un deload.`
            });
        }
        
        // Mesocycle-based recommendation
        if (report.mesocycle) {
            report.overallRecommendations.push({
                type: 'mesocycle',
                priority: 'info',
                message: report.mesocycle.recommendation
            });
        }
        
        return report;
    }
    
    // === ADVANCED: Calculate cumulative fatigue score from recent sessions ===
    async calculateFatigueScore(exerciseId, recentWorkouts) {
        if (!recentWorkouts || recentWorkouts.length < 3) return null;
        
        // Analyze last 3-5 sessions for fatigue indicators
        let fatigueIndicators = 0;
        let totalIndicators = 0;
        
        for (let i = 0; i < Math.min(5, recentWorkouts.length - 1); i++) {
            const current = recentWorkouts[i];
            const previous = recentWorkouts[i + 1];
            if (!current || !previous) continue;
            
            totalIndicators++;
            
            // Indicator 1: Declining reps at same weight
            const currFirstReps = current.sets[0]?.reps || 0;
            const prevFirstReps = previous.sets[0]?.reps || 0;
            const currWeight = current.sets[0]?.weight || 0;
            const prevWeight = previous.sets[0]?.weight || 0;
            
            if (Math.abs(currWeight - prevWeight) < 2 && currFirstReps < prevFirstReps) {
                fatigueIndicators++;
            }
            
            // Indicator 2: Increasing RPE for same performance
            if (current.hasRealRpe && previous.hasRealRpe) {
                if (current.avgRpe > previous.avgRpe + 0.5 && currFirstReps <= prevFirstReps) {
                    fatigueIndicators++;
                    totalIndicators++;
                }
            }
            
            // Indicator 3: Dropped mid-session pattern
            const currPattern = this.analyzeWorkoutPattern(current.sets, this.currentSlot);
            if (currPattern?.analysis?.droppedMidSession) {
                fatigueIndicators++;
                totalIndicators++;
            }
        }
        
        if (totalIndicators === 0) return null;
        
        const fatigueRatio = fatigueIndicators / totalIndicators;
        
        // Return fatigue assessment
        if (fatigueRatio >= 0.6) {
            return {
                level: 'high',
                score: fatigueRatio,
                recommendation: 'Deload recommandé : fatigue chronique probable',
                suggestedAction: 'deload'
            };
        } else if (fatigueRatio >= 0.3) {
            return {
                level: 'moderate',
                score: fatigueRatio,
                recommendation: 'Fatigue modérée : surveille ta récupération',
                suggestedAction: 'monitor'
            };
        }
        
        return {
            level: 'low',
            score: fatigueRatio,
            recommendation: 'Récupération OK',
            suggestedAction: 'continue'
        };
    }
    
    // === VELOCITY PROXY: Estimate bar speed from rep performance ===
    // Without actual VBT device, we can infer velocity loss from rep drop-off
    estimateVelocityLoss(sets) {
        if (!sets || sets.length < 2) return null;
        
        const firstSetReps = sets[0]?.reps || 0;
        const lastSetReps = sets[sets.length - 1]?.reps || 0;
        
        if (firstSetReps === 0) return null;
        
        // Rep drop-off as proxy for velocity loss
        // Research: 30% rep drop ≈ 20-25% velocity loss (optimal hypertrophy zone)
        const repDropPercent = ((firstSetReps - lastSetReps) / firstSetReps) * 100;
        
        // Convert to estimated velocity loss (rough correlation)
        const estimatedVelocityLoss = repDropPercent * 0.8;
        
        return {
            repDropPercent: Math.round(repDropPercent),
            estimatedVelocityLoss: Math.round(estimatedVelocityLoss),
            zone: estimatedVelocityLoss < 15 ? 'strength' : 
                  estimatedVelocityLoss < 30 ? 'hypertrophy_optimal' : 
                  estimatedVelocityLoss < 45 ? 'hypertrophy_high' : 'endurance',
            interpretation: estimatedVelocityLoss < 15 
                ? 'Peu de fatigue métabolique - zone force/neural'
                : estimatedVelocityLoss < 30 
                    ? 'Zone hypertrophie optimale ✓'
                    : estimatedVelocityLoss < 45
                        ? 'Fatigue métabolique élevée - bon pour la masse'
                        : 'Fatigue excessive - risque de junk volume'
        };
    }
}

// Initialize app
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
