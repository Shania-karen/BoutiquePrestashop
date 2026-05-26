# Guide d'Implémentation : Réductions Avancées (Fidélité & Volume)

Dans un projet PrestaShop "Headless" (avec un Front React), la gestion des réductions est l'une des parties les plus intéressantes. Il existe deux grandes familles de réductions dans PrestaShop :
1. **Les Prix Spécifiques (`specific_prices`)** : Idéal pour les réductions par quantité (ex: > 10 articles).
2. **Les Règles de Panier (`cart_rules`)** : Idéal pour les codes promo ou les remises de fidélité globales sur un panier.

Voici comment implémenter tes deux scénarios avec du code concret.

---

## Scénario 1 : La Réduction de Fidélité (Client VIP)

**L'idée :** Si un client a passé plus de 3 commandes, il obtient -10% sur tout son panier.
**La logique :** On va interroger l'API pour compter ses commandes. Si le test est validé, on appliquera une réduction au moment du calcul de son panier.

### 1. Le Service à créer (`customerService.js` ou `statService.js`)
On a besoin d'une fonction pour vérifier si le client est fidèle.

```javascript
import { fetchPrestaData, extractValue } from './apiClient';

/**
 * Vérifie si un client a droit à la réduction de fidélité.
 * Règle : Avoir au moins 3 commandes avec le statut "Livré" (5).
 */
export async function checkCustomerLoyaltyStatus(customerId) {
  try {
    // 1. On cherche toutes les commandes de ce client
    const res = await fetchPrestaData(`orders?filter[id_customer]=[${customerId}]&display=[id,current_state]`);
    const ordersRaw = res?.orders?.order;
    
    if (!ordersRaw) return { isLoyal: false, discountPercent: 0 };
    
    const orders = Array.isArray(ordersRaw) ? ordersRaw : [ordersRaw];
    
    // 2. On compte combien sont valides (statut 5 = Livré, ou 2 = Payé)
    const validOrders = orders.filter(o => {
      const state = extractValue(o.current_state);
      return state === '5' || state === '2';
    });
    
    // 3. La règle métier : si >= 3 commandes, il est fidèle !
    if (validOrders.length >= 3) {
      return { isLoyal: true, discountPercent: 10 }; // 10% de réduction
    }
    
    return { isLoyal: false, discountPercent: 0 };
  } catch (error) {
    console.error("Erreur vérification fidélité:", error);
    return { isLoyal: false, discountPercent: 0 };
  }
}
```

### 2. Comment l'utiliser dans ton Composant Panier (`ShoppingCart.jsx`)
Quand tu calcules le total du panier, tu appelles ce service pour appliquer la remise :

```javascript
// Dans ton useEffect du Panier :
const loyaltyData = await checkCustomerLoyaltyStatus(user.id);

// Lors du calcul final des prix :
let subtotalHT = calculDuTotalHTDesProduits();
let discountAmount = 0;

if (loyaltyData.isLoyal) {
   // On applique les -10% sur le sous-total
   discountAmount = subtotalHT * (loyaltyData.discountPercent / 100);
}

const totalAPayer = subtotalHT - discountAmount;
```

*(Note : Pour être 100% raccord avec PrestaShop, il faudrait créer une règle de panier `cart_rule` via l'API, mais la calculer côté Front est souvent beaucoup plus simple pour une app React).*

---

## Scénario 2 : Le Tarif Dégressif (Acheter > 10 articles)

**L'idée :** Si le client met plus de 10 T-Shirts dans son panier, le prix unitaire du T-Shirt baisse.
**La logique :** C'est une fonctionnalité native de PrestaShop appelée "Prix Spécifiques". L'API possède un endpoint `/api/specific_prices`.

### 1. Le Service à utiliser (`productservice.js`)
On va créer une fonction qui cherche s'il existe une règle de quantité pour un produit donné.

```javascript
import { fetchPrestaData, extractValue } from './apiClient';

/**
 * Cherche s'il existe une réduction de volume pour un produit.
 * Retourne le nouveau prix unitaire ou la réduction à appliquer.
 */
export async function getVolumeDiscount(productId) {
  try {
    // On cherche les prix spécifiques pour ce produit
    const res = await fetchPrestaData(`specific_prices?filter[id_product]=[${productId}]&display=full`);
    const pricesRaw = res?.specific_prices?.specific_price;
    
    if (!pricesRaw) return null;
    const rules = Array.isArray(pricesRaw) ? pricesRaw : [pricesRaw];
    
    // On cherche s'il y a une règle où 'from_quantity' est supérieur à 1 (ex: 10)
    const volumeRule = rules.find(rule => parseInt(extractValue(rule.from_quantity)) > 1);
    
    if (volumeRule) {
      return {
        minQuantity: parseInt(extractValue(volumeRule.from_quantity)), // Ex: 10
        reductionType: extractValue(volumeRule.reduction_type), // 'amount' ou 'percentage'
        reductionValue: parseFloat(extractValue(volumeRule.reduction)) // Ex: 0.15 (pour 15%) ou 5.00 (pour 5€)
      };
    }
    
    return null;
  } catch (error) {
    console.error("Erreur lors de la recherche du prix de gros:", error);
    return null;
  }
}
```

### 2. Comment l'utiliser dans ton code
Lorsque le client modifie la quantité d'un produit dans son panier, tu vérifies cette règle pour recalculer le prix de la ligne.

```javascript
// Exemple d'utilisation dans la fonction qui calcule le prix d'une ligne du panier :

async function calculateLinePrice(productItem) {
  const basePrice = productItem.priceHT;
  let finalUnitPrice = basePrice;
  
  // 1. On interroge notre service
  const volumeDiscount = await getVolumeDiscount(productItem.id);
  
  // 2. On vérifie si le client a mis assez d'articles dans son panier
  if (volumeDiscount && productItem.quantity >= volumeDiscount.minQuantity) {
    
    // 3. On applique la réduction selon son type
    if (volumeDiscount.reductionType === 'percentage') {
      // Ex: 20€ - (20€ * 15%)
      finalUnitPrice = basePrice - (basePrice * volumeDiscount.reductionValue);
    } 
    else if (volumeDiscount.reductionType === 'amount') {
      // Ex: 20€ - 5€
      finalUnitPrice = basePrice - volumeDiscount.reductionValue;
    }
  }
  
  // Le prix total de la ligne
  return finalUnitPrice * productItem.quantity;
}
```

### 💡 Le petit conseil du Chef de Projet :
Dans un vrai projet de production e-commerce, on ne fait pas ces calculs uniquement côté Front-End (car un hacker pourrait modifier le code JavaScript pour payer moins cher). 
La bonne pratique finale consiste à **envoyer le panier brut à l'API**, et c'est l'API qui te renvoie le prix total validé. Mais pour un projet d'école ou un MVP (Minimum Viable Product), gérer ces calculs en React comme montré ci-dessus est la meilleure méthode pour comprendre toute la logique de tarification !
