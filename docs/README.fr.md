# LinkedIn Spam Blocker

[![CI](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml/badge.svg)](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cortega26/stop-spam-linkedin?label=release)](https://github.com/cortega26/stop-spam-linkedin/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2ea44f)](../manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-compatible-4285F4?logo=googlechrome&logoColor=white)](#manual-unpacked-install)
[![Firefox](https://img.shields.io/badge/Firefox-compatible-FF7139?logo=firefoxbrowser&logoColor=white)](#manual-unpacked-install)
[![Local only](https://img.shields.io/badge/confidentialite-local--only-0a7f64)](../PRIVACY_POLICY.md)
[![No telemetry](https://img.shields.io/badge/telemetrie-aucune-0a7f64)](../PRIVACY_POLICY.md)
[![License](https://img.shields.io/badge/licence-source--available-lightgrey)](../LICENSE)

**Lire en :** [English](../README.md) | [Español](README.es.md) | **Français** | [Português](README.pt.md) | [Deutsch](README.de.md)

Nettoyez le bruit du fil LinkedIn sans envoyer votre fil nulle part.

LinkedIn Spam Blocker masque les publications courantes d'engagement bait qui demandent de commenter un mot-cle comme "CLAUDE", "SKILL" ou "PROMPTS" pour recevoir un fichier, un modele, un pack de prompts ou un "acces". Il fonctionne localement dans votre navigateur, prend en charge Chrome et Firefox, et vous permet d'annuler ou d'ajuster le blocage lorsqu'il se trompe.

## En bref

- **Prive par conception** — pas d'analytics, pas de telemetrie, pas de listes distantes, pas d'API IA, pas de requetes reseau
- **Fait pour le vrai fil LinkedIn** — analyse les nouvelles publications pendant le defilement, sans dependre de selecteurs CSS fragiles
- **Ajustable** — ajoutez des phrases personnalisees, choisissez les langues de detection, autorisez des auteurs et importez/exportez votre liste
- **Reversible** — affichez temporairement une publication masquee ou marquez-la comme "Not spam" pour que le meme texte ne soit plus bloque
- **Leger** — JavaScript vanilla, Manifest V3, aucune etape de build

## Pourquoi ce projet existe

Le flux de signalement de LinkedIn laisse souvent en place les publications d'engagement bait, meme lorsqu'elles suivent un schema evident : "commente X et je t'envoie Y". Ces publications sont optimisees pour la portee algorithmique, pas pour des discussions utiles, et elles peuvent remplacer les actualites professionnelles, les recrutements et les nouvelles sectorielles que l'on venait consulter.

Cette extension vous donne un moyen local et prive de rendre votre propre fil moins bruyant sans attendre une action de la plateforme. Elle ne signale pas les publications, ne contacte pas LinkedIn et ne change rien cote serveur. Elle masque seulement les publications correspondantes dans votre navigateur.

## Fonctionnement

LinkedIn Spam Blocker analyse le texte des pages LinkedIn compatibles et le compare a des motifs integres d'engagement bait ainsi qu'aux phrases personnalisees que vous ajoutez. Lorsqu'une publication correspond, elle est masquee et remplacee par un petit emplacement qui permet de la restaurer immediatement.

La detection est heuristique, pas magique. Elle peut manquer de nouveaux formats de spam et masquer occasionnellement une publication que vous vouliez voir. L'extension inclut "Show", "Not spam", les phrases personnalisees, les options de langue et la liste blanche d'auteurs pour l'adapter a votre fil.

## Fonctionnalites

- **Detection locale uniquement** — zero requete reseau, pas d'analytics, pas de telemetrie, pas d'API externe
- **Motifs integres** — detecte les structures courantes de commentaire-pour-reveler en anglais, espagnol, francais, portugais et allemand
- **Phrases personnalisees** — ajoutez vos propres declencheurs avec correspondance Exact ou Contains, avec des limites pour garder stockage et recherche legers
- **Analyse independante des selecteurs** — utilise l'analyse du texte du DOM au lieu des noms de classes CSS LinkedIn fragiles
- **Analyse incrementale** — verifie les nouvelles publications pendant le defilement
- **Ajout par clic droit** — selectionnez du texte et ajoutez-le depuis le menu contextuel du navigateur
- **Mises a jour en direct** — les changements de phrases et de langues s'appliquent sans recharger l'extension
- **Pause temporaire** — suspend le blocage pendant 30 minutes avec reprise automatique
- **Import / Export** — sauvegardez ou partagez votre liste de phrases en JSON
- **Annulation et faux positifs** — cliquez sur "Show" ou "Not spam" depuis l'emplacement
- **Liste blanche d'auteurs** — evite de bloquer certains profils, entreprises, ecoles ou pages showcase
- **Statistiques** — compteurs du jour, de la semaine et du total dans le popup
- **Routes LinkedIn prises en charge** — fil, profils, publications, pages entreprise, groupes, recherche, Mon reseau, notifications, emplois, newsletters et articles

## Limites

- LinkedIn peut modifier la structure de ses pages, ce qui peut necessiter des mises a jour de detection.
- De nouvelles formulations d'engagement bait peuvent passer jusqu'a ce que les motifs ou vos phrases personnalisees soient mis a jour.
- Des faux positifs sont possibles, notamment dans les publications qui citent des exemples de spam ou parlent du spam.
- Les compteurs sont des statistiques locales pratiques, pas des rapports analytiques precis.

## Ce que l'extension ne fait pas

- Ne signale pas de publications a LinkedIn
- Ne supprime pas de publications LinkedIn pour d'autres personnes
- Ne bloque pas de comptes globalement
- N'utilise pas d'IA, d'API externes ni de listes distantes
- Ne collecte pas d'analytics, de telemetrie, d'historique de navigation ni de donnees de compte LinkedIn
- Ne modifie pas les donnees LinkedIn cote serveur

## Utilisation

1. Installez l'extension.
2. Ouvrez LinkedIn et faites defiler normalement.
3. Les publications correspondantes sont masquees automatiquement.
4. Cliquez sur l'icone de l'extension pour voir les statistiques, activer/desactiver, mettre en pause ou ouvrir les options.
5. Cliquez sur "Show" sur une publication bloquee pour la restaurer temporairement.
6. Cliquez sur "Not spam" si une publication a ete bloquee par erreur.
7. Ajoutez des phrases personnalisees depuis les options ou en selectionnant du texte avec le menu contextuel lorsque votre fil invente une nouvelle variante.

## Installation

### Chrome Web Store

Publication en attente. Utilisez pour l'instant l'installation manuelle ci-dessous.

### Firefox Add-ons

Publication en attente. Utilisez pour l'instant l'installation temporaire ci-dessous.

### Dernier paquet

Le dernier zip est joint a la [derniere release GitHub](https://github.com/cortega26/stop-spam-linkedin/releases/latest). Pour le developpement local ou une verification manuelle, l'installation non empaquetee est generalement la plus simple.

<a id="manual-unpacked-install"></a>
### Installation manuelle non empaquetee

1. Clonez le depot : `git clone https://github.com/cortega26/stop-spam-linkedin.git`
2. Ouvrez Chrome et allez sur `chrome://extensions`
3. Activez le "Mode developpeur"
4. Cliquez sur "Load unpacked" et selectionnez le dossier `stop-spam-linkedin`
5. Pour Firefox, ouvrez `about:debugging#/runtime/this-firefox`, cliquez sur "Load Temporary Add-on" et selectionnez `manifest.json`

## Captures d'ecran

### Blocage dans le fil

![Capture du blocage dans le fil](../screenshots/screenshot-1-feed.png)

### Options

![Capture des options](../screenshots/screenshot-2-settings.png)

### Popup

![Capture du popup](../screenshots/screenshot-3-popup-1280x800.png)

## Developpement

Aucune etape de build n'est necessaire. L'extension utilise JavaScript vanilla et Manifest V3.

Commandes utiles :

- `npm run smoke` — valide le JSON et verifie la syntaxe JavaScript
- `npm run test:extension` — charge l'extension non empaquetee dans Chromium et verifie qu'une publication LinkedIn simulee est masquee
- `npm run test:package` — empaquette l'extension puis teste le zip exact de la version actuelle du manifest
- `npm run package` — cree `dist/linkedin-spam-blocker-{version}.zip` a partir de la version de `manifest.json`

## Permissions

- `storage` — enregistre les preferences, phrases personnalisees, langues, statistiques, etat de pause, auteurs autorises et signatures de faux positifs dans le stockage du navigateur
- `contextMenus` — ajoute l'action de clic droit "Add to LinkedIn Spam Blocker" pour le texte selectionne
- Correspondances statiques de content script sur les routes compatibles `https://www.linkedin.com/*` — analyse les pages LinkedIn sans demander de permission d'hote plus large

Aucune donnee n'est transmise. Consultez [PRIVACY_POLICY.md](../PRIVACY_POLICY.md).

## Support

Pour les bugs, faux positifs ou motifs de spam manques, ouvrez une issue avec la phrase ou le court extrait pertinent et le type de page LinkedIn concerne. Evitez de partager des details de compte prives ou le contenu complet d'une publication sauf si c'est necessaire pour reproduire le probleme.

## Licence

Source-available proprietaire. Vous pouvez inspecter le code source et utiliser l'extension pour un usage personnel, mais la redistribution, l'usage commercial et les produits derives concurrents ne sont pas autorises sans accord ecrit prealable. Consultez [LICENSE](../LICENSE).

