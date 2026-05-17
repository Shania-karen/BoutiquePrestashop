# Fonctionnalité : Recherche Multicritère

Ce document explique le fonctionnement de la nouvelle fonctionnalité de recherche et de filtrage dynamique sur le catalogue du Frontoffice. L'objectif est de permettre aux clients de trouver rapidement un produit en affinant les résultats selon trois critères simultanés : nom, catégorie et prix.

## 📁 Fichiers Modifiés

1. **`src/components/Frontoffice.jsx`**
   - **États (State)** : Ajout de plusieurs variables d'état avec `useState` pour stocker les critères de l'utilisateur : `searchName`, `searchCategory`, `searchMinPrice`, `searchMaxPrice`. Un état `categories` a également été ajouté pour stocker la liste des catégories.
   - **Appels API (`useEffect`)** : 
     - L'appel pour récupérer les produits a été modifié pour récupérer **100 produits** au lieu de 12 (`fetchPrestaData('products', 0, 100)`). Cela permet de constituer un catalogue local suffisamment grand pour que le filtre soit pertinent et instantané.
     - Un nouvel appel API (`fetchPrestaData('categories', 0, 100)`) a été ajouté pour récupérer la liste des catégories existantes et hydrater le menu déroulant.
   - **Interface Utilisateur (UI)** : Ajout d'une barre contenant les inputs (champ texte pour le nom, menu déroulant `<select>` pour les catégories, et deux champs numériques pour les intervalles de prix).
   - **Logique de filtrage** : Création d'une variable dynamique `filteredProducts` qui combine les filtres saisis par l'utilisateur (texte, catégorie exacte, et prix final TTC compris dans la fourchette). Le système n'affiche que cette liste restreinte.

2. **`src/assets/css/Frontoffice.css`**
   - **Styles visuels** : Ajout des classes CSS (`.filters-container`, `.filter-input`, `.filter-select`, `.price-filters`, `.price-input`) pour mettre en forme la barre de recherche.
   - **Intégration au thème** : Les styles sont alignés avec le thème minimaliste (fonds blancs, textes noirs, fines bordures grises). La barre est également rendue "Responsive" (adaptable) pour se superposer correctement sur les mobiles.

## 🛠️ Comment ça marche ? (Mécanisme technique)

1. Au chargement de la page (`useEffect`), l'application télécharge la liste des produits (avec le calcul des taxes et réductions appliqués) ainsi que la liste des catégories.
2. Lorsque l'utilisateur tape un texte, sélectionne une catégorie ou tape un montant de prix, les états de l'application React sont mis à jour instantanément.
3. À chaque mise à jour, React relance le rendu. Juste avant d'afficher les produits, la liste totale passe à travers la méthode `.filter()`.
4. Pour chaque produit, les tests suivants sont effectués :
   - `nameMatch` : Le nom du produit contient-il le texte saisi (insensible à la casse) ?
   - `catMatch` : Si une catégorie est sélectionnée, le produit appartient-il à cette catégorie (comparaison sur `id_category_default`) ?
   - `minMatch` / `maxMatch` : Le prix TTC du produit (stocké dans `__priceDisplay.finalTTC`) est-il supérieur au prix min et inférieur au prix max ?
5. Si toutes les conditions sont remplies (`return nameMatch && catMatch && minMatch && maxMatch`), le produit est conservé pour l'affichage.
6. La grille des produits affiche uniquement ce tableau `filteredProducts`. S'il est vide, un message indique qu'aucun produit ne correspond.
