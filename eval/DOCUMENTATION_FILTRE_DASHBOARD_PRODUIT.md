# Documentation : filtrer le Dashboard par produit

## Objectif

Ajouter un filtre pour afficher les chiffres du Dashboard pour **un produit précis** au lieu de tout le stock ou de toutes les commandes.

---

## Principe

Le Dashboard travaille avec 3 types de données :

- **Commandes** : pour les totaux CA, HT, TTC et taxes
- **Produits** : pour les totaux d’inventaire
- **Panier** : pour les totaux du panier

Pour filtrer par produit, il faut :

1. choisir un produit dans l’interface
2. conserver uniquement les lignes liées à ce produit
3. recalculer les totaux avec les données filtrées

---

## 1. État à ajouter dans `Dashboard.jsx`

On ajoute un état pour mémoriser le produit sélectionné :

```jsx
const [selectedProductId, setSelectedProductId] = useState('');
```

Optionnellement, on peut aussi filtrer par référence :

```jsx
const [selectedProductRef, setSelectedProductRef] = useState('');
```

---

## 2. Ajouter un sélecteur dans l’interface

Exemple simple avec une liste déroulante :

```jsx
<select
  value={selectedProductId}
  onChange={(e) => setSelectedProductId(e.target.value)}
>
  <option value="">Tous les produits</option>
  {allProducts.map((product) => (
    <option key={product.id} value={product.id}>
      {product.reference} - {product.name}
    </option>
  ))}
</select>
```

---

## 3. Filtrer les commandes

Une commande peut contenir plusieurs produits dans `order_rows`.

Il faut donc garder seulement les commandes qui contiennent le produit choisi :

```jsx
const filteredOrders = useMemo(() => {
  if (!selectedProductId) return allOrders;

  return allOrders.filter((order) => {
    const rows = order.associations?.order_rows?.order_row;
    if (!rows) return false;

    const rowsArray = Array.isArray(rows) ? rows : [rows];
    return rowsArray.some((row) =>
      String(extractValue(row.product_id)) === String(selectedProductId)
    );
  });
}, [allOrders, selectedProductId]);
```

Ensuite, les calculs de commandes doivent utiliser `filteredOrders` au lieu de `allOrders`.

---

## 4. Filtrer les produits inventaire

Pour l’inventaire, on peut soit :

- afficher seulement le produit choisi
- ou garder la liste complète et surligner le produit filtré

Exemple simple :

```jsx
const filteredProducts = useMemo(() => {
  if (!selectedProductId) return allProducts;
  return allProducts.filter((product) =>
    String(extractValue(product.id)) === String(selectedProductId)
  );
}, [allProducts, selectedProductId]);
```

Puis calculer les totaux inventaire avec `filteredProducts`.

---

## 5. Filtrer le panier

Pour le panier, il faut garder uniquement les `cart_rows` du produit sélectionné.

Exemple :

```jsx
const filteredCartRows = useMemo(() => {
  if (!selectedProductId) return cartRows;

  return cartRows.filter((row) =>
    String(extractValue(row.id_product)) === String(selectedProductId)
  );
}, [cartRows, selectedProductId]);
```

Puis recalculer :

- `totalCartItems`
- `totalCartHT`
- `totalCartTTC`
- `totalCartTaxes`

---

## 6. Recalcul des KPI

Une fois les données filtrées, il faut recalculer les KPI avec :

- les commandes filtrées
- les produits filtrés
- le panier filtré

Exemple pour les commandes :

```jsx
const totalTTC = filteredOrders.reduce((sum, order) => {
  const value = Number(extractValue(order.total_paid)) || 0;
  return sum + value;
}, 0);
```

---

## 7. Structure conseillée

### Filtre visuel
- select produit
- bouton réinitialiser

### Données filtrées
- `filteredOrders`
- `filteredProducts`
- `filteredCartRows`

### Statistiques recalculées
- `stats`
- `productsStats`
- `cartStats`

---

## 8. Cas particulier : produit avec déclinaisons

Si le produit a des variantes, il faut filtrer aussi :

- par `product_id`
- et éventuellement par `product_attribute_id`

Exemple :

```jsx
String(extractValue(row.product_id)) === String(selectedProductId)
```

Si tu veux une déclinaison précise, il faut aussi tester :

```jsx
String(extractValue(row.product_attribute_id)) === String(selectedCombinationId)
```

---

## 9. Résultat attendu

Quand un produit est sélectionné :

- les KPIs ne concernent plus que ce produit
- les graphes affichent uniquement ses données
- le panier montre uniquement ses lignes
- les totaux HT / TTC / taxes sont recalculés correctement

---

## 10. Résumé rapide

Le filtre produit repose sur 3 étapes :

1. **sélectionner** un produit
2. **filtrer** les lignes correspondantes
3. **recalculer** les montants

C’est la méthode la plus simple et la plus propre pour filtrer un Dashboard PrestaShop par produit.
