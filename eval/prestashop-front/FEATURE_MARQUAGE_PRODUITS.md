# Fonctionnalité : Marquage des Produits (HOT / NEW)

Cette documentation explique le fonctionnement de la nouvelle fonctionnalité d'étiquetage des produits sur le catalogue du Frontoffice. L'objectif est d'attirer l'œil des clients sur les nouveautés récentes en ajoutant automatiquement des badges sur l'image du produit.

## 📁 Fichiers Modifiés

1. **`src/components/Frontoffice.jsx`**
   - **Logique de calcul** : Lors du chargement de la liste des produits (`loadProducts` et la fonction `enrichOne`), nous vérifions la date de sortie du produit via la propriété `available_date` (ou `date_add` en solution de repli si la date de disponibilité n'est pas renseignée).
   - **Conditions** : 
     - **HOT** : Si le produit a été ajouté il y a **moins de 24 heures** (ou si sa date de sortie est encore dans le futur).
     - **NEW** : Si le produit a été ajouté il y a **entre 1 et 7 jours**.
   - **Rendu** : Ajout d'une condition dans la carte du produit pour afficher dynamiquement le badge si le statut `__statusBadge` a été défini lors de la récupération.

2. **`src/assets/css/Frontoffice.css`**
   - **Styles visuels** : Ajout des classes `.product-status-badge`, `.product-status-badge.hot` et `.product-status-badge.new`.
   - **Intégration au thème** : Les badges respectent la charte graphique minimaliste "Boutique" (Noir et Blanc). Le parent `.product-image-wrapper` a été mis en `position: relative` pour permettre le positionnement absolu du badge en haut à droite.

## 🛠️ Comment ça marche ? (Mécanisme technique)

Lorsque l'application appelle l'API PrestaShop :
1. Le nœud `date_add` et `available_date` sont extraits du XML du produit.
2. Le système prend `available_date` en priorité. S'il vaut `"0000-00-00"`, il utilise `date_add`.
3. Une différence de temps (`diffTime`) est calculée entre la date d'aujourd'hui (`new Date()`) et la date récupérée.
4. Cette différence est convertie en **jours** (`diffDays`).
5. Le flag `__statusBadge` est affecté à `"HOT"` ou `"NEW"`. S'il y a plus de 7 jours, il reste vide (`null`).
6. Le Frontoffice interprète ce flag pour insérer dynamiquement le texte et la classe CSS correspondante au-dessus de l'image du produit.
