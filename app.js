// ===== Streak Engine =====
class StreakEngine {
    constructor() {
        this.LEVELS = [
            { name: 'Rookie', min: 0, max: 3, color: '#94a3b8' },
            { name: 'Focus', min: 4, max: 7, color: '#f59e0b' },
            { name: 'Machine', min: 8, max: 15, color: '#8b5cf6' },
            { name: 'Légende', min: 16, max: Infinity, color: '#ef4444' }
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
        
        return {
            streakCount,
            shieldCount,
            weekProtected,
            weeklyGoal,
            currentWeekSessions,
            lastWeekCheck
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
        
        for (let i = 1; i <= weeksPassed; i++) {
            const weekToCheck = new Date(lastCheckWeekStart);
            weekToCheck.setDate(weekToCheck.getDate() + (i * 7));
            const { start, end } = this.getWeekBounds(weekToCheck);
            
            const history = await db.getAll('workoutHistory');
            const weekSessions = history.filter(w => {
                const d = new Date(w.date);
                return d >= start && d <= end;
            }).length;
            
            const goalMet = weekSessions >= weeklyGoal;
            
            if (goalMet) {
                streakCount++;
                if (!weekProtected) {
                    shieldCount = Math.min(shieldCount + 0.5, this.MAX_SHIELDS);
                }
                weekProtected = false;
                results.push({ week: i, success: true, streakCount, shieldCount });
            } else {
                if (shieldCount >= 1) {
                    shieldCount -= 1;
                    weekProtected = true;
                    results.push({ week: i, success: false, protected: true, streakCount, shieldCount });
                } else {
                    streakCount = 0;
                    weekProtected = false;
                    results.push({ week: i, success: false, protected: false, streakCount: 0, shieldCount });
                }
            }
        }
        
        await db.setSetting('streakCount', streakCount);
        await db.setSetting('shieldCount', shieldCount);
        await db.setSetting('weekProtected', weekProtected);
        await db.setSetting('lastWeekCheck', new Date().toISOString());
        
        return results;
    }

    async recordWorkoutForStreak() {
        await this.checkAndProcessWeekEnd();
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
                'Séance terminée !',
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
            4: { icon: '🔥', title: 'Focus atteint !', message: 'Tu passes au niveau Focus !' },
            8: { icon: '⚡', title: 'Machine !', message: 'Tu es une vraie machine !' },
            16: { icon: '👑', title: 'Légende !', message: 'Tu es une légende vivante !' },
            25: { icon: '🌟', title: 'Incroyable !', message: '25 semaines consécutives !' },
            50: { icon: '💎', title: 'Diamant !', message: '50 semaines ! Tu es exceptionnel !' }
        };
        
        const milestone = milestones[streakCount];
        if (milestone) {
            this.triggerConfetti('heavy');
            setTimeout(() => {
                this.showAchievement(milestone.icon, milestone.title, milestone.message, 100);
            }, 300);
        }
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
        this.sessionTimer = null;
        this.sessionStartTime = null;
        this.restTimer = null;
        this.restTimeLeft = 0;
        this.restTimeTotal = 0;
        this.lastExerciseHistory = null;
        this.poolSlotId = null;
        this.editingSessionId = null;
    }

    async init() {
        await db.init();
        await initializeData();
        await this.loadCurrentWorkout();
        this.bindEvents();
        this.setupVisibilityHandler();
        await this.updateStorageInfo();
        setInterval(() => this.updateStorageInfo(), 5000);
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

    // ===== Home Screen =====
    async renderHome() {
        // Process any week transitions first
        await streakEngine.checkAndProcessWeekEnd();
        
        const sessions = await db.getSessions();
        const nextIndex = (await db.getSetting('nextSessionIndex')) ?? 0;
        const nextSession = sessions[nextIndex];
        
        if (nextSession) {
            document.getElementById('session-name').textContent = nextSession.name;
            document.getElementById('session-duration').textContent = `~${nextSession.estimatedDuration} min`;
            
            const slots = await db.getSlotsBySession(nextSession.id);
            document.getElementById('session-slots').textContent = `${slots.length} exercices`;
            
            this.currentSession = nextSession;
        }

        // Last session info
        const history = await db.getAll('workoutHistory');
        if (history.length > 0) {
            const lastWorkout = history.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const lastSession = await db.get('sessions', lastWorkout.sessionId);
            const daysAgo = Math.floor((Date.now() - new Date(lastWorkout.date)) / (1000 * 60 * 60 * 24));
            const daysText = daysAgo === 0 ? "aujourd'hui" : daysAgo === 1 ? 'hier' : `il y a ${daysAgo} jours`;
            document.getElementById('last-session-info').textContent = `Dernière séance : ${lastSession?.name || 'Inconnue'}, ${daysText}`;
        }

        // Render streak system
        await this.renderStreakSystem();

        // Render stats
        await this.renderStats();

        this.showScreen('home');
    }
    
    // ===== Streak System Rendering =====
    async renderStreakSystem() {
        const data = await streakEngine.getStreakData();
        const prediction = await streakEngine.getWeekPrediction();
        const level = streakEngine.getLevel(data.streakCount);
        const nextLevel = streakEngine.LEVELS.find(l => l.min > data.streakCount) || level;
        
        // Render consolidated streak card
        this.renderStreakCard(data, prediction, level, nextLevel);
        
        // Render prediction/warning
        this.renderWeekPrediction(prediction);
    }
    
    renderStreakCard(data, prediction, level, nextLevel) {
        const container = document.getElementById('streak-card');
        if (!container) return;
        
        const isComplete = data.currentWeekSessions >= data.weeklyGoal;
        
        // Calculate progress to next level
        const progressInLevel = data.streakCount - level.min;
        const levelRange = (nextLevel.min - level.min) || 1;
        const levelProgress = Math.min((progressInLevel / levelRange) * 100, 100);
        const weeksToNext = nextLevel.min - data.streakCount;
        
        // Generate session indicators
        let sessionsHtml = '';
        for (let i = 0; i < data.weeklyGoal; i++) {
            const filled = i < data.currentWeekSessions;
            sessionsHtml += `<span class="session-indicator ${filled ? 'filled' : ''}">
                ${filled ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>` : ''}
            </span>`;
        }
        
        // Generate shields
        let shieldsHtml = '';
        const fullShields = Math.floor(data.shieldCount);
        const hasHalf = data.shieldCount % 1 >= 0.5;
        for (let i = 0; i < 3; i++) {
            if (i < fullShields) {
                shieldsHtml += `<span class="shield-icon filled">${this.getShieldSVG('full')}</span>`;
            } else if (i === fullShields && hasHalf) {
                shieldsHtml += `<span class="shield-icon half">${this.getShieldSVG('half')}</span>`;
            } else {
                shieldsHtml += `<span class="shield-icon empty">${this.getShieldSVG('empty')}</span>`;
            }
        }
        
        const protectedBadge = data.weekProtected ? 
            `<div class="protected-badge">
                ${this.getShieldSVG('full')}
                <span>Semaine protégée</span>
            </div>` : '';
        
        // Better week status messaging
        const sessionsRemaining = data.weeklyGoal - data.currentWeekSessions;
        const weekStatusText = isComplete 
            ? `<span class="week-status-count success">${data.currentWeekSessions}/${data.weeklyGoal} séances</span>`
            : sessionsRemaining === 1
                ? `<span class="week-status-count partial">${data.currentWeekSessions}/${data.weeklyGoal} séances <span class="week-hint">· Plus qu'une séance</span></span>`
                : `<span class="week-status-count partial">${data.currentWeekSessions}/${data.weeklyGoal} séances <span class="week-hint">· ${sessionsRemaining} restantes</span></span>`;
        
        // Streak label that makes sense
        const streakLabel = data.streakCount === 0 ? 'Série validée' : `Semaine${data.streakCount > 1 ? 's' : ''} consécutive${data.streakCount > 1 ? 's' : ''}`;
        const streakSubtext = data.streakCount === 0 ? 'Semaines où l\'objectif est validé' : 'Semaines consécutives validées';
        
        container.innerHTML = `
            <div class="streak-main">
                <div class="streak-score">
                    <div class="streak-number">${data.streakCount}</div>
                    <div class="streak-label">${streakLabel}</div>
                    <div class="streak-subtext">${streakSubtext}</div>
                </div>
                <div class="streak-info">
                    <div class="streak-level-badge" style="--level-color: ${level.color}">
                        ${this.getLevelIconSVG(level.name)}
                        <span>${level.name}</span>
                    </div>
                    <div class="streak-progress-section">
                        <div class="streak-progress-bar">
                            <div class="streak-progress-fill" style="width: ${levelProgress}%; background: ${level.color}"></div>
                        </div>
                        <div class="streak-next-level">
                            ${weeksToNext > 0 ? `Prochain niveau: <strong>${nextLevel.name}</strong> · ${weeksToNext}/${levelRange} semaine${weeksToNext > 1 ? 's' : ''}` : 'Niveau max atteint !'}
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="streak-divider"></div>
            
            <div class="streak-week">
                <div class="week-header">
                    <span class="week-title">CETTE SEMAINE</span>
                    ${protectedBadge}
                </div>
                <div class="week-content">
                    <div class="week-sessions">
                        ${weekStatusText}
                        <div class="sessions-row">${sessionsHtml}</div>
                    </div>
                    <div class="week-shields">
                        <div class="shields-count">Boucliers: ${Math.floor(data.shieldCount * 10) / 10}/3</div>
                        <div class="shields-row">${shieldsHtml}</div>
                    </div>
                </div>
            </div>
        `;
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
        this.renderVolumeChart(setHistory);
        this.renderFrequencyChart(history);
        
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
                    <div class="muscle-stats-empty-icon">💪</div>
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
            const hasVolume = volume > 0;
            const isOptimal = volume >= VOLUME_THRESHOLDS.minimum && volume <= VOLUME_THRESHOLDS.optimal;
            const isExcessive = volume > VOLUME_THRESHOLDS.maximum;
            
            const progressPercent = Math.min((volume / maxSets) * 100, 100);
            
            let statusClass = '';
            if (isExcessive) statusClass = 'excessive';
            else if (isOptimal) statusClass = 'optimal';
            else if (hasVolume) statusClass = 'has-volume';
            
            html += `
                <div class="muscle-stat-item ${statusClass}">
                    <div class="muscle-stat-top">
                        <span class="muscle-stat-icon">${muscleInfo.icon}</span>
                        <span class="muscle-stat-sets">${volume}</span>
                    </div>
                    <div class="muscle-stat-name">${muscleInfo.name}</div>
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
        return vol.toString();
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
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Set proper canvas size for retina displays
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        const width = rect.width;
        const height = rect.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Get last 4 weeks data
        const weeks = [];
        const now = new Date();
        
        for (let i = 3; i >= 0; i--) {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - (i * 7) - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);
            
            let volume = 0;
            for (const set of setHistory) {
                const setDate = new Date(set.date);
                if (setDate >= weekStart && setDate < weekEnd) {
                    volume += (set.weight || 0) * (set.reps || 0);
                }
            }
            
            weeks.push({
                label: `S-${i}`,
                volume: volume
            });
        }
        
        // Draw chart
        const maxVolume = Math.max(...weeks.map(w => w.volume), 1);
        const padding = 40;
        const barWidth = (width - padding * 2) / 4;
        const chartHeight = height - 50;
        
        // Draw bars
        weeks.forEach((week, i) => {
            const barHeight = Math.max((week.volume / maxVolume) * chartHeight, 2);
            const x = padding + i * barWidth + barWidth * 0.2;
            const y = chartHeight - barHeight + 20;
            const bWidth = barWidth * 0.6;
            
            // Gradient bar
            const gradient = ctx.createLinearGradient(x, y + barHeight, x, y);
            gradient.addColorStop(0, '#6366f1');
            gradient.addColorStop(1, '#a5b4fc');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            this.drawRoundRect(ctx, x, y, bWidth, barHeight, 6);
            ctx.fill();
            
            // Label
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(week.label, x + bWidth / 2, height - 10);
            
            // Value on top
            if (week.volume > 0) {
                ctx.fillStyle = '#1e293b';
                ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
                ctx.fillText(this.formatVolume(week.volume), x + bWidth / 2, y - 8);
            }
        });
    }
    
    renderFrequencyChart(history) {
        const canvas = document.getElementById('frequency-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Set proper canvas size for retina displays
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        const width = rect.width;
        const height = rect.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Get last 8 weeks data
        const weeks = [];
        const now = new Date();
        
        for (let i = 7; i >= 0; i--) {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - (i * 7) - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);
            
            let count = 0;
            for (const workout of history) {
                const wDate = new Date(workout.date);
                if (wDate >= weekStart && wDate < weekEnd) {
                    count++;
                }
            }
            
            weeks.push(count);
        }
        
        // Draw line chart
        const maxCount = Math.max(...weeks, 4);
        const padding = 30;
        const chartWidth = width - padding * 2;
        const chartHeight = height - 40;
        const stepX = chartWidth / (weeks.length - 1);
        
        // Draw grid lines
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        for (let i = 0; i <= maxCount; i++) {
            const y = 20 + (chartHeight / maxCount) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
            
            // Grid labels
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(maxCount - i, padding - 8, y + 4);
        }
        
        // Draw area under line
        ctx.beginPath();
        weeks.forEach((count, i) => {
            const x = padding + i * stepX;
            const y = 20 + chartHeight - (count / maxCount) * chartHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.lineTo(padding + (weeks.length - 1) * stepX, 20 + chartHeight);
        ctx.lineTo(padding, 20 + chartHeight);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, 20, 0, 20 + chartHeight);
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.2)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0.02)');
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Draw line
        ctx.beginPath();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        weeks.forEach((count, i) => {
            const x = padding + i * stepX;
            const y = 20 + chartHeight - (count / maxCount) * chartHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Draw points
        weeks.forEach((count, i) => {
            const x = padding + i * stepX;
            const y = 20 + chartHeight - (count / maxCount) * chartHeight;
            
            // Outer circle
            ctx.beginPath();
            ctx.fillStyle = '#22c55e';
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner circle
            ctx.beginPath();
            ctx.fillStyle = 'white';
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
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
        
        // Build slot -> muscleGroup map
        const slotMuscleMap = {};
        for (const slot of slots) {
            if (slot.muscleGroup) {
                slotMuscleMap[slot.id] = slot.muscleGroup;
            }
        }
        
        // Count sets per muscle this week
        const volumeByMuscle = {};
        
        for (const set of setHistory) {
            const setDate = new Date(set.date);
            if (setDate >= start && setDate <= end) {
                const muscleGroup = slotMuscleMap[set.slotId];
                if (muscleGroup) {
                    if (!volumeByMuscle[muscleGroup]) {
                        volumeByMuscle[muscleGroup] = { sets: 0, effectiveSets: 0 };
                    }
                    volumeByMuscle[muscleGroup].sets++;
                    // Effective sets = sets where RPE >= 7
                    if (set.rpe >= 7 || set.rpe === undefined) {
                        volumeByMuscle[muscleGroup].effectiveSets++;
                    }
                }
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
            isDeload: this.isDeloadMode
        };
        await db.saveCurrentWorkout(this.currentWorkout);

        document.getElementById('current-session-name').textContent = session.name + (this.isDeloadMode ? ' 🔋' : '');
        
        // Start session timer
        this.startSessionTimer();
        
        await this.renderSlots();
        this.showScreen('session');
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
        
        // Calculate performance status from history
        const status = await this.getExerciseStatus(slot);
        
        // Superset badge (only show when not completed)
        const supersetBadge = (!isCompleted && (isFirstInSuperset || isSecondInSuperset)) 
            ? `<span class="superset-badge color-${supersetColor}">⚡ SuperSet</span>` 
            : '';
        
        const isInSuperset = isFirstInSuperset || isSecondInSuperset;

        if (isCompleted) {
            card.innerHTML = `
                <div class="slot-header">
                    <div class="slot-title">
                        <span class="slot-id">${slot.slotId}</span>
                        <span class="slot-name">${slot.activeExercise || slot.name}</span>
                    </div>
                    <div class="completed-badge">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Terminé
                    </div>
                </div>
            `;
        } else {
            // For superset exercises, both have same buttons
            // Use firstSlotId if this is the second exercise, otherwise use slot.id
            const supersetStartId = isFirstInSuperset ? slot.id : (firstSlotId || slot.id);
            
            const launchBtns = isInSuperset 
                ? `
                    <button class="btn btn-primary btn-launch-superset" data-slot-id="${supersetStartId}">⚡ Lancer SuperSet</button>
                    <button class="btn btn-secondary btn-launch-individual" data-slot-id="${slot.id}" title="Lancer cet exercice seul">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v20M2 12h20"/>
                        </svg>
                    </button>
                  `
                : `<button class="btn btn-primary btn-launch" data-slot-id="${slot.id}">Lancer</button>`;
            
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

    // ===== Exercise Screen =====
    async openExercise(slotId) {
        this.currentSlot = await db.get('slots', slotId);
        this.supersetSlot = null; // Reset superset
        this.isSupersetMode = false;
        
        if (!this.currentSlot) return;

        // Initialize slot data in current workout if needed
        if (!this.currentWorkout.slots[slotId]) {
            this.currentWorkout.slots[slotId] = {
                sets: [],
                startTime: Date.now()
            };
            await db.saveCurrentWorkout(this.currentWorkout);
        }

        document.getElementById('exercise-slot-label').textContent = this.currentSlot.slotId;
        document.getElementById('current-exercise-name').textContent = this.currentSlot.activeExercise || this.currentSlot.name;
        document.getElementById('exercise-sets').textContent = this.currentSlot.sets;
        document.getElementById('exercise-reps').textContent = `${this.currentSlot.repsMin}-${this.currentSlot.repsMax}`;
        document.getElementById('exercise-rest').textContent = `${this.currentSlot.rest}s`;
        document.getElementById('exercise-rir').textContent = this.currentSlot.rir;
        document.getElementById('exercise-instructions').textContent = this.currentSlot.instructions || '--';

        // Hide superset logbook
        document.getElementById('logbook-card-superset').style.display = 'none';

        // Load logbook (last session data)
        await this.loadLogbook();
        
        // Calculate and show coaching advice (store for use in renderSeries)
        this.currentCoachingAdvice = await this.calculateCoachingAdvice();
        await this.showCoachingAdvice();
        
        this.renderSeries();
        this.showScreen('exercise');
        
        // Check if there's an active timer from before
        this.onAppResume();
    }
    
    // ===== SuperSet Exercise Screen =====
    async openSuperset(slotId) {
        this.currentSlot = await db.get('slots', slotId);
        if (!this.currentSlot || !this.currentSlot.supersetWith) return;
        
        this.supersetSlot = await db.get('slots', this.currentSlot.supersetWith);
        if (!this.supersetSlot) {
            // Fallback to regular exercise
            return this.openExercise(slotId);
        }
        
        this.isSupersetMode = true;

        // Initialize slot data for both exercises
        if (!this.currentWorkout.slots[slotId]) {
            this.currentWorkout.slots[slotId] = { sets: [], startTime: Date.now() };
        }
        if (!this.currentWorkout.slots[this.supersetSlot.id]) {
            this.currentWorkout.slots[this.supersetSlot.id] = { sets: [], startTime: Date.now() };
        }
        await db.saveCurrentWorkout(this.currentWorkout);

        // Update header
        document.getElementById('exercise-slot-label').textContent = `${this.currentSlot.slotId} + ${this.supersetSlot.slotId}`;
        document.getElementById('current-exercise-name').textContent = 'SuperSet';
        
        // Use min sets between both exercises
        const sets = Math.min(this.currentSlot.sets, this.supersetSlot.sets);
        document.getElementById('exercise-sets').textContent = sets;
        document.getElementById('exercise-reps').textContent = 'Voir ci-dessous';
        document.getElementById('exercise-rest').textContent = `${this.currentSlot.rest}s`;
        document.getElementById('exercise-rir').textContent = `${this.currentSlot.rir}-${this.supersetSlot.rir}`;
        document.getElementById('exercise-instructions').textContent = 'Alterne entre les deux exercices sans pause.';

        // Show superset logbook and set exercise name
        document.getElementById('logbook-card-superset').style.display = 'block';
        document.getElementById('logbook-superset-exercise-name').textContent = this.supersetSlot.activeExercise || this.supersetSlot.name;

        // Load logbook for both
        await this.loadLogbook();
        await this.loadSupersetLogbook();
        
        this.renderSupersetSeries();
        this.showScreen('exercise');
        
        // Check if there's an active timer from before
        this.onAppResume();
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
            this.renderSupersetLogbook(null);
            return;
        }
        
        workoutIds.sort((a, b) => new Date(workoutGroups[b].date) - new Date(workoutGroups[a].date));
        const lastWorkout = workoutGroups[workoutIds[0]];
        lastWorkout.sets.sort((a, b) => a.setNumber - b.setNumber);
        
        this.lastSupersetHistory = {
            date: lastWorkout.date,
            sets: lastWorkout.sets,
            totalReps: lastWorkout.sets.reduce((sum, s) => sum + (s.reps || 0), 0),
            maxWeight: Math.max(...lastWorkout.sets.map(s => s.weight || 0))
        };
        
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
                    <span class="logbook-set-data">${set.weight}kg × ${set.reps}</span>
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

        for (let i = 0; i < sets; i++) {
            const setAData = slotAData.sets[i] || {};
            const setBData = slotBData.sets[i] || {};
            const isCompleted = setAData.completed && setBData.completed;
            
            // Suggested weights
            let suggestedWeightA = lastSetsA[i]?.weight || (i > 0 ? slotAData.sets[i-1]?.weight : '') || '';
            let suggestedWeightB = lastSetsB[i]?.weight || (i > 0 ? slotBData.sets[i-1]?.weight : '') || '';
            
            const displayWeightA = setAData.weight || suggestedWeightA || '';
            const displayWeightB = setBData.weight || suggestedWeightB || '';
            
            const card = document.createElement('div');
            card.className = `superset-series-card ${isCompleted ? 'completed' : ''}`;
            card.dataset.setIndex = i;

            if (isCompleted) {
                card.innerHTML = `
                    <div class="series-header">
                        <span class="series-number">Série ${i + 1}</span>
                        <div class="series-check-container">
                            <span class="series-check">✓</span>
                        </div>
                    </div>
                    <div class="superset-exercise-inputs">
                        <div class="superset-exercise-row row-a">
                            <span class="exercise-label">${this.currentSlot.activeExercise.substring(0, 12)}...</span>
                            <span class="series-result">${setAData.weight}kg × ${setAData.reps}</span>
                        </div>
                        <div class="superset-exercise-row row-b">
                            <span class="exercise-label">${this.supersetSlot.activeExercise.substring(0, 12)}...</span>
                            <span class="series-result">${setBData.weight}kg × ${setBData.reps}</span>
                        </div>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div class="series-header">
                        <span class="series-number">Série ${i + 1}</span>
                    </div>
                    <div class="superset-exercise-inputs">
                        <div class="superset-exercise-row row-a">
                            <span class="exercise-label">${this.currentSlot.activeExercise.substring(0, 15)}</span>
                            <div class="input-group">
                                <input type="number" inputmode="decimal" class="input-weight-a" 
                                       value="${displayWeightA}" placeholder="kg" data-set-index="${i}">
                            </div>
                            <div class="input-group">
                                <input type="number" inputmode="numeric" class="input-reps-a" 
                                       value="${setAData.reps || ''}" placeholder="${this.currentSlot.repsMin}-${this.currentSlot.repsMax}" data-set-index="${i}">
                            </div>
                        </div>
                        <div class="superset-exercise-row row-b">
                            <span class="exercise-label">${this.supersetSlot.activeExercise.substring(0, 15)}</span>
                            <div class="input-group">
                                <input type="number" inputmode="decimal" class="input-weight-b" 
                                       value="${displayWeightB}" placeholder="kg" data-set-index="${i}">
                            </div>
                            <div class="input-group">
                                <input type="number" inputmode="numeric" class="input-reps-b" 
                                       value="${setBData.reps || ''}" placeholder="${this.supersetSlot.repsMin}-${this.supersetSlot.repsMax}" data-set-index="${i}">
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-series-done btn-superset-done" data-set-index="${i}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        SuperSet terminé
                    </button>
                `;
            }

            container.appendChild(card);
        }

        // Check if all sets complete
        const completedA = slotAData.sets.filter(s => s.completed).length;
        const completedB = slotBData.sets.filter(s => s.completed).length;
        if (completedA >= sets && completedB >= sets) {
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
        const slotId = this.currentSlot.id;
        
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
        
        // Find the most recent workout
        const workoutIds = Object.keys(workoutGroups);
        if (workoutIds.length === 0) {
            this.lastExerciseHistory = null;
            this.renderLogbook(null);
            return;
        }
        
        // Sort by date descending
        workoutIds.sort((a, b) => {
            return new Date(workoutGroups[b].date) - new Date(workoutGroups[a].date);
        });
        
        const lastWorkoutId = workoutIds[0];
        const lastWorkout = workoutGroups[lastWorkoutId];
        
        // Sort sets by set number
        lastWorkout.sets.sort((a, b) => a.setNumber - b.setNumber);
        
        // Calculate totals
        const totalReps = lastWorkout.sets.reduce((sum, s) => sum + (s.reps || 0), 0);
        const maxWeight = Math.max(...lastWorkout.sets.map(s => s.weight || 0));
        
        this.lastExerciseHistory = {
            date: lastWorkout.date,
            sets: lastWorkout.sets,
            totalReps,
            maxWeight
        };
        
        this.renderLogbook(this.lastExerciseHistory);
    }
    
    renderLogbook(history) {
        const logbookCard = document.getElementById('logbook-card');
        const logbookDate = document.getElementById('logbook-date');
        const logbookContent = document.getElementById('logbook-content');
        
        if (!history) {
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
            dateText = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        }
        
        logbookDate.textContent = dateText;
        
        // Render sets
        let html = '';
        for (const set of history.sets) {
            html += `
                <div class="logbook-set">
                    <span class="logbook-set-number">Série ${set.setNumber}</span>
                    <div class="logbook-set-data">
                        <span class="logbook-value"><strong>${set.weight}</strong> kg</span>
                        <span class="logbook-value"><strong>${set.reps}</strong> reps</span>
                    </div>
                </div>
            `;
        }
        
        // Add summary
        html += `
            <div class="logbook-summary">
                <div class="logbook-summary-item">
                    <div class="logbook-summary-label">Total reps</div>
                    <div class="logbook-summary-value">${history.totalReps}</div>
                </div>
                <div class="logbook-summary-item">
                    <div class="logbook-summary-label">Charge max</div>
                    <div class="logbook-summary-value">${history.maxWeight} kg</div>
                </div>
            </div>
        `;
        
        logbookContent.innerHTML = html;
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
        
        // Use dynamic target reps from genTargetReps
        const { repsMin, repsMax, sets } = this.currentSlot;
        const targetRepsArray = this.genTargetReps(repsMin, repsMax, sets);
        const getTargetReps = (setIndex) => targetRepsArray[setIndex] || repsMax;

        for (let i = 0; i < this.currentSlot.sets; i++) {
            const setData = slotData.sets[i] || {};
            const isCompleted = setData.completed;
            
            // Get suggested weight: coaching advice > last session > previous set
            let suggestedWeight = '';
            if (!setData.weight && !isCompleted) {
                if (coachingSuggestedWeight && i === 0) {
                    // Use coaching suggestion for first set
                    suggestedWeight = coachingSuggestedWeight;
                } else if (lastSets[i]) {
                    suggestedWeight = lastSets[i].weight;
                } else if (i > 0 && slotData.sets[i-1]?.weight) {
                    suggestedWeight = slotData.sets[i-1].weight;
                } else if (coachingSuggestedWeight) {
                    suggestedWeight = coachingSuggestedWeight;
                } else if (lastSets.length > 0) {
                    suggestedWeight = lastSets[0].weight;
                }
            }
            
            // Get suggested reps based on target
            const targetReps = getTargetReps(i);
            const suggestedReps = lastSets[i]?.reps || targetReps;
            
            const displayWeight = setData.weight || suggestedWeight || '';
            const displayReps = setData.reps || '';
            const isSuggested = !setData.weight && suggestedWeight;
            const isCoachingSuggested = isSuggested && coachingSuggestedWeight && (i === 0 || !lastSets[i]);
            
            const card = document.createElement('div');
            card.className = `series-card ${isCompleted ? 'completed' : ''}`;
            card.dataset.setIndex = i;

            card.innerHTML = `
                <div class="series-header">
                    <span class="series-number">Série ${i + 1}</span>
                    ${isCompleted ? `
                        <div class="series-check-container">
                            <span class="series-result">${setData.weight}kg × ${setData.reps}</span>
                            <span class="series-check">✓</span>
                        </div>
                    ` : ''}
                </div>
                ${!isCompleted ? `
                    <div class="series-inputs">
                        <div class="input-group ${isSuggested ? 'suggested' : ''} ${isCoachingSuggested ? 'coaching-suggested' : ''}">
                            <label>Charge (kg) ${isCoachingSuggested ? '<span class="suggested-label">coach</span>' : (isSuggested ? '<span class="suggested-label">suggéré</span>' : '')}</label>
                            <input type="number" inputmode="decimal" class="input-weight" 
                                   value="${displayWeight}" 
                                   placeholder="${suggestedWeight || '0'}"
                                   data-set-index="${i}">
                        </div>
                        <div class="input-group">
                            <label>Reps <span class="suggested-label">cible: ${targetReps}</span></label>
                            <input type="number" inputmode="numeric" class="input-reps" 
                                   value="${displayReps}" 
                                   placeholder="${targetReps}"
                                   data-set-index="${i}">
                        </div>
                    </div>
                    <button class="btn btn-series-done" data-set-index="${i}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Série terminée
                    </button>
                ` : ''}
            `;

            container.appendChild(card);
        }

        // Check if exercise is complete
        const completedSets = slotData.sets.filter(s => s.completed).length;
        if (completedSets === this.currentSlot.sets) {
            this.showExerciseSummary();
        }
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
            rpe: null // Will be set during rest timer if user provides it
        };
        
        // Track last completed set for RPE capture
        this.lastCompletedSetIndex = setIndex;
        this.lastCompletedSetWeight = weight;
        this.lastCompletedSetReps = reps;

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

        // Check if all sets are complete
        const completedSets = slotData.sets.filter(s => s.completed).length;
        if (completedSets === this.currentSlot.sets) {
            // Show summary after a brief delay
            setTimeout(() => this.showExerciseSummary(), 300);
        } else {
            // Start rest timer (with RPE capture + Hot/Cold feedback)
            this.resetRpeSlider();
            this.startRestTimer(this.currentSlot.rest);
        }
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
            8: { text: 'Effort sérieux • ~2 reps en réserve', emoji: '😤' },
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
        this.updateRpeDisplay(8);
    }
    
    async saveRpeToLastSet() {
        if (this.lastCompletedSetIndex === undefined || !this.currentSlot) return;
        
        const rpe = parseInt(document.getElementById('rpe-slider').value);
        const slotData = this.currentWorkout.slots[this.currentSlot.id];
        
        if (slotData && slotData.sets[this.lastCompletedSetIndex]) {
            slotData.sets[this.lastCompletedSetIndex].rpe = rpe;
            await db.saveCurrentWorkout(this.currentWorkout);
            
            // === AUTO BACK-OFF: After set 1, if RPE >= 9, suggest weight reduction ===
            if (this.lastCompletedSetIndex === 0 && rpe >= 9) {
                await this.checkAutoBackoff(rpe);
            }
            
            // === HOT/COLD DAY DETECTION after set 1 ===
            if (this.lastCompletedSetIndex === 0 && this.avgPerformance) {
                this.detectDayStatus(rpe);
            }
        }
    }
    
    async checkAutoBackoff(rpe) {
        const isCompound = this.currentExerciseType === 'compound';
        const weight = this.lastCompletedSetWeight;
        
        // Only suggest back-off for compound exercises or very high RPE
        if (!isCompound && rpe < 10) return;
        
        const backoffPercent = 10;
        const suggestedWeight = Math.round(weight * (1 - backoffPercent / 100) * 2) / 2;
        
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

        document.getElementById('summary-total-reps').textContent = totalReps;
        document.getElementById('summary-max-weight').textContent = `${maxWeight} kg`;
        
        // Get comparison with last session
        const comparison = document.getElementById('summary-comparison');
        const summaryIcon = document.getElementById('summary-icon');
        const summaryTitle = document.getElementById('summary-title');
        
        if (this.lastExerciseHistory && this.lastExerciseHistory.totalReps > 0) {
            const lastTotalReps = this.lastExerciseHistory.totalReps;
            const lastMaxWeight = this.lastExerciseHistory.maxWeight;
            const repsDiff = totalReps - lastTotalReps;
            const weightDiff = maxWeight - lastMaxWeight;
            
            let comparisonClass = 'neutral';
            let icon = '🟠';
            let text = '';
            
            if (repsDiff > 0 || weightDiff > 0) {
                comparisonClass = 'positive';
                icon = '🚀';
                summaryIcon.textContent = '🎉';
                summaryTitle.textContent = 'Progression !';
                
                if (repsDiff > 0 && weightDiff > 0) {
                    text = `<span>+${repsDiff}</span> reps et <span>+${weightDiff}kg</span> vs dernière fois`;
                } else if (repsDiff > 0) {
                    text = `<span>+${repsDiff}</span> reps vs dernière fois`;
                } else {
                    text = `<span>+${weightDiff}kg</span> vs dernière fois`;
                }
                
                // Trigger confetti!
                this.triggerConfetti();
            } else if (repsDiff < 0 && weightDiff <= 0) {
                comparisonClass = 'negative';
                icon = '💪';
                summaryIcon.textContent = '✅';
                summaryTitle.textContent = 'Exercice terminé';
                text = `<span>${repsDiff}</span> reps vs dernière fois`;
            } else {
                comparisonClass = 'neutral';
                icon = '🟠';
                summaryIcon.textContent = '✅';
                summaryTitle.textContent = 'Exercice terminé';
                text = 'Performance stable';
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
            db.saveCurrentWorkout(this.currentWorkout);
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

    async confirmFinishSession() {
        this.stopSessionTimer();
        this.hideFinishModal();
        
        // Calculate Stimulus Score before saving
        const stimulusScore = await this.calculateStimulusScore();

        // Save workout to history
        const workoutRecord = {
            sessionId: this.currentSession.id,
            date: new Date().toISOString(),
            duration: Date.now() - this.sessionStartTime,
            slots: this.currentWorkout.slots,
            completedSlots: this.currentWorkout.completedSlots,
            stimulusScore: stimulusScore.total
        };

        const workoutId = await db.add('workoutHistory', workoutRecord);

        // Save individual sets to history (including RPE)
        for (const [slotId, slotData] of Object.entries(this.currentWorkout.slots)) {
            const slot = await db.get('slots', slotId);
            for (let i = 0; i < slotData.sets.length; i++) {
                const setData = slotData.sets[i];
                if (setData && setData.completed) {
                    await db.add('setHistory', {
                        slotId,
                        exerciseId: slot.activeExercise || slot.name,
                        workoutId,
                        setNumber: i + 1,
                        weight: setData.weight,
                        reps: setData.reps,
                        rpe: setData.rpe || 8, // Include RPE data
                        date: new Date().toISOString()
                    });
                }
            }
        }

        // Update next session index
        const sessions = await db.getSessions();
        const currentIndex = sessions.findIndex(s => s.id === this.currentSession.id);
        let nextIndex;
        if (currentIndex >= 0) {
            nextIndex = (currentIndex + 1) % sessions.length;
        } else {
            const storedIndex = (await db.getSetting('nextSessionIndex')) ?? 0;
            nextIndex = (storedIndex + 1) % sessions.length;
        }
        await db.setSetting('nextSessionIndex', nextIndex);

        // Check weekly goal status BEFORE recording (to detect if we just completed it)
        const streakDataBefore = await streakEngine.getStreakData();
        const wasGoalMetBefore = streakDataBefore.currentWeekSessions >= streakDataBefore.weeklyGoal;
        
        // Update streak system
        await streakEngine.recordWorkoutForStreak();
        await db.setSetting('lastWorkoutDate', new Date().toISOString());
        
        // Check if we just met the weekly goal
        const streakDataAfter = await streakEngine.getStreakData();
        const isGoalMetNow = streakDataAfter.currentWeekSessions >= streakDataAfter.weeklyGoal;
        const justMetWeeklyGoal = !wasGoalMetBefore && isGoalMetNow;
        
        // Reset deload mode after session (deload is per-session)
        if (this.isDeloadMode) {
            await db.setSetting('isDeloadMode', false);
            this.isDeloadMode = false;
        }

        // Calculate workout stats for celebration (before clearing)
        const duration = Math.round((Date.now() - this.sessionStartTime) / 60000);
        let totalSets = 0;
        for (const slotData of Object.values(this.currentWorkout.slots)) {
            totalSets += slotData.sets.filter(s => s && s.completed).length;
        }
        const sessionName = this.currentSession.name;
        
        // Clear current workout
        await db.clearCurrentWorkout();
        this.currentWorkout = null;

        // Show Stimulus Score animation before going home
        await this.showStimulusScoreAnimation(stimulusScore);
        
        // Trigger celebrations after stimulus score
        gamification.celebrateWorkoutComplete(sessionName, {
            totalSets,
            duration,
            xpGain: Math.round(stimulusScore.total * 2)
        });
        
        // Celebrate weekly goal if just achieved
        if (justMetWeeklyGoal) {
            setTimeout(() => {
                gamification.celebrateWeeklyGoal();
            }, 3000);
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
        const nextIndex = (await db.getSetting('nextSessionIndex')) ?? 0;
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

        const sheet = document.getElementById('sheet-edit-slot');
        const form = document.getElementById('edit-slot-form');
        
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
        slot.instructions = document.getElementById('edit-slot-instructions').value.trim();
        
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
            document.getElementById('current-exercise-name').textContent = slot.activeExercise || slot.name;
            document.getElementById('exercise-sets').textContent = slot.sets;
            document.getElementById('exercise-reps').textContent = `${slot.repsMin}-${slot.repsMax}`;
            document.getElementById('exercise-rest').textContent = `${slot.rest}s`;
            document.getElementById('exercise-rir').textContent = slot.rir;
            document.getElementById('exercise-instructions').textContent = slot.instructions || '--';
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
            await db.importData(data);
            await this.renderHome();
            alert('Données importées avec succès !');
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
        
        document.getElementById('btn-import').onclick = () => {
            document.getElementById('import-file').click();
        };
        
        document.getElementById('import-file').onchange = (e) => {
            if (e.target.files[0]) {
                this.importData(e.target.files[0]);
            }
        };

        // Session screen
        document.getElementById('btn-back-home').onclick = () => this.renderHome();
        document.getElementById('btn-finish-session').onclick = () => this.showFinishModal();

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
            this.renderSlots();
            this.showScreen('session');
        };

        document.getElementById('series-list').onclick = (e) => {
            const supersetDoneBtn = e.target.closest('.btn-superset-done');
            if (supersetDoneBtn) {
                this.completeSupersetSet(parseInt(supersetDoneBtn.dataset.setIndex));
                return;
            }
            
            const doneBtn = e.target.closest('.btn-series-done');
            if (doneBtn) {
                this.completeSet(parseInt(doneBtn.dataset.setIndex));
            }
        };

        // Auto-save on input change
        document.getElementById('series-list').oninput = async (e) => {
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
        };

        // Timer controls
        document.getElementById('btn-timer-skip').onclick = () => this.stopRestTimer();
        document.getElementById('btn-timer-minus').onclick = () => this.adjustRestTimer(-15);
        document.getElementById('btn-timer-plus').onclick = () => this.adjustRestTimer(15);
        document.getElementById('btn-timer-stop').onclick = () => this.stopRestTimer();
        
        // RPE Slider
        const rpeSlider = document.getElementById('rpe-slider');
        rpeSlider.oninput = () => this.updateRpeDisplay(parseInt(rpeSlider.value));
        
        // RPE emoji clicks
        document.querySelectorAll('.rpe-labels span').forEach(span => {
            span.onclick = () => {
                const rpe = parseInt(span.dataset.rpe);
                rpeSlider.value = rpe;
                this.updateRpeDisplay(rpe);
            };
        });

        // Summary
        document.getElementById('btn-back-to-session').onclick = () => {
            this.hideExerciseSummary();
            this.renderSlots();
            this.showScreen('session');
        };

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
        
        document.getElementById('sheet-settings').classList.add('active');
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
        
        // Periodization settings
        const cycleLength = parseInt(document.getElementById('setting-cycle-length').value);
        const autoDeloadEnabled = document.getElementById('setting-auto-deload').checked;
        const deloadVolumeReduction = parseInt(document.getElementById('setting-deload-volume').value);
        
        await db.setSetting('weeklyGoal', weeklyGoal);
        await db.setSetting('failureCount', failureCount);
        await db.setSetting('deloadPercent', deloadPercent);
        await db.setSetting('weightIncrement', weightIncrement);
        await db.setSetting('lockWeeks', lockWeeks);
        
        // Periodization settings
        await db.setSetting('cycleLength', cycleLength);
        await db.setSetting('autoDeloadEnabled', autoDeloadEnabled);
        await db.setSetting('deloadVolumeReduction', deloadVolumeReduction);
        
        // Initialize cycle start date if not set
        const cycleStartDate = await db.getSetting('cycleStartDate');
        if (!cycleStartDate) {
            await db.setSetting('cycleStartDate', new Date().toISOString());
        }
        
        this.hideSettingsSheet();
        
        // Refresh streak system display with new goal
        await this.renderStreakSystem();
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
    effectiveRepsFromSet(reps, rpe) {
        if (rpe == null) return null;
        const rir = Math.max(0, 10 - rpe);
        return Math.max(0, (reps || 0) - (rir + 5));
    }
    
    // Estimate 1RM for Hot/Cold comparison
    e1rm(weight, reps) {
        return (weight || 0) * (1 + (reps || 0) / 30);
    }
    
    // Determine day status (hot/cold/normal) based on first set performance
    getDayStatus(currentSet, avgPerformance) {
        if (!currentSet || !avgPerformance) return null;
        const cur = this.e1rm(currentSet.weight, currentSet.reps);
        const ref = this.e1rm(avgPerformance.weight, avgPerformance.reps);
        if (ref <= 0) return null;

        const delta = (cur - ref) / ref;
        if (delta > 0.02) return 'hot';   // +2% ou plus
        if (delta < -0.02) return 'cold'; // -2% ou plus
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
    
    // Get reference weight from workout (top set for ramp, first set otherwise)
    getReferenceWeight(workout, slot) {
        const sets = workout.sets;
        if (this.isRampingWorkout(sets)) {
            // Ramping: find heaviest set with reps >= repsMin
            const validSets = sets.filter(s => (s.reps || 0) >= slot.repsMin);
            if (validSets.length > 0) {
                return Math.max(...validSets.map(s => s.weight || 0));
            }
            return workout.maxWeight;
        }
        // Not ramping: use first set weight
        return sets[0]?.weight || workout.maxWeight;
    }
    
    async showCoachingAdvice() {
        const adviceCard = document.getElementById('coaching-advice');
        if (!this.currentSlot) {
            adviceCard.style.display = 'none';
            return;
        }
        
        // Use stored advice or calculate if not available
        const advice = this.currentCoachingAdvice || await this.calculateCoachingAdvice();
        
        if (!advice) {
            adviceCard.style.display = 'none';
            return;
        }
        
        // Remove all advice classes and add the new one
        adviceCard.className = 'coaching-advice advice-' + advice.type;
        adviceCard.style.display = 'block';
        
        // Update icon and title
        const iconEl = document.getElementById('coaching-advice-icon');
        iconEl.innerHTML = this.getAdviceIconSVG(advice.icon || advice.type);

        document.getElementById('coaching-advice-title').textContent = advice.title;
        document.getElementById('coaching-advice-message').textContent = advice.message;
        
        // Update suggested weight with trend arrow
        document.getElementById('coaching-suggested-weight').textContent = advice.suggestedWeight + ' kg';
        
        const trendEl = document.getElementById('coaching-weight-trend');
        trendEl.className = 'coaching-weight-trend trend-' + advice.weightTrend;
        trendEl.innerHTML = this.getTrendArrowSVG(advice.weightTrend);
        
        // Update suggested reps
        document.getElementById('coaching-suggested-reps').textContent = advice.suggestedReps;
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
        const slot = this.currentSlot;
        const exerciseId = slot.activeExercise || slot.name;
        const isIsolation = slot.type === 'isolation';
        
        // Get settings with ?? to handle 0 values correctly
        const failureThreshold = (await db.getSetting('failureCount')) ?? 5;
        const deloadPercent = (await db.getSetting('deloadPercent')) ?? 10;
        const baseWeightIncrement = (await db.getSetting('weightIncrement')) ?? 2;
        
        // Check if deload mode is active
        const isDeloadMode = this.isDeloadMode || (await db.getSetting('isDeloadMode')) || false;
        const deloadIntensityReduction = (await db.getSetting('deloadPercent')) ?? 10;
        
        // Isolation: micro-loading (+0.5-1kg), Compound: +2.5kg
        const weightIncrement = isIsolation ? Math.min(baseWeightIncrement, 1) : baseWeightIncrement;
        // Isolation: RPE 10 allowed, Compound: max RPE 9 for safety
        const maxSafeRpe = isIsolation ? 10 : 9;
        
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
        
        // === DELOAD MODE: Reduce intensity and provide specific advice ===
        if (isDeloadMode) {
            const deloadWeight = Math.round(lastWeight * (1 - deloadIntensityReduction / 100) * 2) / 2;
            const deloadSets = Math.max(2, Math.ceil(slot.sets * 0.5)); // 50% des séries, min 2
            const deloadReps = this.formatTargetReps(this.genTargetReps(slot.repsMin, slot.repsMax, deloadSets));
            
            return {
                type: 'deload',
                icon: 'maintain',
                title: '🔋 Mode Deload actif',
                message: `Semaine de récupération ! Charge réduite à ${deloadWeight}kg (-${deloadIntensityReduction}%), fais seulement ${deloadSets} séries. Focus sur la technique et le contrôle, pas l'intensité.`,
                suggestedWeight: deloadWeight,
                weightTrend: 'down',
                suggestedReps: deloadReps,
                isDeload: true
            };
        }
        const hasRealRpe = lastWorkout.hasRealRpe;
        const lastAvgRpe = lastWorkout.avgRpe;
        
        // === EFFECTIVE REPS CALCULATION (only if RPE data exists) ===
        let effectiveRepsPerSet = null;
        if (hasRealRpe) {
            const setsWithRpe = lastSets.filter(s => s.rpe != null);
            const totalEffective = setsWithRpe.reduce((sum, s) => {
                return sum + (this.effectiveRepsFromSet(s.reps, s.rpe) || 0);
            }, 0);
            effectiveRepsPerSet = setsWithRpe.length > 0 ? totalEffective / setsWithRpe.length : null;
        }
        
        // Effort thresholds for effective reps
        const LOW_EFF = 1.5;  // per set average - too easy
        const HIGH_EFF = 3.0; // per set average - hard effort
        
        // === ANALYZE FIRST SET (most important for progression) ===
        const firstSet = lastSets[0];
        const firstSetReps = firstSet?.reps || 0;
        const firstSetRpe = firstSet?.rpe;
        const firstSetHitMax = firstSetReps >= slot.repsMax;
        const firstSetBelowMin = firstSetReps < slot.repsMin;
        
        // Check if ALL sets hit repsMax (only if enough sets recorded)
        const enoughSets = lastSets.length >= slot.sets;
        const allSetsHitMax = enoughSets && lastSets.every(s => (s.reps || 0) >= slot.repsMax);
        
        // === CASE 2: Only one workout ===
        if (workouts.length === 1) {
            if (allSetsHitMax) {
                // Determine increment based on effort
                let increment = weightIncrement;
                if (hasRealRpe && effectiveRepsPerSet !== null && effectiveRepsPerSet < LOW_EFF) {
                    // Very easy - more aggressive increase for compounds
                    increment = isIsolation ? weightIncrement : weightIncrement * 1.5;
                }
                const newWeight = Math.round((lastWeight + increment) * 2) / 2;
                return {
                    type: 'increase',
                    icon: 'increase',
                    title: 'Prêt à progresser !',
                    message: `${slot.repsMax} reps atteint partout. Passe à ${newWeight}kg !`,
                    suggestedWeight: newWeight,
                    weightTrend: 'up',
                    suggestedReps: targetReps
                };
            } else if (firstSetBelowMin) {
                // Check if it's effort issue or load issue
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
                        message: `Reps basses mais effort faible. Engage-toi plus !`,
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
                message: `Objectif : ${slot.repsMax} reps sur toutes les séries.`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        // === CASE 3: Multiple workouts - PROGRESSION ANALYSIS ===
        const prevWorkout = workouts[1];
        const prevSets = prevWorkout.sets;
        const prevWeight = this.getReferenceWeight(prevWorkout, slot);
        
        const prevFirstSet = prevSets[0];
        const prevFirstReps = prevFirstSet?.reps || 0;
        
        // Progression indicators
        const firstSetRepsImproved = firstSetReps > prevFirstReps;
        const firstSetWeightImproved = lastWeight > prevWeight;
        const overallRepsImproved = lastWorkout.totalReps > prevWorkout.totalReps;
        const overallWeightImproved = lastWorkout.maxWeight > prevWorkout.maxWeight;
        
        const hasProgression = firstSetRepsImproved || firstSetWeightImproved || overallRepsImproved || overallWeightImproved;
        
        // === STAGNATION DETECTION WITH EFFORT AWARENESS ===
        let consecutiveStagnation = 0;
        let lowEffortStagnation = 0;
        let highEffortStagnation = 0;
        
        if (!hasProgression) {
            consecutiveStagnation = 1;
            // Only count effort if we have real RPE data
            if (hasRealRpe && lastAvgRpe !== null) {
                if (lastAvgRpe < 8) lowEffortStagnation++;
                else highEffortStagnation++;
            }
            
            // Check history
            for (let i = 1; i < Math.min(workouts.length - 1, 5); i++) {
                const curr = workouts[i];
                const prev = workouts[i + 1];
                const currFirst = curr.sets[0];
                const prevFirst = prev.sets[0];
                
                const noProgressHere = 
                    (currFirst?.reps || 0) <= (prevFirst?.reps || 0) && 
                    (currFirst?.weight || 0) <= (prevFirst?.weight || 0) &&
                    curr.totalReps <= prev.totalReps;
                
                if (noProgressHere) {
                    consecutiveStagnation++;
                    if (curr.hasRealRpe && curr.avgRpe !== null) {
                        if (curr.avgRpe < 8) lowEffortStagnation++;
                        else highEffortStagnation++;
                    }
                } else {
                    break;
                }
            }
        }
        
        // === HIERARCHIE D'INTERVENTIONS SIMPLIFIÉE ===
        
        // Stagnation 1x : Encouragement + technique
        if (consecutiveStagnation === 1) {
            if (hasRealRpe && effectiveRepsPerSet !== null && effectiveRepsPerSet < LOW_EFF) {
                return {
                    type: 'maintain',
                    icon: 'target',
                    title: 'Tu as de la marge ! 💪',
                    message: `Pas de progression cette fois, mais ton effort était modéré. La prochaine série, rapproche-toi davantage de l'échec pour maximiser tes gains !`,
                    suggestedWeight: lastWeight,
                    weightTrend: 'same',
                    suggestedReps: targetReps
                };
            }
            const msg = hasRealRpe && lastAvgRpe !== null && lastAvgRpe >= 9 
                ? `Bel effort malgré la stagnation ! C'est normal, le corps ne progresse pas linéairement. Continue avec la même intensité 🔥` 
                : `Première stagnation, pas de panique ! Concentre-toi sur la qualité de chaque rep et essaie de gratter 1 rep de plus.`;
            return {
                type: 'maintain',
                icon: 'target',
                title: 'Persévère',
                message: msg,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        // Stagnation 2x : Suggestion variation tempo/technique
        if (consecutiveStagnation === 2) {
            return {
                type: 'maintain',
                icon: 'warning',
                title: '2 séances sans progrès',
                message: `Essaie de varier le tempo (3s en descente) ou améliore ta technique. Parfois un petit ajustement suffit à débloquer la progression !`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        // Stagnation 3x : Deload volume suggéré
        if (consecutiveStagnation === 3) {
            const deloadReps = this.formatTargetReps(this.genTargetReps(slot.repsMin, slot.repsMax, 2));
            return {
                type: 'maintain',
                icon: 'warning',
                title: '3 séances de stagnation',
                message: `Ton corps a peut-être besoin de récupérer. Fais seulement 2 séries cette fois pour laisser tes muscles se régénérer. La surcompensation fera le reste ! 🔋`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: deloadReps
            };
        }
        
        // Stagnation 4x : Changement de rep-range suggéré
        if (consecutiveStagnation === 4) {
            const alternateReps = slot.repsMin >= 8 
                ? `5-8 reps (plus lourd)` 
                : `10-15 reps (plus léger)`;
            return {
                type: 'maintain',
                icon: 'warning',
                title: '4 séances sans progrès',
                message: `Essaie de changer ta plage de reps pendant 2-3 séances (${alternateReps}) pour stimuler différemment le muscle. Tu pourras revenir ensuite à ta plage habituelle.`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        // Stagnation 5x+ : SUGGESTION de changement d'exercice (pas obligatoire)
        if (consecutiveStagnation >= 5) {
            return {
                type: 'switch',
                icon: 'switch',
                title: `Plateau détecté (${consecutiveStagnation} séances)`,
                message: `Malgré plusieurs tentatives, cet exercice stagne. Tu peux essayer une variante de la pool pour relancer la progression avec un nouveau stimulus. Ce n'est qu'une suggestion - si tu préfères continuer, c'est ton choix !`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps,
                consecutiveStagnation: consecutiveStagnation
            };
        }
        
        // === PROGRESSION PATH ===
        
        // All sets hit max → increase weight
        if (allSetsHitMax) {
            let increment = weightIncrement;
            // More aggressive if low effort
            if (hasRealRpe && effectiveRepsPerSet !== null && effectiveRepsPerSet < LOW_EFF && !isIsolation) {
                increment = weightIncrement * 1.5;
            }
            const newWeight = Math.round((lastWeight + increment) * 2) / 2;
            return {
                type: 'increase',
                icon: 'celebrate',
                title: 'Progression validée ! 🎉',
                message: `Excellente maîtrise de ${lastWeight}kg sur toutes les séries ! Tu as mérité cette progression → ${newWeight}kg. Garde la même technique solide !`,
                suggestedWeight: newWeight,
                weightTrend: 'up',
                suggestedReps: targetReps
            };
        }
        
        // First set hit max → can try increase on S1
        if (firstSetHitMax) {
            const newWeight = Math.round((lastWeight + weightIncrement) * 2) / 2;
            return {
                type: 'increase',
                icon: 'increase',
                title: 'Série 1 au top ! 🚀',
                message: `${slot.repsMax} reps clean sur S1 ! Tente ${newWeight}kg sur la première série. Si c'est trop dur, tu peux redescendre pour les séries suivantes.`,
                suggestedWeight: newWeight,
                weightTrend: 'up',
                suggestedReps: targetReps
            };
        }
        
        // Below minimum → decrease
        if (firstSetBelowMin) {
            // Only decrease if effort was high or no RPE data
            const shouldDecrease = !hasRealRpe || (firstSetRpe != null && firstSetRpe >= 8);
            if (shouldDecrease) {
                const newWeight = Math.round(lastWeight * (1 - deloadPercent / 100) * 2) / 2;
                return {
                    type: 'decrease',
                    icon: 'decrease',
                    title: 'Ajustement nécessaire',
                    message: `Tu étais sous ${slot.repsMin} reps malgré un effort intense. Baisse à ${newWeight}kg pour travailler dans la bonne plage et progresser durablement.`,
                    suggestedWeight: newWeight,
                    weightTrend: 'down',
                    suggestedReps: targetReps
                };
            } else {
                return {
                    type: 'maintain',
                    icon: 'target',
                    title: 'Engage-toi plus ! 💪',
                    message: `Tes reps sont basses mais ton effort semblait modéré. Concentre-toi et pousse plus près de l'échec - c'est là que la magie opère !`,
                    suggestedWeight: lastWeight,
                    weightTrend: 'same',
                    suggestedReps: targetReps
                };
            }
        }
        
        // === DEFAULT: Keep building ===
        return {
            type: 'maintain',
            icon: 'maintain',
            title: 'Continue comme ça 💪',
            message: `Tu progresses bien ! Vise ${slot.repsMax} reps sur toutes les séries avant d'augmenter la charge. Chaque rep compte !`,
            suggestedWeight: lastWeight,
            weightTrend: 'same',
            suggestedReps: targetReps
        };
    }
    
    // Get coaching suggestion for next sets based on current session performance
    async getIntraSessionAdvice(currentSetIndex, currentSetData) {
        if (!this.currentSlot || !this.avgPerformance) return null;
        
        // Only after first set
        if (currentSetIndex !== 0) return null;
        
        // Detect hot/cold day
        const dayStatus = this.getDayStatus(currentSetData, this.avgPerformance);
        
        if (dayStatus === 'hot') {
            return {
                type: 'hot',
                message: 'Journée en forme ! Tu peux viser le haut de la plage.'
            };
        } else if (dayStatus === 'cold') {
            return {
                type: 'cold',
                message: 'Journée difficile. Vise le bas de la plage, garde la forme.'
            };
        }
        return null;
    }
}

// Initialize app
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
