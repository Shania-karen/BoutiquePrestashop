import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { fetchPrestaData, extractValue } from '../services/apiClient';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const storageKey = user ? `prestashop_front_cart_${user.id}` : 'prestashop_front_cart_guest';

  const [cart, setCart] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Erreur de chargement du panier:', error);
      return [];
    }
  });

  // Recharger le panier quand l'utilisateur change et synchroniser avec l'API
  useEffect(() => {
    let localData = [];
    try {
      const stored = localStorage.getItem(storageKey);
      localData = stored ? JSON.parse(stored) : [];
      setCart(localData);
    } catch (error) {
      setCart([]);
    }

    // Si utilisateur connecté, on récupère ses paniers API non commandés
    const syncApiCarts = async () => {
      if (!user) return;
      try {
        const ordersData = await fetchPrestaData('orders?display=full', 0, 200);
        const oArray = ordersData?.orders?.order || [];
        const userOrders = (Array.isArray(oArray) ? oArray : [oArray]).filter(o => extractValue(o.id_customer) === String(user.id));
        const orderedCartIds = userOrders.map(o => extractValue(o.id_cart));

        const cartsData = await fetchPrestaData('carts?display=full', 0, 200);
        const cArray = cartsData?.carts?.cart || [];
        const userCarts = (Array.isArray(cArray) ? cArray : [cArray]).filter(c => extractValue(c.id_customer) === String(user.id));
        const unOrderedCarts = userCarts.filter(c => !orderedCartIds.includes(extractValue(c.id)));

        if (unOrderedCarts.length === 0) return;

        // On a des paniers API, on a besoin des infos produits pour les ajouter
        const productsData = await fetchPrestaData('products?display=full');
        const pArray = productsData?.products?.product || [];
        const productsList = Array.isArray(pArray) ? pArray : [pArray];
        const productsMap = {};
        productsList.forEach(p => {
          const id = extractValue(p.id);
          let name = 'Produit';
          if (p.name?.language) {
            const l = Array.isArray(p.name.language) ? p.name.language.find(x => extractValue(x.id) === '1') || p.name.language[0] : p.name.language;
            name = extractValue(l);
          }
          const priceHT = parseFloat(extractValue(p.price)) || 0;
          productsMap[id] = { name, price: priceHT * 1.2 }; // approximation TTC
        });

        setCart(prev => {
          let updated = [...prev];
          unOrderedCarts.forEach(cart => {
            const cartRows = cart.associations?.cart_rows?.cart_row;
            const prods = Array.isArray(cartRows) ? cartRows : (cartRows ? [cartRows] : []);
            
            prods.forEach(p => {
              const idProd = extractValue(p.id_product);
              const qty = parseInt(extractValue(p.quantity) || 1);
              const combId = extractValue(p.id_product_attribute) || '0';
              const key = `${idProd}_${combId}`;
              
              if (!updated.find(item => item.key === key)) {
                const pInfo = productsMap[idProd] || { name: `Produit #${idProd}`, price: 0 };
                updated.push({
                  key,
                  id: idProd,
                  combinationId: combId,
                  name: pInfo.name,
                  variantLabel: '',
                  price: pInfo.price,
                  image: '',
                  stock: 99,
                  quantity: qty
                });
              }
            });
          });
          return updated;
        });
      } catch (err) {
        console.warn('Sync API Cart failed:', err);
      }
    };

    syncApiCarts();
  }, [storageKey, user]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch (error) {
      console.error('Erreur de sauvegarde du panier:', error);
    }
  }, [cart, storageKey]);

  // ─── Ajouter / incrémenter ────────────────────────────────────────────────
  const addToCart = useCallback(({
    id,
    combinationId = '0',
    name,
    variantLabel = '',
    price,
    image = '',
    stock = 99,
    quantity = 1,
  }) => {
    const key = `${id}_${combinationId}`;
    setCart(prev => {
      const existing = prev.find(item => item.key === key);
      if (existing) {
        const newQty = Math.min(existing.quantity + quantity, stock);
        return prev.map(item =>
          item.key === key ? { ...item, quantity: newQty } : item
        );
      }
      return [...prev, {
        key,
        id,
        combinationId,
        name,
        variantLabel,
        price: parseFloat(price) || 0,
        image,
        stock,
        quantity: Math.min(quantity, stock),
      }];
    });
  }, []);

  // ─── Retirer ──────────────────────────────────────────────────────────────
  const removeFromCart = useCallback((key) => {
    setCart(prev => prev.filter(item => item.key !== key));
  }, []);

  // ─── Mettre à jour la quantité ────────────────────────────────────────────
  const updateQuantity = useCallback((key, quantity) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.key !== key));
      return;
    }
    setCart(prev =>
      prev.map(item => {
        if (item.key !== key) return item;
        return { ...item, quantity: Math.min(quantity, item.stock) };
      })
    );
  }, []);

  // ─── Vider ────────────────────────────────────────────────────────────────
  const clearCart = useCallback(() => {
    setCart([]);
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Erreur de suppression du panier:', error);
    }
  }, [storageKey]);

  // ─── Calculé ──────────────────────────────────────────────────────────────
  const getTotalPrice = () =>
    cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      cart,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      getTotalPrice,
      totalItems,
    }}>
      {children}
    </CartContext.Provider>
  );
}

// Utilisation : const { cart, addToCart, ... } = useCart();
export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
};