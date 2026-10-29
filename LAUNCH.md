# Muscu — plan de lancement

Ce document décrit ce qui est prêt dans la PWA 6.0 et ce qu'il reste à brancher quand l'app sera emballée pour iOS / Android (Capacitor).

## 1. Offre Muscu+ (paywall)

Défini dans `premium.js`. **Désactivé pendant la bêta** (`PAYWALL_ENABLED = false`) : tout est débloqué, l'écran Muscu+ présente l'offre (Réglages → carte Muscu+).

| Formule | Prix | Essai |
|---|---|---|
| Annuel (mise en avant) | 39,99 € / an (3,33 €/mois, −52 %) | 7 jours |
| Mensuel | 6,99 € / mois | 7 jours |
| À vie « Fondateur » | 89,99 € une fois | — |

**Toujours gratuit** : suivi illimité (séances, séries, cardio, historique), coach de base (charge + reps conseillées), parcours, trophées, quêtes, défis du mois, programme généré à l'inscription.

**Muscu+** : coach avancé (deload auto, fatigue en direct, progression multi-axes, plateaux), cardio fractionné, stats complètes et fiches perso détaillées, Coach IA, boucliers de série bonus, synchro Apple Santé / Health Connect, cartes de partage premium.

Principes : la progression et l'historique ne sont **jamais** verrouillés (aucune donnée prise en otage) ; le paywall n'apparaît qu'au moment où l'on touche une fonctionnalité Plus (`app.requireFeature(key)`), jamais en pleine série.

Activation le jour J :
1. Créer les produits `plus_yearly`, `plus_monthly`, `plus_lifetime` dans App Store Connect / Play Console et l'entitlement `plus` dans RevenueCat.
2. Installer `@revenuecat/purchases-capacitor` ; `PurchasesBridge` l'utilise automatiquement.
3. Passer `PAYWALL_ENABLED` à `true` et entourer les points d'entrée Plus de `requireFeature()` (IA, intervalles, stats > 8 semaines, synchro Santé, thèmes de partage).
4. Offrir 3 mois de Muscu+ aux bêta-testeurs (setting `premium = { status: 'active', source: 'beta' }`).

## 2. Apple Santé / Health Connect

`native.js` → `HealthBridge` (plugin Capacitor de type `capacitor-health` / `@capacitor-community/health`) :
- écriture de chaque séance terminée (type musculation, début/fin, calories, distance) ;
- lecture du dernier poids au lancement → alimente l'estimation des calories cardio ;
- interrupteur dans Réglages (grisé « Disponible dans l'app » en PWA).

À faire dans le projet natif : capacités HealthKit (iOS, textes d'usage `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription`), permissions Health Connect (Android : `WRITE_EXERCISE`, `READ_WEIGHT`, `WRITE_TOTAL_CALORIES_BURNED`, `WRITE_DISTANCE`).

## 3. Notifications façon Duolingo

`native.js` construit un **plan de rappels sur 7 jours** à partir des vraies données :
- **Jour de séance** à l'heure choisie (jours répartis selon l'objectif hebdo), messages variés ;
- **Série en danger** le dimanche 17 h si la semaine n'est pas validée ;
- **Retour** 3 jours après la dernière séance ;
- **Récompense** à récupérer (coffres, quêtes).

Le plan est recalculé après chaque séance et au lancement. En natif, il est programmé avec `@capacitor/local-notifications` (ids 7000–7999) ; en PWA il est visible en aperçu dans Réglages (une PWA ne peut pas sonner app fermée sans serveur).

Étape suivante (push serveur, optionnel) : FCM/APNs pour les campagnes (défi du mois, nouveautés) et les rappels si l'utilisateur change d'appareil.

## 4 bis. Coach IA « comme un pote »

Aujourd'hui (`ai-coach.js` + `ai-coach-ui.js`) : l'app prépare un résumé de tes données (assiduité, tendances e1RM, volume par muscle, déséquilibres, notes) et l'envoie en un tap à ChatGPT, Claude, Gemini ou Le Chat ; la réponse collée est relue et appliquée au programme.

Version intégrée (app native) — une conversation dans l'app, sans copier-coller :
1. **Petit backend** (Cloudflare Worker / Supabase Edge Function) qui garde la clé d'API et applique un quota par utilisateur (gratuit : 3 messages / semaine ; Muscu+ : illimité raisonnable).
2. L'app envoie le **même résumé** que `AiCoach.buildDigest()` + l'historique court de la conversation ; le serveur ajoute le *system prompt* du coach (ton bienveillant, tutoiement, emojis légers, sécurité : jamais de conseil médical, renvoi vers un pro en cas de douleur).
3. Les réponses qui modifient le programme renvoient le format `worktout-program-v1` déjà géré par `AiCoach.parseResponse()` → écran « changements proposés » existant, puis application avec sauvegarde.
4. Moments proactifs (déclenchés côté app, 1 fois max par jour) : bilan après chaque séance, message de relance quand la série est en danger, félicitations sur un record.

## 4. Ce qui a été durci pour la 6.0

- Coach : 11 bugs corrigés (axe de progression validé en fin de séance, lest et assistance réels, charges jamais à 0 kg, deload, unilatéral, fatigue, séances chronométrées).
- Séance : double tap, série modifiée sans « Sauvegarder », séries vides, XP de fin de séance, série hebdo au changement d'heure, minuteur fantôme, restauration de sauvegarde.
- Sécurité : les toasts affichent du texte brut (noms de séances et d’exercices saisis par l’utilisateur).
- Base IndexedDB v2, migration testée depuis la 5.5 et la 5.7 sans perte.

## 5. Feuille de route après lancement

1. **Mode sombre** (les cartes « hero » sont déjà sombres : poser les tokens clairs/sombres sur `:root`).
2. **Ligues hebdomadaires** et amis (nécessite un backend : classement XP par groupe de 30, promotion/relégation).
3. **Compte & sauvegarde cloud** (Supabase/Firebase) pour changer de téléphone sans export manuel.
4. **Photos de progression** (stockage local chiffré, comparaison avant/après).
5. **Widgets** iOS/Android : série en cours, prochaine séance.
6. **Apple Watch / Wear OS** : chrono de repos et validation de série au poignet.
