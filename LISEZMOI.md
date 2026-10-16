# Coffre

Appli Windows **et Android** pour gérer ta collection : les 722 cartes de **Yu-Gi-Oh! Forbidden Memories** (avec images) et tes **vinyles** (recherche en ligne avec pochettes via MusicBrainz ou Discogs). Sur le téléphone, l'appareil photo reconnaît les cartes par leur illustration et lit le code-barres des vinyles. Le PC et le téléphone se synchronisent sur le Wi-Fi.

Tes données sont rangées dans `%AppData%\Coffre` (fichier `coffre.json` + dossier `pochettes`). Les mises à jour de l'appli n'y touchent jamais.

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

C'est tout. GitHub compile la nouvelle version pour Windows **et** Android. Au prochain lancement, Coffre sur PC la télécharge en arrière-plan puis affiche **« Redémarrer »** en haut à droite. Sur le téléphone, Coffre affiche **« Télécharger »** : ouvre le fichier téléchargé pour installer la mise à jour (tes données restent).

---

## 3. Tester sur ton PC sans compiler (optionnel)

Il faut [Node.js LTS](https://nodejs.org) installé. Ensuite, double-clic sur `lancer.bat` (la première fois, il installe ce qu'il faut).
En mode test, les mises à jour automatiques sont désactivées : c'est normal.

---

## 4. Discogs (optionnel)

MusicBrainz marche tout de suite, sans compte. Discogs référence plus de pressages vinyles (couleurs, rééditions…) :
1. Connecte-toi sur discogs.com → **Paramètres → Développeurs** → **Créer une application** (nom : `Coffre`).
2. Copie la **Consumer Key** et le **Consumer Secret**.
3. Dans Coffre : ⚙ **Réglages** → colle-les dans les deux champs Discogs. À faire sur le PC et sur le téléphone (ces clés ne sont jamais envoyées d'un appareil à l'autre, ni mises dans le code).

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
- **Vinyles** : onglet Vinyles → **📷 Scanner un vinyle**.
  - S'il y a un code-barres, vise-le : la recherche se lance toute seule.
  - Sinon, cadre la pochette (le recto, ou le dos s'il y a du texte) et touche **Reconnaître la pochette**. Coffre lit le texte imprimé, cherche avec, puis met en premier les disques dont la pochette ressemble à ta photo (« Même pochette »). Les mots lus s'affichent sous la recherche : touche-les pour les ajouter ou les retirer. Si la pochette n'a aucun texte, tape l'artiste ou l'album : les résultats seront quand même classés selon la photo.
  - Touche le bon pressage puis **Ajouter au coffre**.
- Quand tu fais défiler une liste, le haut de l'écran se replie pour tout laisser aux cartes ; remonte un peu pour le faire revenir. Le bouton rond 📷 permet de scanner sans remonter.

---

## Sauvegarde

⚙ **Réglages → Exporter une sauvegarde** crée un fichier `.coffre` qui contient tout (cartes, vinyles, pochettes). **Importer une sauvegarde** le recharge, sur ce PC ou un autre. Sur le téléphone, l'export arrive dans le dossier **Documents**.
