import React, { useState, useEffect } from 'react';
import { fetchPrestaData, extractValue, BASE_URL, API_KEY } from '../services/apiClient';

export default function CategoryStockTable() {
  const [productsStock, setProductsStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadProductStockData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Récupérer toutes les catégories pour le nom
      const categoriesData = await fetchPrestaData('categories?display=full', 0, 500);
      let catsList = categoriesData?.categories?.category || [];
      if (!Array.isArray(catsList)) catsList = catsList ? [catsList] : [];

      const categoriesMap = {};
      catsList.forEach(cat => {
        const id = extractValue(cat.id);
        let name = 'Inconnu';
        if (cat.name?.language) {
          const langObj = Array.isArray(cat.name.language)
            ? cat.name.language.find(l => extractValue(l['@_id']) === '1') || cat.name.language[0]
            : cat.name.language;
          name = extractValue(langObj);
        }
        categoriesMap[id] = name;
      });

      // 2. Récupérer tous les produits
      const prodsData = await fetchPrestaData('products?display=full', 0, 1000);
      let prodsList = prodsData?.products?.product || [];
      if (!Array.isArray(prodsList)) prodsList = prodsList ? [prodsList] : [];

      // 3. Récupérer le stock physique (stock_availables)
      const allStockData = await fetchPrestaData('stock_availables', 0, 5000);
      let stocksList = allStockData?.stock_availables?.stock_available || [];
      if (!Array.isArray(stocksList)) stocksList = stocksList ? [stocksList] : [];

      // On extrait le stock physique total de chaque produit (id_product_attribute = '0' contient la somme)
      const physicalStockMap = {};
      stocksList.forEach(s => {
        const pid = extractValue(s.id_product);
        const attrId = extractValue(s.id_product_attribute);
        const qty = Number(extractValue(s.quantity)) || 0;

        if (attrId === '0') {
          physicalStockMap[pid] = qty;
        }
      });

      // 4. Récupérer les commandes réservées (Statuts Payé : 2 et 11)
      const pendingOrdersRes = await fetch(`${BASE_URL}/orders?display=[id]&filter[current_state]=[2|11]&ws_key=${API_KEY}`);
      const pendingXml = await pendingOrdersRes.text();
      const pendingDoc = new DOMParser().parseFromString(pendingXml, 'text/xml');
      const pendingOrderIds = Array.from(pendingDoc.querySelectorAll('order id')).map(el => el.textContent);
      
      let reservedProductMap = {}; // Dictionnaire { id_produit: qte_reservee }
      
      if (pendingOrderIds.length > 0) {
        const detailsRes = await fetch(`${BASE_URL}/order_details?display=[product_id,product_quantity]&filter[id_order]=[${pendingOrderIds.join('|')}]&ws_key=${API_KEY}`);
        const detailsXml = await detailsRes.text();
        const detailsDoc = new DOMParser().parseFromString(detailsXml, 'text/xml');
        
        Array.from(detailsDoc.querySelectorAll('order_detail')).forEach(detail => {
          const pId = detail.querySelector('product_id')?.textContent;
          const qty = parseInt(detail.querySelector('product_quantity')?.textContent || '0', 10);
          if (pId) {
            reservedProductMap[pId] = (reservedProductMap[pId] || 0) + qty;
          }
        });
      }

      // 5. Consolidation pour l'affichage (Mapping de tous les produits)
      const finalizedProducts = prodsList.map(p => {
        const pid = extractValue(p.id);
        
        // Extraction du nom du produit
        let pName = 'Produit inconnu';
        if (p.name?.language) {
          const l = Array.isArray(p.name.language) 
            ? p.name.language.find(x => extractValue(x['@_id']) === '1') || p.name.language[0] 
            : p.name.language;
          pName = extractValue(l);
        }

        const cid = extractValue(p.id_category_default) || '0';
        const categoryName = categoriesMap[cid] || 'Non catégorisé';

        const physicalQty = physicalStockMap[pid] || 0;
        const reservedQty = reservedProductMap[pid] || 0;
        const availableQty = physicalQty - reservedQty;

        return {
          id: pid,
          name: pName,
          category: categoryName,
          physicalQty,
          reservedQty,
          availableQty
        };
      });

      // On trie par catégorie puis par nom de produit
      finalizedProducts.sort((a, b) => {
        if (a.category === b.category) return a.name.localeCompare(b.name);
        return a.category.localeCompare(b.category);
      });

      setProductsStock(finalizedProducts);
    } catch (err) {
      console.error("Erreur consolidation des produits :", err);
      setError("Impossible de charger le tableau des produits.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProductStockData();
  }, []);

  // Fonction de filtrage pour la barre de recherche
  const displayedProducts = productsStock.filter(p => {
    const term = searchTerm.toLowerCase();
    return p.name.toLowerCase().includes(term) || 
           p.category.toLowerCase().includes(term) || 
           p.id.includes(term);
  });

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
         Extraction de tous les produits et calcul des stocks...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: '#d32f2f', padding: '20px', background: '#ffebee', borderRadius: '4px', margin: '20px' }}>
         {error}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#000', fontSize: '20px' }}>Rapport Détaillé des Stocks par Produit</h2>
         
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder=" Rechercher (nom, cat, id)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', width: '250px'
            }}
          />
          <button
            onClick={loadProductStockData}
            style={{
              padding: '8px 16px', background: '#f5f5f5', border: '1px solid #ddd',
              borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 500
            }}
          >
            ↻ Rafraîchir
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px', overflowX: 'auto', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '2px solid #e0e0e0' }}>
              <th style={{ ...thStyle, width: '60px' }}>ID</th>
              <th style={thStyle}>Produit</th>
              <th style={thStyle}>Catégorie</th>
              <th style={{ ...thStyle, textAlign: 'center', background: '#e3f2fd', color: '#1565c0' }}>Qté physique</th>
              <th style={{ ...thStyle, textAlign: 'center', background: '#fff3cd', color: '#e65100' }}>Qté réservé</th>
              <th style={{ ...thStyle, textAlign: 'center', background: '#e8f5e9', color: '#2e7d32' }}>Qté disponible</th>
            </tr>
          </thead>
          <tbody>
            {displayedProducts.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                  Aucun produit trouvé.
                </td>
              </tr>
            ) : (
              displayedProducts.map((prod) => (
                <tr 
                  key={prod.id} 
                  style={{ borderBottom: '1px solid #f0f0f0', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#fcfcfc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  <td style={{ ...tdStyle, color: '#888', fontSize: '12px' }}>{prod.id}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{prod.name}</td>
                  <td style={{ ...tdStyle, color: '#555', fontSize: '13px' }}>
                    <span style={{ background: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
                      {prod.category}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 'bold' }}>{prod.physicalQty}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#f57c00', fontWeight: '500' }}>{prod.reservedQty}</td>
                  <td style={{ 
                    ...tdStyle, 
                    textAlign: 'center', 
                    fontWeight: 'bold',
                    color: prod.availableQty > 0 ? '#2e7d32' : '#c62828'
                  }}>
                    {prod.availableQty}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Styles en ligne
const thStyle = {
  padding: '14px 20px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#666'
};

const tdStyle = {
  padding: '12px 20px',
  fontSize: '14px',
  color: '#333',
  verticalAlign: 'middle'
};