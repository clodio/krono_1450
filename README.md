# krono1450

## Images

Ouvrir [index.html](index.html) dans un navigateur pour utiliser l'application.

Optimisation initiale : 442 fichiers (137 702 554 octets) deviennent 148 fichiers
(45 130 550 octets), soit 67,2 % de gain. Suppression de 275 doublons strictement
identiques et de 19 images devenues inutiles : les 18 images de la grille a la
racine, chargees auparavant avant le choix du scenario, et une icone JPEG inutilisee.
141 fichiers ont aussi ete compresses, pour un gain supplementaire de 894 862 octets.

- Les doublons sont compares par SHA-256 puis par egalite des octets, jamais par nom.
- [image-assets.js](image-assets.js) associe les 423 chemins logiques aux fichiers
	conserves. Il doit etre publie avec la page et les images.
- Les chemins logiques des lieux restent distincts pour choisir les bonnes images
	d'informations, meme lorsque les illustrations des lieux sont partagees.
- Compression WebP/JPEG a qualite 90, sans redimensionnement ; PNG sans perte.
	Un resultat plus volumineux que l'original n'est jamais conserve.
- L'alpha des WebP est encode sans perte (`alphaQuality: 100`), puis compare pixel
	par pixel avant remplacement. Les dimensions et la presence du canal sont verifies.
- Les fichiers de noms identiques mais de contenus differents sont conserves.
- Deux alias corrigent des references auparavant cassees dans `le_sceptre_dor_5` :
	`place6-informations(63).webp` et `setup.jpg`.
- Les icones PWA pointent vers les fichiers existants ; le cache est versionne.

Le detail des suppressions, doublons et compressions figure dans
[image-optimization-report.json](image-optimization-report.json).
Les originaux versionnes restent recuperables dans l'historique Git.

## Maintenance

Node.js et npm sont necessaires uniquement pour les outils d'optimisation :

```sh
npm ci
npm run images:check
npm run images:optimize
```

`images:check` ne modifie aucun fichier et echoue si une image attendue manque.
`images:optimize` applique les suppressions, genere les alias et actualise le rapport.
Les empreintes du rapport evitent de recompresser avec perte les fichiers deja
traites et inchanges. Conserver ce rapport pour les executions suivantes.
Adapter la detection des usages dans
[scripts/deduplicate-images.cjs](scripts/deduplicate-images.cjs) si les boutons,
scenarios ou conventions de noms changent. Versionner egalement le cache de
[sw.js](sw.js) lors de nouvelles modifications des ressources publiees.

Verification initiale : comparaison des 423 alias avec les originaux Git,
dimensions des 148 fichiers et alpha exact des 15 images concernees ; test navigateur
des 15 scenarios, de leurs quatre vues et des superpositions lieu/heure/personnage
(691 decodages d'images, aucun echec).
