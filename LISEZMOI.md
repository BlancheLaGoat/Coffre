# Coffre

Appli Windows pour gérer ta collection : les 722 cartes de **Yu-Gi-Oh! Forbidden Memories** (avec images) et tes **vinyles** (recherche en ligne avec pochettes via MusicBrainz ou Discogs).

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

C'est tout. GitHub compile la nouvelle version, et au prochain lancement Coffre la télécharge en arrière-plan puis affiche **« Redémarrer »** en haut à droite.

---

## 3. Tester sur ton PC sans compiler (optionnel)

Il faut [Node.js LTS](https://nodejs.org) installé. Ensuite, double-clic sur `lancer.bat` (la première fois, il installe ce qu'il faut).
En mode test, les mises à jour automatiques sont désactivées : c'est normal.

---

## 4. Discogs (optionnel)

MusicBrainz marche tout de suite, sans compte. Discogs référence plus de pressages vinyles (couleurs, rééditions…) mais demande un token gratuit :
1. Connecte-toi sur discogs.com → **Paramètres → Développeurs** → **Générer un nouveau token**.
2. Dans Coffre : ⚙ **Réglages** → colle le token.

---

## Sauvegarde

⚙ **Réglages → Exporter une sauvegarde** crée un fichier `.coffre` qui contient tout (cartes, vinyles, pochettes). **Importer une sauvegarde** le recharge, sur ce PC ou un autre.
