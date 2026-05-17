import React, { useState, useEffect } from 'react';
import { fetchPrestaData, extractValue } from '../services/apiClient';
import { updateOrderState } from '../services/orderService';
import '../assets/css/AdminOrders.css';

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState({});
  const [orderStates, setOrderStates] = useState({});
  const [productsMap, setProductsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  useEffect(() => {
    loadAdminOrdersData();
  }, []);

  const loadAdminOrdersData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Récupérer les statuts de commande
      const statesData = await fetchPrestaData('order_states?display=full');
      const statesArray = statesData?.order_states?.order_state;
      const statesList = Array.isArray(statesArray) ? statesArray : (statesArray ? [statesArray] : []);
      
      const statesMap = {};
      statesList.forEach(state => {
        const id = extractValue(state.id);
        let name = 'Inconnu';
        if (state.name?.language) {
          const langObj = Array.isArray(state.name.language)
            ? state.name.language.find(l => extractValue(l['@_id']) === '1') || state.name.language[0]
            : state.name.language;
          name = extractValue(langObj);
        }
        statesMap[id] = {
          name: name,
          color: extractValue(state.color) || '#d3d3d3'
        };
      });
      setOrderStates(statesMap);

      // 2. Récupérer tous les clients
      const customersData = await fetchPrestaData('customers?display=full', 0, 200);
      const customersArray = customersData?.customers?.customer;
      const customersList = Array.isArray(customersArray) ? customersArray : (customersArray ? [customersArray] : []);
      
      const customersMap = {};
      customersList.forEach(customer => {
        const id = extractValue(customer.id);
        customersMap[id] = {
          firstname: extractValue(customer.firstname),
          lastname: extractValue(customer.lastname),
          email: extractValue(customer.email)
        };
      });
      setCustomers(customersMap);

      // 3. Récupérer les produits (pour noms dans le détail)
      const prodsData = await fetchPrestaData('products?display=full', 0, 500);
      const prodsArray = prodsData?.products?.product;
      const prodsList = Array.isArray(prodsArray) ? prodsArray : (prodsArray ? [prodsArray] : []);
      const pMap = {};
      prodsList.forEach(p => {
        const id = extractValue(p.id);
        let name = 'Produit';
        if (p.name?.language) {
          const l = Array.isArray(p.name.language) ? p.name.language[0] : p.name.language;
          name = extractValue(l);
        }
        pMap[id] = {
          name,
          reference: extractValue(p.reference),
          price: parseFloat(extractValue(p.price)) || 0
        };
      });
      setProductsMap(pMap);

      // 4. Récupérer toutes les commandes
      const ordersData = await fetchPrestaData('orders?display=full', 0, 200);
      const ordersArray = ordersData?.orders?.order;
      const ordersList = Array.isArray(ordersArray) ? ordersArray : (ordersArray ? [ordersArray] : []);
      
      const ordersCartIds = new Set(ordersList.map(o => extractValue(o.id_cart)));

      // Trier par date décroissante
      ordersList.sort((a, b) => new Date(extractValue(b.date_add)) - new Date(extractValue(a.date_add)));

      setOrders(ordersList);
    } catch (err) {
      console.error('Erreur chargement commandes:', err);
      setError('Erreur lors de la récupération des commandes');
    } finally {
      setLoading(false);
    }
  };

  const handleStateChange = async (orderId, newStateId) => {
    try {
      setUpdatingOrderId(orderId);
      await updateOrderState(orderId, newStateId);
      await loadAdminOrdersData();
    } catch (err) {
      console.error('Erreur mise à jour état:', err);
      setError('Erreur lors de la mise à jour du statut de commande');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const getReadableTextColor = (hexColor) => {
    const color = String(hexColor || '').replace('#', '');
    if (!/^([0-9a-fA-F]{6})$/.test(color)) return '#000000';
    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    return luminance > 160 ? '#000000' : '#ffffff';
  };

  // Extraire les lignes de produits d'une commande ou d'un panier
  const getOrderProducts = (order) => {
    // Paniers orphelins
    if (order._cartProducts) {
      return order._cartProducts.map(cp => {
        const prod = productsMap[cp.product_id];
        return {
          name: prod?.name || `Produit #${cp.product_id}`,
          reference: prod?.reference || '',
          quantity: cp.product_quantity,
          unitPrice: prod?.price?.toFixed(2) || '0.00',
          totalPrice: ((prod?.price || 0) * parseInt(cp.product_quantity)).toFixed(2)
        };
      });
    }
    // Commandes normales (order_rows)
    if (order.associations?.order_rows?.order_row) {
      let rows = order.associations.order_rows.order_row;
      if (!Array.isArray(rows)) rows = [rows];
      return rows.map(r => ({
        name: extractValue(r.product_name) || 'Produit',
        reference: extractValue(r.product_reference) || '',
        quantity: extractValue(r.product_quantity),
        unitPrice: parseFloat(extractValue(r.product_price) || 0).toFixed(2),
        totalPrice: (parseFloat(extractValue(r.product_price) || 0) * parseInt(extractValue(r.product_quantity) || 1)).toFixed(2)
      }));
    }
    return [];
  };

  if (loading) {
    return <div className="admin-orders-container"><p>Chargement des commandes...</p></div>;
  }

  if (error) {
    return <div className="admin-orders-container"><p className="error-alert">{error}</p></div>;
  }

  return (
    <div className="admin-orders-container">
      <h2 className="admin-orders-title">Gestion des Commandes</h2>
      
      {orders.length === 0 ? (
        <p className="empty-message">Aucune commande trouvée</p>
      ) : (
        <div className="orders-table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Référence</th>
                <th>Nouveau Client</th>
                <th>Livraison</th>
                <th>Client</th>
                <th>Total</th>
                <th>Paiement</th>
                <th>État</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const orderId = extractValue(order.id);
                const reference = extractValue(order.reference);
                const customerId = extractValue(order.id_customer);
                const customer = customers[customerId];
                const totalPaid = extractValue(order.total_paid);
                const totalTTC = extractValue(order.total_paid_tax_incl) || totalPaid;
                const totalHT = extractValue(order.total_paid_tax_excl) || totalPaid;
                const stateId = extractValue(order.current_state);
                const state = orderStates[stateId];
                const date = new Date(extractValue(order.date_add));
                const isNewCustomer = extractValue(order.id_customer) === '0' || !customer;
                const paymentMethod = extractValue(order.payment) || 'N/A';
                const isExpanded = expandedOrderId === orderId;
                const products = isExpanded ? getOrderProducts(order) : [];

                return (
                  <React.Fragment key={orderId}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedOrderId(isExpanded ? null : orderId)}>
                      <td className="id-cell">{orderId}</td>
                      <td className="reference-cell">{reference}</td>
                      <td className="new-customer-cell">
                        {isNewCustomer ? <span className="badge-new">OUI</span> : <span className="badge-no">NON</span>}
                      </td>
                      <td className="shipping-cell">À livrer</td>
                      <td className="customer-cell">
                        {customer ? `${customer.firstname} ${customer.lastname}` : 'N/A'}
                      </td>
                      <td className="total-cell">{parseFloat(totalPaid).toFixed(2)} €</td>
                      <td className="payment-cell">
                        <span className="payment-badge">{paymentMethod}</span>
                      </td>
                      <td className="state-cell" onClick={e => e.stopPropagation()}>
                        <select
                          className="state-select"
                          value={stateId || '0'}
                          onChange={(e) => handleStateChange(orderId, e.target.value)}
                          disabled={updatingOrderId === orderId || stateId === 'cart_only'}
                          style={{
                            backgroundColor: state?.color || '#f5f5f5',
                            color: getReadableTextColor(state?.color),
                            borderColor: state?.color || '#999999',
                          }}
                        >
                          {Object.entries(orderStates).map(([id, stateInfo]) => (
                            <option key={id} value={id}>{stateInfo.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="date-cell">{date.toLocaleDateString('fr-FR')}</td>
                      <td className="actions-cell">
                        <button className="btn-view" onClick={e => { e.stopPropagation(); setExpandedOrderId(isExpanded ? null : orderId); }}>
                          {isExpanded ? '▲ Fermer' : '▼ Voir'}
                        </button>
                      </td>
                    </tr>

                    {/* --- DÉTAIL DE LA COMMANDE (style PrestaShop) --- */}
                    {isExpanded && (
                      <tr className="detail-row">
                        <td colSpan="10" style={{ padding: 0 }}>
                          <div className="order-detail-panel">
                            {/* En-tête du détail */}
                            <div className="detail-header">
                              <div className="detail-header-left">
                                <h3>Commande {reference}</h3>
                                <span className="detail-date">
                                  {date.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="detail-header-right">
                                <span className="detail-state-badge" style={{ backgroundColor: state?.color || '#ccc', color: getReadableTextColor(state?.color) }}>
                                  {state?.name || 'Inconnu'}
                                </span>
                              </div>
                            </div>

                            <div className="detail-grid">
                              {/* Colonne gauche : Produits */}
                              <div className="detail-section">
                                <h4 className="detail-section-title">
                                  Produits ({products.length})
                                </h4>
                                <table className="detail-products-table">
                                  <thead>
                                    <tr>
                                      <th>Produit</th>
                                      <th>Réf.</th>
                                      <th>Qté</th>
                                      <th>Prix unitaire</th>
                                      <th>Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {products.length > 0 ? products.map((prod, idx) => (
                                      <tr key={idx}>
                                        <td style={{ fontWeight: 500 }}>{prod.name}</td>
                                        <td style={{ fontFamily: 'monospace', color: '#666' }}>{prod.reference}</td>
                                        <td style={{ textAlign: 'center' }}>{prod.quantity}</td>
                                        <td style={{ textAlign: 'right' }}>{prod.unitPrice} €</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{prod.totalPrice} €</td>
                                      </tr>
                                    )) : (
                                      <tr><td colSpan="5" style={{ textAlign: 'center', color: '#999' }}>Aucun produit</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              {/* Colonne droite : Récap */}
                              <div className="detail-section detail-summary">
                                {/* Client */}
                                <h4 className="detail-section-title">Client</h4>
                                <div className="detail-info-block">
                                  <p><strong>{customer ? `${customer.firstname} ${customer.lastname}` : 'N/A'}</strong></p>
                                  <p style={{ color: '#666', fontSize: '0.85rem' }}>{customer?.email || ''}</p>
                                </div>

                                {/* Récapitulatif financier */}
                                <h4 className="detail-section-title" style={{ marginTop: '20px' }}>Récapitulatif</h4>
                                <div className="detail-info-block">
                                  <div className="detail-recap-row">
                                    <span>Total produits (HT)</span>
                                    <span>{parseFloat(totalHT).toFixed(2)} €</span>
                                  </div>
                                  <div className="detail-recap-row">
                                    <span>Taxes</span>
                                    <span>{(parseFloat(totalTTC) - parseFloat(totalHT)).toFixed(2)} €</span>
                                  </div>
                                  <div className="detail-recap-row detail-recap-total">
                                    <span>Total TTC</span>
                                    <span>{parseFloat(totalTTC).toFixed(2)} €</span>
                                  </div>
                                </div>

                                {/* Paiement */}
                                <h4 className="detail-section-title" style={{ marginTop: '20px' }}>Paiement</h4>
                                <div className="detail-info-block">
                                  <p>Méthode : <strong>{paymentMethod}</strong></p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
