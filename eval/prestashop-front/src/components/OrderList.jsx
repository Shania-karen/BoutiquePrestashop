import React, { useState, useEffect, use } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { fetchPrestaData, extractValue } from '../services/apiClient';
import '../assets/css/OrderList.css';
import { getOrderById, duplicateOrderWithNewCart } from '../services/orderService';
import { fetchStockAvailable } from '../services/productservice';

export default function OrderList() {
  const { user, isAuthenticated } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [duplicateCommande, setDuplicateCommande] = useState(false);
  const [nombreDUplication, setNombreDublication] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [selectedOrderForDuplication, setSelectedOrderForDuplication] = useState(null);
  const [isCheckingStock, setIsCheckingStock] = useState(false);
  const [stockValidationResults, setStockValidationResults] = useState([]);

  useEffect(() => {
    async function checkStock() {
      setIsCheckingStock(true);
      setStockValidationResults([]);

      try {
        const realOrderId = selectedOrderForDuplication.id.replace('order_', '');
        const orderData = await getOrderById(realOrderId);
        const orderRows = orderData.associations?.order_rows?.order_row;
        const productList = Array.isArray(orderRows) ? orderRows : (orderRows ? [orderRows] : []);
        const results = [];
        for (const product of productList) {
          const productId = extractValue(product.product_id);
          const productAttributeId = extractValue(product.product_attribute_id) || 0;
          const qtyInOrder = parseInt(extractValue(product.product_quantity));
          const qtyRequired = qtyInOrder * multiplier;

          const availableStock = await fetchStockAvailable(productId, productAttributeId);

          results.push({
            name: extractValue(product.product_name),
            qty_required: qtyRequired,
            stock_available: availableStock,
            is_ok: availableStock >= qtyRequired
          });

          setStockValidationResults(results);

        }
      }
      catch (err) {
        console.error("Erreur lors de la vérification du stock :", err);
      }
      finally {
        setIsCheckingStock(false);
      }

    }
    if (selectedOrderForDuplication) {
      checkStock();
    }
  }, [selectedOrderForDuplication, multiplier]);
  const executeDuplication = async () => {
    const hasOutOfStock = stockValidationResults.some(res => !res.is_ok);
    if (hasOutOfStock) {
      alert("Désolé, il n'y a pas assez de stock pour cette commande");
      return;
    }
    try {
      setIsCheckingStock(true);
      const realOrderId = selectedOrderForDuplication.id.replace('order_', '');
      const orderData = await getOrderById(realOrderId);
      await duplicateOrderWithNewCart(orderData, multiplier);
      setSelectedOrderForDuplication(null);
      window.location.reload();
    }
    catch (error) {
      console.error("Erreur lors de la duplication de la commande :", error);
    }
    finally {
      setIsCheckingStock(false);
    }
  }

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

        // A. Récupérer les produits pour avoir les noms/prix
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

        // B. Récupérer les commandes du client
        const ordersData = await fetchPrestaData('orders?display=full', 0, 200);
        const oArray = ordersData?.orders?.order || [];
        const allOrdersList = Array.isArray(oArray) ? oArray : [oArray];
        const userOrders = allOrdersList.filter(o => extractValue(o.id_customer) === String(user.id));

        //recuperer liste des produits pour les dupliquer dans le panier
        const ordersDataByline = await getOrderById(userOrders[0].id);
        console.log("ordersDataByline", ordersDataByline);
        setDuplicateCommande(ordersDataByline);

        let combinedItems = [];

        // Traitement des commandes selon la machine à états
        userOrders.forEach(order => {
          const orderRows = order.associations?.order_rows?.order_row;
          const prods = Array.isArray(orderRows) ? orderRows : (orderRows ? [orderRows] : []);

          const products = prods.map(p => ({
            qty: extractValue(p.product_quantity),
            name: extractValue(p.product_name),
            price: parseFloat(extractValue(p.unit_price_tax_incl) || extractValue(p.product_price) || 0).toFixed(2)
          }));

          // --- HARMONISATION DES STATUTS CLIENT AVEC LE BACKOFFICE ---
          const stateId = String(extractValue(order.current_state));
          let stateInfo = { text: 'En cours', color: '#FFA500' };

          // On regroupe le statut 2 et le 11 sous le même affichage "Payé"
          if (stateId === '2' || stateId === '11') {
            stateInfo = { text: 'Payé', color: '#28a745' };
          } else if (stateId === '5') {
            stateInfo = { text: 'Livré', color: '#107c41' };
          } else if (stateId === '6') {
            stateInfo = { text: 'Annulé', color: '#dc3545' };
          }

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
        <div className="empty-orders">Vous n'avez passé aucune commande pour le moment.</div>
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
                  <div classname="order-info-main">
                    <span className="order-ref">ID : <strong>{item.id}</strong></span>
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
                    </div>
                    <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Détails de la commande (Visible au clic) */}
                {isExpanded && (
                  <div className="order-expanded-content" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="order-products-section">
                      <h4 className="section-title">Produits commandés</h4>
                      <div className="order-products-list">
                        {item.products.map((prod, idx) => (
                          <div key={idx} className="order-product-item">
                            <span className="product-qty">{prod.qty}x</span>
                            <span className="product-name">{prod.name}</span>
                            <span className="product-price">{prod.price} €</span>

                          </div>
                        ))}
                        <input type="number" min="1" value={multiplier} onChange={(e) => setMultiplier(e.target.value) || 1}></input>
                        <button
                          onClick={() => {
                            setSelectedOrderForDuplication(item)
                          }}

                        >
                          Dupliquer
                        </button>

                      </div>

                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* MODAL DE VÉRIFICATION DE STOCK */}
      {selectedOrderForDuplication && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', minWidth: '400px' }}>
            <h3>Vérification des stocks</h3>

            {/* 1. On gère l'état de chargement */}
            {isCheckingStock ? (
              <p>Vérification en cours, veuillez patienter...</p>
            ) : (
              <div>
                {/* 2. On affiche la liste des produits */}
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {stockValidationResults.map((res, index) => (
                    <li key={index} style={{ marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                      <strong>{res.name}</strong><br />
                      Demandé : {res.qty_required} | En stock : {res.stock_available}
                      <span style={{ color: res.is_ok ? 'green' : 'red', fontWeight: 'bold', marginLeft: '10px' }}>
                        {res.is_ok ? '✓ OK' : '✗ RUPTURE'}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* 3. Les boutons d'action (Annuler / Confirmer) */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>

                  {/* Bouton Annuler : Il vide l'état, ce qui ferme automatiquement le modal */}
                  <button
                    onClick={() => setSelectedOrderForDuplication(null)}
                    style={{ padding: '8px 15px', cursor: 'pointer' }}
                  >
                    Annuler
                  </button>

                  {/* Bouton Confirmer */}
                  <button
                    onClick={executeDuplication}
                  >
                    Confirmer la duplication
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}