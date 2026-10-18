# Coffre

Appli Windows **et Android** pour gérer ta collection : les 722 cartes de **Yu-Gi-Oh! Forbidden Memories** (avec images), **toutes les cartes Yu-Gi-Oh** (collection par extension et decks) et tes **vinyles** (recherche Discogs avec pochettes et prix du marché). Sur le téléphone, l'appareil photo reconnaît les cartes et lit le code-barres des vinyles. Le PC et le téléphone se synchronisent sur le Wi-Fi.

Tes données sont rangées dans `%AppData%\Coffre` (fichier `coffre.json`). Les mises à jour de l'appli n'y touchent jamais.

**Images** : les pochettes de vinyles ne sont jamais enregistrées, elles s'affichent depuis Discogs. Les images des cartes Yu-Gi-Oh et One Piece sont gardées dans un cache limité à **200 Mo sur le PC** et **50 Mo sur le téléphone** (les deux jeux ensemble) : au-delà, celles vues le moins récemment s'effacent toutes seules. YGOPRODeck interdit de recharger ses images sans arrêt, d'où ce petit cache. ⚙ Réglages → Images montre la place prise et permet de le vider.

---

## 1. Première installation (une seule fois)

### Mettre le projet sur GitHub
1. Dézippe le dossier `Coffre` dans `C:\Users\galax\Desktop\Projet\Coffre`.
2. Dans **GitHub Desktop** : *File → Add local repository…* → choisis le dossier `Coffre` → clique sur **create a repository**, puis **Create repository**.
3. Clique sur **Publish repository**.
   - Nom : `Coffre`
   - **Décoche « Keep this code private »**. Le repo doit être public pour que l'appli puisse trouver ses mises à jour toute seule.

### Sortir la première version
4. Dans GitHub Desktop, onglet **History** : clic droit sur le dernier commit → **Create Tag…** → tape `v1.0.0` → **Create Tag**.
5. Clique sur **Push origin** (le tag part avec).
6. Sur github.com, dans ton repo, onglet **Actions** : la compilation tourne (environ 5 minutes).
7. Quand c'est vert, va dans **Releases** : télécharge `Coffre-Setup-1.0.0.exe` et installe-le.

> Windows peut afficher « Windows a protégé votre ordinateur » parce que l'appli n'est pas signée. Clique sur **Informations complémentaires → Exécuter quand même**. Ça ne le fera qu'à l'installation.

---

## 2. Publier une mise à jour

1. Remplace les fichiers modifiés dans le dossier du projet.
2. Dans `package.json`, augmente le numéro de `"version"` (ex. `1.0.0` → `1.0.1`).
3. GitHub Desktop : **Commit** puis **Push origin**.
4. **History** → clic droit sur ce commit → **Create Tag…** → `v1.0.1` (même numéro que dans package.json, avec un `v` devant) → **Push origin**.

Les nouveautés de chaque version sont dans `src/renderer/changelog.js` (je les écris à chaque mise à jour). L'appli les affiche une fois après la mise à jour, et GitHub les met sur la page de la version.

C'est tout. GitHub compile la nouvelle version pour Windows **et** Android. Au prochain lancement, Coffre sur PC la télécharge en arrière-plan puis affiche **« Redémarrer »** en haut à droite. Sur le téléphone, Coffre affiche **« Télécharger »** : ouvre le fichier téléchargé pour installer la mise à jour (tes données restent).

---

## 3. Tester sur ton PC sans compiler (optionnel)

Il faut [Node.js LTS](https://nodejs.org) installé. Ensuite, double-clic sur `lancer.bat` (la première fois, il installe ce qu'il faut).
En mode test, les mises à jour automatiques sont désactivées : c'est normal.

---

## 4. Discogs (nécessaire pour les vinyles)

La recherche de vinyles et leurs prix passent par Discogs. Il faut une clé gratuite :
1. Connecte-toi sur discogs.com → **Paramètres → Développeurs** → **Créer une application** (nom : `Coffre`).
2. Copie la **Consumer Key** et le **Consumer Secret**.
3. Dans Coffre : ⚙ **Réglages** → colle-les dans les deux champs Discogs. À faire sur le PC et sur le téléphone (ces clés ne sont jamais envoyées d'un appareil à l'autre, ni mises dans le code).

**Prix** : chaque vinyle affiche le prix le plus bas actuellement en vente sur Discogs (et le nombre d'exemplaires en vente). La valeur de ta collection est en haut de l'onglet Vinyles. Les prix se mettent à jour tout seuls chaque semaine, ou avec le bouton **Actualiser les prix**. Les vinyles ajoutés avant via MusicBrainz ou à la main n'ont pas de prix : rajoute-les depuis la recherche Discogs si tu veux leur prix.

---

## 5. Appli Android

### Préparer la clé de signature (une seule fois)
Android n'accepte une mise à jour que si elle est signée avec la même clé que l'appli installée. Cette clé est dans le fichier `cle-android-coffre.txt` que je t'ai donné.
1. **Range ce fichier en dehors du dossier `Projet`** (par exemple dans tes Documents), pour qu'il ne parte jamais sur GitHub. Garde-le précieusement : sans lui, impossible de publier une mise à jour Android (il faudrait désinstaller l'appli et perdre ce qui n'est pas synchronisé).
2. Sur github.com, dans ton repo `Coffre` : **Settings → Secrets and variables → Actions → New repository secret**.
3. Crée deux secrets, en copiant les valeurs du fichier :
   - Nom `ANDROID_KEYSTORE` → la longue suite de caractères.
   - Nom `ANDROID_KEYSTORE_PASSWORD` → le mot de passe.

Ensuite, chaque tag de version (`v1.1.0`, `v1.1.1`…) produit aussi `Coffre-Android.apk` dans la release.

### Installer sur le téléphone
1. Sur le téléphone, ouvre `https://github.com/BlancheLaGoat/Coffre/releases/latest` et télécharge **Coffre-Android.apk**.
2. Ouvre le fichier. Android demande d'autoriser l'installation d'applis depuis ton navigateur : accepte (seulement pour cette source).
3. Si Play Protect affiche un avertissement (appli inconnue), choisis **Installer quand même**.

### Associer le téléphone au PC
1. Sur le PC : Coffre → ⚙ **Réglages** → section **Téléphone** : un QR code s'affiche. Si Windows demande l'autorisation réseau pour Coffre, accepte pour les **réseaux privés**.
2. Sur le téléphone : ⚙ **Réglages → Associer au PC** → vise le QR code.
3. C'est fait. Les deux appareils doivent être sur le même Wi-Fi, avec Coffre ouvert sur le PC. La synchro se fait toute seule (ouverture de l'appli, après chaque ajout, toutes les 45 secondes) ; il y a aussi un bouton **Synchroniser maintenant**.

> Si la synchro dit « PC injoignable » alors que tout est allumé : vérifie que le Wi-Fi de Windows est en **réseau privé** (Paramètres → Réseau et Internet → Wi-Fi → ton réseau → Type de profil réseau : Privé). Si le PC change d'adresse, rescanne le QR code.

### Scanner
- **Cartes FM** : onglet Cartes FM → **📷 Scanner des cartes**. Pose la carte bien à plat dans le cadre. Les 6 cartes les plus ressemblantes s'affichent en bas : touche la bonne pour l'ajouter. Avec **Ajout auto** coché, la carte est ajoutée toute seule quand l'appli est sûre d'elle ; retire-la du cadre et passe à la suivante. **Annuler** retire la dernière ajoutée.
  La reconnaissance regarde seulement l'illustration, donc les vieilles cartes japonaises sans code marchent aussi. 13 cartes n'ont pas d'image dans l'appli : celles-là, ajoute-les à la main.
- **Cartes Yu-Gi-Oh** : onglet Yu-Gi-Oh → **📷 Scanner des cartes**. Place la carte dans le cadre : Coffre lit le code imprimé sous l'illustration (ex. SGX1-FRA18) et ajoute la bonne impression à ta collection. Une carte française est reconnue comme sa version anglaise (même extension). Si le code n'est pas reconnu (anciennes cartes européennes comme LDD-F092, qui ont d'autres numéros), Coffre lit le **nom** de la carte en haut et propose ses extensions, ou « Peu importe l'extension ». Si plusieurs raretés existent pour ce code, touche la bonne.
- **Vinyles** : onglet Vinyles → **📷 Scanner un code-barres** → vise le code-barres au dos. La recherche se lance toute seule ; touche le bon pressage puis **Ajouter au coffre**. Sans code-barres, cherche le disque à la main avec « Rechercher un vinyle ».
- Quand tu fais défiler une liste, le haut de l'écran se replie pour tout laisser aux cartes ; remonte un peu pour le faire revenir. Le bouton rond 📷 permet de scanner sans remonter.

---

## Wishlist des cartes FM

Onglet Cartes FM → **Wishlist Cardmarket** : la liste des cartes FM qui te manquent, au format Cardmarket (une carte par ligne), avec le nom officiel de la carte et une estimation du prix. Si tu as filtré (type ou recherche), tu peux ne prendre que les cartes affichées. Les cartes introuvables dans la base Yu-Gi-Oh (propres au jeu, ou nom différent) sont mises à part ; tu peux les ajouter quand même.

---

## 6. Yu-Gi-Oh (toutes les cartes du jeu)

La première fois, l'onglet **Yu-Gi-Oh** propose de **télécharger la base de cartes** (YGOPRODeck, gratuite : environ 13 000 cartes avec toutes leurs extensions, noms anglais et français). Elle se met ensuite à jour toute seule chaque semaine. Sur le téléphone associé, elle est récupérée depuis le PC. Les images des cartes se téléchargent au fur et à mesure, puis restent sur l'appareil.

- **Ma collection** : seulement les cartes que tu as. Chaque carte garde sa **langue** (FR par défaut, choix à côté de la recherche et dans la fiche) : une carte française apparaît avec son code français (ex. DUAD-FR053). **Ajouter des cartes** → tape un nom (français ou anglais) ou un code (ex. SGX1-FRA18) → choisis l'extension et la rareté, ou « Peu importe l'extension ».
- **Compléter une extension** : dans « Ajouter des cartes », tape le nom de l'extension (ex. « Legend of Blue Eyes ») ou son code (ex. « LOB »). Touche l'extension : toutes ses cartes s'affichent avec ta progression (ex. 12 / 126), le filtre **Manquantes**, et **Copier les manquantes** pour ta wishlist Cardmarket.
- **Decks** : **Nouveau deck**, donne-lui un nom, puis ajoute n'importe quelle carte du jeu, même si tu ne l'as pas. Chaque carte indique combien tu en possèdes ; le filtre **Manquantes** montre ce qu'il te faut.
- **Fichiers .ydk** : dans **Decks**, « Importer un deck (.ydk) » crée un deck depuis un fichier d'EDOPro, Dueling Book, YGOPRODeck… Dans un deck, « Exporter (.ydk) » l'enregistre pour ces simulateurs (sur le téléphone, dans Documents). Main, Extra et Side Deck sont gardés.
- **Side Deck** : dans un deck, « + Side » à côté de « + Deck ». Les cartes du Side comptent dans les manquantes, la banlist (deck + side) et le prix.
- **Wishlist** : les cartes que tu veux en dehors de tes decks. Ajoute-les depuis l'onglet Wishlist (recherche) ou depuis la fiche d'une carte (« ☆ Ajouter à la wishlist »), puis **Copier la liste** pour Cardmarket.
- **Wishlist Cardmarket** : dans un deck, **Copier la liste** copie les cartes manquantes au format Cardmarket (`2 Dark Magician`, une carte par ligne). Sur Cardmarket : Wishlist → ajouter des cartes → colle la liste.

- **Banlist** : la banlist TCG (celle de l'Europe, mise à jour avec la base chaque semaine) est affichée sur les cartes : pastille rouge 0 = interdite, orange 1 = limitée, jaune 2 = semi-limitée. Un deck qui ne la respecte pas est signalé (⚠ banlist).
- **Texte des cartes** : la fiche d'une carte affiche son texte (en français quand YGOPRODeck l'a, sinon en anglais).
- **Prix** : la valeur de ta collection, le prix de chaque deck (et de ce qu'il te manque) et le coût des manquantes d'une extension utilisent le prix de référence Cardmarket de chaque carte, toutes éditions confondues (données YGOPRODeck, mises à jour chaque semaine). C'est une estimation : une rareté chère peut valoir bien plus.

Tout se synchronise entre le PC et le téléphone, comme le reste.

---

## 7. One Piece (toutes les cartes du jeu)

L'onglet **One Piece** marche comme celui de Yu-Gi-Oh. La première fois, il propose de **télécharger la base de cartes** (optcgapi.com, gratuite, sans clé : toutes les extensions OP, EB, PRB, les decks de démarrage ST et les promos, avec les versions parallèles). Elle se met à jour toute seule chaque semaine ; sur le téléphone associé, elle est récupérée depuis le PC.

- **Ma collection** : par **version** (normale, Parallèle, SP…) ou « Peu importe la version », avec la langue de la carte (FR, EN ou JP). Le code est le même dans toutes les langues (ex. OP01-001).
- **Compléter une extension** : dans « Ajouter des cartes », tape son nom (« Romance Dawn ») ou son code (« OP-05 », « ST-01 »). Progression, filtre par rareté/version, **Manquantes** et **Copier les manquantes**.
- **Decks** : un Leader + 50 cartes, même celles que tu n'as pas. **Manquantes** et **Copier la liste** au format Cardmarket One Piece (`2x Roronoa Zoro OP01-025`).
- **Wishlist** : comme pour Yu-Gi-Oh.
- **Texte des cartes** : affiché sous l'image dans la fiche (en anglais).
- **Scan (téléphone)** : 📷 **Scanner des cartes** lit le code en bas à droite de la carte. La version normale est ajoutée toute seule ; pour une parallèle, touche **Annuler** puis la bonne version.
- **Prix** : prix du marché **TCGplayer** (États-Unis), en **dollars**, par version (une parallèle coûte souvent bien plus). Cardmarket ne donne pas ses prix One Piece à des applis gratuites : c'est une estimation.

---

## Choisir les onglets

⚙ Réglages → **Onglets** : décoche Cartes FM, Yu-Gi-Oh, One Piece ou Vinyles pour cacher l'onglet. Rien n'est supprimé : recoche la case et tout revient. Chaque appareil garde son propre choix.

## Sauvegarde

⚙ **Réglages → Exporter une sauvegarde** crée un fichier `.coffre` qui contient tout (cartes, decks, vinyles ; les images restent en ligne). **Importer une sauvegarde** le recharge, sur ce PC ou un autre. Sur le téléphone, l'export arrive dans le dossier **Documents**.
