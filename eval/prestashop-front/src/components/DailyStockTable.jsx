import React, { useState, useEffect } from 'react';
import { BASE_URL, API_KEY } from '../services/apiClient';

export default function DailyStockTable({ productId, startDate, endDate }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!productId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // 1. Récupérer le stock PHYSIQUE ACTUEL
        const stockRes = await fetch(`${BASE_URL}/stock_availables?display=full&filter[id_product]=[${productId}]&ws_key=${API_KEY}`);
        const stockXml = await stockRes.text();
        const stockDoc = new DOMParser().parseFromString(stockXml, 'text/xml');
        
        const runningStock = {};
        Array.from(stockDoc.querySelectorAll('stock_available')).forEach(node => {
          const idAttr = node.querySelector('id_product_attribute')?.textContent || '0';
          const qty = parseInt(node.querySelector('quantity')?.textContent || '0', 10);
          runningStock[idAttr] = qty;
        });

        // 2. Récupérer toutes les ventes pour ce produit
        const detailsRes = await fetch(`${BASE_URL}/order_details?display=full&filter[product_id]=[${productId}]&ws_key=${API_KEY}`);
        const detailsXml = await detailsRes.text();
        const detailsDoc = new DOMParser().parseFromString(detailsXml, 'text/xml');
        const orderDetails = Array.from(detailsDoc.querySelectorAll('order_detail'));

        if (orderDetails.length === 0) {
          setMovements([]);
          setLoading(false);
          return;
        }

        // 3. Extraire les IDs de commandes et récupérer leur DATE et leur STATUT
        const orderIds = [...new Set(orderDetails.map(od => od.querySelector('id_order')?.textContent))];
        
        let ordersMap = {}; // { id_order: { date, state } }
        if (orderIds.length > 0) {
          // Ajout de current_state dans le display
          const ordersRes = await fetch(`${BASE_URL}/orders?display=[id,date_add,current_state]&filter[id]=[${orderIds.join('|')}]&ws_key=${API_KEY}`);
          const ordersXml = await ordersRes.text();
          const ordersDoc = new DOMParser().parseFromString(ordersXml, 'text/xml');
          
          Array.from(ordersDoc.querySelectorAll('order')).forEach(order => {
            const id = order.querySelector('id')?.textContent;
            const date = order.querySelector('date_add')?.textContent;
            const state = order.querySelector('current_state')?.textContent;
            if (id && date) ordersMap[id] = { date, state };
          });
        }

        // 4. Construire l'historique en FILTRANT les commandes non livrées
        let history = [];
        orderDetails.forEach(detail => {
          const orderId = detail.querySelector('id_order')?.textContent;
          const orderInfo = ordersMap[orderId];
          
          // RÈGLE MÉTIER : On ne compte comme mouvement que si le statut est Livré (5)
          if (orderInfo && String(orderInfo.state) === '5') {
            const attrId = detail.querySelector('product_attribute_id')?.textContent || '0';
            const qtySold = parseInt(detail.querySelector('product_quantity')?.textContent || '0', 10);
            
            history.push({
              id: detail.querySelector('id')?.textContent,
              orderId: orderId,
              date: orderInfo.date,
              attrId: attrId,
              declinaison: attrId !== '0' ? `#${productId}-${attrId}` : 'Principal',
              mouvement: -qtySold,
              qtyNum: qtySold,
            });
          }
        });

        // 5. Trier chronologiquement (DESC)
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 6. Recalculer le stock rétroactivement
        const finalizedHistory = history.map(mvt => {
          const currentForAttr = runningStock[mvt.attrId] || 0;
          const stockApresVente = currentForAttr;
          runningStock[mvt.attrId] = currentForAttr + mvt.qtyNum;
          
          return {
            ...mvt,
            nouveauStock: stockApresVente
          };
        });

        setMovements(finalizedHistory);

      } catch (err) {
        console.error("Erreur historique :", err);
        setError("Impossible de charger l'historique détaillé.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [productId]);

  const displayedMovements = movements.filter(mvt => {
    const movementDay = typeof mvt.date === 'string' ? mvt.date.slice(0, 10) : '';
    if (!startDate && !endDate) return true;
    if (startDate && movementDay < startDate) return false;
    if (endDate && movementDay > endDate) return false;
    return true;
  });

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>⏳ Calcul des mouvements validés (Livrées)...</div>;
  if (error) return <div style={{ color: '#d32f2f', padding: '20px' }}>❌ {error}</div>;

  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
      <div style={{ padding: '16px 20px', background: '#fafafa', borderBottom: '2px solid #e0e0e0' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Historique détaillé (Produit #{productId})</h3>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th style={thStyle}>Date de commande</th>
            <th style={thStyle}>Réf Commande</th>
            <th style={thStyle}>Déclinaison</th>
            <th style={{...thStyle, textAlign: 'center'}}>Mouvement acté</th>
            <th style={{...thStyle, textAlign: 'center'}}>Stock Physique</th>
          </tr>
        </thead>
        <tbody>
          {displayedMovements.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Aucun produit encore livré.</td>
            </tr>
          ) : (
            displayedMovements.map((mvt, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={tdStyle}>{mvt.date}</td>
                <td style={tdStyle}>#{mvt.orderId} (Livrée)</td>
                <td style={tdStyle}>{mvt.declinaison}</td>
                <td style={{...tdStyle, textAlign: 'center', color: '#d32f2f', fontWeight: 'bold'}}>{mvt.mouvement}</td>
                <td style={{...tdStyle, textAlign: 'center', fontWeight: 'bold'}}>{mvt.nouveauStock}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = { padding: '14px 20px', textAlign: 'left', fontSize: '12px', color: '#888' };
const tdStyle = { padding: '12px 20px', fontSize: '13px' };