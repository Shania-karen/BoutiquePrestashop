# Guide de Survie Examen : PrestaShop & React

Puisque les outils d'IA seront interdits lors de votre examen, ce guide recense les **5 fonctionnalités les plus probables** que votre professeur pourrait vous demander de développer. 

Pour chaque fonctionnalité, vous trouverez **les fichiers à modifier**, **la logique à suivre** et les **pièges à éviter**. Lisez-le bien et gardez-le ouvert pendant l'examen !

---

## 🛑 Scénario 1 : Ajouter la Pagination aux Produits

**Le problème actuel :** Dans `Frontoffice.jsx` et `ProductList.jsx`, on charge 50 ou 100 produits d'un coup en "dur". Le prof va vous demander de faire une vraie pagination (Page 1, Page 2...).

### Fichiers à modifier :
1. `src/components/Frontoffice.jsx` (ou `ProductList.jsx`)

### Étapes à suivre :
1. **Ajouter les états (states)** :
   ```javascript
   const [page, setPage] = useState(0); // 0 = page 1 dans l'API PrestaShop
   const limit = 12; // 12 produits par page
   ```
2. **Modifier l'appel API dans le `useEffect`** :
   ```javascript
   // Au lieu de fetchPrestaData('products', 0, 50)
   const data = await fetchPrestaData('products', page * limit, limit);
   ```
3. **Mettre à jour le tableau de dépendances** du `useEffect` pour recharger quand la page change :
   ```javascript
   }, [page]); // Ajouter 'page' ici
   ```
4. **Créer les boutons Précédent / Suivant dans le JSX** :
   ```jsx
   <div className="pagination">
     <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
       Précédent
     </button>
     <span>Page {page + 1}</span>
     <button onClick={() => setPage(p => p + 1)}>
       Suivant
     </button>
   </div>
   ```

---

## 🛑 Scénario 2 : Connecter le CRUD Produits (Backoffice) à l'API PrestaShop

**Le problème actuel :** Le CRUD actuel dans `ProductList.jsx` modifie un tableau local (les modifications disparaissent si on actualise). Le prof voudra que l'ajout/suppression impacte la VRAIE base de données PrestaShop.

### Fichiers à modifier :
1. `src/services/apiClient.js`
2. `src/components/ProductList.jsx`

### Étapes à suivre :
1. **PrestaShop n'accepte que du XML** pour les écritures ! Dans `apiClient.js`, si on vous demande de faire un PUT/POST, il faut construire la chaîne XML. *Attention : C'est complexe, le prof pourrait fournir une fonction pré-faite. Si ce n'est pas le cas, regardez comment les requêtes POST sont faites ailleurs dans votre code.*
2. **Suppression (Le plus simple à coder en exam)** :
   Dans `apiClient.js` :
   ```javascript
   export const deletePrestaData = async (resource, id) => {
     const response = await fetch(`${API_URL}/${resource}/${id}?ws_key=${API_KEY}`, {
       method: 'DELETE',
     });
     return response.ok;
   };
   ```
3. **Brancher la suppression dans `ProductList.jsx`** :
   ```javascript
   import { deletePrestaData } from '../services/apiClient';

   const handleDelete = async (id) => {
     if (window.confirm('Voulez-vous vraiment supprimer ?')) {
       // 1. Supprimer sur le serveur
       const success = await deletePrestaData('products', id);
       if (success) {
         // 2. Mettre à jour l'affichage localement
         setProducts(products.filter(p => p.id !== id));
       }
     }
   };
   ```

---

## 🛑 Scénario 3 : Ajouter un Onglet "Clients" dans le BackOffice

**Le problème actuel :** Le BackOffice gère les Produits et les Commandes, mais il manque souvent la gestion des utilisateurs/clients.

### Fichiers à modifier :
1. **Créer** `src/components/ClientList.jsx`
2. **Modifier** `src/components/Backoffice.jsx` (pour l'ajouter au menu)

### Étapes à suivre :
1. **Dans `Backoffice.jsx`** :
   Ajouter le bouton de menu `Clients` et gérer `activeTab === 'clients'`.
2. **Dans `ClientList.jsx` (Nouveau fichier)** :
   - S'inspirer de `OrderList.jsx` ou `ProductList.jsx`.
   - L'appel API sera : `await fetchPrestaData('customers')`.
   - Afficher un tableau (`<table>`) ou des cartes avec : `id`, `firstname`, `lastname`, `email`.
   - **Piège** : Les données renvoyées par PrestaShop s'appellent `customers.customer`. N'oubliez pas le `.customer` !

---

## 🛑 Scénario 4 : Convertir le Panier Local en vraie Commande (Checkout)

**Le problème actuel :** Les articles sont stockés dans `CartContext.jsx` (localStorage). Mais ils ne sont jamais envoyés à PrestaShop comme "Vraie Commande".

### Fichiers à modifier :
1. `src/components/Cart.jsx` ou `Checkout.jsx`

### Étapes à suivre :
1. Il faut un bouton "Valider la commande".
2. Au clic, si le prof demande de faire ça côté client, il faudra utiliser une fonction de création de commande `POST /api/orders` en XML. 
3. **Cependant**, dans 90% des cas d'examen sur PrestaShop, la création de commande via API est très verbeuse. **Il est possible que le prof vous demande juste de générer un PDF local de la facture** ou de **passer le panier à "Vidé" et d'afficher "Commande validée"**.
4. **Comment vider le panier** : Appeler la fonction `clearCart()` de votre `CartContext` et faire un `navigate('/success')`.

---

## 🛑 Scénario 5 : Gérer la Quantité (Stock) d'un Produit depuis la liste

**Le problème actuel :** Le Backoffice affiche la quantité, mais le prof pourrait vouloir un petit bouton "+" et "-" directement sur la carte pour gérer le stock sans ouvrir le formulaire.

### Fichiers à modifier :
1. `src/components/ProductList.jsx`

### Étapes à suivre :
1. Dans le rendu du composant `<div className="product-card">` :
   ```jsx
   <div className="stock-manager">
     <button onClick={() => updateLocalStock(product.id, -1)}>-</button>
     <span>{product.quantity}</span>
     <button onClick={() => updateLocalStock(product.id, 1)}>+</button>
   </div>
   ```
2. Créer la fonction locale :
   ```javascript
   const updateLocalStock = (id, change) => {
     setProducts(products.map(p => {
       if (p.id === id) {
         return { ...p, quantity: Math.max(0, p.quantity + change) };
       }
       return p;
     }));
   };
   ```
3. Si le prof exige que ça aille sur la BDD, il faudra utiliser l'endpoint PrestaShop `/api/stock_availables` (pas `/api/products`).

---

## 💡 Astuces Ultimes sans IA :
*   **Si ça plante (Page Blanche)** : Ouvrez la console F12. Dans 90% des cas, c'est `Cannot read properties of undefined (reading 'map')`. Cela signifie que la donnée API n'est pas un tableau. Solution : `const monTableau = data?.machin || []`.
*   **Les données API PrestaShop** : Quand vous lisez `extractValue(product.name)`, n'oubliez pas que PrestaShop renvoie parfois des textes dans plusieurs langues. `extractValue` gère ça. Ne faites jamais `product.name` directement !
*   **Garder le CSS existant** : Ne perdez pas de temps à inventer du CSS. Reprenez les classes existantes (`btn-add-cart`, `product-card`) pour que tout s'aligne vite et bien.
