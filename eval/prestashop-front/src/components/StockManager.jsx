import React, { useState, useEffect } from 'react';
import { fetchPrestaData, extractValue, updatePrestaData, BASE_URL, API_KEY } from '../services/apiClient';
import { deletePrestaData } from '../services/adminService';

/**
 * Composant de gestion des stocks pour le Backoffice.
 * Permet de visualiser, modifier et supprimer le stock de chaque produit/déclinaison.
 * Le stock contrôle la disponibilité des produits côté Frontoffice et Backoffice.
 */
export default function StockManager() {
  const [products, setProducts] = useState([]);
  const [stockData, setStockData] = useState({}); // { productId: { main: {...}, combinations: [...] } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // ID du stock en cours de sauvegarde
  const [editValues, setEditValues] = useState({}); // { stockId: quantity }
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // productId à supprimer

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // --- CHARGEMENT DES DONNÉES ---
  const loadData = async () => {
    try {
      setLoading(true);

      // 1. Charger tous les produits
      const prodsData = await fetchPrestaData('products', 0, 500);
      let prods = prodsData?.products?.product || [];
      if (!Array.isArray(prods)) prods = prods ? [prods] : [];

      // 2. Charger tous les stock_availables
      const allStockData = await fetchPrestaData('stock_availables', 0, 5000);
      let stocks = allStockData?.stock_availables?.stock_available || [];
      if (!Array.isArray(stocks)) stocks = stocks ? [stocks] : [];

      // 3. Charger les déclinaisons (combinations)
      const combsData = await fetchPrestaData('combinations', 0, 5000);
      let combs = combsData?.combinations?.combination || [];
      if (!Array.isArray(combs)) combs = combs ? [combs] : [];

      // 4. Organiser les stocks par produit
      const stockMap = {};
      const editMap = {};

      stocks.forEach(s => {
        const pid = extractValue(s.id_product);
        const paId = extractValue(s.id_product_attribute);
        const sid = extractValue(s.id);
        const qty = Number(extractValue(s.quantity)) || 0;

        if (!stockMap[pid]) {
          stockMap[pid] = { main: null, combinations: [] };
        }

        const stockEntry = {
          stockId: sid,
          productId: pid,
          productAttributeId: paId,
          quantity: qty,
          combinationRef: ''
        };

        // Trouver la ref de la déclinaison si applicable
        if (paId && paId !== '0') {
          const comb = combs.find(c =>
            (extractValue(c.id) === paId) ||
            (c['@_id'] === paId)
          );
          if (comb) {
            stockEntry.combinationRef = extractValue(comb.reference) || `Déclinaison #${paId}`;
          } else {
            stockEntry.combinationRef = `Déclinaison #${paId}`;
          }
          stockMap[pid].combinations.push(stockEntry);
        } else {
          stockMap[pid].main = stockEntry;
        }

        editMap[sid] = qty;
      });

      setProducts(prods);
      setStockData(stockMap);
      setEditValues(editMap);
    } catch (error) {
      console.error("Erreur chargement stocks:", error);
      showNotification(`Erreur de chargement : ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // --- MISE À JOUR DU STOCK ---
  const handleSaveStock = async (stockId) => {
    const newQty = parseInt(editValues[stockId], 10);
    if (isNaN(newQty) || newQty < 0) {
      showNotification("La quantité doit être un nombre ≥ 0", "error");
      return;
    }

    try {
      setSaving(stockId);

      // Récupérer le XML complet du stock_available
      const response = await fetch(`${BASE_URL}/stock_availables/${stockId}?ws_key=${API_KEY}`);
      let xmlStock = await response.text();

      // Injecter la nouvelle quantité
      xmlStock = xmlStock.replace(
        /<quantity><!\[CDATA\[.*?\]\]><\/quantity>/,
        `<quantity><![CDATA[${newQty}]]></quantity>`
      );
      if (!xmlStock.includes(`<![CDATA[${newQty}]]>`)) {
        xmlStock = xmlStock.replace(
          /<quantity>.*?<\/quantity>/,
          `<quantity><![CDATA[${newQty}]]></quantity>`
        );
      }

      await updatePrestaData('stock_availables', stockId, xmlStock);
      showNotification(`Stock mis à jour (ID ${stockId} → ${newQty})`);

      // Mettre à jour l'état local
      setStockData(prev => {
        const updated = { ...prev };
        for (const pid of Object.keys(updated)) {
          if (updated[pid].main?.stockId === stockId) {
            updated[pid] = { ...updated[pid], main: { ...updated[pid].main, quantity: newQty } };
          }
          updated[pid] = {
            ...updated[pid],
            combinations: updated[pid].combinations.map(c =>
              c.stockId === stockId ? { ...c, quantity: newQty } : c
            )
          };
        }
        return updated;
      });
    } catch (error) {
      showNotification(`Erreur : ${error.message}`, 'error');
    } finally {
      setSaving(null);
    }
  };

  // --- SUPPRESSION D'UN PRODUIT (met le stock à 0 et désactive) ---
  const handleDeleteProduct = async (productId) => {
    try {
      setSaving(productId);

      // Mettre le stock principal à 0
      const pStock = stockData[productId];
      if (pStock?.main) {
        setEditValues(prev => ({ ...prev, [pStock.main.stockId]: 0 }));
        await handleSaveStock_direct(pStock.main.stockId, 0);
      }

      // Mettre toutes les déclinaisons à 0
      for (const comb of (pStock?.combinations || [])) {
        await handleSaveStock_direct(comb.stockId, 0);
      }

      // Désactiver le produit via l'API
      const response = await fetch(`${BASE_URL}/products/${productId}?ws_key=${API_KEY}`);
      let xmlProduct = await response.text();
      xmlProduct = xmlProduct.replace(
        /<active><!\[CDATA\[.*?\]\]><\/active>/,
        `<active><![CDATA[0]]></active>`
      );
      if (!xmlProduct.includes(`<active><![CDATA[0]]></active>`)) {
        xmlProduct = xmlProduct.replace(
          /<active>.*?<\/active>/,
          `<active><![CDATA[0]]></active>`
        );
      }
      await updatePrestaData('products', productId, xmlProduct);

      showNotification(`Produit #${productId} désactivé et stock mis à 0`);
      setConfirmDelete(null);
      await loadData(); // Recharger
    } catch (error) {
      showNotification(`Erreur suppression : ${error.message}`, 'error');
    } finally {
      setSaving(null);
    }
  };

  // Sauvegarde directe sans UI feedback (pour le batch delete)
  const handleSaveStock_direct = async (stockId, qty) => {
    const response = await fetch(`${BASE_URL}/stock_availables/${stockId}?ws_key=${API_KEY}`);
    let xmlStock = await response.text();
    xmlStock = xmlStock.replace(/<quantity><!\[CDATA\[.*?\]\]><\/quantity>/, `<quantity><![CDATA[${qty}]]></quantity>`);
    if (!xmlStock.includes(`<![CDATA[${qty}]]>`)) {
      xmlStock = xmlStock.replace(/<quantity>.*?<\/quantity>/, `<quantity><![CDATA[${qty}]]></quantity>`);
    }
    await updatePrestaData('stock_availables', stockId, xmlStock);
  };

  // --- FILTRAGE ---
  const filteredProducts = products.filter(p => {
    const name = extractValue(p.name).toLowerCase();
    const ref = extractValue(p.reference).toLowerCase();
    const id = extractValue(p.id);
    const term = searchTerm.toLowerCase();
    return name.includes(term) || ref.includes(term) || id.includes(term);
  });

  // --- CALCUL STATS ---
  const totalProducts = products.length;
  const inStockCount = products.filter(p => {
    const pid = extractValue(p.id);
    const main = stockData[pid]?.main;
    return main && main.quantity > 0;
  }).length;
  const outOfStockCount = totalProducts - inStockCount;

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
        Chargement des stocks...
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* NOTIFICATION */}
      {notification && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 1000,
          padding: '14px 24px', borderRadius: '4px',
          background: notification.type === 'error' ? '#ff4c4c' : '#000',
          color: '#fff', fontSize: '13px', fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'fadeIn 0.3s ease'
        }}>
          {notification.msg}
        </div>
      )}

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#000', fontSize: '20px' }}>Gestion des Stocks</h2>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: '13px' }}>
            Gérez la disponibilité de vos produits
          </p>
        </div>
        <button
          onClick={loadData}
          style={{
            padding: '8px 16px', background: '#f5f5f5', border: '1px solid #ddd',
            borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 500
          }}
        >
          ↻ Rafraîchir
        </button>
      </div>

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '24px' }}>
        <div style={kpiStyle}>
          <span style={kpiLabel}>Total produits</span>
          <span style={kpiValue}>{totalProducts}</span>
        </div>
        <div style={{ ...kpiStyle, borderLeftColor: '#4cbb6c' }}>
          <span style={kpiLabel}>En stock</span>
          <span style={{ ...kpiValue, color: '#4cbb6c' }}>{inStockCount}</span>
        </div>
        <div style={{ ...kpiStyle, borderLeftColor: '#ff4c4c' }}>
          <span style={kpiLabel}>Rupture de stock</span>
          <span style={{ ...kpiValue, color: '#ff4c4c' }}>{outOfStockCount}</span>
        </div>
      </div>

      {/* BARRE DE RECHERCHE */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="🔍 Rechercher par nom, référence ou ID..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', border: '1px solid #ddd',
            borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box',
            outline: 'none', transition: 'border-color 0.2s'
          }}
          onFocus={e => e.target.style.borderColor = '#000'}
          onBlur={e => e.target.style.borderColor = '#ddd'}
        />
      </div>

      {/* TABLEAU DES STOCKS */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '2px solid #e0e0e0' }}>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Produit</th>
              <th style={thStyle}>Référence</th>
              <th style={thStyle}>Déclinaison</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Stock actuel</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Nouveau stock</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Statut</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                  Aucun produit trouvé.
                </td>
              </tr>
            ) : (
              filteredProducts.map(product => {
                const pid = extractValue(product.id);
                const name = extractValue(product.name);
                const ref = extractValue(product.reference);
                const isActive = extractValue(product.active) === '1';
                const pStock = stockData[pid];
                const mainStock = pStock?.main;
                const combinations = pStock?.combinations || [];
                const hasCombs = combinations.length > 0;

                // Lignes à afficher : stock principal + déclinaisons
                const rows = [];

                // Stock principal (seulement si pas de déclinaisons, ou toujours pour le total)
                if (mainStock) {
                  rows.push(
                    <tr key={`main-${pid}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={tdStyle}>{pid}</td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>
                        {name}
                        {!isActive && <span style={{ marginLeft: '8px', fontSize: '10px', color: '#ff4c4c', fontWeight: 700 }}>DÉSACTIVÉ</span>}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{ref}</td>
                      <td style={{ ...tdStyle, color: '#888', fontSize: '12px' }}>
                        {hasCombs ? '— Principal —' : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>
                        {mainStock.quantity}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          value={editValues[mainStock.stockId] ?? ''}
                          onChange={e => setEditValues(prev => ({ ...prev, [mainStock.stockId]: e.target.value }))}
                          style={inputQtyStyle}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {mainStock.quantity > 0
                          ? <span style={badgeInStock}>En stock</span>
                          : <span style={badgeOutOfStock}>Rupture</span>
                        }
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleSaveStock(mainStock.stockId)}
                            disabled={saving === mainStock.stockId}
                            style={btnSave}
                          >
                            {saving === mainStock.stockId ? '...' : '💾'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(pid)}
                            style={btnDelete}
                            title="Désactiver le produit et mettre le stock à 0"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // Déclinaisons
                combinations.forEach(comb => {
                  rows.push(
                    <tr key={`comb-${comb.stockId}`} style={{ borderBottom: '1px solid #f5f5f5', background: '#fafafa' }}>
                      <td style={tdStyle}></td>
                      <td style={tdStyle}></td>
                      <td style={tdStyle}></td>
                      <td style={{ ...tdStyle, color: '#555', fontSize: '12px', paddingLeft: '20px' }}>
                        ↳ {comb.combinationRef}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 500 }}>
                        {comb.quantity}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          value={editValues[comb.stockId] ?? ''}
                          onChange={e => setEditValues(prev => ({ ...prev, [comb.stockId]: e.target.value }))}
                          style={inputQtyStyle}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {comb.quantity > 0
                          ? <span style={badgeInStock}>En stock</span>
                          : <span style={badgeOutOfStock}>Rupture</span>
                        }
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleSaveStock(comb.stockId)}
                          disabled={saving === comb.stockId}
                          style={btnSave}
                        >
                          {saving === comb.stockId ? '...' : '💾'}
                        </button>
                      </td>
                    </tr>
                  );
                });

                return rows;
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE CONFIRMATION DE SUPPRESSION */}
      {confirmDelete && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>⚠️ Confirmer la désactivation</h3>
            <p style={{ margin: '0 0 20px', color: '#555', fontSize: '14px' }}>
              Le produit <strong>#{confirmDelete}</strong> sera <strong>désactivé</strong> et son stock sera mis à <strong>0</strong>.
              Il ne sera plus visible dans le Frontoffice.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}
              >
                Annuler
              </button>
              <button
                onClick={() => handleDeleteProduct(confirmDelete)}
                disabled={saving}
                style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', background: '#ff4c4c', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                {saving ? 'En cours...' : 'Désactiver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- STYLES ---
const kpiStyle = {
  background: '#fff',
  padding: '16px 20px',
  borderRadius: '4px',
  border: '1px solid #e0e0e0',
  borderLeft: '4px solid #000',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
};

const kpiLabel = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#888'
};

const kpiValue = {
  fontSize: '28px',
  fontWeight: 800,
  color: '#000'
};

const thStyle = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#888'
};

const tdStyle = {
  padding: '10px 14px',
  fontSize: '13px',
  color: '#333',
  verticalAlign: 'middle'
};

const inputQtyStyle = {
  width: '70px',
  padding: '6px 8px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '13px',
  textAlign: 'center',
  outline: 'none'
};

const badgeInStock = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 600,
  background: '#e8f5e9',
  color: '#2e7d32'
};

const badgeOutOfStock = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 600,
  background: '#ffebee',
  color: '#c62828'
};

const btnSave = {
  padding: '6px 10px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '14px',
  transition: 'background 0.2s'
};

const btnDelete = {
  padding: '6px 10px',
  border: '1px solid #ffcdd2',
  borderRadius: '4px',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '14px',
  transition: 'background 0.2s'
};

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 999
};

const modalStyle = {
  background: '#fff',
  padding: '28px',
  borderRadius: '8px',
  maxWidth: '440px',
  width: '90%',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
};
