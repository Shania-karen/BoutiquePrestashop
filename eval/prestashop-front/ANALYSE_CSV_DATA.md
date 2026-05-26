# Analyse Spécifique de ton Modèle CSV (`data-import`)

Suite à ton message, j'ai jeté un œil direct au format de tes fichiers CSV (comme `import-csv-data-18-mai-26 - produit.csv`). Il contient les colonnes suivantes : 
`date_availability_produit, nom, reference, prix_ttc, Taxe, categorie, prix_achat`

C'est un excellent format pour un humain, mais **c'est un champ de mines pour l'API PrestaShop**. C'est exactement ce genre de format qui fait crasher un importateur s'il n'est pas "nettoyé" au préalable en JavaScript. 

Voici pourquoi et ce que ton `ImportExportManager` DOIT faire avant d'envoyer la donnée à l'API :

### A. Le séparateur décimal (La Virgule vs Le Point)
- **Ton CSV :** Contient des prix comme `"199,1"` ou `"116,55"`.
- **Ce que veut l'API :** Un séparateur décimal anglais avec un point (`199.10` ou `116.55`).
- **Le Crash :** PrestaShop et sa base de données SQL ne comprennent pas la virgule pour les nombres. Si tu envoies "199,1", l'API va planter ou tronquer le prix à `199.00` ! 
- **La solution :** Ton script DOIT faire un `.replace(',', '.')` sur tous les montants financiers.

### B. Le problème des Taxes en pourcentage
- **Ton CSV :** Contient des valeurs comme `"11,54%"` ou `"20,00%"`.
- **Ce que veut l'API :** Un identifiant entier `id_tax_rules_group` (ex: `1` pour 20%, `2` pour 5.5%).
- **Le Crash :** L'API `products` n'accepte aucun pourcentage. Si tu envoies "20%", la requête est rejetée (Erreur 400). 
- **La solution :** Ton script doit d'abord interroger PrestaShop pour trouver l'ID de la règle de taxe qui correspond à 20% (ou la créer si elle n'existe pas), et associer cet ID au produit.

### C. La Catégorie en Texte Libre
- **Ton CSV :** Contient des noms comme `Habillement` ou `Électronique`.
- **Ce que veut l'API :** Un identifiant entier `id_category_default` (ex: `12`).
- **Le Crash :** PrestaShop ne lie pas les produits par des mots, mais par des IDs relationnels. 
- **La solution :** Ton script doit faire une requête préalable pour trouver l'ID de la catégorie "Habillement". Si elle n'existe pas, l'ImportManager doit *d'abord* créer la catégorie pour récupérer son nouvel ID, puis utiliser cet ID pour créer le produit.

### D. Le piège comptable du Prix TTC
- **Ton CSV :** Fournit le `prix_ttc` (Prix Toutes Taxes Comprises).
- **Ce que veut l'API :** L'API PrestaShop exige qu'on lui fournisse le **Prix HT** (`price`).
- **Le Crash (Comptable) :** Si tu envoies directement le `prix_ttc` de ton CSV dans le champ `price` de l'API, PrestaShop va croire que c'est du HT. Il va rajouter la TVA par-dessus ! Ton produit à 100€ TTC dans le CSV finira affiché à 120€ sur la boutique. 
- **La solution :** Ton script doit obligatoirement calculer le prix HT côté React avant de l'envoyer à l'API. La formule mathématique à appliquer est : `Prix_HT = Prix_TTC / (1 + (Taxe / 100))`.

### En Résumé
Le fichier CSV que tu m'as montré est ce qu'on appelle de la "donnée brute" (Raw Data). Les limites de ton ImportManager ne viendront pas de l'API elle-même, mais de **sa capacité à parser, convertir et lier** ces données brutes avant de fabriquer le fichier XML attendu par PrestaShop. 
Si ton script prend le CSV tel quel et l'injecte dans le XML, le crash est assuré à 100% !
