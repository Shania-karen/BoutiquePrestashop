# Documentation Dashboard - Totaux Produits et Panier

## 📋 Vue d'ensemble

Le Dashboard affiche maintenant **trois types de totaux** :

1. **KPIs Généraux** : Statistiques des commandes (CA, HT, TTC, etc.)
2. **Totaux Produits** : Inventaire complet de tous les produits de la boutique
3. **Totaux Panier** : Résumé financier du panier utilisateur actuel

---

## 1️⃣ Totaux Produits (Inventaire)

### Description
Cette section affiche les **totaux financiers de tous les produits disponibles** dans la boutique PrestaShop.

### Fonctionnement

#### Source des données
- Les produits sont chargés via l'API PrestaShop : `GET products?display=[id,supplier_reference,price]`
- **Price** (champ `price`) = Prix HT (hors taxes)
- **supplier_reference** = Taux de taxe en % (ex: 20 pour 20% de TVA)

#### Calculs effectués

```
Pour chaque produit :
  - Prix HT = extractValue(product.price)
  - Taux taxe = (taxRates[productId] || 0) / 100
  - Prix TTC = Prix HT × (1 + Taux taxe)

Total général :
  - Total HT = Somme de tous les (Prix HT)
  - Total Taxes = Somme de tous les (Prix TTC - Prix HT)
  - Total TTC = Somme de tous les (Prix TTC) = Total HT + Total Taxes
```

#### Exemple
```
3 produits dans la boutique :
1. Produit A : Prix HT = 100 €, Taxe = 20% → TTC = 120 €
2. Produit B : Prix HT = 50 €, Taxe = 20% → TTC = 60 €
3. Produit C : Prix HT = 30 €, Taxe = 5.5% → TTC ≈ 31.65 €

Résultats affichés :
- Nombre de produits : 3
- Total HT : 180 €
- Total Taxes (TVA) : 21.65 €
- Total TTC : 201.65 €
```

### Affichage
4 cartes KPI affichent :
- **Nombre de produits** : Nombre total de produits en stock
- **Total HT** : Somme de tous les prix (hors taxes)
- **Total Taxes** : TVA totale estimée
- **Total TTC** : Somme de tous les prix (taxes incluses) - mise en avant en noir

---

## 2️⃣ Totaux Panier

### Description
Cette section affiche les **totaux financiers du panier de l'utilisateur actuel**.

### Fonctionnement

#### Source des données
Le panier est géré par **CartContext** avec les méthodes exposées :
- `getTotalTTC()` : Montant total TTC du panier
- `getTotalHT(taxRate)` : Montant total HT du panier (avec TVA par défaut 20%)
- `getTotalTaxes(taxRate)` : Montant des taxes sur le panier
- `totalItems` : Nombre total d'articles dans le panier

#### Structure du panier
```javascript
const cartItem = {
  key: "productId_combinationId",           // Identifiant unique
  id: productId,                            // ID produit
  combinationId: combinationId,             // ID variante/combinaison
  name: "Nom du produit",
  variantLabel: "Description variante",
  price: 99.99,                             // Prix TTC de l'article
  image: "/path/to/image.jpg",
  stock: 50,
  quantity: 1                               // Quantité cmdée
};
```

#### Calculs effectués

```
Total TTC du panier :
  = Somme de (item.price × item.quantity) pour tous les articles

Total HT du panier (TVA 20% par défaut) :
  = Total TTC / (1 + 0.20)
  = Total TTC / 1.20

Total Taxes :
  = Total TTC - Total HT
```

#### Exemple
```
Panier :
- 2× Produit A (Prix TTC 120 €) → 240 €
- 1× Produit B (Prix TTC 60 €) → 60 €

Résultats affichés :
- Articles : 3
- Total HT : (240 + 60) / 1.20 = 250 €
- Total Taxes (TVA) : 300 - 250 = 50 €
- Total TTC : 300 €
```

### Affichage
4 cartes KPI affichent :
- **Articles** : Nombre total d'articles dans le panier
- **Total HT** : Montant sans taxes
- **Taxes (TVA)** : Montant des taxes applicables
- **Total TTC** : Prix final TTC - mise en avant en noir

---

## 3️⃣ Gestion des Widgets

### Affichage conditionnels
Les utilisateurs peuvent **afficher/masquer chaque widget** via les checkboxes :

```
☑ KPIs Généraux
☑ Courbe des ventes
☑ Courbe des revenus
☑ Tableau par jour
☑ Totaux Produits (Inventaire)
☑ Totaux Panier
```

### Architecture

#### État (useState)
```javascript
const [activeWidgets, setActiveWidgets] = useState([
  'kpis', 'salesGraph', 'amountGraph', 'dailyTable', 'productsStats', 'cartStats'
]);
```

#### Fonction de bascule
```javascript
const handleToggleWidget = (widgetId) => {
  setActiveWidgets(prev => 
    prev.includes(widgetId) 
      ? prev.filter(id => id !== widgetId)  // Masquer
      : [...prev, widgetId]                  // Afficher
  );
};
```

#### Rendu conditionnel
```jsx
{activeWidgets.includes('productsStats') && (
  <div>
    {/* Affichage section Totaux Produits */}
  </div>
)}
```

---

## 4️⃣ Données et API

### Appels API effectués

#### 1. Charger les commandes
```
GET /api/orders?limit=1000&display=full
```
Retourne : toutes les commandes (états, dates, montants, articles)

#### 2. Charger les produits
```
GET /api/products?display=[id,supplier_reference,price]&limit=500
```
Retourne : ID, taux de taxe, prix HT pour chaque produit

#### 3. Charger les paniers
```
GET /api/carts?limit=1000&display=full
```
Retourne : tous les paniers pour identifier les paniers orphelins (non commandés)

### Flux de chargement
```
useEffect → Dashboard monte
  ├─ Charger commandes
  ├─ Charger produits (pour taux taxes)
  ├─ Charger paniers (pour compter orphelins)
  └─ État: setLoading(false)

Données chargées → useMemo calcule
  ├─ dailyData + stats (basé sur commandes)
  ├─ productsStats (basé sur produits)
  └─ cartStats (basé sur CartContext - le panier)
```

---

## 5️⃣ Détails Techniques

### Taux de taxe
- Stocké dans le champ `product.supplier_reference` en % (ex: "20")
- Par défaut : 0% si absent
- Utilisé pour calculer le passage HT → TTC

### Format des montants
- Tous les montants sont affichés avec **2 décimales** : `.toFixed(2)`
- Symbole € ajouté manuellement

### Dépendances
```javascript
// Assets
import { useCart } from '../context/CartContext';
import { fetchPrestaData, extractValue } from '../services/apiClient';

// Composants recharts
import { LineChart, BarChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
```

### Gestion d'erreurs
- Try/catch lors du chargement des données API
- État de chargement (`loading`) affiché pendant la requête
- Fallback à 0 si parsing échoue

---

## 6️⃣ Utilisation

### Afficher le Dashboard
```jsx
import Dashboard from './components/Dashboard';

<Dashboard />
```

### Accéder au panier depuis un autre composant
```jsx
import { useCart } from './context/CartContext';

const MyComponent = () => {
  const { cart, getTotalTTC, getTotalHT, getTotalTaxes, totalItems } = useCart();
  
  console.log(`Panier : ${totalItems} articles, TTC: ${getTotalTTC()} €`);
  
  return (
    <div>
      <p>Total: {getTotalTTC()} €</p>
    </div>
  );
};
```

### Modifier les taux de taxe
1. Éditer le champ `supplier_reference` du produit en base de données
2. OU mettre à jour via l'API PrestaShop avant de rafraîchir le Dashboard

---

## 7️⃣ Limitations et Notes

- **Taux de taxe unique par produit** : Tous les articles d'une même catégorie utilisent le même taux
- **Panier = LocalStorage** : Les données sont stockées localement, pas synchronisées en temps réel avec l'API
- **TVA panier fixe à 20%** : A modifier en paramètre si taux variable souhaité
- **Prix API = TTC** : Les prix saisis dans CartContext sont déjà TTC

---

## 📊 Résumé des widgets

| Widget | Source | Calculs | Affichage |
|--------|--------|---------|-----------|
| **KPIs** | Commandes API | Totaux CA, HT, TTC, annulations | 6 cartes |
| **Produits** | Produits API | Inventaire HT, TTC, taxes | 4 cartes |
| **Panier** | CartContext | Totaux utilisateur HT, TTC, taxes | 4 cartes |
| **Ventes** | Commandes API | Courbes quotidiennes | Graphique ligne |
| **Revenus** | Commandes API | Barres HT vs TTC | Graphique barres |
| **Tableau** | Commandes API | Détails par jour | Table trier |

---

## 🔧 Modification futures
- Paramétrer le taux de TVA (actuellement 20% fixe)
- Ajouter un filtre par catégorie produits
- Exporter les totaux en CSV/PDF
- Real-time sync du panier avec l'API
