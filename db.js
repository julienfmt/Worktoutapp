// ===== IndexedDB Database Layer =====
const DB_NAME = 'MuscuDB';
const DB_VERSION = 1;

class Database {
    constructor() {
        this.db = null;
    }

    async init() {
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

    // Export all data
    async exportData() {
        const data = {
            sessions: await this.getAll('sessions'),
            slots: await this.getAll('slots'),
            workoutHistory: await this.getAll('workoutHistory'),
            setHistory: await this.getAll('setHistory'),
            settings: await this.getAll('settings'),
            exportDate: new Date().toISOString()
        };
        return data;
    }

    // Import data
    async importData(data) {
        // Clear existing data
        await this.clear('sessions');
        await this.clear('slots');
        await this.clear('workoutHistory');
        await this.clear('setHistory');
        await this.clear('settings');

        // Import new data
        for (const session of (data.sessions || [])) {
            await this.put('sessions', session);
        }
        for (const slot of (data.slots || [])) {
            await this.put('slots', slot);
        }
        for (const workout of (data.workoutHistory || [])) {
            await this.put('workoutHistory', workout);
        }
        for (const set of (data.setHistory || [])) {
            await this.put('setHistory', set);
        }
        for (const setting of (data.settings || [])) {
            await this.put('settings', setting);
        }
    }
}

const db = new Database();
