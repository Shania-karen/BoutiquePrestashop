# Documentation - PrestashopAPI

## Vue d'ensemble
Le fichier `prestashopApi.js` est le **service core** pour toute communication avec l'API REST de PrestaShop. Il contient :
- ✅ Les **opérations CRUD de base** (lire, créer, modifier, supprimer)
- ✅ Les **opérations métier avancées** (export CSV, import batch, suppression sécurisée)
- ✅ Les **utilitaires** pour parser XML et construire les requêtes

**Technologie** : XMLParser de la bibliothèque `fast-xml-parser` pour convertir XML ↔ JSON

---

## 1. Configuration initiale

### Clé API et URLs
```javascript
const API_KEY = '77KUX2NEZ7SIRLUVUKXR5EDA5U7TWM2I';
const BASE_URL = '/api-presta/api';
const IMAGE_BASE_URL = '/api-presta/api/images/products';
```

### Parseur XML
```javascript
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});
```
- Accepte les attributs XML (ex: `id="1"`)
- Préfixe les attributs par `@_` dans l'objet JSON (ex: `@_id`)

---

## 2. Utilitaires

### 🔧 `escapeXml(str)`
**Objectif** : Échappe les caractères spéciaux XML pour éviter les erreurs de parsing

**Conversions** :
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`

```javascript
escapeXml("Prix 29,99 € < 30€") 
// → "Prix 29,99 € &lt; 30€"
```

---

### 🔧 `buildGenericXml(resourceName, dataObj)`
**Objectif** : Construire du XML formaté pour n'importe quelle ressource

**Particularité** : Certains champs (name, description, link_rewrite) sont enveloppés dans une balise `<language>` :

```javascript
buildGenericXml('product', {
  name: 'Mon Produit',
  price: '29.99',
  active: '1'
});

// Résultat :
// <?xml version="1.0" encoding="UTF-8"?>
// <prestashop>
//   <product>
//     <name><language id="1">Mon Produit</language></name>
//     <price>29.99</price>
//     <active>1</active>
//   </product>
// </prestashop>
```

---

### 🔧 `getProductImageUrl(productId, imageId)`
**Objectif** : Construire l'URL complète d'une image produit

```javascript
getProductImageUrl(5, 12)
// → '/api-presta/api/images/products/5/12?ws_key=77KUX2NEZ...'
```

---

## 3. Opérations CRUD de base

### 📖 `fetchPrestaData(resourcePath, limitStart, limitCount)`
**Objectif** : Récupérer (GET) des données et les convertir de XML en JSON

| Paramètre | Type | Description |
|-----------|------|-------------|
| `resourcePath` | string | Chemin de la ressource (`products`, `categories`, `products?filter[id]=[5]`) |
| `limitStart` | number | Début de la pagination (défaut: 0) |
| `limitCount` | number | Nombre d'éléments à récupérer (défaut: 50) |

**Exemple** :
```javascript
const data = await fetchPrestaData('products', 0, 10);
// data.product → Array des produits parsés en JSON
```

**Gestion des erreurs** :
- Logs console des erreurs
- Lance une exception si le statut HTTP n'est pas ok

---

### ✏️ `updatePrestaData(resourcePath, id, xmlData)`
**Objectif** : Mettre à jour un élément (PUT)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `resourcePath` | string | `products`, `categories`, etc. |
| `id` | number/string | ID de l'élément |
| `xmlData` | string | Contenu XML complet de l'élément |

**Exemple** :
```javascript
const xmlData = `<?xml version="1.0"?>
<prestashop>
  <product>
    <price>39.99</price>
  </product>
</prestashop>`;

await updatePrestaData('products', 5, xmlData);
```

---

### 🗑️ `deletePrestaItem(resourcePath, id)`
**Objectif** : Supprimer un élément (DELETE)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `resourcePath` | string | `products`, `categories`, etc. |
| `id` | number/string | ID de l'élément à supprimer |

**Exemple** :
```javascript
await deletePrestaItem('products', 5);
// Supprime le produit d'ID 5
```

---

## 4. Opérations métier avancées

### 🛡️ `safeDeleteCategory(categoryIdToDelete, fallbackCategoryId = 2)`
**Objectif** : Supprimer une catégorie **en toute sécurité** (réassigner ses produits)

**Flux** :
1. Cherche tous les produits dans la catégorie
2. Réaffecte chaque produit à une catégorie par défaut (ex: 2 = "Accueil")
3. Supprime la catégorie vide

| Paramètre | Type | Description |
|-----------|------|-------------|
| `categoryIdToDelete` | number/string | ID de la catégorie à supprimer |
| `fallbackCategoryId` | number/string | ID de la catégorie de secours (défaut: 2) |

**Exemple** :
```javascript
await safeDeleteCategory(15, 2);
// Les produits de la catégorie 15 → catégorie 2
// La catégorie 15 est ensuite supprimée
```

---

### 📤 `exportToCSV(resourcePath, selectedColumns)`
**Objectif** : Exporter les données d'une ressource en CSV et déclencher le téléchargement

| Paramètre | Type | Description |
|-----------|------|-------------|
| `resourcePath` | string | `products`, `categories`, etc. |
| `selectedColumns` | array | Colonnes à exporter (ex: `['id', 'name', 'price']`) |

**Flux** :
1. Récupère jusqu'à 1000 éléments
2. Construit le CSV avec l'en-tête (colonnes)
3. Pour chaque élément, extrait les colonnes demandées
4. Crée un blob et déclenche le téléchargement

**Gestion spéciale des champs multilangues** :
```javascript
// Si une colonne contient : { language: [{ "#text": "Valeur" }, ...] }
// → Extrait "Valeur" (première langue)
```

**Fichier généré** : `export_products.csv`, `export_categories.csv`, etc.

---

### 🏗️ `createGenericPrestaItem(resourceName, resourcePath, dataObj)`
**Objectif** : Créer n'importe quelle ressource via l'API (POST générique)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `resourceName` | string | Singulier (`product`, `category`, `customer`) |
| `resourcePath` | string | Pluriel pour l'URL (`products`, `categories`, `customers`) |
| `dataObj` | object | Données de la ressource |

**Exemple** :
```javascript
await createGenericPrestaItem('product', 'products', {
  name: 'Mon produit',
  price: '29.99',
  active: '1'
});
```

**Champs avec balises `<language>` automatiques** :
- `name`
- `description`
- `link_rewrite`
- `meta_title`

---

### 🛍️ `createPrestaProduct(productData)`
**Objectif** : Créer un produit avec **nettoyage automatique des données**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `productData` | object | Données du produit (sans vérification stricte) |

**Nettoyage appliqué** :
```javascript
{
  name: productData.name || '',                           // Défaut: vide
  link_rewrite: (name).toLowerCase().replace(/\s+/g, '-'), // Auto-slug
  description: productData.description || '',             // Défaut: vide
  reference: productData.reference || '',                 // Défaut: vide
  price: productData.price || '0',                        // Défaut: 0
  active: productData.active !== undefined ? productData.active : '1', // Défaut: 1
  id_category_default: productData.id_category_default || '2' // Défaut: 2
}
```

**Exemple** :
```javascript
await createPrestaProduct({
  name: 'Chaussures Nike',
  price: '89.99'
  // Les autres champs ont des valeurs par défaut
});
```

---

### 📦 `createBatchProducts(productsArray)`
**Objectif** : Créer plusieurs produits sur plusieurs itérations (avec gestion d'erreur)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `productsArray` | array | Tableau des produits à créer |

**Retour** :
```javascript
{
  success: ["Produit A", "Produit B"],           // Noms des produits créés
  errors: [                                       // Produits en erreur
    { product: "Produit C", error: "...", index: 2 }
  ],
  total: 3                                        // Nombre total traité
}
```

**Flux** :
- Crée les produits UN PAR UN
- Continue même si une création échoue
- Retourne un rapport detallé

---

### 🗂️ `fetchApiResources()`
**Objectif** : Obtenir la liste de TOUTES les ressources disponibles (métadonnée)

**Exemple** :
```javascript
const resources = await fetchApiResources();
// → ['products', 'categories', 'customers', 'orders', ...]
```

---

### 📋 `fetchResourceSchema(resourcePath)`
**Objectif** : Récupérer les champs (colonnes) d'une ressource (métadonnée)

**Exemple** :
```javascript
const schema = await fetchResourceSchema('products');
// → ['id', 'name', 'price', 'reference', 'active', 'id_category_default', ...]
```

---

## 5. Flux complet visuel

```
┌─────────────────────────────────────────────────────────────┐
│              IMPORT (ImportExportManager)                   │
├─────────────────────────────────────────────────────────────┤
│  CSV reçu → Parsing Papa Parse → Boucle sur lignes →        │
│  createPrestaProduct() → buildGenericXml() → POST XML →     │
│  Retour créé ou erreur                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              EXPORT (ImportExportManager)                   │
├─────────────────────────────────────────────────────────────┤
│  Colonnes sélectionnées → fetchPrestaData() → Parsing XML   │
│  → Extraction colonnes → Construction CSV → Téléchargement  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              SUPPRESSION SÉCURISÉE (Dashboard)             │
├─────────────────────────────────────────────────────────────┤
│  safeDeleteCategory() →                                     │
│    1. Chercher produits de la catégorie                    │
│    2. Réaffecter chaque produit (updatePrestaData)          │
│    3. Supprimer la catégorie vide (deletePrestaItem)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Gestion des erreurs

| Situation | Comportement |
|-----------|-------------|
| Réponse HTTP non ok (fetchPrestaData) | Lance une exception avec statut |
| Erreur lors de la création (POST) | Lance exception avec détail de l'erreur API |
| Erreur lors de la mise à jour (PUT) | Lance exception avec contenu de la réponse |
| Erreur lors de la suppression (DELETE) | Lance exception |
| Characters spéciaux XML | Utilise `escapeXml()` pour les nettoyer |

**Logs console** : Tous les erreurs sont loggées pour faciliter le débogage

---

## 7. Conversion XML ↔ JSON

### XML reçu de l'API
```xml
<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <products>
    <product id="5">
      <name>
        <language id="1"><![CDATA[Mon Produit]]></language>
      </name>
      <price>29.99</price>
    </product>
  </products>
</prestashop>
```

### JSON après parsing
```javascript
{
  products: {
    product: [
      {
        "@_id": "5",
        name: { language: { "@_id": "1", "#text": "Mon Produit" } },
        price: "29.99"
      }
    ]
  }
}
```

**Points clés** :
- Attributs XML → préfixés par `@_` (ex: `@_id`)
- Texte interne → clé `#text`
- Éléments multilangues → tableau ou objet selon contexte

---

## 8. Champs spéciaux

### Champs multilangues (auto-wrappés)
Ces champs sont **automatiquement** enveloppés dans `<language id="1">` :
- `name`
- `description`
- `link_rewrite` (slug)
- `meta_title`

### Champs avec CDATA
PrestaShop utilise `<![CDATA[...]]>` pour les longs textes (description).
Le parseur gère automatiquement cette conversion.

---

## 9. Pagination API

**Limite maximale** : PrestaShop API retourne max 50 éléments par requête

**Pour récupérer plus** :
```javascript
// Première page
const page1 = await fetchPrestaData('products', 0, 50);

// Deuxième page
const page2 = await fetchPrestaData('products', 50, 50);

// Troisième page
const page3 = await fetchPrestaData('products', 100, 50);
```

---

## 10. Améliorations possibles

1. **Cache** : Mettre en cache les ressources fréquemment utilisées (fetchApiResources)
2. **Requêtes parallèles** : Pour createBatchProducts, faire des imports par batch de 10 au lieu de 1 par 1
3. **Retry automatique** : En cas d'erreur réseau, réessayer 3 fois
4. **Compression** : Compresser le XML avant l'envoi pour les gros volumes
5. **Webhooks** : Observer les changements en temps réel via webhooks plutôt que polling

---

## 11. Exemple complet d'utilisation

```javascript
import { 
  fetchPrestaData, 
  createPrestaProduct, 
  exportToCSV,
  safeDeleteCategory 
} from './services/prestashopApi';

// 1. Récupérer les produits
const data = await fetchPrestaData('products', 0, 50);
console.log(data.products.product);

// 2. Créer un produit
await createPrestaProduct({
  name: 'Nouveau Produit',
  price: '49.99',
  id_category_default: 2
});

// 3. Exporter en CSV
await exportToCSV('products', ['id', 'name', 'price']);

// 4. Supprimer une catégorie (et réaffecter ses produits)
await safeDeleteCategory(15, 2);
```

