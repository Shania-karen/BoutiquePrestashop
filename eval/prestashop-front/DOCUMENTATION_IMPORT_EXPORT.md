# Documentation - ImportExportManager

## Vue d'ensemble
Le composant `ImportExportManager` est un gestionnaire bidirectionnel de données pour l'intégration PrestaShop. Il permet à l'utilisateur :
- **D'exporter** des données (produits, catégories) depuis PrestaShop en format CSV
- **D'importer** des données en masse via un fichier CSV

Le composant s'affiche en deux panneaux côte à côte (export à gauche, import à droite).

---

## 1. Structure générale

Le composant utilise React hooks (`useState`) et s'appuie sur :
- **PapaParse** : Bibliothèque pour analyser/traiter les fichiers CSV
- **Services API** : Fonctions du fichier `prestashopAPI.js` pour communiquer avec PrestaShop

---

## 2. État du composant (State)

| Variable | Type | Description |
|----------|------|-------------|
| `resourceToExport` | string | Type de ressource à exporter (ex: 'products', 'categories') |
| `selectedColumns` | array | Liste des colonnes sélectionnées pour l'export |
| `importFile` | File \| null | Fichier CSV sélectionné pour l'import |
| `importStatus` | string | Message de statut de l'importation (progression/erreurs) |

---

## 3. Fonctionnalités

### 🔵 EXPORT (Panneau gauche)

#### Flux d'export :

1. **Sélection de la ressource**
   - Menu déroulant avec options : "Produits" ou "Catégories"
   - Stockée dans `resourceToExport`

2. **Sélection des colonnes**
   - Colonnes disponibles : `id`, `name`, `price`, `description`, `id_category_default`, `active`
   - Cases à cocher pour sélectionner les colonnes désirées
   - Fonction `toggleColumn()` ajoute/retire une colonne de la sélection

3. **Génération du CSV**
   - Au clic du bouton "Générer le fichier CSV", la fonction `handleExport()` :
     - Vérifie qu'au moins une colonne est sélectionnée
     - Appelle `exportToCSV(resourceType, columns)` via l'API
     - Télécharge le fichier CSV

#### Code de la fonction export :
```javascript
const handleExport = async () => {
  if (selectedColumns.length === 0) {
    alert("Veuillez sélectionner au moins une colonne.");
    return;
  }
  try {
    await exportToCSV(resourceToExport, selectedColumns);
  } catch (error) {
    alert(`Erreur d'export: ${error.message}`);
  }
};
```

---

### 🟢 IMPORT (Panneau droit)

#### Flux d'import :

1. **Sélection du fichier**
   - Input file accepte uniquement les fichiers `.csv`
   - Stocké dans `importFile`

2. **Lancement de l'importation**
   - Au clic du bouton "Lancer l'importation", la fonction `handleImport()` :
     - Vérifie qu'un fichier est sélectionné
     - Utilise **PapaParse** pour lire le CSV

3. **Traitement du CSV**
   - **Configuration PapaParse** :
     - `header: true` → Considère la première ligne comme en-têtes
     - `skipEmptyLines: true` → Ignore les lignes vides
   
4. **Validé et nettoyage des données**
   - Pour chaque ligne du CSV :
     ```javascript
     const cleanData = {
       name: row.name ? String(row.name).trim() : 'Sans nom',
       price: parseFloat(row.price) || 0,
       id_category_default: parseInt(row.id_category_default) || 2,
       active: row.active || '1'
     };
     ```
   - **Nettoyage appliqué** :
     - **name** : Conversion en string + suppression espaces (trim)
     - **price** : Conversion en nombre décimal (défaut : 0)
     - **id_category_default** : Conversion en entier (défaut : 2)
     - **active** : Statut du produit (défaut : '1')

5. **Création des produits**
   - Pour chaque ligne, appelle `createPrestaProduct(cleanData)` via l'API
   - Compte les succès et erreurs
   - Met à jour le statut : `"Terminé ! X succès, Y erreurs"`

#### Code de la fonction import :
```javascript
const handleImport = () => {
  if (!importFile) return;

  setImportStatus('Lecture du fichier en cours...');
  
  Papa.parse(importFile, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      setImportStatus(`Fichier lu. ${results.data.length} lignes trouvées...`);
      
      let successCount = 0;
      let errorCount = 0;

      for (const row of results.data) {
        try {
          const cleanData = { /* validation des données */ };
          await createPrestaProduct(cleanData);
          successCount++;
        } catch (err) {
          console.error("Erreur sur une ligne:", err);
          errorCount++;
        }
      }
      setImportStatus(`Terminé ! ${successCount} succès, ${errorCount} erreurs.`);
    },
    error: (error) => {
      setImportStatus(`Erreur de lecture CSV: ${error.message}`);
    }
  });
};
```

---

## 4. Interface utilisateur

### Panneau Export
- 📤 Titre en bleu
- Menu déroulant pour choisir la ressource
- Cases à cocher pour sélectionner colonnes
- Bouton bleu "Générer le fichier CSV"

### Panneau Import
- 📥 Titre en vert
- Input file (accepte `.csv`)
- Bouton vert "Lancer l'importation" (désactivé si aucun fichier)
- Zone de statut affichant la progression/résultats

### Layout responsive
- Grille 1 colonne sur mobile
- 2 colonnes sur écrans moyens/larges (Tailwind CSS)

---

## 5. Gestion d'erreurs

| Situation | Comportement |
|-----------|-------------|
| Pas de colonne sélectionnée | ⚠️ Alerte "Veuillez sélectionner au moins une colonne" |
| Pas de fichier pour import | 🔒 Bouton désactivé |
| Erreur lors de l'export | ⚠️ Alerte avec message d'erreur |
| Erreur lors de l'import | ❌ Compte comme une erreur, continue avec la ligne suivante |
| Erreur de parsing CSV | 📝 Message d'erreur affiché dans le statut |

---

## 6. Format attendu du CSV pour l'import

Le fichier CSV doit avoir une **ligne d'en-tête** avec les colonnes suivantes :

```
name,price,id_category_default,active
Produit A,29.99,2,1
Produit B,49.99,3,1
```

**Colonnes obligatoires** :
- `name` : Nom du produit
- `price` : Prix (convertible en décimal)
- `id_category_default` : ID de la catégorie
- `active` : Statut (1 = actif, 0 = inactif)

---

## 7. Dépendances externes

| Bibliothèque | Usage |
|--------------|-------|
| `react` | Hook `useState` pour gérer l'état |
| `papaparse` | Parsing CSV |
| `prestashopAPI.js` | Fonctions `exportToCSV()` et `createPrestaProduct()` |

---

## 8. Flux complet visuel

```
EXPORT :
[Sélectionner ressource] → [Sélectionner colonnes] → [Clic Export] 
→ API exportToCSV() → Téléchargement CSV

IMPORT :
[Sélectionner .csv] → [Clic Import] → PapaParse → [Boucle sur lignes]
→ Nettoyage données → API createPrestaProduct() → [Comptage succès/erreurs]
→ Affichage statut
```

---

## Notes importants

✅ L'import contient une **boucle de nettoyage des données** pour éviter les erreurs de type  
✅ Le statut est mis à jour progressivement pour informer l'utilisateur  
❌ Pas de limite de lignes importées en même temps (attention aux gros fichiers)  
❌ L'import est séquentiel (ligne par ligne) - amélioration possible : import par batch

---

## Améliorations possibles

1. **Ajouter une limite de fichier** et un indicateur de progression (barre)
2. **Permettre l'upload en batch** (grouper les créations par 10 lignes par ex.)
3. **Exporter le rapport d'erreur** (fichier avec lignes en erreur)
4. **Validation avant import** (afficher un aperçu avant de créer)
5. **Gestion des doublons** (vérifier si le produit existe déjà)
