import React, { useState, useEffect, useRef, useMemo } from 'react';
import { fetchPrestaData, extractValue, deletePrestaItem } from '../services/apiClient';
import { getProductImageUrl, fetchTaxRate, fetchProductReduction } from '../services/productservice';
import { createProductPrestaShop, updateProductPrestaShop } from '../services/adminService';
import '../assets/css/Frontoffice.css'; // Utilisation du même CSS que le Frontoffice

export default function ProductList() {
  const taxRateCacheRef = useRef(new Map());
  const reductionCacheRef = useRef(new Map());

  // Image de repli (fallback)
  const buildFallbackSvgDataUri = (label, size) => {
    const safeLabel = (label || 'Image').toString().slice(0, 20);
    const svg = `\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">\n  <rect width="100%" height="100%" fill="#f2f2f2"/>\n  <rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="none" stroke="#cfcfcf"/>\n  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="16" fill="#777">${safeLabel}</text>\n</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };
  const FALLBACK_IMG_240 = buildFallbackSvgDataUri('No Image', 240);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // États du CRUD
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailStock, setDetailStock] = useState(null); // Stock du produit en détail
  const [formData, setFormData] = useState({ name: '', category: '', price: '', quantity: '10', description: '' });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // États des Filtres
  const [searchName, setSearchName] = useState('');
  const [searchCategory, setSearchCategory] = useState('');
  const [searchMinPrice, setSearchMinPrice] = useState('');
  const [searchMaxPrice, setSearchMaxPrice] = useState('');

  // États pour la pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Remettre la pagination à la page 1 si les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [searchName, searchCategory, searchMinPrice, searchMaxPrice]);

  // 1. Récupérer les produits depuis PrestaShop (comme dans Frontoffice)
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        // Catégories
        try {
          const catData = await fetchPrestaData('categories', 0, 100);
          let catList = catData?.categories?.category || [];
          if (!Array.isArray(catList)) catList = catList ? [catList] : [];
          setCategories(catList);
        } catch (e) {
          console.warn("Erreur chargement catégories:", e);
        }

        // Produits (limite à 200 pour pagination locale fluide)
        const data = await fetchPrestaData('products', 0, 200);
        let productList = data.products?.product || [];
        if (!Array.isArray(productList)) {
          productList = productList ? [productList] : [];
        }

        const enrichOne = async (product) => {
          const id = extractValue(product.id) || product['@_id'];
          const taxGroupId = extractValue(product.id_tax_rules_group);
          const taxCacheKey = String(taxGroupId || '0');
          let taxRate = taxRateCacheRef.current.get(taxCacheKey);
          if (taxRate === undefined) {
            taxRate = await fetchTaxRate(taxGroupId);
            taxRateCacheRef.current.set(taxCacheKey, taxRate);
          }

          let sp = product.associations?.specific_prices?.specific_price;
          if (sp) sp = Array.isArray(sp) ? sp[0] : sp;
          if (!sp && id) {
            if (reductionCacheRef.current.has(id)) {
              sp = reductionCacheRef.current.get(id);
            } else {
              sp = await fetchProductReduction(id);
              reductionCacheRef.current.set(id, sp);
            }
          }

          const baseHT = Number.parseFloat(extractValue(product.price)) || 0;
          let reductionAmountHT = 0;
          let discountLabel = '';

          if (sp) {
            const reduction = Number.parseFloat(extractValue(sp.reduction)) || 0;
            const type = extractValue(sp.reduction_type);
            if (type === 'percentage') {
              reductionAmountHT = baseHT * reduction;
              discountLabel = `-${Math.round(reduction * 100)}%`;
            } else if (type === 'amount') {
              reductionAmountHT = reduction;
              discountLabel = `-${reduction.toFixed(2)}€`;
            }
          }

          const finalHT = Math.max(0, baseHT - reductionAmountHT);
          const taxMultiplier = 1 + ((Number(taxRate) || 0) / 100);
          const regularTTC = baseHT * taxMultiplier;
          const finalTTC = finalHT * taxMultiplier;

          const dateAddStr = extractValue(product.date_add);
          const availableDateStr = extractValue(product.available_date);
          const releaseDateStr = (availableDateStr && availableDateStr !== '0000-00-00') ? availableDateStr : dateAddStr;
          
          let productStatusBadge = null;
          if (releaseDateStr) {
            const releaseDate = new Date(releaseDateStr);
            const now = new Date();
            const diffTime = now.getTime() - releaseDate.getTime();
            const diffDays = diffTime / (1000 * 3600 * 24);
            if (diffDays <= 1) productStatusBadge = 'HOT';
            else if (diffDays <= 7) productStatusBadge = 'NEW';
          }

          // Format unifié pour simplifier le composant CRUD
          return {
            id,
            name: extractValue(product.name) || 'Sans nom',
            id_category_default: extractValue(product.id_category_default),
            description_short: extractValue(product.description_short) || '',
            description: extractValue(product.description) || '',
            date_add: dateAddStr,
            available_date: availableDateStr,
            price: baseHT, // On garde le HT pour l'édition
            __priceDisplay: {
              regularTTC,
              finalTTC,
              hasDiscount: reductionAmountHT > 0,
              discountLabel,
            },
            __statusBadge: productStatusBadge,
            _raw: product // Objet brut nécessaire pour extraire les images
          };
        };

        const enrichedList = await Promise.all(productList.map(enrichOne));
        setProducts(enrichedList);
      } catch (err) {
        console.error("Erreur de récupération des produits :", err);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [refreshTrigger]);

  const getProductImageSrc = (product) => {
    if (product.localImage) return product.localImage; // Pour les produits ajoutés localement
    try {
      const raw = product._raw;
      if (!raw) return FALLBACK_IMG_240;
      const images = raw.associations?.images?.image;
      if (images) {
        const imageArray = Array.isArray(images) ? images : [images];
        if (imageArray.length > 0) {
          const imageId = imageArray[0].id || imageArray[0];
          return getProductImageUrl(product.id, imageId);
        }
      }
      return FALLBACK_IMG_240;
    } catch {
      return FALLBACK_IMG_240;
    }
  };

  // --- FONCTIONS CRUD LOCALES ---
  const handleAdd = () => {
    setIsEditing(false);
    setCurrentProduct(null);
    setDetailProduct(null);
    setShowForm(true);
    setFormData({ name: '', category: '', price: '', quantity: '10', description: '' });
  };

  const handleEdit = (product) => {
    setIsEditing(true);
    setCurrentProduct(product);
    setDetailProduct(null);
    setShowForm(true);
    setFormData({ 
      name: product.name, 
      category: product.id_category_default || '',
      price: product.price, 
      quantity: product.quantity || 10,
      description: product.description_short
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (window.confirm('Voulez-vous vraiment supprimer ce produit DÉFINITIVEMENT de PrestaShop ?')) {
      try {
        setIsSubmitting(true);
        await deletePrestaItem('products', id);
        setProducts(products.filter(p => p.id !== id));
        if (detailProduct && detailProduct.id === id) setDetailProduct(null);
      } catch (err) {
        alert("Erreur lors de la suppression : " + err.message);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setIsEditing(false);
    setCurrentProduct(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price) {
      alert('Veuillez remplir au moins le nom et le prix');
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (isEditing && currentProduct) {
        await updateProductPrestaShop(currentProduct.id, formData);
      } else {
        await createProductPrestaShop(formData);
      }
      
      // Recharge la liste depuis le serveur
      setRefreshTrigger(prev => prev + 1);
      handleCancelForm();
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- FILTRAGE DES PRODUITS ---
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const nameMatch = product.name.toLowerCase().includes(searchName.toLowerCase());
      const catMatch = searchCategory === '' || product.id_category_default == searchCategory;
      const priceTTC = product.__priceDisplay.finalTTC;
      const minMatch = searchMinPrice === '' || priceTTC >= Number(searchMinPrice);
      const maxMatch = searchMaxPrice === '' || priceTTC <= Number(searchMaxPrice);
      return nameMatch && catMatch && minMatch && maxMatch;
    });
  }, [products, searchName, searchCategory, searchMinPrice, searchMaxPrice]);


  // --- VUE DÉTAIL ---
  if (detailProduct) {
    const priceInfo = detailProduct.__priceDisplay;
    const productImage = getProductImageSrc(detailProduct);

    // Charger le stock du produit en détail
    const loadDetailStock = async () => {
      try {
        const stockData = await fetchPrestaData(`stock_availables?filter[id_product]=[${detailProduct.id}]&display=full`);
        let stocks = stockData?.stock_availables?.stock_available || [];
        if (!Array.isArray(stocks)) stocks = stocks ? [stocks] : [];

        // Charger les déclinaisons pour les noms
        const combsData = await fetchPrestaData(`combinations?filter[id_product]=[${detailProduct.id}]&display=full`);
        let combs = combsData?.combinations?.combination || [];
        if (!Array.isArray(combs)) combs = combs ? [combs] : [];

        const result = { main: null, combinations: [] };
        stocks.forEach(s => {
          const paId = extractValue(s.id_product_attribute);
          const qty = Number(extractValue(s.quantity)) || 0;
          if (!paId || paId === '0') {
            result.main = qty;
          } else {
            const comb = combs.find(c => (extractValue(c.id) === paId || c['@_id'] === paId));
            result.combinations.push({
              id: paId,
              ref: comb ? extractValue(comb.reference) : `Déclinaison #${paId}`,
              quantity: qty
            });
          }
        });
        setDetailStock(result);
      } catch (e) {
        console.warn('Erreur chargement stock détail:', e);
      }
    };

    // Déclencher le chargement à chaque changement de detailProduct
    if (!detailStock) loadDetailStock();
    
    return (
      <div style={{ padding: '20px' }}>
        <button 
          onClick={() => setDetailProduct(null)}
          style={{ marginBottom: '20px', padding: '8px 15px', background: '#ecf0f1', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: '#2c3e50' }}
        >
          ← Retour à la liste
        </button>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', background: '#fff', padding: '30px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ flex: '1 1 300px', maxWidth: '400px' }}>
             <img src={productImage} alt={detailProduct.name} style={{ width: '100%', borderRadius: '8px', border: '1px solid #f1f5f9' }} />
             {detailProduct.__statusBadge && (
               <div style={{ marginTop: '10px', display: 'inline-block', padding: '5px 10px', background: '#e74c3c', color: 'white', fontWeight: 'bold', borderRadius: '3px', fontSize: '12px' }}>
                 {detailProduct.__statusBadge}
               </div>
             )}
          </div>
          <div style={{ flex: '2 1 400px' }}>
            <h2 style={{ fontSize: '32px', marginTop: 0, marginBottom: '10px', color: '#1e293b' }}>{detailProduct.name}</h2>
            
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{priceInfo.finalTTC.toFixed(2)} €</span>
              {priceInfo.hasDiscount && (
                <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{priceInfo.regularTTC.toFixed(2)} €</span>
              )}
            </div>

            <div style={{ marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#475569' }}><strong style={{ color: '#0f172a' }}>Date d'ajout :</strong> {detailProduct.date_add || 'N/A'}</p>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#475569' }}><strong style={{ color: '#0f172a' }}>Date de disponibilité :</strong> {detailProduct.available_date === '0000-00-00' ? 'N/A' : detailProduct.available_date || 'N/A'}</p>
              <p style={{ margin: '0', fontSize: '14px', color: '#475569' }}><strong style={{ color: '#0f172a' }}>Catégorie ID :</strong> {detailProduct.id_category_default || 'N/A'}</p>
            </div>

            {/* SECTION STOCK */}
            <div style={{ marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '15px' }}>📦 Stock disponible</h4>
              {!detailStock ? (
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>Chargement du stock...</p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>Stock principal :</span>
                    <span style={{
                      fontWeight: 700,
                      fontSize: '14px',
                      color: detailStock.main > 0 ? '#16a34a' : '#dc2626'
                    }}>
                      {detailStock.main} {detailStock.main > 0 ? '✅' : '❌ Rupture'}
                    </span>
                  </div>
                  {detailStock.combinations.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Déclinaisons :</span>
                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {detailStock.combinations.map(c => (
                          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                            <span style={{ color: '#334155' }}>{c.ref}</span>
                            <span style={{ fontWeight: 600, color: c.quantity > 0 ? '#16a34a' : '#dc2626' }}>
                              {c.quantity} {c.quantity > 0 ? 'en stock' : 'rupture'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', color: '#0f172a' }}>Description</h3>
              <div style={{ color: '#475569', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: detailProduct.description || detailProduct.description_short || 'Aucune description disponible.' }} />
            </div>

            <div style={{ display: 'flex', gap: '15px' }}>
              <button onClick={() => handleEdit(detailProduct)} style={{ padding: '10px 20px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Modifier le produit</button>
              <button onClick={() => handleDelete(detailProduct.id)} style={{ padding: '10px 20px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Supprimer</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      
      {/* HEADER CRUD */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', margin: 0, color: '#333' }}>Gestion des Produits</h2>
        <button 
          onClick={handleAdd}
          style={{ background: '#24b9d7', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          + Ajouter un produit
        </button>
      </div>

      {/* FORMULAIRE CRUD */}
      {showForm && (
        <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #ddd' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>{isEditing ? 'Modifier' : 'Nouveau'} Produit</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 200px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#555' }}>Nom</label>
              <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 150px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#555' }}>Catégorie</label>
              <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                <option value="">Sélectionner</option>
                {categories.map(cat => (
                  <option key={extractValue(cat.id) || cat['@_id']} value={extractValue(cat.id) || cat['@_id']}>{extractValue(cat.name)}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: '0 1 100px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#555' }}>Prix HT (€)</label>
              <input type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: '0 1 80px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#555' }}>Quantité</label>
              <input type="number" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 200px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#555' }}>Description courte</label>
              <input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={handleCancelForm} disabled={isSubmitting} style={{ padding: '8px 15px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', color: '#333' }}>Annuler</button>
              <button type="submit" disabled={isSubmitting} style={{ padding: '8px 15px', border: 'none', background: isSubmitting ? '#95a5a6' : '#24b9d7', color: 'white', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SECTION FILTRES ET GRILLE DE PRODUITS (Identique au Frontoffice) */}
      <div className="frontoffice-container" style={{ margin: 0, padding: 0, maxWidth: 'none', background: 'transparent' }}>
        <main className="frontoffice-content" style={{ padding: 0 }}>
          <section className="featured-products" style={{ margin: 0, padding: 0 }}>
            <div className="catalog-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Catalogue des produits</h3>
              
              {/* Barre de Filtres */}
              <div className="filters-container" style={{ margin: 0 }}>
                <input 
                  type="text" 
                  placeholder="Rechercher un produit..." 
                  value={searchName} 
                  onChange={(e) => setSearchName(e.target.value)} 
                  className="filter-input"
                />
                <select 
                  value={searchCategory} 
                  onChange={(e) => setSearchCategory(e.target.value)} 
                  className="filter-select"
                >
                  <option value="">Toutes les catégories</option>
                  {categories.map(cat => (
                    <option key={extractValue(cat.id) || cat['@_id']} value={extractValue(cat.id) || cat['@_id']}>
                      {extractValue(cat.name)}
                    </option>
                  ))}
                </select>
                <div className="price-filters">
                  <input 
                    type="number" 
                    placeholder="Prix min" 
                    value={searchMinPrice} 
                    onChange={(e) => setSearchMinPrice(e.target.value)} 
                    className="filter-input price-input"
                  />
                  <span>-</span>
                  <input 
                    type="number" 
                    placeholder="Prix max" 
                    value={searchMaxPrice} 
                    onChange={(e) => setSearchMaxPrice(e.target.value)} 
                    className="filter-input price-input"
                  />
                </div>
              </div>
            </div>

            {/* Affichage des produits */}
            {loading ? (
              <div className="loading">Chargement des produits depuis PrestaShop…</div>
            ) : filteredProducts.length === 0 ? (
              <div className="loading">Aucun produit ne correspond à vos critères de recherche.</div>
            ) : (() => {
              const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
              const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

              return (
                <>
                  <div className="products-grid">
                    {paginatedProducts.map(product => {
                      const priceInfo = product.__priceDisplay;
                      const productImage = getProductImageSrc(product);

                      return (
                        <div key={product.id} className="product-card">
                          <div className="product-image-wrapper">
                            {product.__statusBadge && (
                              <span className={`product-status-badge ${product.__statusBadge.toLowerCase()}`}>
                                {product.__statusBadge}
                              </span>
                            )}
                            <img
                              src={productImage}
                              alt={product.name}
                              className="product-image"
                              onError={(e) => {
                                if (e.currentTarget.dataset.fallbackApplied) return;
                                e.currentTarget.dataset.fallbackApplied = '1';
                                e.currentTarget.src = FALLBACK_IMG_240;
                              }}
                            />
                          </div>

                          <h4>{product.name}</h4>

                          <div className="product-price-block">
                            {priceInfo?.hasDiscount && (
                              <div className="product-price-discount-row">
                                <span className="product-price-regular">{priceInfo.regularTTC.toFixed(2)} €</span>
                                <span className="product-price-badge">ÉCONOMISEZ {priceInfo.discountLabel}</span>
                              </div>
                            )}
                            <div className="product-price-current">
                              <span className="product-price-ttc">{(priceInfo?.finalTTC ?? 0).toFixed(2)} €</span>
                              <span className="product-price-tax">TTC</span>
                            </div>
                          </div>
                          
                          <div className="product-description" dangerouslySetInnerHTML={{ __html: product.description_short }} />

                          {/* Boutons d'options CRUD au lieu du panier */}
                          <div className="product-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 0' }}>
                            <button
                              onClick={() => { setDetailStock(null); setDetailProduct(product); }}
                              style={{ 
                                width: '100%', 
                                padding: '8px', 
                                border: '1px solid #e2e8f0', 
                                borderRadius: '4px', 
                                background: '#f8fafc', 
                                color: '#334155', 
                                fontWeight: 'bold', 
                                cursor: 'pointer' 
                              }}
                            >
                              Détails complets
                            </button>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleEdit(product)}
                                style={{ 
                                  flex: 1, 
                                  padding: '8px', 
                                  border: 'none', 
                                  borderRadius: '4px', 
                                  background: '#f39c12', 
                                  color: 'white', 
                                  fontWeight: 'bold', 
                                  cursor: 'pointer' 
                                }}
                              >
                                Modifier
                              </button>
                              <button
                                onClick={() => handleDelete(product.id)}
                                style={{ 
                                  flex: 1, 
                                  padding: '8px', 
                                  border: 'none', 
                                  borderRadius: '4px', 
                                  background: '#e74c3c', 
                                  color: 'white', 
                                  fontWeight: 'bold', 
                                  cursor: 'pointer' 
                                }}
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Composant de pagination */}
                  {totalPages > 1 && (
                    <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '40px', marginBottom: '20px' }}>
                      <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                        disabled={currentPage === 1}
                        style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: '6px', background: currentPage === 1 ? '#f3f4f6' : 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', color: currentPage === 1 ? '#9ca3af' : '#374151', fontWeight: '500' }}
                      >
                        Précédent
                      </button>
                      <span style={{ fontWeight: 'bold', color: '#4b5563' }}>Page {currentPage} sur {totalPages}</span>
                      <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                        disabled={currentPage === totalPages}
                        style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: '6px', background: currentPage === totalPages ? '#f3f4f6' : 'white', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', color: currentPage === totalPages ? '#9ca3af' : '#374151', fontWeight: '500' }}
                      >
                        Suivant
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        </main>
      </div>
    </div>
  );
}