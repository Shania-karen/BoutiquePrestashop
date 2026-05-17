# Guide de Correction des Erreurs d'Import — Côté Code

Ce document décrit comment **modifier le code** de `ImportExportManager.jsx` pour corriger automatiquement les erreurs au lieu d'arrêter l'import. Les corrections se font dans le fichier source, pas dans le CSV.

---

## Comportement Actuel

> [!CAUTION]
> En cas d'erreur de validation, **l'import est immédiatement arrêté** et les fichiers sont réinitialisés. La validation se trouve dans la fonction `validateCSVFiles()` du fichier `ImportExportManager.jsx`.

---

## Architecture du Code de Validation

Le code de validation se trouve dans `src/components/ImportExportManager.jsx` et se compose de :

| Élément | Lignes | Rôle |
|---|---|---|
| `EXPECTED_COLS_CAT` | ~20-28 | Colonnes attendues pour le fichier produits |
| `EXPECTED_COLS_DEC` | ~31-37 | Colonnes attendues pour le fichier déclinaisons |
| `EXPECTED_COLS_ORD` | ~40-48 | Colonnes attendues pour le fichier commandes |
| `normalizeColName()` | ~61 | Normalise un nom de colonne (minuscules, conserve les accents) |
| `isValidDateDMY()` | ~66-80 | Valide le format DD/MM/YYYY |
| `isPositiveAmount()` | ~85-91 | Vérifie qu'un montant est > 0 |
| `validateCSVFiles()` | ~97-179 | Orchestre toutes les validations |
| Phase de validation dans `runImport()` | ~269-285 | Appelle `validateCSVFiles()` et arrête si erreur |

---

## 1. Colonne non conforme → Ne pas arrêter, ignorer la colonne

### Problème
Si un CSV contient une colonne `"prix_ventes"` au lieu de `"prix_vente_ttc"`, l'import s'arrête.

### Correction dans le code

**Stratégie** : Au lieu de rejeter la colonne inconnue, la loguer comme avertissement et continuer.

Modifier `checkColumns` dans `validateCSVFiles()` :

```diff
  const checkColumns = (data, expectedCols, label, allowSpecifiPrefix = false) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    for (const header of headers) {
      const normalized = normalizeColName(header);
      if (allowSpecifiPrefix && normalized.startsWith('specifi')) continue;
      if (!expectedCols.includes(normalized)) {
-       errors.push({
-         type: 'COLONNE_INCONNUE',
-         file: label,
-         message: `Colonne inconnue "${header}" détectée...`
-       });
+       // MODE TOLÉRANT : loguer un avertissement au lieu de bloquer
+       warnings.push({
+         type: 'COLONNE_IGNOREE',
+         file: label,
+         message: `⚠️ Colonne "${header}" ignorée (non reconnue)`
+       });
      }
    }
  };
```

> [!IMPORTANT]
> **Rappel sur les accents** : La normalisation met en minuscules mais **ne touche pas aux accents**. `làlana` ≠ `lalàna`. Si vous voulez accepter les deux, il faut ajouter les deux variantes dans le tableau `EXPECTED_COLS_*` correspondant :
> ```javascript
> const EXPECTED_COLS_ORD = [
>   'date', 'nom', 'email', 'pwd',
>   'adresse', 'àdresse',  // ← ajouter les variantes accentuées
>   'achat', 'etat'
> ];
> ```

### Alternative : Ajouter un alias automatique

Si un CSV utilise un nom de colonne non standard mais prévisible, ajouter l'alias dans les constantes :

```javascript
// Avant :
const EXPECTED_COLS_CAT = [
  'date_availability_produit', 'date_produit', 'date',
  // ...
];

// Après : ajouter la variante "produits" (avec un s)
const EXPECTED_COLS_CAT = [
  'date_availability_produit', 'date_availability_produits', 'date_produit', 'date',
  // ...
];
```

---

## 2. Format de date incorrect → Corriger automatiquement

### Problème
Une date `06/26/2026` (MM/DD/YYYY) ou `2025-12-01` (ISO) arrête l'import.

### Correction dans le code

**Stratégie** : Remplacer `isValidDateDMY` par une fonction `autoFixDate` qui détecte et corrige les formats courants.

Ajouter cette fonction dans `ImportExportManager.jsx` (après `isValidDateDMY`) :

```javascript
/**
 * Tente de corriger automatiquement un format de date invalide.
 * Retourne la date corrigée en DD/MM/YYYY ou null si impossible.
 */
const autoFixDate = (dateStr) => {
  if (!dateStr || !dateStr.trim()) return dateStr;
  const val = dateStr.trim();

  // Déjà au bon format DD/MM/YYYY ?
  if (isValidDateDMY(val)) return val;

  // Format ISO : YYYY-MM-DD → DD/MM/YYYY
  const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const fixed = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    if (isValidDateDMY(fixed)) return fixed;
  }

  // Format avec tirets : DD-MM-YYYY → DD/MM/YYYY
  const dashMatch = val.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dashMatch) {
    const fixed = `${dashMatch[1]}/${dashMatch[2]}/${dashMatch[3]}`;
    if (isValidDateDMY(fixed)) return fixed;
  }

  // Format MM/DD/YYYY (mois > 12 détecté car jour impossible)
  const slashMatch = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const part1 = parseInt(slashMatch[1], 10);
    const part2 = parseInt(slashMatch[2], 10);
    // Si le "jour" (part1) > 12, c'est probablement un mois → inverser
    if (part1 > 12 && part2 <= 12) {
      const fixed = `${slashMatch[2]}/${slashMatch[1]}/${slashMatch[3]}`;
      if (isValidDateDMY(fixed)) return fixed;
    }
  }

  // Format sans zéros : D/M/YYYY → DD/MM/YYYY
  const shortMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (shortMatch) {
    const fixed = `${shortMatch[1].padStart(2, '0')}/${shortMatch[2].padStart(2, '0')}/${shortMatch[3]}`;
    if (isValidDateDMY(fixed)) return fixed;
  }

  return null; // Impossible à corriger
};
```

Puis modifier `checkDates` pour corriger au lieu de bloquer :

```diff
  const checkDates = (data, label) => {
    if (!data || data.length === 0) return;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      for (const key of Object.keys(row)) {
        const normalized = normalizeColName(key);
        if (DATE_COLUMNS.includes(normalized)) {
          const val = String(row[key] || '').trim();
          if (val && !isValidDateDMY(val)) {
-           errors.push({
-             type: 'FORMAT_DATE',
-             file: label,
-             message: `Format de date invalide à la ligne ${i + 2} : ...`
-           });
+           const fixed = autoFixDate(val);
+           if (fixed) {
+             row[key] = fixed; // Corriger directement dans les données
+             warnings.push({
+               type: 'DATE_CORRIGEE',
+               file: label,
+               message: `📅 Ligne ${i+2} : "${val}" → "${fixed}" (corrigé automatiquement)`
+             });
+           } else {
+             errors.push({
+               type: 'FORMAT_DATE',
+               file: label,
+               message: `Date impossible à corriger ligne ${i+2} : "${val}"`
+             });
+           }
          }
        }
      }
    }
  };
```

---

## 3. Montant négatif → Prendre la valeur absolue

### Problème
Un prix `"-12,50"` arrête l'import.

### Correction dans le code

**Stratégie** : Convertir automatiquement les montants négatifs en positifs avec `Math.abs()`.

Modifier `checkAmounts` :

```diff
  const checkAmounts = (data, amountCols, label) => {
    if (!data || data.length === 0) return;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      for (const key of Object.keys(row)) {
        const normalized = normalizeColName(key);
        if (amountCols.includes(normalized)) {
          const val = row[key];
          if (!isPositiveAmount(val)) {
-           errors.push({
-             type: 'MONTANT_NEGATIF',
-             file: label,
-             message: `Montant négatif ou nul à la ligne ${i + 2} : ...`
-           });
+           // Corriger : prendre la valeur absolue
+           const cleaned = String(val).replace(',', '.').replace(/[^0-9.\-]/g, '');
+           const absVal = Math.abs(parseFloat(cleaned));
+           if (absVal > 0) {
+             row[key] = String(absVal).replace('.', ',');
+             warnings.push({
+               type: 'MONTANT_CORRIGE',
+               file: label,
+               message: `💰 Ligne ${i+2} : "${val}" → "${absVal}" (valeur absolue)`
+             });
+           } else {
+             errors.push({
+               type: 'MONTANT_NUL',
+               file: label,
+               message: `Montant nul non corrigeable ligne ${i+2} : "${val}"`
+             });
+           }
          }
        }
      }
    }
  };
```

---

## 4. Modifier `validateCSVFiles` pour supporter le mode tolérant

Pour que la fonction retourne des **warnings** en plus des erreurs, modifier sa structure :

```diff
-const validateCSVFiles = (catData, decData, ordData) => {
+const validateCSVFiles = (catData, decData, ordData, autoFix = false) => {
   const errors = [];
+  const warnings = [];

   // ... (checkColumns, checkDates, checkAmounts utilisent warnings au lieu de errors
   //      quand autoFix est true)

   return errors.length === 0
-    ? { valid: true }
-    : { valid: false, errors };
+    ? { valid: true, warnings }
+    : { valid: false, errors, warnings };
 };
```

Puis dans `runImport()`, afficher les warnings sans bloquer :

```diff
- const validation = validateCSVFiles(files.cat, files.dec, files.ord);
+ const validation = validateCSVFiles(files.cat, files.dec, files.ord, true);
+
+ // Afficher les corrections automatiques (warnings)
+ if (validation.warnings?.length > 0) {
+   for (const w of validation.warnings) {
+     addLog(`⚠️ [${w.file}] ${w.message}`, "warning");
+   }
+ }

  if (!validation.valid) {
    // Seules les erreurs IMPOSSIBLES à corriger arrêtent l'import
    addLog(`❌ VALIDATION ÉCHOUÉE : ${validation.errors.length} erreur(s) non corrigeable(s)`, "error");
    // ...
  }
```

---

## 5. Résumé des Modifications par Fichier

Toutes les modifications se font dans **un seul fichier** :

**`src/components/ImportExportManager.jsx`**

| Correction | Fonction à modifier | Changement |
|---|---|---|
| Colonne inconnue → ignorer | `checkColumns` dans `validateCSVFiles` | `errors.push` → `warnings.push` |
| Date invalide → auto-corriger | `checkDates` dans `validateCSVFiles` | Ajouter `autoFixDate()`, corriger `row[key]` |
| Montant négatif → valeur absolue | `checkAmounts` dans `validateCSVFiles` | `Math.abs()` + corriger `row[key]` |
| Supporter warnings | `validateCSVFiles` | Ajouter paramètre `autoFix` + tableau `warnings` |
| Afficher warnings | `runImport` | Loguer les warnings avant de continuer |

> [!NOTE]
> Avec ces modifications, seules les erreurs **impossibles à corriger** (ex: date complètement illisible comme `"abc"`, montant à `0`) arrêtent l'import. Tout le reste est corrigé à la volée avec un log d'avertissement.
