# LinkedIn Spam Blocker

[![CI](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml/badge.svg)](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cortega26/stop-spam-linkedin?label=release)](https://github.com/cortega26/stop-spam-linkedin/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2ea44f)](../manifest.json)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-v1.2.4-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-v1.2.4-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/addon/linkedin-spam-blocker/)
[![Local only](https://img.shields.io/badge/confidentialite-local--only-0a7f64)](../PRIVACY_POLICY.md)
[![No telemetry](https://img.shields.io/badge/telemetrie-aucune-0a7f64)](../PRIVACY_POLICY.md)
[![License](https://img.shields.io/badge/licence-source--available-lightgrey)](../LICENSE)

**Lire en :** [English](../README.md) | [Español](README.es.md) | **Français** | [Português](README.pt.md) | [Deutsch](README.de.md)

Ces publications "commentez STRATEGIE et je vous envoie le framework" sont partout. LinkedIn Spam Blocker les masque automatiquement — entierement dans votre navigateur, sans rien envoyer nulle part.

Il detecte les publications qui demandent de commenter un mot-cle comme "CLAUDE", "SKILL" ou "PROMPTS" pour recevoir un fichier, un modele, un pack de prompts ou un "acces". Fonctionne dans Chrome et Firefox, inclut des motifs pour cinq langues d'office, et vous permet d'annuler ou d'ajuster le blocage lorsqu'il se trompe.

## En bref

- **Prive par conception** — pas d'analytics, pas de telemetrie, pas de listes distantes, pas d'API IA, pas de requetes reseau de quelque sorte que ce soit
- **Multilingue** — motifs integres pour l'anglais, l'espagnol, le francais, le portugais et l'allemand, tous activables independamment
- **Ajustable** — ajoutez des phrases personnalisees, autorisez des auteurs de confiance et importez/exportez votre liste
- **Reversible** — affichez temporairement une publication masquee ou marquez-la comme "Not spam" pour que le meme texte ne soit plus jamais bloque

## Pourquoi ce projet existe

Le flux de signalement de LinkedIn laisse souvent en place les publications d'engagement bait, meme lorsqu'elles suivent un schema evident : "commente X et je t'envoie Y". Ces publications sont optimisees pour la portee algorithmique, pas pour des discussions utiles, et elles peuvent remplacer les actualites professionnelles, les recrutements et les nouvelles sectorielles que l'on venait consulter.

Cette extension vous donne un moyen local et prive de rendre votre propre fil moins bruyant sans attendre une action de la plateforme. Elle ne signale pas les publications, ne contacte pas LinkedIn et ne change rien cote serveur. Elle masque seulement les publications correspondantes dans votre navigateur.

## Fonctionnement

LinkedIn Spam Blocker analyse le texte des pages LinkedIn compatibles et le compare a des motifs integres d'engagement bait ainsi qu'aux phrases personnalisees que vous ajoutez. Lorsqu'une publication correspond, elle est masquee et remplacee par un petit emplacement qui permet de la restaurer immediatement.

La detection est heuristique, pas magique. Elle peut manquer de nouveaux formats de spam et masquer occasionnellement une publication que vous vouliez voir. L'extension inclut "Show", "Not spam", les phrases personnalisees, les options de langue et la liste blanche d'auteurs pour l'adapter a votre fil.

## Fonctionnalites

**Confidentialite**
- Zero requete reseau — pas d'analytics, pas de telemetrie, pas d'API externe, pas de listes distantes
- Toutes les donnees restent dans le stockage du navigateur ; rien n'est jamais transmis

**Detection**
- Motifs integres pour l'anglais, l'espagnol, le francais, le portugais et l'allemand, activables individuellement
- Analyse du texte du DOM au lieu des classes CSS LinkedIn fragiles — resiste mieux aux changements de mise en page
- Analyse incrementale : verifie les nouvelles publications pendant le defilement
- Phrases personnalisees avec correspondance Exact ou Contains

**Controles**
- Annuler n'importe quelle publication bloquee depuis le popup ou l'emplacement dans le fil
- Exclusion "Not spam" pour que le meme texte ne soit jamais rebloque
- Liste blanche d'auteurs pour les profils, entreprises, ecoles et pages showcase
- Pause de 30 minutes avec reprise automatique
- Clic droit sur le texte selectionne pour ajouter une phrase instantanement
- Parametres en direct — les changements de phrases et de langues s'appliquent sans rechargement
- Import / Export de votre liste de phrases en JSON

**Statistiques et couverture**
- Compteurs du jour, de la semaine et du total dans le popup
- Pages prises en charge : fil, profils, publications, pages entreprise, groupes, recherche, Mon reseau, notifications, emplois, newsletters et articles

## Limites

- LinkedIn peut modifier la structure de ses pages, ce qui peut necessiter des mises a jour de detection.
- De nouvelles formulations d'engagement bait peuvent passer jusqu'a ce que les motifs ou vos phrases personnalisees soient mis a jour.
- Des faux positifs sont possibles, notamment dans les publications qui citent des exemples de spam ou parlent du spam.
- Les compteurs sont des statistiques locales pratiques, pas des rapports analytiques precis.

## Ce que l'extension ne fait pas

- Ne signale pas de publications a LinkedIn et n'interagit avec les serveurs LinkedIn d'aucune facon
- N'affecte pas ce que voient les autres — les changements sont locaux a votre navigateur uniquement
- Ne lit, ne stocke ni ne transmet vos donnees de compte LinkedIn, votre historique de navigation ni le contenu des publications

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

[Installer depuis le Chrome Web Store](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc)

### Firefox Add-ons

[Installer depuis Firefox Add-ons](https://addons.mozilla.org/addon/linkedin-spam-blocker/)

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

Utilisez les formulaires d'issue pour structurer vos rapports :

- **Bug** — quelque chose ne fonctionne plus ou se comporte de maniere inattendue
- **Faux positif** — une publication a ete bloquee alors qu'elle ne devrait pas l'etre
- **Motif manque** — une publication de spam est passee sans etre bloquee
- **Demande de fonctionnalite** — quelque chose que vous souhaiteriez voir ajoute

Incluez la phrase ou le court extrait pertinent et le type de page LinkedIn. Evitez de partager des details de compte prives ou le contenu complet d'une publication sauf si necessaire pour reproduire le probleme.

## Licence

Source-available proprietaire. Vous pouvez inspecter le code source et utiliser l'extension pour un usage personnel, mais la redistribution, l'usage commercial et les produits derives concurrents ne sont pas autorises sans accord ecrit prealable. Consultez [LICENSE](../LICENSE).

