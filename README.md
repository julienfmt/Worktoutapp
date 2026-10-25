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

### Nouveautés v5
- 🎨 DA unifiée mauve/violet + vert de validation (`theme.css`) : boutons 3D gamifiés, cartes de série identiques en bilatéral / unilatéral / superset, animations (entrée de cartes, validation, « +XP » flottant, badge record).
- ↔️ Unilatéral repensé : une ligne compacte par côté (G indigo, D violet), le côté le plus faible passe en premier, RPE enregistré sur la paire, réglage « Auto / G-D / Bilatéral » par exercice.
- 🧠 Coach : charges toujours sur la grille réelle de l'équipement, cibles de reps calculées à partir du RIR, double palier si la séance était nettement trop facile, montée anticipée si le haut de fourchette est proche avec beaucoup de marge, RIR du programme enfin utilisé, historiques gauche/droite strictement séparés, séance interrompue ignorée comme référence.
- 🏆 Détection de record en direct (e1RM) avec bonus XP et vibration.
- 🧪 Tests exécutables sans Node : servir le dossier puis ouvrir `tests/browser-runner.html?test=coach-engine` (ou `adaptive-session`).

### Nouveautés v5.1
- 🔥 Accueil refondu : carte « hero » sombre mauve avec streak géant + flamme qui grandit selon le niveau, paliers segmentés, semaine jour par jour (L→D), boucliers et statut de la semaine intégrés.
- 🔔 Notifications de fin de repos : plus de notification en retard à la réouverture de l'app (ni quand l'app est à l'écran) ; les notifications restées dans le centre sont nettoyées au retour.

### Nouveautés v5.2
- 🎯 Coach « Mission du jour » : carte sombre mauve (même DA que l'accueil) avec charge cible et écart vs dernière séance (« +2.5 kg », « Idem »), reps en jetons par série, règle du jour en quête, raisons en pastilles, jauge d'énergie segmentée. La teinte suit le conseil (boost vert, deload indigo, prudence magenta). Superset et unilatéral reprennent la même coque.
- 📈 Stats de l'exo : tuiles Record e1RM / séances en hausse / volume, courbe e1RM lissée avec point record doré et dates, objectif record (« 80 kg × 9 à RIR 2 ») avec jauge, masqué en deload.
- 📒 Historique : dernière séance en cartes de série avec écart vs la séance précédente, anciennes séances en lignes compactes.
- 🧠 « Pourquoi ce conseil » : jauge de confiance circulaire et lignes à icônes.
- 🗂️ Cartes de séance : infos en 4 mini-tuiles (séries / reps / repos / RIR), défi en bandeau de quête avec bonus XP. Défi actif avec jauge de progression (ex. 12/42 reps). Contrôle libre avec stepper de séries.
- 🐛 Un exercice « Développé … » n'est plus pris pour du cardio (« velo » était trouvé dans « dé-velo-ppé »).

### Nouveautés v5.3
- 🗂️ Accueil en 2 onglets **Séance / Parcours** (pastille verte quand une quête est à réclamer).
- 🏆 Parcours gamifié : carte joueur (niveau + titre, de « Recrue » à « Mythe vivant », jauge d'XP, tonnage total avec équivalence fun), **quêtes hebdo** à réclamer (+XP), **salle des trophées** (29 trophées : séances, tonnage, records, streak, clubs 60→180 kg, séries, niveaux), lifts (record e1RM + progressions avec mini-courbes), activité 8 semaines (tonnage + séances vs objectif), carte « physique » par muscle avec zone de croissance MEV→MAV.
- ⏱️ Écran de repos refait dans la DA : bilan de la série validée (charge × reps, écart vs la dernière fois, +XP, record doré), jauge des séries, chrono, prochaine série en tuiles, ressenti.
- ✅ Série validée : ligne compacte (badge ✓, charge × reps, puces record / écart / RPE).
- 🧹 Haut de l'écran exercice allégé : badge muscle + objectifs (« 4 × 5-8 · 150s · RIR 2 ») dans l'en-tête, coach resserré, défi en bandeau doré, rappel du défi seulement sur la prochaine série.
- 🎨 Badge muscle coloré avec pictogramme (cartes de séance, en-tête, carte physique).
- 📚 Base de **1 324 exercices** (`exercises-db.json`, consignes FR) issue de [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) : fiche technique par exo (animation, muscles, étapes), correction manuelle du mouvement associé, recherche dans « Ajouter un exercice ». Le JSON n'est chargé qu'à la première utilisation ; les animations sont streamées depuis le repo et seules les dernières vues restent en cache (120 max). Données texte : MIT · médias : © Gym visual.
- 🐛 L'XP de fin de séance annoncé est enfin crédité (et le passage de niveau est fêté) ; chrono de séance au-delà d'1 h affiché en « 1h05:12 ».
- 🧪 `tests/demo-seed.js` : génère 8 semaines de données factices (à utiliser sur une origine jetable, ex. `127.0.0.1`).

## Stack technique
- Frontend pur : HTML, CSS, JavaScript vanilla.
- Stockage : IndexedDB (abstraction dans `db.js`).
- Données initiales : `data.js` (sessions, slots, pools d’exercices).
- Service worker : `sw.js` (cache statique + stratégie network-first pour `index.html`).
- PWA : `manifest.json` + icônes maskables.

## Structure des fichiers
- `index.html` : structure des écrans (accueil, séance, exercice, paramètres, bottom sheets, modals).
- `styles.css` : design mobile-first et composants (cards, boutons, charts, overlays, etc.).
- `theme.css` : couche de DA chargée en dernier (tokens, boutons gamifiés, animations).
- `app.js` : logique principale (navigation, timers, logbook, coaching adaptatif, analyse série par série, qualité des séries, récupération, analyse gauche/droite, substitutions, charts, import/export, superset, progression, etc.).
- `data.js` : données de départ (séances Bras/Pecs A/B et slots associés).
- `exercise-db.js` + `exercises-db.json` : base d'exercices (chargement paresseux, recherche, résolution exo → fiche).
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
- Une notification de fin de repos peut être activée volontairement. Sa disponibilité dépend du navigateur et du mode PWA : sur iOS, la PWA est gelée en arrière-plan, donc sans serveur de push la notification ne peut pas partir à l'heure (elle est alors ignorée plutôt qu'affichée en retard). Si une série suggère plus de repos, le timer conserve le repos programmé et affiche un bouton pour l’étendre au choix.
- Les supersets affichent un bouton dédié « Lancer SuperSet » et le logbook comporte deux cartes.
- La progression/coaching se base sur l’historique des séries par exercice et tient compte des annotations « hors progression ».
- Une série « hors progression » reste conservée dans le volume réel, mais n’influence pas les charges, reps de référence, e1RM, plateaux ou suggestions du coach.

## Licence
Non spécifiée. À définir selon tes besoins.
