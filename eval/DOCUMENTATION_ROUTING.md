# Documentation : `currentView` et `renderView`

## Vue d'ensemble

`currentView` et `renderView` forment un système de **navigation interne** (routing) sans rechargement de page. C'est ce qu'on appelle un **SPA (Single Page Application)**.

---

## 1. **`currentView` : L'État de Navigation**

### Qu'est-ce que c'est ?

```jsx
const [currentView, setCurrentView] = useState('products');
```

- **Variable d'état React** qui stocke **quelle section afficher**
- Valeurs possibles : `'products'`, `'reset'`, `'import'`
- Par défaut : `'products'` (affichée au chargement de l'app)

### Analogy 📺

Pensez à un **écran de télévision** :
- `currentView` = **le canal sélectionné** (TF1, France 2, etc.)
- `setCurrentView` = **appuyer sur la télécommande** pour changer de canal

### États possibles

| État | Affichage |
|------|-----------|
| `'products'` | Liste des produits |
| `'reset'` | Dashboard de réinitialisation |
| `'import'` | Outil d'importation CSV |

---

## 2. **`renderView` : La Fonction d'Affichage**

### Qu'est-ce que c'est ?

```jsx
const renderView = () => {
  switch (currentView) {
    case 'products':
      return <ProductList />;
    case 'reset':
      return <ResetDashboard />;
    case 'import':
      return (
        <div style={{ padding: '20px' }}>
          <h2>Outil d'Importation CSV</h2>
          <p>Module en cours de développement...</p>
        </div>
      );
    default:
      return <ProductList />;
  }
};
```

- **Fonction qui décide quel composant afficher**
- Utilise `currentView` pour prendre sa décision (comme un `if/else`)
- Retourne le composant JSX correspondant

### Comment ça fonctionne ?

```
currentView = 'reset' 
        ↓
  renderView() évalue
        ↓
  case 'reset' → retourne <ResetDashboard />
        ↓
  Affiche le composant ResetDashboard
```

---

## 3. **Flux Complet : De Clique à Affichage**

### Étape par étape

```
┌─────────────────────────────────────────┐
│  Utilisateur clique sur "Réinitialisation"│
└────────────┬──────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ onClick={() => setCurrentView('reset')} │
│ Change l'état currentView → 'reset'     │
└────────────┬──────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ React détecte le changement d'état       │
│ Re-rend le composant App()               │
└────────────┬──────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ renderView() est appelée                 │
│ currentView === 'reset' ?                │
│ ✓ OUI → retourne <ResetDashboard />     │
└────────────┬──────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ Le composant ResetDashboard s'affiche    │
│ dans la zone <main className="main">     │
└──────────────────────────────────────────┘
```

---

## 4. **Code en Contexte**

### Sidebar (Navigation)

```jsx
<button 
  className={currentView === 'products' ? 'active' : ''} 
  onClick={() => setCurrentView('products')}
>
   Liste des Produits
</button>
```

**Explication :**
- `onClick={() => setCurrentView('products')}` → Quand cliqué, change `currentView` à `'products'`
- `className={currentView === 'products' ? 'active' : ''}` → Le bouton reçoit la classe `active` s'il est sélectionné (pour le styling)

### Zone d'Affichage (Main)

```jsx
<main className="main">
  {renderView()}
</main>
```

**Explication :**
- `{renderView()}` → Appelle la fonction qui retourne le composant approprié
- Le contenu change dynamiquement selon `currentView`

---

## 5. **Comparaison : Avant vs Après**

### ❌ Sans `currentView` et `renderView`

```jsx
// Vous devriez afficher tout en même temps (mauvais !)
<ProductList />
<ResetDashboard />
<ImportCSV />
```

**Problèmes :** Tout charge, ralentit, pas d'interface propre

### ✅ Avec `currentView` et `renderView`

```jsx
// Affiche UNIQUEMENT ce qui est sélectionné
{renderView()}  // Retourne 1 seul composant
```

**Avantages :** Performance, UX propre, navigation rapide

---

## 6. **Exemple : Ajouter une Nouvelle Section**

Si vous voulez ajouter une section "Paramètres" :

### 1️⃣ Ajouter une nouvelle case dans `renderView`

```jsx
const renderView = () => {
  switch (currentView) {
    case 'products':
      return <ProductList />;
    case 'reset':
      return <ResetDashboard />;
    case 'import':
      return <ImportCSV />;
    case 'settings':  // ← NOUVEAU
      return <Settings />;
    default:
      return <ProductList />;
  }
};
```

### 2️⃣ Ajouter un bouton dans la Sidebar

```jsx
<button 
  className={currentView === 'settings' ? 'active' : ''} 
  onClick={() => setCurrentView('settings')}
>
   ⚙️ Paramètres
</button>
```

### 3️⃣ Créer le composant `Settings`

```jsx
// components/Settings.jsx
export default function Settings() {
  return <div>Paramètres de l'application</div>;
}
```

**C'est tout !** La navigation fonctionne instantanément. ⚡

---

## 7. **Points Clés à Retenir**

| Concept | Rôle |
|---------|------|
| **currentView** | Stocke **quelle section afficher** |
| **setCurrentView** | **Change** la section à afficher |
| **renderView** | **Décide quel composant afficher** selon `currentView` |
| **onClick={() => setCurrentView(...)}** | Déclenche le changement de section |

---

## 8. **Diagramme de Logique**

```
                    App.jsx
                      │
        ┌─────────────┴─────────────┐
        │                           │
    Sidebar               Main (Zone d'affichage)
    (Navigation)                    │
        │                           │
    Boutons                    {renderView()}
        │                           │
   setCurrentView()         Retourne un composant
        │                    selon currentView
    currentView change             │
        │                    Affichage mis à jour
        ↓___________________________↓
          Re-rendu du composant App
```

---

## Résumé - TL;DR

- **`currentView`** = Mémoire de "où vous êtes" dans l'app
- **`setCurrentView`** = Boutons pour naviguer
- **`renderView`** = Affiche le bon composant selon où vous êtes
- **Aucune URL, aucun rechargement** → SPA ultra-rapide ⚡

C'est un pattern très courant en React para les petites applications sans routeur (React Router).
