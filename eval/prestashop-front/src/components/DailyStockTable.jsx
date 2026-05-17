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
        
        // 1. Récupérer le stock ACTUEL du produit (principal et déclinaisons)
        const stockRes = await fetch(`${BASE_URL}/stock_availables?display=full&filter[id_product]=[${productId}]&ws_key=${API_KEY}`);
        const stockXml = await stockRes.text();
        const stockDoc = new DOMParser().parseFromString(stockXml, 'text/xml');
        
        // Dictionnaire pour garder une trace du stock pendant qu'on remonte le temps
        // Clé: id_product_attribute, Valeur: quantité courante
        const runningStock = {};
        Array.from(stockDoc.querySelectorAll('stock_available')).forEach(node => {
          const idAttr = node.querySelector('id_product_attribute')?.textContent || '0';
          const qty = parseInt(node.querySelector('quantity')?.textContent || '0', 10);
          runningStock[idAttr] = qty;
        });

        // 2. Récupérer toutes les ventes (détails de commandes) pour ce produit
        const detailsRes = await fetch(`${BASE_URL}/order_details?display=full&filter[product_id]=[${productId}]&ws_key=${API_KEY}`);
        const detailsXml = await detailsRes.text();
        const detailsDoc = new DOMParser().parseFromString(detailsXml, 'text/xml');
        const orderDetails = Array.from(detailsDoc.querySelectorAll('order_detail'));

        if (orderDetails.length === 0) {
          setMovements([]);
          setLoading(false);
          return;
        }

        // 3. Extraire les IDs de commandes uniques pour récupérer leurs vraies dates
        const orderIds = [...new Set(orderDetails.map(od => od.querySelector('id_order')?.textContent))];
        
        let ordersMap = {}; // { id_order: date_add }
        if (orderIds.length > 0) {
          const ordersRes = await fetch(`${BASE_URL}/orders?display=[id,date_add]&filter[id]=[${orderIds.join('|')}]&ws_key=${API_KEY}`);
          const ordersXml = await ordersRes.text();
          const ordersDoc = new DOMParser().parseFromString(ordersXml, 'text/xml');
          
          Array.from(ordersDoc.querySelectorAll('order')).forEach(order => {
            const id = order.querySelector('id')?.textContent;
            const date = order.querySelector('date_add')?.textContent;
            if (id && date) ordersMap[id] = date;
          });
        }

        // 4. Construire l'historique brut
        let history = orderDetails.map(detail => {
          const orderId = detail.querySelector('id_order')?.textContent;
          const attrId = detail.querySelector('product_attribute_id')?.textContent || '0';
          const qtySold = parseInt(detail.querySelector('product_quantity')?.textContent || '0', 10);
          
          return {
            id: detail.querySelector('id')?.textContent,
            orderId: orderId,
            date: ordersMap[orderId] || 'Date inconnue',
            attrId: attrId,
            declinaison: attrId !== '0' ? `#${productId}-${attrId}` : 'Principal',
            mouvement: -qtySold, // Une vente est un retrait
            qtyNum: qtySold,
          };
        });

        // 5. Trier chronologiquement du plus récent au plus ancien (DESC)
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 6. Recalculer le "Nouveau Stock" en remontant le temps
        // Comme on part d'aujourd'hui vers le passé, le stock d'avant la commande 
        // est égal au stock actuel + la quantité vendue.
        const finalizedHistory = history.map(mvt => {
          const currentForAttr = runningStock[mvt.attrId] || 0;
          
          // Le "Nouveau Stock" (celui qui restait juste après cette vente spécifique)
          const stockApresVente = currentForAttr;
          
          // On ajoute la quantité vendue pour remonter d'un cran dans le passé 
          // pour la prochaine itération de la boucle
          runningStock[mvt.attrId] = currentForAttr + mvt.qtyNum;
          
          return {
            ...mvt,
            nouveauStock: stockApresVente
          };
        });

        setMovements(finalizedHistory);

      } catch (err) {
        console.error("Erreur lors de la récupération de l'historique :", err);
        setError("Impossible de charger l'historique détaillé.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [productId]); // Ne pas inclure les dates ici pour garder le recalcul rétroactif indépendant du filtre

  // 7. Filtrer entre deux dates pour l'affichage (après le calcul du stock)
  const displayedMovements = movements.filter(mvt => {
    const movementDay = typeof mvt.date === 'string' ? mvt.date.slice(0, 10) : '';
    if (!startDate && !endDate) return true;
    if (startDate && movementDay < startDate) return false;
    if (endDate && movementDay > endDate) return false;
    return true;
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#666', border: '1px solid #ddd', borderRadius: '4px', background: '#fff' }}>
        ⏳ Construction de l'historique basé sur les commandes...
      </div>
    );
  }

  if (error) {
    return <div style={{ color: '#d32f2f', padding: '20px', background: '#ffebee', borderRadius: '4px' }}>❌ {error}</div>;
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', background: '#fafafa', borderBottom: '2px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#000' }}>
          Historique détaillé des mouvements (Produit #{productId})
        </h3>
        {(startDate || endDate) && (
          <span style={{ fontSize: '12px', background: '#e0e0e0', padding: '4px 8px', borderRadius: '12px' }}>
            Période : {startDate || '...'} → {endDate || '...'}
          </span>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#fff', borderBottom: '1px solid #ddd' }}>
            <th style={thStyle}>Date & Heure exacte</th>
            <th style={thStyle}>Commande Réf</th>
            <th style={thStyle}>Déclinaison</th>
            <th style={{...thStyle, textAlign: 'center'}}>Mouvement</th>
            <th style={{...thStyle, textAlign: 'center'}}>Stock Restant</th>
          </tr>
        </thead>
        <tbody>
          {displayedMovements.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
                Aucune vente enregistrée pour ce produit{startDate || endDate ? ' sur cette période' : ''}.
              </td>
            </tr>
          ) : (
            displayedMovements.map((mvt, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #f0f0f0', background: index % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{...tdStyle, fontFamily: 'monospace', color: '#555'}}>{mvt.date}</td>
                <td style={{...tdStyle, fontWeight: 500}}>
                  <a href={`/admin/orders/${mvt.orderId}`} style={{ color: '#2196f3', textDecoration: 'none' }}>#{mvt.orderId}</a>
                </td>
                <td style={{...tdStyle, color: '#666'}}>{mvt.declinaison}</td>
                <td style={{...tdStyle, textAlign: 'center'}}>
                  <span style={{ color: '#d32f2f', fontWeight: 600, background: '#ffebee', padding: '2px 8px', borderRadius: '12px' }}>
                    {mvt.mouvement} (Vente)
                  </span>
                </td>
                <td style={{...tdStyle, textAlign: 'center', fontWeight: 'bold', fontSize: '14px'}}>
                  {mvt.nouveauStock}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  padding: '14px 20px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#888'
};

const tdStyle = {
  padding: '12px 20px',
  fontSize: '13px',
  color: '#333',
  verticalAlign: 'middle'
};