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
        await this.renderHome();
    }

    // ===== Navigation =====
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`screen-${screenId}`).classList.add('active');
        this.currentScreen = screenId;
    }

    // ===== Home Screen =====
    async renderHome() {
        const sessions = await db.getSessions();
        const nextIndex = await db.getSetting('nextSessionIndex') || 0;
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

        // Streak & XP with configurable goal
        const weeklyWorkouts = await db.getSetting('weeklyWorkouts') || 0;
        const weeklyGoal = await db.getSetting('weeklyGoal') || 3;
        document.getElementById('streak-count').textContent = `${weeklyWorkouts}/${weeklyGoal}`;
        
        const xp = await db.getSetting('xp') || 0;
        document.getElementById('xp-fill').style.width = `${Math.min(xp % 1000 / 10, 100)}%`;

        // Render stats
        await this.renderStats();

        this.showScreen('home');
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
    }
    
    formatVolume(vol) {
        if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
        if (vol >= 1000) return (vol / 1000).toFixed(1) + 'k';
        return vol.toString();
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
            ctx.roundRect(x, y, bWidth, barHeight, 6);
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

    // ===== Session Screen =====
    async startSession(session) {
        this.currentSession = session;
        this.sessionStartTime = Date.now();
        
        // Initialize current workout
        this.currentWorkout = {
            sessionId: session.id,
            startTime: this.sessionStartTime,
            slots: {},
            completedSlots: []
        };
        await db.saveCurrentWorkout(this.currentWorkout);

        document.getElementById('current-session-name').textContent = session.name;
        
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
            
            const card = await this.createSlotCard(slot, isCompleted, isFirstInSuperset, isSecondInSuperset, firstSlotId);
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
    
    // ===== Performance Status =====
    async getExerciseStatus(slot) {
        const exerciseId = slot.activeExercise || slot.name;
        
        // Get all set history for this exercise
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        
        if (allSetHistory.length === 0) {
            return { class: '', title: 'Pas encore de données' };
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
        
        // Sort workouts by date (most recent first)
        const workouts = Object.values(workoutGroups).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        
        if (workouts.length < 2) {
            return { class: '', title: 'Pas assez de données' };
        }
        
        // Compare last 2 workouts
        const current = workouts[0];
        const previous = workouts[1];
        
        const repsImproved = current.totalReps > previous.totalReps;
        const weightImproved = current.maxWeight > previous.maxWeight;
        const repsSame = current.totalReps === previous.totalReps;
        const weightSame = current.maxWeight === previous.maxWeight;
        
        if (repsImproved || weightImproved) {
            return { class: 'success', title: 'Progression !' };
        } else if (repsSame && weightSame) {
            // Check if this is second failure in a row
            if (workouts.length >= 3) {
                const beforePrevious = workouts[2];
                const prevRepsStable = previous.totalReps <= beforePrevious.totalReps;
                const prevWeightStable = previous.maxWeight <= beforePrevious.maxWeight;
                
                if (prevRepsStable && prevWeightStable) {
                    return { class: 'danger', title: 'Échec 2 - Switch recommandé' };
                }
            }
            return { class: 'warning', title: 'Échec 1 - Performance stable' };
        } else {
            // Regression
            if (workouts.length >= 3) {
                const beforePrevious = workouts[2];
                const prevRegressed = previous.totalReps < beforePrevious.totalReps;
                if (prevRegressed) {
                    return { class: 'danger', title: 'Échec 2 - Switch recommandé' };
                }
            }
            return { class: 'warning', title: 'Échec 1 - Régression' };
        }
    }

    async createSlotCard(slot, isCompleted, isFirstInSuperset = false, isSecondInSuperset = false, firstSlotId = null) {
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
            ? '<span class="superset-badge">⚡ SuperSet</span>' 
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
        let xp = await db.getSetting('xp') || 0;
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
        
        // Calculate target reps based on series position (higher reps earlier, fatigue later)
        const getTargetReps = (setIndex) => {
            const { repsMin, repsMax, sets } = this.currentSlot;
            // First series: aim for max, last series: aim for middle of range
            if (setIndex === 0) return repsMax;
            if (setIndex === sets - 1) return Math.round((repsMin + repsMax) / 2);
            return repsMax; // Middle series still aim high
        };

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

        // Save set data
        const slotData = this.currentWorkout.slots[this.currentSlot.id];
        slotData.sets[setIndex] = {
            weight,
            reps,
            completed: true,
            timestamp: Date.now()
        };

        await db.saveCurrentWorkout(this.currentWorkout);

        // Add XP
        let xp = await db.getSetting('xp') || 0;
        xp += 10;
        await db.setSetting('xp', xp);

        this.renderSeries();

        // Check if all sets are complete
        const completedSets = slotData.sets.filter(s => s.completed).length;
        if (completedSets === this.currentSlot.sets) {
            // Show summary after a brief delay
            setTimeout(() => this.showExerciseSummary(), 300);
        } else {
            // Start rest timer
            this.startRestTimer(this.currentSlot.rest);
        }
    }

    // ===== Rest Timer =====
    startRestTimer(seconds) {
        this.restTimeLeft = seconds;
        this.restTimeTotal = seconds;
        const overlay = document.getElementById('timer-overlay');
        const countdown = document.getElementById('timer-countdown');
        const progressRing = document.getElementById('timer-ring-progress');
        
        overlay.classList.add('active');
        countdown.textContent = this.restTimeLeft;
        countdown.classList.remove('ending');
        
        // Update progress ring
        this.updateTimerProgress();
        
        // Vibrate on start (if supported)
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        this.restTimer = setInterval(() => {
            this.restTimeLeft--;
            countdown.textContent = this.restTimeLeft;
            this.updateTimerProgress();
            
            // Add ending animation when < 5 seconds
            if (this.restTimeLeft <= 5 && this.restTimeLeft > 0) {
                countdown.classList.add('ending');
                if (navigator.vibrate) {
                    navigator.vibrate(30);
                }
            }

            if (this.restTimeLeft <= 0) {
                this.onTimerComplete();
            }
        }, 1000);
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
        document.getElementById('timer-overlay').classList.remove('active');
        document.getElementById('timer-countdown').classList.remove('ending');
    }

    adjustRestTimer(seconds) {
        this.restTimeLeft = Math.max(0, this.restTimeLeft + seconds);
        this.restTimeTotal = Math.max(this.restTimeTotal, this.restTimeLeft);
        document.getElementById('timer-countdown').textContent = this.restTimeLeft;
        this.updateTimerProgress();
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

        // Save workout to history
        const workoutRecord = {
            sessionId: this.currentSession.id,
            date: new Date().toISOString(),
            duration: Date.now() - this.sessionStartTime,
            slots: this.currentWorkout.slots,
            completedSlots: this.currentWorkout.completedSlots
        };

        const workoutId = await db.add('workoutHistory', workoutRecord);

        // Save individual sets to history
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
                        date: new Date().toISOString()
                    });
                }
            }
        }

        // Update next session index
        const sessions = await db.getSessions();
        let nextIndex = await db.getSetting('nextSessionIndex') || 0;
        nextIndex = (nextIndex + 1) % sessions.length;
        await db.setSetting('nextSessionIndex', nextIndex);

        // Update weekly workouts
        let weeklyWorkouts = await db.getSetting('weeklyWorkouts') || 0;
        const lastWorkoutDate = await db.getSetting('lastWorkoutDate');
        const now = new Date();
        
        if (lastWorkoutDate) {
            const lastDate = new Date(lastWorkoutDate);
            const daysDiff = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
            if (daysDiff >= 7) {
                weeklyWorkouts = 1;
            } else {
                weeklyWorkouts = Math.min(weeklyWorkouts + 1, 7);
            }
        } else {
            weeklyWorkouts = 1;
        }

        await db.setSetting('weeklyWorkouts', weeklyWorkouts);
        await db.setSetting('lastWorkoutDate', now.toISOString());

        // Clear current workout
        await db.clearCurrentWorkout();
        this.currentWorkout = null;

        // Go back home
        await this.renderHome();
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
        const nextIndex = await db.getSetting('nextSessionIndex') || 0;
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
        const weeklyGoal = await db.getSetting('weeklyGoal') || 3;
        const failureCount = await db.getSetting('failureCount') || 2;
        const deloadPercent = await db.getSetting('deloadPercent') || 10;
        const weightIncrement = await db.getSetting('weightIncrement') || 2;
        const lockWeeks = await db.getSetting('lockWeeks') || 4;
        
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
            { id: 'setting-lock-weeks', valueId: 'setting-lock-weeks-value' }
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
        
        await db.setSetting('weeklyGoal', weeklyGoal);
        await db.setSetting('failureCount', failureCount);
        await db.setSetting('deloadPercent', deloadPercent);
        await db.setSetting('weightIncrement', weightIncrement);
        await db.setSetting('lockWeeks', lockWeeks);
        
        this.hideSettingsSheet();
        
        // Update streak display with new goal
        const weeklyWorkouts = await db.getSetting('weeklyWorkouts') || 0;
        document.getElementById('streak-count').textContent = `${weeklyWorkouts}/${weeklyGoal}`;
    }
    
    // ===== Coaching Intelligence =====
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
        
        // Get settings
        const failureThreshold = await db.getSetting('failureCount') || 2;
        const deloadPercent = await db.getSetting('deloadPercent') || 10;
        const weightIncrement = await db.getSetting('weightIncrement') || 2;
        
        // Get all set history for this exercise
        const allSetHistory = await db.getByIndex('setHistory', 'exerciseId', exerciseId);
        
        // Group by workout
        const workoutGroups = {};
        for (const set of allSetHistory) {
            if (!workoutGroups[set.workoutId]) {
                workoutGroups[set.workoutId] = {
                    date: set.date,
                    sets: [],
                    totalReps: 0,
                    maxWeight: 0,
                    avgWeight: 0
                };
            }
            workoutGroups[set.workoutId].sets.push(set);
            workoutGroups[set.workoutId].totalReps += set.reps || 0;
            workoutGroups[set.workoutId].maxWeight = Math.max(workoutGroups[set.workoutId].maxWeight, set.weight || 0);
        }
        
        // Calculate average weight for each workout
        for (const wId of Object.keys(workoutGroups)) {
            const sets = workoutGroups[wId].sets;
            const totalWeight = sets.reduce((sum, s) => sum + (s.weight || 0), 0);
            workoutGroups[wId].avgWeight = sets.length > 0 ? totalWeight / sets.length : 0;
        }
        
        // Sort workouts by date (most recent first)
        const workouts = Object.values(workoutGroups).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        
        // Default target reps (middle of range)
        const targetReps = `${slot.repsMax} / ${slot.repsMax} / ${Math.round((slot.repsMin + slot.repsMax) / 2)}`;
        
        // === CASE 1: First time on this exercise ===
        if (workouts.length === 0) {
            return {
                type: 'new',
                icon: 'new',
                title: 'Nouvel exercice',
                message: `Première fois sur cet exercice ! Commence léger pour maîtriser la technique. Vise ${slot.repsMax} reps sur chaque série.`,
                suggestedWeight: '?',
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        const lastWorkout = workouts[0];
        const lastWeight = lastWorkout.avgWeight || lastWorkout.maxWeight;
        const lastTotalReps = lastWorkout.totalReps;
        const lastSets = lastWorkout.sets;
        
        // Check if all sets hit top of rep range
        const targetTotalReps = slot.sets * slot.repsMax;
        const hitTopRange = lastTotalReps >= targetTotalReps;
        
        // Check if first set was below minimum
        const firstSetReps = lastSets.length > 0 ? lastSets[0].reps : 0;
        const belowMinRange = firstSetReps < slot.repsMin;
        
        // === CASE 2: Only one workout - not enough data for progression check ===
        if (workouts.length === 1) {
            if (hitTopRange) {
                // They crushed it! Suggest increase
                const newWeight = Math.round((lastWeight + weightIncrement) * 2) / 2;
                return {
                    type: 'increase',
                    icon: 'increase',
                    title: 'Prêt à progresser !',
                    message: `Tu as atteint ${slot.repsMax} reps sur toutes les séries. Augmente la charge !`,
                    suggestedWeight: newWeight,
                    weightTrend: 'up',
                    suggestedReps: targetReps
                };
            } else if (belowMinRange) {
                // Too heavy
                const newWeight = Math.round(lastWeight * (1 - deloadPercent / 100) * 2) / 2;
                return {
                    type: 'decrease',
                    icon: 'warning',
                    title: 'Charge trop élevée',
                    message: `Tu n'atteins pas ${slot.repsMin} reps sur la 1ère série. Baisse la charge pour rester dans la plage.`,
                    suggestedWeight: newWeight,
                    weightTrend: 'down',
                    suggestedReps: targetReps
                };
            } else {
                // Keep working
                return {
                    type: 'maintain',
                    icon: 'target',
                    title: 'Continue comme ça',
                    message: `Objectif : atteindre ${slot.repsMax} reps sur toutes les séries avant d'augmenter.`,
                    suggestedWeight: lastWeight,
                    weightTrend: 'same',
                    suggestedReps: targetReps
                };
            }
        }
        
        // === CASE 3: Multiple workouts - check progression ===
        const prevWorkout = workouts[1];
        const prevTotalReps = prevWorkout.totalReps;
        const prevMaxWeight = prevWorkout.maxWeight;
        
        // Determine if there was progression
        const repsImproved = lastTotalReps > prevTotalReps;
        const weightImproved = lastWorkout.maxWeight > prevMaxWeight;
        const noProgress = !repsImproved && !weightImproved;
        
        // Count consecutive failures
        let consecutiveFailures = 0;
        if (noProgress) {
            consecutiveFailures = 1;
            // Check further back
            for (let i = 1; i < workouts.length - 1; i++) {
                const curr = workouts[i];
                const prev = workouts[i + 1];
                if (curr.totalReps <= prev.totalReps && curr.maxWeight <= prev.maxWeight) {
                    consecutiveFailures++;
                } else {
                    break;
                }
            }
        }
        
        // === Check for fatigue pattern (3+ exercises regressing) ===
        // This would require session-level analysis, simplified here
        
        // === CASE 4: Consecutive failures - suggest switch ===
        if (consecutiveFailures >= failureThreshold) {
            return {
                type: 'switch',
                icon: 'switch',
                title: `${consecutiveFailures} échecs - Switch recommandé`,
                message: `Stagnation détectée depuis ${consecutiveFailures} séances. Change d'exercice pour relancer la progression.`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        // === CASE 5: One failure ===
        if (noProgress) {
            return {
                type: 'maintain',
                icon: 'warning',
                title: 'Échec 1 - Persévère',
                message: `Pas de progression cette fois. Concentre-toi sur la technique et gratte 1 rep !`,
                suggestedWeight: lastWeight,
                weightTrend: 'same',
                suggestedReps: targetReps
            };
        }
        
        // === CASE 6: Progression achieved ===
        if (hitTopRange) {
            const newWeight = Math.round((lastWeight + weightIncrement) * 2) / 2;
            return {
                type: 'increase',
                icon: 'increase',
                title: 'Progression validée !',
                message: `Excellent ! Tu as atteint ${slot.repsMax} reps partout. Augmente la charge !`,
                suggestedWeight: newWeight,
                weightTrend: 'up',
                suggestedReps: targetReps
            };
        }
        
        // === CASE 7: Below minimum range ===
        if (belowMinRange) {
            const newWeight = Math.round(lastWeight * (1 - deloadPercent / 100) * 2) / 2;
            return {
                type: 'decrease',
                icon: 'decrease',
                title: 'Baisse suggérée',
                message: `Tu es sous la plage cible (${slot.repsMin}-${slot.repsMax}). Réduis la charge pour progresser proprement.`,
                suggestedWeight: newWeight,
                weightTrend: 'down',
                suggestedReps: targetReps
            };
        }
        
        // === CASE 8: Normal progression - keep going ===
        return {
            type: 'maintain',
            icon: 'maintain',
            title: 'Bonne progression',
            message: `Tu progresses ! Continue à viser ${slot.repsMax} reps sur chaque série avant d'augmenter.`,
            suggestedWeight: lastWeight,
            weightTrend: 'same',
            suggestedReps: targetReps
        };
    }
}

// Initialize app
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
