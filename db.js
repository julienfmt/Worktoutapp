// ===== IndexedDB Database Layer =====
const DB_NAME = 'MuscuDB';
const DB_VERSION = 1;

// Storage management configuration
const STORAGE_CONFIG = {
    OLD_DATA_THRESHOLD_DAYS: 90,  // Delete detailed data older than 90 days
    CLEANUP_ON_INIT: true,         // Run cleanup on app initialization
    PRESERVE_ESSENTIAL_DATA: true  // Keep e1RM history and volume trends
};

class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        await this.requestPersistentStorage();
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store pour les séances (définitions)
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionsStore.createIndex('order', 'order', { unique: false });
                }

                // Store pour les slots (exercices dans chaque séance)
                if (!db.objectStoreNames.contains('slots')) {
                    const slotsStore = db.createObjectStore('slots', { keyPath: 'id' });
                    slotsStore.createIndex('sessionId', 'sessionId', { unique: false });
                }

                // Store pour l'historique des séances réalisées
                if (!db.objectStoreNames.contains('workoutHistory')) {
                    const historyStore = db.createObjectStore('workoutHistory', { keyPath: 'id', autoIncrement: true });
                    historyStore.createIndex('sessionId', 'sessionId', { unique: false });
                    historyStore.createIndex('date', 'date', { unique: false });
                }

                // Store pour l'historique des séries (performances)
                if (!db.objectStoreNames.contains('setHistory')) {
                    const setStore = db.createObjectStore('setHistory', { keyPath: 'id', autoIncrement: true });
                    setStore.createIndex('slotId', 'slotId', { unique: false });
                    setStore.createIndex('exerciseId', 'exerciseId', { unique: false });
                    setStore.createIndex('workoutId', 'workoutId', { unique: false });
                    setStore.createIndex('date', 'date', { unique: false });
                }

                // Store pour les paramètres de l'app
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // Store pour la séance en cours
                if (!db.objectStoreNames.contains('currentWorkout')) {
                    db.createObjectStore('currentWorkout', { keyPath: 'id' });
                }
            };
        });
    }

    async requestPersistentStorage() {
        if (navigator.storage && navigator.storage.persist) {
            try {
                const isPersisted = await navigator.storage.persisted();
                
                if (!isPersisted) {
                    const granted = await navigator.storage.persist();
                    if (granted) {
                        console.log("✅ Stockage persistant accordé");
                    } else {
                        console.warn("❌ Stockage persistant refusé - Les données peuvent être supprimées après 7 jours d'inactivité sur iOS");
                        console.warn("💡 Conseil: Installez l'app sur l'écran d'accueil pour garantir la persistance");
                    }
                } else {
                    console.log("✅ Stockage déjà persistant");
                }
                
                // Afficher les informations sur le quota de stockage
                if (navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
                    const usageMB = (estimate.usage / 1024 / 1024).toFixed(2);
                    const availableMB = ((estimate.quota - estimate.usage) / 1024 / 1024).toFixed(2);
                    console.log(`📊 Quota: ${quotaMB}MB | Utilisé: ${usageMB}MB | Disponible: ${availableMB}MB`);
                }
            } catch (error) {
                console.error("Erreur lors de la demande de stockage persistant:", error);
            }
        } else {
            console.warn("⚠️ API Storage non disponible - La persistance ne peut pas être garantie");
        }
    }

    // Generic CRUD operations
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Sessions specific methods
    async getSessions() {
        const sessions = await this.getAll('sessions');
        return sessions.sort((a, b) => a.order - b.order);
    }

    async getSlotsBySession(sessionId) {
        const slots = await this.getByIndex('slots', 'sessionId', sessionId);
        return slots.sort((a, b) => a.order - b.order);
    }

    // Settings
    async getSetting(key) {
        const setting = await this.get('settings', key);
        return setting ? setting.value : null;
    }

    async setSetting(key, value) {
        return this.put('settings', { key, value });
    }

    // Current workout
    async getCurrentWorkout() {
        const workouts = await this.getAll('currentWorkout');
        return workouts[0] || null;
    }

    async saveCurrentWorkout(workout) {
        await this.clear('currentWorkout');
        if (workout) {
            return this.put('currentWorkout', { id: 'current', ...workout });
        }
    }

    async clearCurrentWorkout() {
        return this.clear('currentWorkout');
    }

    async getStorageInfo() {
        const info = {
            isPersisted: false,
            quota: null,
            usage: null,
            available: null
        };

        if (navigator.storage) {
            try {
                if (navigator.storage.persisted) {
                    info.isPersisted = await navigator.storage.persisted();
                }
                
                if (navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    info.quota = estimate.quota;
                    info.usage = estimate.usage;
                    info.available = estimate.quota - estimate.usage;
                }
            } catch (error) {
                console.error("Erreur lors de la récupération des informations de stockage:", error);
            }
        }

        return info;
    }

    // Storage cleanup - Remove old detailed workout data while preserving essential trends
    async cleanupOldData() {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - STORAGE_CONFIG.OLD_DATA_THRESHOLD_DAYS);
        
        console.log(`🧹 Nettoyage des données antérieures au ${thresholdDate.toLocaleDateString()}`);
        
        let deletedWorkouts = 0;
        let deletedSets = 0;
        let preservedWorkouts = 0;
        
        if (!STORAGE_CONFIG.PRESERVE_ESSENTIAL_DATA) {
            // Simple deletion without preservation
            const workouts = await this.getAll('workoutHistory');
            for (const workout of workouts) {
                const workoutDate = new Date(workout.date);
                if (workoutDate < thresholdDate) {
                    await this.delete('workoutHistory', workout.id);
                    deletedWorkouts++;
                    
                    // Delete associated sets
                    const sets = await this.getByIndex('setHistory', 'workoutId', workout.id);
                    for (const set of sets) {
                        await this.delete('setHistory', set.id);
                        deletedSets++;
                    }
                }
            }
        } else {
            // Intelligent cleanup: preserve essential data for e1RM trends
            const workouts = await this.getAll('workoutHistory');
            const exerciseE1RMMap = new Map(); // Track best e1RM per exercise
            
            // First pass: identify best performances per exercise
            for (const workout of workouts) {
                const workoutDate = new Date(workout.date);
                if (workoutDate < thresholdDate) {
                    const sets = await this.getByIndex('setHistory', 'workoutId', workout.id);
                    
                    for (const set of sets) {
                        if (set.weight && set.reps && set.rpe) {
                            const key = set.exerciseId;
                            const e1rm = this.calculateE1RM(set.weight, set.reps, set.rpe);
                            
                            if (!exerciseE1RMMap.has(key) || e1rm > exerciseE1RMMap.get(key).e1rm) {
                                exerciseE1RMMap.set(key, {
                                    e1rm,
                                    setId: set.id,
                                    date: set.date,
                                    weight: set.weight,
                                    reps: set.reps,
                                    rpe: set.rpe
                                });
                            }
                        }
                    }
                }
            }
            
            // Second pass: delete old data except preserved sets
            const preservedSetIds = new Set(
                Array.from(exerciseE1RMMap.values()).map(v => v.setId)
            );
            
            for (const workout of workouts) {
                const workoutDate = new Date(workout.date);
                if (workoutDate < thresholdDate) {
                    const sets = await this.getByIndex('setHistory', 'workoutId', workout.id);
                    let hasPreservedSets = false;
                    
                    // Delete non-essential sets
                    for (const set of sets) {
                        if (!preservedSetIds.has(set.id)) {
                            await this.delete('setHistory', set.id);
                            deletedSets++;
                        } else {
                            hasPreservedSets = true;
                        }
                    }
                    
                    // Delete workout if no preserved sets remain
                    if (!hasPreservedSets) {
                        await this.delete('workoutHistory', workout.id);
                        deletedWorkouts++;
                    } else {
                        preservedWorkouts++;
                    }
                }
            }
        }
        
        // Check storage after cleanup
        const storageInfo = await this.getStorageInfo();
        
        console.log(`✅ Nettoyage terminé:`);
        console.log(`   - ${deletedWorkouts} séances supprimées`);
        console.log(`   - ${deletedSets} séries supprimées`);
        console.log(`   - ${preservedWorkouts} séances conservées (données essentielles)`);
        
        if (storageInfo.usage) {
            const usageMB = (storageInfo.usage / 1024 / 1024).toFixed(2);
            console.log(`   - Stockage utilisé: ${usageMB}MB`);
        }
        
        return {
            deletedWorkouts,
            deletedSets,
            preservedWorkouts,
            thresholdDate: thresholdDate.toISOString()
        };
    }
    
    // Simple e1RM calculation for cleanup (RPE-aware Brzycki)
    calculateE1RM(weight, reps, rpe = 10) {
        if (!weight || weight <= 0 || !reps || reps <= 0) return 0;
        const rir = 10 - rpe;
        const totalPotentialReps = reps + rir;
        if (totalPotentialReps >= 37) {
            return weight * (1 + totalPotentialReps * 0.025);
        }
        return weight / (1.0278 - 0.0278 * totalPotentialReps);
    }
    
    // Check if cleanup is needed based on storage usage
    async shouldCleanup() {
        const storageInfo = await this.getStorageInfo();
        
        // Trigger cleanup if usage > 80% of quota
        if (storageInfo.quota && storageInfo.usage) {
            const usagePercent = (storageInfo.usage / storageInfo.quota) * 100;
            if (usagePercent > 80) {
                console.warn(`⚠️ Stockage à ${usagePercent.toFixed(1)}% - nettoyage recommandé`);
                return true;
            }
        }
        
        // Also check if old data exists
        const oldWorkouts = await this.getOldWorkoutCount();
        return oldWorkouts > 0;
    }
    
    // Count workouts older than threshold
    async getOldWorkoutCount() {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - STORAGE_CONFIG.OLD_DATA_THRESHOLD_DAYS);
        
        const workouts = await this.getAll('workoutHistory');
        return workouts.filter(w => new Date(w.date) < thresholdDate).length;
    }

    // Export all data (including currentWorkout for complete backup)
    async exportData() {
        const data = {
            sessions: await this.getAll('sessions'),
            slots: await this.getAll('slots'),
            workoutHistory: await this.getAll('workoutHistory'),
            setHistory: await this.getAll('setHistory'),
            settings: await this.getAll('settings'),
            currentWorkout: await this.getAll('currentWorkout'),
            exportDate: new Date().toISOString(),
            version: DB_VERSION
        };
        return data;
    }

    // Import data (with validation)
    async importData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Données invalides');
        }
        
        console.log('📥 Import des données...');
        
        // Clear existing data
        await this.clear('sessions');
        await this.clear('slots');
        await this.clear('workoutHistory');
        await this.clear('setHistory');
        await this.clear('settings');
        await this.clear('currentWorkout');

        // Import new data with counts
        let counts = {
            sessions: 0,
            slots: 0,
            workouts: 0,
            sets: 0,
            settings: 0,
            currentWorkout: 0
        };
        
        for (const session of (data.sessions || [])) {
            await this.put('sessions', session);
            counts.sessions++;
        }
        for (const slot of (data.slots || [])) {
            await this.put('slots', slot);
            counts.slots++;
        }
        for (const workout of (data.workoutHistory || [])) {
            await this.put('workoutHistory', workout);
            counts.workouts++;
        }
        for (const set of (data.setHistory || [])) {
            await this.put('setHistory', set);
            counts.sets++;
        }
        for (const setting of (data.settings || [])) {
            await this.put('settings', setting);
            counts.settings++;
        }
        for (const current of (data.currentWorkout || [])) {
            await this.put('currentWorkout', current);
            counts.currentWorkout++;
        }
        
        console.log('✅ Import terminé:', counts);
        return counts;
    }
}

const db = new Database();
