# Comment fonctionne le Dashboard actuel et comment en créer un nouveau

Ce fichier explique comment le tableau de bord des commandes a été implémenté et quelles sont les étapes à suivre si vous souhaitez créer un tableau de bord similaire pour un autre module (par exemple : les clients, les produits, ou les paniers).

---

## 1. Comment fonctionne le Dashboard actuel (Commandes)

Le fichier `src/components/Dashboard.jsx` affiche un tableau de bord analytique basé sur les données réelles des commandes provenant de l'API PrestaShop.

### A. Récupération des données
Nous utilisons la fonction `fetchPrestaData` du fichier `src/services/apiClient.js` :
```javascript
import { fetchPrestaData, extractValue } from '../services/apiClient';

// Appel de l'API pour récupérer jusqu'à 1000 commandes
const data = await fetchPrestaData('orders', 0, 1000);
let orders = data?.orders?.order || [];
```

### B. Traitement et Agrégation
Les données brutes renvoyées par l'API XML sont transformées en JSON. Nous itérons sur chaque commande pour extraire :
- **La date** (`date_add`) : pour grouper les commandes par jour.
- **Le montant** (`total_paid_tax_incl` ou `total_paid`).

Nous calculons ainsi le **Total Général** (nombre total et montant global) et nous regroupons les statistiques **par jour** dans un dictionnaire (`dayMap`), qui est ensuite converti en tableau (`dailyData`) et trié chronologiquement.

### C. Affichage avec Recharts
Nous utilisons la bibliothèque `recharts` pour générer les graphiques de manière réactive :
- `LineChart` : pour afficher l'évolution du nombre de commandes.
- `BarChart` : pour afficher les revenus générés par jour.

Un sélecteur interactif permet à l'utilisateur d'activer ou de désactiver certains widgets (les graphiques, le total général ou le tableau détaillé).

---

## 2. Comment créer un Dashboard pour un autre module

Si vous souhaitez créer un tableau de bord pour un autre module (par exemple : **Les Clients** ou **Les Produits**), voici les étapes à suivre :

### Étape 1 : Identifier l'URL de la ressource API
Assurez-vous de connaître le nom exact de la ressource PrestaShop. 
- Clients : `'customers'`
- Produits : `'products'`
- Paniers : `'carts'`

*Astuce : Vous pouvez consulter le fichier `DOCUMENTATION_PRESTASHOP_API.md` pour voir comment récupérer le schéma exact de chaque ressource via `fetchResourceSchema(resourcePath)`.*

### Étape 2 : Créer un nouveau composant React
Créez un nouveau fichier dans `src/components/`, par exemple `CustomersDashboard.jsx`.

### Étape 3 : Importer les outils nécessaires
Importez `fetchPrestaData` et `extractValue` depuis le client API, ainsi que les graphiques de `recharts`.

```javascript
import React, { useState, useEffect } from 'react';
import { fetchPrestaData, extractValue } from '../services/apiClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
```

### Étape 4 : Récupérer et agréger les données
Dans un `useEffect`, lancez la requête vers la nouvelle ressource et traitez les données selon vos besoins :

```javascript
useEffect(() => {
  async function loadData() {
    try {
      // Exemple pour les clients
      const data = await fetchPrestaData('customers', 0, 1000);
      let customers = data?.customers?.customer || [];
      if (!Array.isArray(customers)) customers = [customers];

      let countPerDay = {};
      
      customers.forEach(customer => {
        // Obtenir la date d'inscription
        const dateAdd = extractValue(customer.date_add); 
        if (!dateAdd) return;
        
        const day = dateAdd.split(' ')[0]; // Ne garder que YYYY-MM-DD
        
        if (!countPerDay[day]) {
          countPerDay[day] = { date: day, nbInscriptions: 0 };
        }
        countPerDay[day].nbInscriptions += 1;
      });

      // Convertir en tableau et trier
      const graphData = Object.values(countPerDay).sort((a, b) => new Date(a.date) - new Date(b.date));
      // Mettre dans le state...
    } catch (error) {
      console.error(error);
    }
  }
  loadData();
}, []);
```

### Étape 5 : Afficher les widgets
Utilisez la même structure CSS ou `recharts` que dans le `Dashboard.jsx` principal. Adaptez les `<XAxis dataKey="date" />` et les `<Line dataKey="nbInscriptions" />` avec les clés que vous avez définies lors de votre agrégation.

### Étape 6 : Intégrer votre Dashboard au Backoffice
Enfin, rendez-vous dans `src/components/Backoffice.jsx` (ou le composant où vous gérez la navigation) et ajoutez un bouton dans le menu latéral (Sidebar) pour afficher votre nouveau composant `CustomersDashboard`.
