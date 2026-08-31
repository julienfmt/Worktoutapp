# Muscu - Training App

Application web offline-first pour suivre tes séances de musculation, gérer tes exercices (supersets inclus), voir tes stats et exporter/importer tes données. Fonctionne totalement côté client avec IndexedDB et un service worker.

## Fonctionnalités clés
- 📲 PWA installable (manifest + service worker) pour un usage hors-ligne.
- 🏋️ Gestion de séances et d’exercices avec supersets, temps de repos, RIR et instructions.
- 📈 Statistiques : volume, fréquence des séances, XP, motivation dynamique.
- ⏱️ Timer de repos avec persistance même si l’app passe en arrière-plan.
- 📒 Logbook automatique des séries (setHistory) et recommandations/coaching.
- 📊 Historique enrichi par exercice — y compris côtés unilatéraux et supersets : e1RM estimé, volume, repos moyens, qualité annotée et ancienne variante quand elle existe.
- 🧠 Adaptation facultative en séance : lecture des chutes de reps/charge, repos conseillé, charge suivante et volume ajustable sans modification automatique.
- 🧮 Les analyses de séries effectives fonctionnent même sans RPE saisi : l’estimation est explicitement séparée des RPE utilisateur et s’appuie sur les reps/la zone de l’exercice.
- 🧪 Analyse série par série : première série trop ambitieuse, fatigue progressive, repos court, baisse de charge cohérente, montée en charge, plafond machine et performance inhabituelle.
- 🏷️ Qualité facultative des séries : propre, amplitude réduite, élan, difficulté technique, douleur inhabituelle ou série exclue de la progression sans supprimer le volume réel.
- 🔥 Échauffement intelligent optionnel, séparé des statistiques, avec rampes adaptées à l’exercice et validation libre étape par étape.
- 🗺️ Carte de récupération indicative : expositions récentes (fenêtre par défaut de 14 jours), séries effectives estimées et recouvrements musculaires primaires/secondaires.
- 🆔 Identité d’exercice persistante : les renommages, alias, variantes et anciennes données restent rattachés autant que possible au bon mouvement, y compris les noms anglais/custom des anciens exports.
- ↔️ Exercices unilatéraux suivis côté gauche/droit, avec suggestions indépendantes, équilibre estimé et validation d’un seul côté à la fois.
- 🔁 Pools de substitutions enrichies : groupe musculaire, format, équipement et compatibilité visibles avant tout changement.
- 🗂️ Une substitution en cours de séance archive les séries déjà réalisées avec le bon exercice pour préserver l’historique et les statistiques.
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
- `app.js` : logique principale (navigation, timers, logbook, coaching adaptatif, analyse série par série, qualité des séries, récupération, analyse gauche/droite, substitutions, charts, import/export, superset, progression, etc.).
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
- Le maintien d’écran actif est demandé automatiquement pendant un exercice quand le navigateur le permet ; il reste désactivable et sans impact sur les données.
- Une notification de fin de repos peut être activée volontairement. Sa disponibilité dépend du navigateur et du mode PWA, en particulier sur iOS. Si une série suggère plus de repos, le timer conserve le repos programmé et affiche un bouton pour l’étendre au choix.
- Les supersets affichent un bouton dédié « Lancer SuperSet » et le logbook comporte deux cartes.
- La progression/coaching se base sur l’historique des séries par exercice et tient compte des annotations « hors progression ».
- Une série « hors progression » reste conservée dans le volume réel, mais n’influence pas les charges, reps de référence, e1RM, plateaux ou suggestions du coach.

## Licence
Non spécifiée. À définir selon tes besoins.
