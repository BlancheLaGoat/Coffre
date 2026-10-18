// Coffre — nouveautés de chaque version (affichées dans l'appli après une mise à jour,
// et reprises comme notes de version sur GitHub). La plus récente en premier.
window.COFFRE_CHANGELOG = [
{
 "v": "1.14.5",
 "date": "19/10/2026",
 "items": [
  "Collection Yu-Gi-Oh et One Piece beaucoup plus fluide avec une grosse collection : l'affichage « Par extension », l'ouverture d'une extension, le filtre « Manquantes » et les boutons + / − ne ralentissent plus (plus d'une seconde avant, quelques millisecondes maintenant)."
 ]
},
{
 "v": "1.14.4",
 "date": "18/10/2026",
 "items": [
  "Decks One Piece : la decklist (format 4xOP09-056) est maintenant affichée dans une zone de texte en bas du deck, avec « Copier la decklist » et « Enregistrer (.txt) » juste en dessous."
 ]
},
{
 "v": "1.14.3",
 "date": "18/10/2026",
 "items": [
  "Petites corrections."
 ]
},
{
 "v": "1.14.2",
 "date": "18/10/2026",
 "items": [
  "Cartes sans image (cartes à venir dont TCGplayer n'a pas encore mis l'image en ligne) : un cadre « Image pas encore disponible » remplace le carré gris. L'image apparaît toute seule dès qu'elle est publiée."
 ]
},
{
 "v": "1.14.1",
 "date": "18/10/2026",
 "items": [
  "One Piece, extensions à venir : elles sont maintenant récupérées une fois par jour par une tâche GitHub (onglet Actions → « Cartes à venir »), qui publie le fichier que Coffre lit. Le site source (TCGCSV) interdit d'être interrogé directement par les applis : c'est ce qui empêchait EB05 et OP18 d'arriver.",
  "⚙ Réglages → Images : bouton « Mettre à jour les cartes maintenant » pour retélécharger tout de suite les bases Yu-Gi-Oh et One Piece (nouvelles cartes, banlist, prix).",
  "La base One Piece se retélécharge une fois toute seule."
 ]
},
{
 "v": "1.14.0",
 "date": "18/10/2026",
 "items": [
  "One Piece : les extensions à venir sont maintenant dans Coffre avant leur sortie (ex. EB05 Heroines Edition Vol. 2, OP18 The Dominance of God), avec les cartes déjà révélées. Elles viennent du catalogue de précommandes TCGplayer (via TCGCSV) tant qu'optcgapi ne les a pas ; dès qu'optcgapi les ajoute, sa version prend le relais.",
  "Étiquette verte « à venir · date de sortie » sur ces extensions et sur leurs cartes, en One Piece comme en Yu-Gi-Oh (YGOPRODeck ajoute déjà les extensions avant leur sortie).",
  "Quand une extension à venir est en cours de révélation, la base de cartes se met à jour plus souvent (tous les 2 jours en One Piece, 3 jours en Yu-Gi-Oh) pour avoir les nouvelles cartes.",
  "Cartes à venir : noms, raretés et prix sont provisoires (précommandes), et le texte peut manquer jusqu'à la sortie."
 ]
},
{
 "v": "1.13.0",
 "date": "18/10/2026",
 "items": [
  "Decks One Piece : « Importer une decklist » (onglet Decks). Colle une decklist partagée au format 4xOP09-056 (une carte par ligne, le Leader en 1x…) ou ouvre un fichier .txt : Coffre crée le deck, avec les cartes manquantes et le prix.",
  "Dans un deck One Piece : « Copier la decklist » et « Enregistrer (.txt) » donnent le même format, Leader en premier, prêt à partager ou à coller dans un simulateur.",
  "Les codes inconnus de la base sont signalés et laissés de côté."
 ]
},
{
 "v": "1.12.1",
 "date": "18/10/2026",
 "items": [
  "Collection Yu-Gi-Oh et One Piece : nouveau tri « Par prix », les cartes les plus chères en premier (prix Cardmarket pour Yu-Gi-Oh, prix de la version pour One Piece).",
  "One Piece : le tri choisi est gardé d'une ouverture à l'autre."
 ]
},
{
 "v": "1.12.0",
 "date": "18/10/2026",
 "items": [
  "Collection Yu-Gi-Oh : nouveau tri « Par extension ». Il liste les extensions dont tu as des cartes, de la plus récente à la plus ancienne, avec leur date de sortie, leur code et ta progression (ex. 2 / 103 cartes).",
  "Touche une extension pour voir les cartes que tu en as, rangées par numéro. « Compléter l'extension » ouvre toutes ses cartes pour ajouter celles qui manquent.",
  "Le tri choisi est gardé d'une ouverture à l'autre."
 ]
},
{
 "v": "1.11.0",
 "date": "18/10/2026",
 "items": [
  "Nouveautés : après chaque mise à jour, Coffre affiche une fois ce qui a changé depuis ta dernière version.",
  "⚙ Réglages → Application → « Nouveautés » : la liste des changements des dernières versions, à relire quand tu veux.",
  "Sur GitHub, la page de chaque version affiche aussi ses nouveautés."
 ]
},
 {
  "v": "1.10.1",
  "date": "18/10/2026",
  "items": [
   "Decks Yu-Gi-Oh : Side Deck. Dans la recherche d'un deck, « + Side » à côté de « + Deck » ; une section Side Deck sous le Main et l'Extra Deck, avec ses propres quantités.",
   "Les cartes du Side comptent dans les cartes manquantes, la liste Cardmarket, le prix du deck et la banlist (exemplaires du deck + du side).",
   "Fichiers .ydk : le Side Deck est maintenant importé et exporté."
  ]
 },
 {
  "v": "1.10.0",
  "date": "18/10/2026",
  "items": [
   "Decks Yu-Gi-Oh : importer et exporter en .ydk, le format des simulateurs (EDOPro, Dueling Book, YGOPRODeck…).",
   "Onglet Decks → « Importer un deck (.ydk) » : crée un deck nommé d'après le fichier, Main et Extra Deck. Les illustrations alternatives sont reconnues ; le Side Deck et les cartes inconnues sont signalés et laissés de côté.",
   "Dans un deck → « Exporter (.ydk) » : sur PC, tu choisis où l'enregistrer ; sur le téléphone, il arrive dans Documents."
  ]
 },
 {
  "v": "1.9.1",
  "date": "17/10/2026",
  "items": [
   "Scan Yu-Gi-Oh : quand le nom lu ne correspond pas au code (un chiffre mal lu, ex. RA05-FR038 lu RA03-FR038), Coffre cherche maintenant la carte par son nom dans toute la base, puis garde ses impressions dont le code ressemble au code lu. Lacrima du Démonforgeron est donc proposée à la place de Dragon Clair de Lune Rose Noire.",
   "Si plusieurs codes sont lus, celui qui correspond au nom est choisi.",
   "Une seule impression possible à un caractère près : ajout automatique ; sinon il suffit de toucher la rareté."
  ]
 },
 {
  "v": "1.9.0",
  "date": "17/10/2026",
  "items": [
   "Yu-Gi-Oh : banlist TCG (celle qui s'applique en Europe, fournie par YGOPRODeck et mise à jour avec la base chaque semaine).",
   "Pastille sur les cartes de la collection, des decks et de la wishlist : 0 rouge = interdite, 1 orange = limitée, 2 jaune = semi-limitée. En liste et dans la recherche : « Interdite », « Limitée (1) », « Semi-limitée (2) ». Dans la fiche : ligne « Banlist TCG ».",
   "Decks : avertissement « ⚠ Pas conforme à la banlist TCG » avec les cartes en trop, et « ⚠ banlist » dans la liste des decks.",
   "La base de cartes se retélécharge toute seule une fois pour avoir la banlist."
  ]
 },
 {
  "v": "1.8.3",
  "date": "17/10/2026",
  "items": [
   "Scan Yu-Gi-Oh : plus de codes inventés. Le code enregistré vient toujours de la base de cartes : celui de l'impression reconnue ou touchée (rareté), dans la langue de la carte (ex. MP24-FR127). Le texte lu par l'appareil photo ne sert plus qu'à trouver la carte, il n'est jamais recopié (avant : « MP24-NT27 », « MP25-BIN229 »).",
   "Les codes mal lus déjà enregistrés sont réparés tout seuls à l'ouverture de l'appli (et la correction se synchronise)."
  ]
 },
 {
  "v": "1.8.2",
  "date": "17/10/2026",
  "items": [
   "Téléphone : dans Yu-Gi-Oh et One Piece, quand tu descends dans ta collection, les boutons du haut (Scanner, Ajouter des cartes, filtre, Galerie/Liste…) partent avec le défilement et le titre et les onglets se cachent, comme pour les cartes FM. Ils reviennent quand tu remontes tout en haut.",
   "Avant, ces boutons prenaient presque tout l'écran sur un petit téléphone : la collection n'avait plus qu'une petite bande, et glisser le doigt sur les boutons ne faisait rien défiler."
  ]
 },
 {
  "v": "1.8.1",
  "date": "17/10/2026",
  "items": [
   "Cache des images de cartes : 200 Mo au total sur le PC et 50 Mo au total sur le téléphone, partagés entre Yu-Gi-Oh et One Piece (avant : 25 Mo par jeu). Au-delà, les images vues le moins récemment, tous jeux confondus, s'effacent toutes seules."
  ]
 },
 {
  "v": "1.8.0",
  "date": "17/10/2026",
  "items": [
   "Pochettes de vinyles plus enregistrées, ni sur le PC ni sur le téléphone : elles s'affichent depuis Discogs (le vinyle garde seulement leur adresse). Les anciennes pochettes enregistrées sont remplacées par leur adresse en ligne puis effacées toutes seules au démarrage (il faut la clé Discogs dans les réglages).",
   "Vinyles ajoutés à la main : plus de photo perso (bouton retiré, comme le bouton « Changer la pochette »).",
   "Images Yu-Gi-Oh et One Piece : cache plafonné à 50 Mo par appareil (25 Mo par jeu). Au-delà, les images vues le moins récemment s'effacent toutes seules. Un ancien cache plus gros est réduit au démarrage.",
   "⚙ Réglages → Images : place prise et bouton « Vider les images des cartes ».",
   "Sauvegardes et synchro : plus de pochettes dedans (fichiers plus légers)."
  ]
 },
 {
  "v": "1.7.1",
  "date": "17/10/2026",
  "items": [
   "Texte des cartes dans la fiche, sous l'image : Yu-Gi-Oh (en français quand YGOPRODeck l'a, sinon en anglais) et One Piece. La base de cartes se retélécharge toute seule une fois pour l'avoir.",
   "Scan Yu-Gi-Oh : plus de cartes fantômes. Un nom n'est cherché que dans le haut de la carte, et il faut au moins 5 lettres (le mot « PAGE » d'un clavier donnait « Péage »). Une carte reconnue seulement par son nom n'est jamais ajoutée toute seule : elle attend un toucher.",
   "Scan : chiffres mal lus. Le nom lu en haut doit correspondre à la carte du code. Sinon Coffre cherche la carte de l'extension qui porte ce nom ; s'il ne trouve pas, il demande de confirmer au lieu d'ajouter.",
   "Scan : plus de doubles quand la carte reste devant l'appareil. La même carte n'est rajoutée que si elle a été retirée environ 3 secondes (ou d'un toucher sur sa rareté)."
  ]
 },
 {
  "v": "1.7.0",
  "date": "16/10/2026",
  "items": [
   "Nouvel onglet One Piece (☠), comme Yu-Gi-Oh : Ma collection, Decks et Wishlist.",
   "Base de toutes les cartes One Piece (optcgapi.com, gratuite) : extensions OP, EB, PRB, decks ST, promos, avec les versions parallèles. Téléchargée une fois, mise à jour chaque semaine, envoyée au téléphone par le PC.",
   "Collection par version (normale, Parallèle, SP…) ou « peu importe la version », avec la langue FR / EN / JP.",
   "Compléter une extension : recherche par nom ou code (OP-05), progression, filtre par rareté/version, manquantes et copie pour Cardmarket.",
   "Decks : Leader + 50 cartes, cartes manquantes, prix du deck, liste au format Cardmarket One Piece (2x Nom OP01-025).",
   "Scan sur le téléphone : le code en bas à droite de la carte est lu, la version normale s'ajoute toute seule, les autres en un toucher.",
   "Prix : marché TCGplayer, en dollars, par version.",
   "Tout se synchronise entre PC et téléphone et part dans les sauvegardes. L'onglet peut être caché dans ⚙ Réglages → Onglets.",
   "Téléphone : onglets plus compacts (« FM ») pour que les quatre tiennent sur une ligne."
  ]
 },
 {
  "v": "1.6.0",
  "date": "16/10/2026",
  "items": [
   "Réglages : nouvelle section Onglets avec une case pour Cartes FM, Yu-Gi-Oh et Vinyles. Décocher une case cache l’onglet en haut.",
   "Rien n’est effacé : les cartes, decks et vinyles d’un onglet caché restent enregistrés, continuent de se synchroniser et sont dans les sauvegardes. Recoche la case pour tout retrouver.",
   "Il reste toujours au moins un onglet ; s’il n’en reste qu’un, la barre d’onglets disparaît. Le choix est propre à chaque appareil (PC et téléphone peuvent être différents)."
  ]
 },
 {
  "v": "1.5.1",
  "date": "16/10/2026",
  "items": [
   "Yu-Gi-Oh : nouvel onglet Wishlist (à côté de Ma collection et Decks) pour les cartes que tu veux en dehors des decks : recherche, quantités, prix estimé, « déjà X dans ta collection », galerie ou liste, et Copier la liste au format Cardmarket.",
   "Fiche d’une carte : bouton « ☆ Ajouter à la wishlist ».",
   "Android : quand on fait défiler, l’en-tête reste caché jusqu’à revenir tout en haut de la liste (il ne réapparaît plus en remontant un peu). Aussi dans l’onglet Yu-Gi-Oh."
  ]
 },
 {
  "v": "1.5.0",
  "date": "16/10/2026",
  "items": [
   "Vinyles : prix Discogs. Chaque vinyle affiche le prix le plus bas actuellement en vente sur Discogs (en €) et le nombre d’exemplaires en vente ; la valeur de ta collection est en haut de l’onglet.",
   "Prix mis à jour tout seuls chaque semaine (un vinyle par seconde, limite de Discogs), ou avec le bouton Actualiser les prix.",
   "MusicBrainz retiré : la recherche (texte et code-barres) passe uniquement par Discogs. Les vinyles déjà ajoutés via MusicBrainz restent dans ta collection, sans prix."
  ]
 },
 {
  "v": "1.4.1",
  "date": "16/10/2026",
  "items": [
   "Cartes FM : bouton Wishlist Cardmarket. Il copie les cartes FM manquantes au format wishlist Cardmarket, avec le nom officiel de la carte (retrouvée dans la base Yu-Gi-Oh par son mot de passe, sinon par son nom) et le prix estimé.",
   "Choix « toutes les manquantes » ou « seulement le filtre actuel ». Les cartes introuvables dans la base (propres au jeu, ou nom différent) sont mises à part, avec un bouton pour les ajouter quand même."
  ]
 },
 {
  "v": "1.4.0",
  "date": "16/10/2026",
  "items": [
   "Yu-Gi-Oh : prix Cardmarket. Valeur de ta collection en haut de l’onglet, prix de chaque carte, prix d’un deck et de ce qu’il te manque, coût des cartes manquantes d’une extension.",
   "Le prix est le prix de référence Cardmarket de la carte, toutes éditions confondues (fourni par YGOPRODeck). La base et les prix se mettent à jour chaque semaine ; la première ouverture après la mise à jour retélécharge la base pour récupérer les prix.",
   "Le titre devient simplement « Coffre »."
  ]
 },
 {
  "v": "1.3.8",
  "date": "16/10/2026",
  "items": [
   "Scan Yu-Gi-Oh plus fiable : deux lectures en alternance, la carte entière (nom + code) puis la bande du code agrandie (le code est petit et souvent peu contrasté). Les deux dernières lectures sont combinées.",
   "La lecture déborde un peu du cadre, pour les cartes mal centrées.",
   "Les lectures s’enchaînent plus vite (dès que la précédente est finie)."
  ]
 },
 {
  "v": "1.3.7",
  "date": "16/10/2026",
  "items": [
   "Yu-Gi-Oh : la langue de chaque carte est enregistrée. Une carte scannée avec un code français (ex. DUAD-FR053, LDD-F092) est rangée en FR et affichée avec son code français, plus seulement le code anglais.",
   "Choix de la langue (FR par défaut) dans « Ajouter des cartes » et dans la fiche d’une carte. Les extensions comptent toutes les langues ensemble pour la progression.",
   "Scan : le code est vérifié avec le nom lu en haut de la carte. Si un chiffre du code est mal lu (ex. DUAD-FR033 au lieu de DUAD-FR053), la carte est corrigée d’après son nom."
  ]
 },
 {
  "v": "1.3.6",
  "date": "16/10/2026",
  "items": [
   "Scan Yu-Gi-Oh : les anciennes cartes européennes (ex. LDD-F092, Légende du Dragon Blanc aux Yeux Bleus) ont un autre préfixe et d’autres numéros que la base anglaise (LOB-092), donc le code seul ne suffisait pas. Si le code n’est pas trouvé, Coffre lit maintenant le nom de la carte (français ou anglais, avec une tolérance aux erreurs de lecture).",
   "Le préfixe lu sert à choisir l’extension : LDD → LOB, DDY → SDY, DDK → SDK, DDP → SDP… Si l’extension reste incertaine, Coffre propose les extensions de la carte et « Peu importe l’extension ».",
   "Le scan lit maintenant la carte entière (le nom en haut et le code)."
  ]
 },
 {
  "v": "1.3.5",
  "date": "16/10/2026",
  "items": [
   "Vue extension : la barre du haut compte aussi les raretés. Une pastille par rareté montre ta progression (ex. « Secret Rare 1/40 », « Starlight Rare 1/40 ») et le total « versions (toutes raretés) ».",
   "Toucher une rareté filtre la liste et la barre sur cette rareté ; « Manquantes » et « Copier les manquantes » suivent le filtre."
  ]
 },
 {
  "v": "1.3.4",
  "date": "16/10/2026",
  "items": [
   "Yu-Gi-Oh : dans « Ajouter des cartes », la recherche trouve aussi les extensions (par nom ou par code, ex. « LOB »). Une extension affiche toutes ses cartes avec ta progression, le filtre Manquantes et l’ajout direct (+ / −).",
   "Copier les manquantes d’une extension au format wishlist Cardmarket : « 1 Dark Magician (Legend of Blue Eyes White Dragon) »."
  ]
 },
 {
  "v": "1.3.3",
  "date": "16/10/2026",
  "items": [
   "Scan : la caméra choisit l’objectif principal (sur les téléphones à plusieurs objectifs, le grand-angle ne fait pas la mise au point de près).",
   "Zoom ×2 par défaut pour tenir le téléphone un peu plus loin, là où la mise au point fonctionne. Bouton ×1 / ×2 / ×3 en haut.",
   "Bouton 🔄 pour passer d’un objectif à l’autre (le choix est retenu). Toucher l’image relance la mise au point."
  ]
 },
 {
  "v": "1.3.2",
  "date": "16/10/2026",
  "items": [
   "Android : le bouton « Télécharger » de la mise à jour ouvre maintenant le navigateur du téléphone, qui télécharge vraiment l’APK. Avant, il passait par un onglet intégré qui se refermait avant la fin du téléchargement."
  ]
 },
 {
  "v": "1.3.1",
  "date": "16/10/2026",
  "items": [
   "Yu-Gi-Oh : Galerie ou Liste au choix, pour ta collection et dans chaque deck (comme les cartes FM). Dans un deck en galerie, les cartes manquantes sont grisées.",
   "Le champ de recherche « Ajouter des cartes » fait de nouveau une seule ligne.",
   "Fiche d’une carte : « Ajouter au deck » et « Voir sur Cardmarket » sont en haut, entre « Dans ta collection » et « Ajouter à ma collection »."
  ]
 },
 {
  "v": "1.3.0",
  "date": "16/10/2026",
  "items": [
   "Nouvel onglet Yu-Gi-Oh avec toutes les cartes du jeu (base YGOPRODeck : environ 13 000 cartes, toutes leurs extensions, noms français et anglais). Téléchargée une fois, mise à jour toute seule toutes les deux semaines ; le téléphone la récupère depuis le PC.",
   "Ma collection : seulement tes cartes. Chaque exemplaire est noté avec son impression (code comme SGX1-ENA18 + rareté) ou « peu importe l’extension ».",
   "Decks nommés, avec n’importe quelle carte du jeu (même non possédée). Main / Extra Deck, cartes possédées et manquantes, filtre Manquantes.",
   "Copier la liste des manquantes au format wishlist Cardmarket (« 2 Dark Magician », une carte par ligne).",
   "Android : scan des cartes Yu-Gi-Oh par leur code (ex. SGX1-FRA18 → SGX1-ENA18), ajout automatique, choix de la rareté si besoin, bouton Annuler.",
   "Android : la reconnaissance des pochettes de vinyles est retirée ; le scan du code-barres reste.",
   "Images des cartes : téléchargées depuis YGOPRODeck une seule fois, puis gardées sur l’appareil (les conditions de cardcluster interdisent la récupération automatique).",
   "Collection Yu-Gi-Oh et decks se synchronisent entre le PC et le téléphone."
  ]
 },
 {
  "v": "1.2.2",
  "date": "16/10/2026",
  "items": [
   "Reconnaissance des pochettes : au lieu d’une seule recherche avec tous les mots lus (un seul mot mal lu suffisait à ne rien trouver), Coffre lance plusieurs recherches courtes : les deux plus grosses lignes ensemble, puis chaque ligne seule, plus la référence catalogue si elle est lue. Les résultats sont regroupés puis classés selon la ressemblance avec la photo (jusqu’à 40 pochettes comparées).",
   "Les mots inutiles pour chercher (stereo, records, side, LP…) sont ignorés.",
   "Sous la recherche, le texte lu s’affiche ligne par ligne : touche une ligne pour chercher avec elle seule."
  ]
 },
 {
  "v": "1.2.1",
  "date": "16/10/2026",
  "items": [
   "Android : la lecture du texte des pochettes restait bloquée sur « Lecture du texte de la pochette… ». Elle passe maintenant par ML Kit, le module de lecture de texte de Google intégré à l’appli : quelques dixièmes de seconde, toujours sans internet.",
   "Si la lecture échoue ou dépasse 15 secondes, la recherche s’ouvre quand même pour taper les mots.",
   "La recherche de code-barres s’arrête pendant la lecture de la photo (moins de travail pour le téléphone).",
   "L’appli Android est plus légère (l’ancien lecteur de texte, Tesseract, est retiré)."
  ]
 },
 {
  "v": "1.2.0",
  "date": "16/10/2026",
  "items": [
   "Android : quand on fait défiler les cartes ou les vinyles, l’en-tête se replie (titre, onglets, recherche, filtres) pour laisser tout l’écran à la liste. Il revient dès qu’on remonte un peu. Un bouton rond 📷 reste disponible pour scanner.",
   "Android : reconnaissance des vinyles sans code-barres. « 📷 Scanner un vinyle » → « Reconnaître la pochette » : le téléphone lit le texte de la pochette (sans internet), lance la recherche avec ces mots, puis classe les résultats selon la ressemblance de leur pochette avec la photo (« Même pochette »). Les mots lus se touchent pour corriger la recherche. Le code-barres reste détecté automatiquement s’il est visible.",
   "Correction : dans la recherche de vinyles, les pochettes pouvaient se chevaucher et cacher les titres."
  ]
 },
 {
  "v": "1.1.0",
  "date": "16/10/2026",
  "items": [
   "Nouvelle appli Android « Coffre » : même collection, avec l’appareil photo.",
   "Cartes FM : reconnaissance par l’illustration (marche aussi pour les vieilles cartes japonaises sans code). Propose les 6 cartes les plus proches, ajout d’un toucher ou ajout auto quand la carte est sûre. Bouton Annuler.",
   "Vinyles : scan du code-barres au dos de la pochette, puis recherche automatique (UPC et EAN essayés tous les deux).",
   "Synchronisation PC ↔ téléphone sur le Wi-Fi : ce qui est ajouté, modifié ou retiré d’un côté arrive de l’autre, pochettes comprises. Appairage en scannant un QR code dans les réglages du PC.",
   "Le PC garde la modification la plus récente de chaque carte / vinyle ; un vinyle retiré reste marqué « supprimé » pour que la suppression passe aussi sur l’autre appareil.",
   "Le workflow GitHub compile maintenant aussi l’APK signée et l’ajoute à la release. L’appli Android prévient quand une nouvelle version existe."
  ]
 },
 {
  "v": "1.0.3",
  "date": "16/10/2026",
  "items": [
   "Cartes FM et Vinyles sont maintenant dans deux onglets séparés en haut de la fenêtre, chacun en pleine largeur.",
   "Chaque onglet affiche son compteur (cartes possédées / disques). L’appli se rouvre sur le dernier onglet utilisé. Raccourcis : Ctrl+1 et Ctrl+2."
  ]
 },
 {
  "v": "1.0.2",
  "date": "16/10/2026",
  "items": [
   "Discogs fonctionne maintenant avec la Consumer Key + Consumer Secret d’une application Discogs (le token personnel reste possible).",
   "Réglages : deux nouveaux champs, et le secret/token sont masqués à l’écran."
  ]
 },
 {
  "v": "1.0.1",
  "date": "16/10/2026",
  "items": [
   "Correction : une fenêtre vide restait affichée au démarrage et bloquait l’appli. Les éléments masqués (fenêtres, bandeau de mise à jour) sont maintenant vraiment cachés."
  ]
 },
 {
  "v": "1.0.0",
  "date": "16/10/2026",
  "items": [
   "Création de l’appli : cartes Forbidden Memories (722, dont 709 avec image) et vinyles côte à côte.",
   "Recherche de vinyles en ligne avec pochettes (MusicBrainz sans clé, Discogs avec token), fiche détaillée avec pistes, ajout au coffre.",
   "Ajout manuel avec ta propre photo de pochette, sauvegarde/restauration complète, mises à jour automatiques via GitHub Releases."
  ]
 }
];
if (typeof module === 'object') module.exports = window.COFFRE_CHANGELOG;
