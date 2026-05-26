# Idées de Fonctionnalités Supplémentaires

Ce document liste des idées de fonctionnalités que tu pourrais ajouter à ton projet React / PrestaShop pour l'améliorer et te challenger. Elles sont classées par niveau de difficulté.

---

## 🟢 Niveau Facile (Pour s'échauffer avec React)

### 1. Filtrage et Tri des Commandes
**L'idée :** Actuellement, la liste des commandes affiche tout en vrac. Il serait utile de pouvoir les trier et les filtrer.
**Ce qu'il faut faire :**
- Ajouter une barre de recherche dans `OrderList.jsx` (ex: chercher par référence de commande).
- Ajouter des boutons de filtre par statut (ex: "Voir uniquement les commandes Livrées", "Voir les Annulées").
- **Technique :** Utiliser la méthode `.filter()` et `.sort()` de JavaScript sur l'état `orders` avant de faire le `.map()` pour l'affichage.

### 2. Badge "Nouveau Produit" ou "Rupture" sur les cartes
**L'idée :** Ajouter un indicateur visuel rapide sur les produits dans la page catalogue.
**Ce qu'il faut faire :**
- Dans le composant qui affiche la liste des produits (`ProductList.jsx` probablement).
- Comparer la date de création du produit (`date_add`) avec la date du jour. Si le produit a moins de 30 jours, afficher un badge stylisé "Nouveau !".
- Si le stock est à 0, griser la carte du produit et afficher "Rupture de stock".
- **Technique :** Rendu conditionnel simple en React (`{condition && <Badge />}`).

---

## 🟡 Niveau Intermédiaire (Pour approfondir la gestion d'état et l'API)

### 1. Système de Favoris (Wishlist)
**L'idée :** Permettre au client de sauvegarder des produits pour les acheter plus tard sans les mettre dans le panier.
**Ce qu'il faut faire :**
- Créer un `Context` React (ex: `WishlistContext.jsx`) pour stocker les produits favoris, exactement comme tu l'as fait pour le panier (`CartContext`).
- Ajouter un bouton "Cœur" sur chaque produit.
- Sauvegarder cette liste dans le `localStorage` du navigateur pour que l'utilisateur ne perde pas ses favoris s'il ferme la page.
- Créer une nouvelle page `Mes Favoris` pour afficher ces produits.

### 2. Téléchargement de Facture PDF
**L'idée :** Permettre au client de télécharger sa facture directement depuis son espace.
**Ce qu'il faut faire :**
- Dans `OrderList.jsx`, ajouter un bouton "Télécharger la facture" pour les commandes ayant le statut "Payé" ou "Livré".
- **Deux approches possibles :**
  - *Approche API (Meilleure) :* Utiliser l'API PrestaShop si elle expose le PDF de la commande, et forcer le téléchargement du fichier.
  - *Approche Frontend :* Utiliser une librairie comme `jspdf` et `html2canvas` pour générer un PDF propre directement en React à partir des données de la commande.

---

## 🔴 Niveau Difficile (Pour devenir un pro de l'architecture)

### 1. Tableau de Bord Analytique avec Graphiques (Dashboard)
**L'idée :** Créer une page réservée aux administrateurs pour voir les statistiques de vente.
**Ce qu'il faut faire :**
- Installer une librairie de graphiques (comme `Recharts` ou `Chart.js`).
- Faire des requêtes complexes à l'API PrestaShop pour récupérer toutes les commandes du mois.
- Agréger les données en JavaScript : calculer le chiffre d'affaires par jour, trouver les 5 produits les plus vendus.
- Afficher ces données sous forme de graphiques (courbes pour le CA, camembert pour la répartition des ventes par catégorie).
- Gérer la performance : ne pas faire crasher l'appli si l'API renvoie 5000 commandes (implémenter de la pagination ou des requêtes par dates filtrées).

### 2. Panier Persistant Multi-Appareils (Synchronisation API)
**L'idée :** Actuellement, si le panier est géré dans le `localStorage` React, le client perd son panier s'il change d'ordinateur. L'objectif est de synchroniser le panier en temps réel avec PrestaShop *avant* même la validation.
**Ce qu'il faut faire :**
- À chaque fois que l'utilisateur ajoute un produit au panier dans React, faire une requête `PUT` à l'API PrestaShop pour mettre à jour l'objet `cart` associé à ce client dans la base de données.
- Au moment de la connexion (`Login.jsx`), interroger PrestaShop pour récupérer le dernier `cart` actif du client et remplir le panier React avec.
- Gérer les conflits : que se passe-t-il si un produit a été mis dans le panier sur le téléphone hier, mais qu'aujourd'hui il est en rupture de stock ? Il faut implémenter une vérification de stock silencieuse au chargement du panier.
