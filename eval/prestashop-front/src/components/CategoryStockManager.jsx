import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPrestaData, extractValue, updatePrestaData, BASE_URL, API_KEY } from '../services/apiClient';

/**
 * Composant de gestion des stocks par catégorie pour le Backoffice.
 * Permet de modifier le stock de tous les produits d'une catégorie.
 */
export default function CategoryStockManager({ onClose }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [stockAvailables, setStockAvailables] = useState([]);
  const [combinationsData, setCombinationsData] = useState([]);
  const [optionValuesData, setOptionValuesData] = useState([]);
  const [loading, setLoading] = useState(true);

  // map for edit values: category ID -> delta (+3, -2, etc)
  const [deltaValues, setDeltaValues] = useState({});
  const [saving, setSaving] = useState(null); // category ID being saved
  const [notification, setNotification] = useState(null);
  const [report, setReport] = useState(null); // Stock adjustment report
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      // 1. Fetch categories
      const categoriesData = await fetchPrestaData('categories?display=full', 0, 500);
      let catsList = categoriesData?.categories?.category || [];
      if (!Array.isArray(catsList)) catsList = catsList ? [catsList] : [];

      // 2. Fetch products
      const prodsData = await fetchPrestaData('products?display=full', 0, 1000);
      let prodsList = prodsData?.products?.product || [];
      if (!Array.isArray(prodsList)) prodsList = prodsList ? [prodsList] : [];

      // 3. Fetch stock availables
      const stockData = await fetchPrestaData('stock_availables', 0, 5000);
      let stocksList = stockData?.stock_availables?.stock_available || [];
      if (!Array.isArray(stocksList)) stocksList = stocksList ? [stocksList] : [];

      // 4. Fetch combinations and option values for naming
      const combsData = await fetchPrestaData('combinations?display=full', 0, 5000);
      let combsList = combsData?.combinations?.combination || [];
      if (!Array.isArray(combsList)) combsList = combsList ? [combsList] : [];

      const optsData = await fetchPrestaData('product_option_values?display=full', 0, 5000);
      let optsList = optsData?.product_option_values?.product_option_value || [];
      if (!Array.isArray(optsList)) optsList = optsList ? [optsList] : [];

      setCategories(catsList);
      setProducts(prodsList);
      setStockAvailables(stocksList);
      setCombinationsData(combsList);
      setOptionValuesData(optsList);
    } catch (error) {
      console.error("Erreur chargement:", error);
      showNotification(`Erreur chargement : ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleApplyDelta = async (categoryId) => {
    const delta = parseInt(deltaValues[categoryId] || 0, 10);
    if (isNaN(delta) || delta === 0) {
      showNotification("Veuillez entrer une valeur d'ajustement valide (ex: 3 ou -2).", "error");
      return;
    }

    try {
      setSaving(categoryId);

      // Trouver tous les produits de cette catégorie
      const categoryProducts = products.filter(p => {
        const idCatDefault = extractValue(p.id_category_default);
        if (idCatDefault === String(categoryId)) return true;

        if (p.associations && p.associations.categories && p.associations.categories.category) {
          let cats = p.associations.categories.category;
          if (!Array.isArray(cats)) cats = [cats];
          return cats.some(c => extractValue(c.id) === String(categoryId));
        }
        return false;
      });

      if (categoryProducts.length === 0) {
        showNotification("Aucun produit trouvé dans cette catégorie.", "error");
        setSaving(null);
        return;
      }

      const productIds = categoryProducts.map(p => extractValue(p.id));

      // Identifier les produits qui ont des déclinaisons (id_product_attribute != 0)
      const hasCombinationsMap = {};
      stockAvailables.forEach(s => {
        if (extractValue(s.id_product_attribute) !== '0') {
          hasCombinationsMap[extractValue(s.id_product)] = true;
        }
      });

      // Trouver tous les stock_availables pour ces produits
      // Si un produit a des déclinaisons, on modifie uniquement les déclinaisons (PrestaShop recalculera le total)
      const stocksToUpdate = stockAvailables.filter(s => {
        const pid = extractValue(s.id_product);
        if (!productIds.includes(pid)) return false;
        if (hasCombinationsMap[pid] && extractValue(s.id_product_attribute) === '0') {
          return false; // Ignorer le stock principal si le produit a des déclinaisons
        }
        return true;
      });

      // Logique d'ajustement PAR PRODUIT : on applique le delta à CHAQUE produit.
      // Si un produit a des déclinaisons, on RÉPARTIT ce delta entre ses déclinaisons.
      let realisedTotal = 0;
      let nonRealisedTotal = 0;
      const details = [];
      let updatedCount = 0;

      // Grouper les stocks par id_product
      const productStocks = {};
      stocksToUpdate.forEach(stock => {
         const pid = extractValue(stock.id_product);
         if (!productStocks[pid]) productStocks[pid] = [];
         productStocks[pid].push({
            stockId: extractValue(stock.id),
            pid: pid,
            attrId: extractValue(stock.id_product_attribute),
            currentQty: parseInt(extractValue(stock.quantity) || 0, 10)
         });
      });

      for (const pid of Object.keys(productStocks)) {
         const items = productStocks[pid];
         
         if (delta > 0) {
            // Répartir l'ajout équitablement sur les déclinaisons
            const baseAdd = Math.floor(delta / items.length);
            let remainder = delta % items.length;
            
            for (const item of items) {
               let addAmount = baseAdd;
               if (remainder > 0) { addAmount++; remainder--; }
               item.newQty = item.currentQty + addAmount;
               item.realised = addAmount;
               item.nonRealised = 0;
               item.deltaApplied = addAmount;
            }
         } else if (delta < 0) {
            // Répartir la soustraction sur les déclinaisons ayant le plus de stock
            let remainingToRemove = Math.abs(delta);
            items.sort((a, b) => b.currentQty - a.currentQty);
            
            for (const item of items) {
               const canRemove = Math.min(item.currentQty, remainingToRemove);
               item.newQty = item.currentQty - canRemove;
               item.realised = canRemove;
               item.deltaApplied = -canRemove;
               item.nonRealised = 0;
               remainingToRemove -= canRemove;
            }
            if (remainingToRemove > 0 && items.length > 0) {
               items[0].nonRealised = remainingToRemove;
            }
         }

         for (const item of items) {
            realisedTotal += item.realised;
            nonRealisedTotal += item.nonRealised;

            // Fetch XML and update
            const response = await fetch(`${BASE_URL}/stock_availables/${item.stockId}?ws_key=${API_KEY}`);
            let xmlStock = await response.text();
            
            xmlStock = xmlStock.replace(/<quantity><!\[CDATA\[.*?\]\]><\/quantity>/, `<quantity><![CDATA[${item.newQty}]]></quantity>`);
            if (!xmlStock.includes(`<![CDATA[${item.newQty}]]>`)) {
              xmlStock = xmlStock.replace(/<quantity>.*?<\/quantity>/, `<quantity><![CDATA[${item.newQty}]]></quantity>`);
            }
            
            await updatePrestaData('stock_availables', item.stockId, xmlStock);
            updatedCount++;

            // Fetch product name for details
            const prod = products.find(p => extractValue(p.id) === item.pid);
            let pName = 'Produit inconnu';
            if (prod && prod.name) {
              if (prod.name.language) {
                const langObj = Array.isArray(prod.name.language)
                  ? prod.name.language.find(l => extractValue(l['@_id']) === '1') || prod.name.language[0]
                  : prod.name.language;
                pName = extractValue(langObj) || 'Produit inconnu';
              } else {
                 pName = extractValue(prod.name) || 'Produit inconnu';
              }
            }

            // Add combination name if applicable
            let combinationName = '';
            if (item.attrId && item.attrId !== '0') {
               const comb = combinationsData.find(c => extractValue(c.id) === item.attrId && extractValue(c.id_product) === item.pid);
               if (comb && comb?.associations?.product_option_values?.product_option_value) {
                  let optionValues = comb.associations.product_option_values.product_option_value;
                  if (!Array.isArray(optionValues)) optionValues = [optionValues];
                  
                  const names = [];
                  for (const ov of optionValues) {
                     const ovId = extractValue(ov.id);
                     const ovData = optionValuesData.find(o => extractValue(o.id) === ovId);
                     if (ovData && ovData.name) {
                        const langObj = Array.isArray(ovData.name.language) 
                             ? ovData.name.language.find(l => extractValue(l['@_id']) === '1') || ovData.name.language[0]
                             : ovData.name.language;
                        names.push(extractValue(langObj));
                     }
                  }
                  if (names.length > 0) {
                     combinationName = names.join(', ');
                  } else {
                     combinationName = `Déclinaison #${item.attrId}`;
                  }
               } else {
                  combinationName = `Déclinaison #${item.attrId}`;
               }
            }

            if (combinationName) {
               pName = `${pName} (${combinationName})`;
            }
            
            details.push({
               productName: pName,
               stockId: item.stockId,
               currentQty: item.currentQty,
               delta: item.deltaApplied,
               newQty: item.newQty,
               realised: item.realised,
               nonRealised: item.nonRealised
            });
         }

         // Synchroniser le stock parent (id_product_attribute = '0') si ce produit a des déclinaisons.
         // PrestaShop WebService ne met pas toujours à jour le parent automatiquement !
         if (hasCombinationsMap[pid]) {
             const parentStock = stockAvailables.find(s => extractValue(s.id_product) === pid && extractValue(s.id_product_attribute) === '0');
             if (parentStock) {
                 const parentStockId = extractValue(parentStock.id);
                 const currentParentQty = parseInt(extractValue(parentStock.quantity) || 0, 10);
                 
                 let productTotalChange = 0;
                 for (const item of items) {
                     productTotalChange += item.deltaApplied;
                 }
                 
                 const newParentQty = currentParentQty + productTotalChange;
                 
                 const response = await fetch(`${BASE_URL}/stock_availables/${parentStockId}?ws_key=${API_KEY}`);
                 let xmlStock = await response.text();
                 xmlStock = xmlStock.replace(/<quantity><!\[CDATA\[.*?\]\]><\/quantity>/, `<quantity><![CDATA[${newParentQty}]]></quantity>`);
                 if (!xmlStock.includes(`<![CDATA[${newParentQty}]]>`)) {
                   xmlStock = xmlStock.replace(/<quantity>.*?<\/quantity>/, `<quantity><![CDATA[${newParentQty}]]></quantity>`);
                 }
                 await updatePrestaData('stock_availables', parentStockId, xmlStock);
             }
         }
      }

      if (updatedCount === 0) {
        showNotification("Aucun stock n'a pu être mis à jour (produits sans gestion de stock ?).", "error");
      } else {
        const action = delta > 0 ? `augmenté de ${Math.abs(delta)}` : `réduit de ${Math.abs(delta)}`;
        showNotification(`Succès : Le stock de CHAQUE produit a été ${action}.`);

        const catNameObj = categories.find(c => extractValue(c.id) === String(categoryId));
        let categoryNameStr = String(categoryId);
        if (catNameObj && catNameObj.name) {
          categoryNameStr = extractValue(catNameObj.name) || categoryNameStr;
        }

        const numProducts = Object.keys(productStocks).length;

        setReport({
          categoryName: categoryNameStr,
          deltaRequested: delta,
          numProducts: numProducts,
          globalDeltaRequested: Math.abs(delta * numProducts),
          realisedTotal,
          nonRealisedTotal,
          details
        });
      }

      // Réinitialiser l'input et recharger
      setDeltaValues(prev => ({ ...prev, [categoryId]: '' }));
      await loadData();
    } catch (error) {
      console.error("Erreur mise à jour :", error);
      showNotification(`Erreur mise à jour : ${error.message}`, 'error');
    } finally {
      setSaving(null);
    }
  };

  // Préparer la liste des catégories uniques avec le nombre de produits
  const categoriesList = [];
  const seenIds = new Set();

  categories.forEach(cat => {
    const id = extractValue(cat.id);
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);

    let name = extractValue(cat.name) || 'Inconnu';

    const prodCount = products.filter(p => {
      const idCatDefault = extractValue(p.id_category_default);
      if (idCatDefault === String(id)) return true;
      if (p.associations?.categories?.category) {
        let cats = p.associations.categories.category;
        if (!Array.isArray(cats)) cats = [cats];
        return cats.some(c => extractValue(c.id) === String(id));
      }
      return false;
    }).length;

    // Optionnel: Ne garder que les catégories qui ont des produits pour nettoyer l'affichage
    if (prodCount > 0) {
      categoriesList.push({ id, name, prodCount });
    }
  });

  // Filtrer les catégories
  const displayedCategories = categoriesList.filter(cat => {
    const term = searchTerm.toLowerCase();
    return cat.name.toLowerCase().includes(term) || cat.id.includes(term);
  });

  if (loading && categories.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
        Chargement des catégories et des stocks...
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
          <button
            onClick={() => {
              if (onClose) onClose();
              else navigate('/frontoffice');
            }}
            style={{ marginBottom: '15px', padding: '6px 12px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
          >
            ← Retour à la boutique
          </button>
          <h2 style={{ margin: 0, color: '#000', fontSize: '20px' }}>Gestion des Stocks par Catégorie</h2>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: '13px' }}>
            Ajustez le stock de <strong>chaque produit</strong> d'une catégorie simultanément (Ex: +5 ajoutera 5 au stock de tous les produits).
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

      {/* BARRE DE RECHERCHE */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="🔍 Rechercher par nom de catégorie ou ID..."
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

      {/* TABLEAU DES CATÉGORIES */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '2px solid #e0e0e0' }}>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Catégorie</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Produits rattachés</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Ajustement par produit (+ / -)</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedCategories.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                  Aucune catégorie trouvée.
                </td>
              </tr>
            ) : (
              displayedCategories.map(cat => (
                <tr key={cat.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={tdStyle}>{cat.id}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{cat.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>
                    {cat.prodCount}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="number"
                      placeholder="Ex: 5 ou -2"
                      value={deltaValues[cat.id] ?? ''}
                      onChange={e => setDeltaValues(prev => ({ ...prev, [cat.id]: e.target.value }))}
                      style={inputQtyStyle}
                      disabled={cat.prodCount === 0}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={() => handleApplyDelta(cat.id)}
                      disabled={saving === cat.id || cat.prodCount === 0 || !deltaValues[cat.id]}
                      style={{
                        ...btnSave,
                        opacity: (cat.prodCount === 0 || !deltaValues[cat.id]) ? 0.5 : 1,
                        cursor: (cat.prodCount === 0 || !deltaValues[cat.id]) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {saving === cat.id ? 'Mise à jour...' : 'Appliquer l\'ajustement'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* RAPPORT DE MISE À JOUR */}
      {report && (
        <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '18px', color: '#333' }}>
            Rapport d'Ajustement : <span style={{ color: '#000' }}>{report.categoryName}</span>
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#555' }}>
            Vous avez demandé un ajustement de <strong>{report.deltaRequested > 0 ? `+${report.deltaRequested}` : report.deltaRequested}</strong> sur chacun des <strong>{report.numProducts}</strong> produits de cette catégorie.<br/>
            Soit un ajustement <strong>GLOBAL</strong> attendu de <strong>{report.deltaRequested > 0 ? '+' : '-'}{report.globalDeltaRequested}</strong> unités au total.
          </p>

          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#333' }}>Détails par produit :</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#fff' }}>
            <thead>
              <tr style={{ background: '#eee', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', color: '#555' }}>Produit (Stock ID)</th>
                <th style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#555' }}>Stock Initial</th>
                <th style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#555' }}>Ajustement Réparti</th>
                <th style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#555' }}>Nouveau Stock</th>
                <th style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#2e7d32' }}>Réalisé</th>
                <th style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#c62828' }}>Non-Réalisé</th>
              </tr>
            </thead>
            <tbody>
              {report.details.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px', color: '#333', fontWeight: '500' }}>
                    {d.productName} <span style={{ color: '#888', fontSize: '11px' }}>(#{d.stockId})</span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>{d.currentQty}</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>{d.delta > 0 ? `+${d.delta}` : d.delta}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>{d.newQty}</td>
                  <td style={{ padding: '10px', textAlign: 'center', color: '#2e7d32', fontWeight: 'bold' }}>{d.realised}</td>
                  <td style={{ padding: '10px', textAlign: 'center', color: '#c62828', fontWeight: 'bold' }}>{d.nonRealised}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f5f5f5', borderTop: '2px solid #ccc' }}>
                <td colSpan="4" style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>
                  TOTAL GÉNÉRAL ({report.realisedTotal + report.nonRealisedTotal}) :
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center', color: '#1b5e20', fontWeight: 'bold', fontSize: '16px' }}>
                  {report.realisedTotal}
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center', color: '#b71c1c', fontWeight: 'bold', fontSize: '16px' }}>
                  {report.nonRealisedTotal}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// --- STYLES ---
const thStyle = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle = {
  padding: '10px 14px',
  fontSize: '13px',
  color: '#333',
  verticalAlign: 'middle'
};


const inputQtyStyle = {
  width: '100px',
  padding: '8px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '13px',
  textAlign: 'center',
  outline: 'none'
};

const btnSave = {
  padding: '8px 16px',
  border: '1px solid #000',
  borderRadius: '4px',
  background: '#000',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  transition: 'opacity 0.2s'
};
