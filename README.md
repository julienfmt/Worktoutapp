# Muscu - Training App

Application web offline-first pour suivre tes séances de musculation, gérer tes exercices (supersets inclus), voir tes stats et exporter/importer tes données. Fonctionne totalement côté client avec IndexedDB et un service worker.

## Fonctionnalités clés
- 📲 PWA installable (manifest + service worker) pour un usage hors-ligne.
- 🏋️ Gestion de séances et d’exercices avec supersets, temps de repos, RIR et instructions.
- 📈 Statistiques : volume, fréquence des séances, XP, motivation dynamique.
- ⏱️ Timer de repos avec persistance même si l’app passe en arrière-plan.
- 📒 Logbook automatique des séries (setHistory) et recommandations/coaching.
- 🧠 Règles de progression paramétrables (objectif hebdo, incrément de charge, deload, seuil d’échecs, période de lock).
- 💾 Import/export JSON des données locales pour sauvegarder/restaurer.

## Stack technique
- Frontend pur : HTML, CSS, JavaScript vanilla.
- Stockage : IndexedDB (abstraction dans `db.js`).
- Données initiales : `data.js` (sessions, slots, pools d’exercices).
- Service worker : `sw.js` (cache statique + stratégie network-first pour `index.html`).
- PWA : `manifest.json` + icônes maskables.

## Structure des fichiers
- `index.html` : structure des écrans (accueil, séance, exercice, paramètres, bottom sheets, modals).
- `styles.css` : design mobile-first et composants (cards, boutons, charts, overlays, etc.).
- `app.js` : logique principale (navigation, timers, logbook, coaching, charts, import/export, superset, progression, etc.).
- `data.js` : données de départ (séances Bras/Pecs A/B et slots associés).
- `db.js` : couche IndexedDB (stores `sessions`, `slots`, `workoutHistory`, `setHistory`, `settings`, `currentWorkout`).
- `sw.js` : service worker et cache des assets.
- `manifest.json` : configuration PWA.
- `icons/` : icônes 192/512 maskables au format SVG.

## Démarrage rapide (local)
1. Clone ou copie ce dossier.
2. Ouvre `index.html` dans ton navigateur **ou** sers-le via un petit serveur statique (recommandé pour le SW) :
   - Node : `npx serve .` puis ouvre l’URL locale.
3. Autorise le stockage persistant si le navigateur le demande (important sur iOS/SAFARI pour garder les données > 7 jours).

## Sauvegarde & restauration
- **Exporter** : bouton « Exporter » (Accueil) → télécharge un JSON avec `sessions`, `slots`, `workoutHistory`, `setHistory`, `settings`.
- **Importer** : bouton « Importer » puis choisis un fichier JSON précédemment exporté. Attention : l’import remplace les données locales actuelles.

## Données & persistance
- Toutes les données sont locales (IndexedDB). Aucun backend.
- Le service worker met en cache les assets pour l’usage offline.
- La logique vérifie et demande `navigator.storage.persist()` pour limiter l’effacement automatique (notamment sur iOS).

## Déploiement
Appli 100% statique : dépose le contenu du dossier sur n’importe quel hébergeur de fichiers statiques (Netlify, Vercel, GitHub Pages, serveur perso). Assure-toi que :
- `index.html` est servi à la racine.
- Le scope du service worker reste `./` (chemins relatifs déjà configurés).

## Notes d’usage
- Les timers de repos se restaurent après un retour depuis l’arrière-plan.
- Les supersets affichent un bouton dédié « Lancer SuperSet » et le logbook comporte deux cartes.
- La progression/coaching se base sur l’historique des séries par exercice (comparaison des deux dernières séances).

## Licence
Non spécifiée. À définir selon tes besoins.
