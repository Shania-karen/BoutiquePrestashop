import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { fetchPrestaData, extractValue } from '../services/apiClient';
import '../assets/css/OrderList.css';

export default function OrderList() {
  const { user, isAuthenticated } = useAuth();
  const { cart: localCart, getTotalPrice } = useCart();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // État pour gérer l'accordéon
  const [expandedOrder, setExpandedOrder] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setError("Vous devez être connecté pour voir vos commandes.");
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);

        // A. Récupérer les produits pour avoir les noms/prix des paniers
        const productsData = await fetchPrestaData('products?display=full');
        const pList = productsData?.products?.product || [];
        const productsArray = Array.isArray(pList) ? pList : [pList];
        const productsMap = {};
        productsArray.forEach(p => {
          const id = extractValue(p.id);
          let name = 'Produit inconnu';
          if (p.name?.language) {
            const l = Array.isArray(p.name.language) ? p.name.language.find(x => extractValue(x.id) === '1') || p.name.language[0] : p.name.language;
            name = extractValue(l);
          }
          const priceHT = parseFloat(extractValue(p.price)) || 0;
          productsMap[id] = { name, priceHT };
        });

        // B. Récupérer les commandes
        const ordersData = await fetchPrestaData('orders?display=full', 0, 200);
        const oArray = ordersData?.orders?.order || [];
        const allOrdersList = Array.isArray(oArray) ? oArray : [oArray];
        const userOrders = allOrdersList.filter(o => extractValue(o.id_customer) === String(user.id));
        
        const orderedCartIds = userOrders.map(o => extractValue(o.id_cart));

        // Nous n'avons plus besoin de récupérer les paniers API ici car CartContext s'en charge.

        let combinedItems = [];

        // Traitement des commandes
        userOrders.forEach(order => {
            const orderRows = order.associations?.order_rows?.order_row;
            const prods = Array.isArray(orderRows) ? orderRows : (orderRows ? [orderRows] : []);
            
            const products = prods.map(p => ({
                qty: extractValue(p.product_quantity),
                name: extractValue(p.product_name),
                price: parseFloat(extractValue(p.unit_price_tax_incl) || extractValue(p.product_price) || 0).toFixed(2)
            }));

            const stateId = extractValue(order.current_state);
            let stateInfo = { text: 'en cours', color: '#FFA500' };
            if (String(stateId) === '2') stateInfo = { text: 'paiement effectué', color: '#28a745' };
            else if (String(stateId) === '6') stateInfo = { text: 'annulé', color: '#dc3545' };

            combinedItems.push({
                type: 'order',
                id: `order_${extractValue(order.id)}`,
                ref: extractValue(order.reference),
                date: new Date(extractValue(order.date_add)),
                total: parseFloat(extractValue(order.total_paid_tax_incl) || 0).toFixed(2),
                stateInfo,
                products
            });
        });

        // Les paniers API non commandés sont désormais synchronisés dans CartContext 
        // et affichés via "Mon Panier Actuel" (localCart). Il n'est donc plus
        // nécessaire de les afficher en double ici.

        // Les paniers locaux ne sont plus affichés ici selon la nouvelle règle de gestion.

        combinedItems.sort((a, b) => b.date - a.date);
        setOrders(combinedItems);

      } catch (err) {
        console.error(err);
        setError("Erreur lors de la récupération de vos données.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, isAuthenticated]);

  const toggleAccordion = (id) => {
    setExpandedOrder(expandedOrder === id ? null : id);
  };

  const formatDate = (dateObj) => {
    if (!(dateObj instanceof Date) || isNaN(dateObj)) return 'Date inconnue';
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return dateObj.toLocaleDateString('fr-FR', options);
  };

  if (loading) return <div className="order-list-container"><div className="loading">Chargement de vos commandes...</div></div>;
  if (error) return <div className="order-list-container"><div className="error-alert">{error}</div></div>;

  return (
    <div className="order-list-container">
      <h2 className="order-list-title">Mes Commandes & Paniers</h2>
      
      {orders.length === 0 ? (
        <div className="empty-orders">Vous n'avez passé aucune commande et n'avez aucun panier en cours pour le moment.</div>
      ) : (
        <div className="orders-wrapper">
          {orders.map(item => {
            const isExpanded = expandedOrder === item.id;

            return (
              <div key={item.id} className={`order-card ${isExpanded ? 'expanded' : ''}`}>
                {/* En-tête (Toujours visible) */}
                <div className="order-header" onClick={() => toggleAccordion(item.id)}>
                  <div className="order-info-main">
                    <span className="order-ref">Référence : <strong>{item.ref}</strong></span>
                    <span className="order-date">{formatDate(item.date)}</span>
                  </div>
                  
                  <div className="order-info-side">
                    <span className="order-total">{item.total} €</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <span 
                        className="order-status-badge" 
                        style={{ backgroundColor: item.stateInfo.color, color: '#fff' }}
                      >
                        {item.stateInfo.text.toUpperCase()}
                      </span>
                      {item.description && (
                        <span style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>{item.description}</span>
                      )}
                    </div>
                    <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Détails de la commande (Visible au clic) */}
                {isExpanded && (
                  <div className="order-expanded-content" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="order-products-section">
                      <h4 className="section-title">Produits {item.type === 'cart' ? 'dans le panier' : 'commandés'}</h4>
                      <div className="order-products-list">
                        {item.products.length === 0 ? (
                          <div className="no-data">Aucun produit trouvé.</div>
                        ) : (
                          item.products.map((prod, idx) => (
                            <div key={idx} className="order-product-item">
                              <span className="product-qty">{prod.qty}x</span>
                              <span className="product-name">{prod.name}</span>
                              <span className="product-price">{prod.price} €</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
