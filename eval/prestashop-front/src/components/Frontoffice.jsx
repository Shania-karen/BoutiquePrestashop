import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useNavigate } from 'react-router-dom';

import { fetchPrestaData, extractValue } from '../services/apiClient';
import { getProductImageUrl, fetchTaxRate, fetchProductReduction } from '../services/productservice';
import '../assets/css/Frontoffice.css';


export default function Frontoffice() {
  const { user, logout, isAuthenticated } = useAuth();
  const { addToCart, totalItems } = useCart();
  const navigate = useNavigate();

  const taxRateCacheRef = useRef(new Map());
  const reductionCacheRef = useRef(new Map());

  // Fallback image (data URI) to avoid network dependency + prevent console spam
  const buildFallbackSvgDataUri = (label, size) => {
    const safeLabel = (label || 'Image').toString().slice(0, 20);
    const svg = `\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">\n  <rect width="100%" height="100%" fill="#f2f2f2"/>\n  <rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="none" stroke="#cfcfcf"/>\n  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="16" fill="#777">${safeLabel}</text>\n</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };

  const FALLBACK_IMG_240 = buildFallbackSvgDataUri('No Image', 240);

  const [products, setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [stockMap, setStockMap]   = useState({}); // { productId: { main: qty, combinations: { paId: qty } } }
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [addedId, setAddedId]     = useState(null); // ID du dernier produit ajouté (feedback visuel)

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

  // ── Chargement des produits ──────────────────────────────────────────────
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        // Récupération des catégories
        try {
          const catData = await fetchPrestaData('categories', 0, 100);
          let catList = catData?.categories?.category || [];
          if (!Array.isArray(catList)) catList = catList ? [catList] : [];
          setCategories(catList);
        } catch (catErr) {
          console.warn("Erreur chargement catégories:", catErr);
        }

        // Récupération de 200 produits pour un filtrage local efficace
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

          // Try to use embedded specific price first, otherwise fetch.
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
            
            // Si c'est dans le futur ou sorti il y a moins d'1 jour
            if (diffDays <= 1) {
              productStatusBadge = 'HOT';
            } else if (diffDays <= 7) {
              productStatusBadge = 'NEW';
            }
          }

          return {
            ...product,
            __priceDisplay: {
              regularTTC,
              finalTTC,
              hasDiscount: reductionAmountHT > 0,
              discountLabel,
            },
            __statusBadge: productStatusBadge
          };
        };

        const enrichedList = await Promise.all(productList.map(enrichOne));
        setProducts(enrichedList);

        // Charger les stocks pour déterminer la disponibilité
        try {
          const allStockData = await fetchPrestaData('stock_availables', 0, 5000);
          let stocks = allStockData?.stock_availables?.stock_available || [];
          if (!Array.isArray(stocks)) stocks = stocks ? [stocks] : [];
          const sMap = {};
          stocks.forEach(s => {
            const pid = extractValue(s.id_product);
            const paId = extractValue(s.id_product_attribute);
            const qty = Number(extractValue(s.quantity)) || 0;
            if (!sMap[pid]) sMap[pid] = { main: 0, combinations: {} };
            if (!paId || paId === '0') {
              sMap[pid].main = qty;
            } else {
              sMap[pid].combinations[paId] = qty;
            }
          });
          setStockMap(sMap);
        } catch (stockErr) {
          console.warn('Erreur chargement stocks:', stockErr);
        }
        setError(null);
      } catch (err) {
        setError('Erreur lors du chargement des produits');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/frontoffice');
  };

  const redirectToLogin = () => {
    navigate(`/login?redirect=${encodeURIComponent('/frontoffice')}`);
  };

  // ── Ajout rapide au panier (depuis la carte — sans choix de déclinaison) ─
  // Si le produit a des déclinaisons, on redirige vers la fiche détaillée.
  const handleQuickAddToCart = (product) => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }

    const hasCombinations = !!product.associations?.combinations?.combination;

    if (hasCombinations) {
      // Produit avec options → aller sur la fiche pour choisir
      navigate(`/product/${extractValue(product.id) || product['@_id']}`);
      return;
    }

    const productId = extractValue(product.id) || product['@_id'];
    const name      = extractValue(product.name) || 'Sans nom';
    const price     = parseFloat(extractValue(product.price)) || 0;
    const image     = getProductImageSrc(product);

    addToCart({
      id:           productId,
      combinationId: '0',
      name,
      variantLabel:  '',
      price,
      image,
      stock:         99, // stock inconnu depuis la liste — limité à 99 par défaut
      quantity:      1,
    });

    // Feedback visuel temporaire sur la carte
    setAddedId(productId);
    setTimeout(() => setAddedId(null), 1800);
  };

  // ── URL image ────────────────────────────────────────────────────────────
  const getProductImageSrc = (product) => {
    try {
      const productId = extractValue(product.id) || product['@_id'];
      const images    = product.associations?.images?.image;
      if (images) {
        const imageArray = Array.isArray(images) ? images : [images];
        if (imageArray.length > 0) {
          const imageId = imageArray[0].id || imageArray[0];
          return getProductImageUrl(productId, imageId);
        }
      }
      return buildFallbackSvgDataUri(
        (extractValue(product.name) || 'Produit').substring(0, 15),
        240
      );
    } catch {
      return buildFallbackSvgDataUri('Image', 240);
    }
  };

  return (
    <div className="frontoffice-layout">

      {/* ── En-tête ──────────────────────────────────────────────────────── */}
      <header className="client-header">
        <div className="client-header-left">
          <h1>PrestaShop Boutique</h1>
        </div>
        <div className="client-header-right">
          {isAuthenticated ? (
            <div className="user-welcome">
              Bienvenue, <strong>{user?.firstname}</strong>
            </div>
          ) : (
            <div className="user-welcome">
              Bienvenue, <strong>Invité</strong>
            </div>
          )}

          {/* Bouton panier avec badge */}
          <button
            className="btn-cart-header"
            onClick={() => {
              if (!isAuthenticated) {
                navigate(`/login?redirect=${encodeURIComponent('/cart')}`);
                return;
              }
              navigate('/cart');
            }}
            title="Voir le panier"
          >
             Panier
            {totalItems > 0 && (
              <span className="cart-badge">{totalItems}</span>
            )}
          </button>
          <button
            className="btn-orders-header"
            onClick={() => {
              if (!isAuthenticated) {
                navigate(`/login?redirect=${encodeURIComponent('/mes-commandes')}`);
                return;
              }
              navigate('/mes-commandes');
            }}
            title="Voir mes commandes"
          >
          Commande 
          </button>

          {isAuthenticated ? (
            <button className="btn-logout-client" onClick={handleLogout}>
              Déconnexion
            </button>
          ) : (
            <button className="btn-logout-client" onClick={redirectToLogin}>
              Se connecter
            </button>
          )}
        </div>
      </header>

      {/* ── Contenu ──────────────────────────────────────────────────────── */}
      <div className="frontoffice-container">
        <main className="frontoffice-content">

          <div className="welcome-section">
            <h2>Bienvenue sur notre boutique</h2>
            {isAuthenticated ? (
              <p>Connecté en tant que : <strong>{user?.email}</strong></p>
            ) : (
              <p>Vous pouvez naviguer librement. Connectez-vous pour ajouter au panier et commander.</p>
            )}
            <p>Parcourez nos produits et ajoutez-les à votre panier pour passer commande.</p>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <section className="featured-products">
            <div className="catalog-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
              <h3>Catalogue des produits</h3>
              
              {/* Barre de Filtres */}
              <div className="filters-container">
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

            {loading ? (
              <div className="loading">Chargement des produits…</div>
            ) : (() => {
              // Logique de filtrage
              const filteredProducts = products.filter(product => {
                const nameMatch = extractValue(product.name).toLowerCase().includes(searchName.toLowerCase());
                const catMatch = searchCategory ? extractValue(product.id_category_default) === searchCategory : true;
                const priceTTC = product.__priceDisplay.finalTTC;
                const minMatch = searchMinPrice === '' || priceTTC >= Number(searchMinPrice);
                const maxMatch = searchMaxPrice === '' || priceTTC <= Number(searchMaxPrice);
                return nameMatch && catMatch && minMatch && maxMatch;
              });

              if (filteredProducts.length === 0) {
                return <div className="loading">Aucun produit ne correspond à vos critères de recherche.</div>;
              }

              // Application de la pagination
              const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
              const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

              return (
                <>
                  <div className="products-grid">
                    {paginatedProducts.map(product => {
                    const productId   = extractValue(product.id) || product['@_id'];
                    const productName = extractValue(product.name) || 'Sans nom';
                    const priceInfo = product.__priceDisplay;
                    const productImage = getProductImageSrc(product);
                    const hasOptions   = !!product.associations?.combinations?.combination;
                    const isJustAdded  = addedId === productId;

                    // Vérifier la disponibilité du stock
                    const pStock = stockMap[productId];
                    let isOutOfStock = false;
                    if (pStock) {
                      if (hasOptions) {
                        // Si toutes les déclinaisons sont ≤ 0 → rupture
                        const combQties = Object.values(pStock.combinations);
                        isOutOfStock = combQties.length > 0 && combQties.every(q => q <= 0);
                      } else {
                        isOutOfStock = pStock.main <= 0;
                      }
                    }

                    return (
                      <div key={productId} className="product-card">
                        <div
                          className="product-image-wrapper"
                          onClick={() => navigate(`/product/${productId}`)}
                          style={{ cursor: 'pointer', position: 'relative' }}
                        >
                          {product.__statusBadge && (
                            <span className={`product-status-badge ${product.__statusBadge.toLowerCase()}`}>
                              {product.__statusBadge}
                            </span>
                          )}
                          <img
                            src={productImage}
                            alt={productName}
                            className="product-image"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (img?.dataset?.fallbackApplied) return;
                              img.dataset.fallbackApplied = '1';
                              img.src = FALLBACK_IMG_240;
                            }}
                          />
                        </div>

                        <h4
                          onClick={() => navigate(`/product/${productId}`)}
                          style={{ cursor: 'pointer' }}
                        >
                          {productName}
                        </h4>

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
                        <div className="product-description" dangerouslySetInnerHTML={{ __html: extractValue(product.description_short) }} />

                        {/* Disponibilité : rupture si toutes les options sont en stock ≤ 0 */}
                        {isOutOfStock ? (
                          <p style={{
                            fontSize: '0.8rem', color: '#e53e3e', fontWeight: 700, margin: '0 0 6px',
                          }}>
                            Rupture de stock
                          </p>
                        ) : hasOptions ? (
                          <p className="product-has-options" style={{
                            fontSize: '0.75rem', color: '#666', margin: '0 0 6px',
                          }}>
                            Plusieurs options disponibles
                          </p>
                        ) : null}

                        <div className="product-buttons">
                          <button
                            className="btn-view-detail"
                            onClick={() => navigate(`/product/${productId}`)}
                          >
                            Voir détails
                          </button>
                          <button
                            className={`btn-add-cart${isJustAdded ? ' added' : ''}`}
                            onClick={() => handleQuickAddToCart(product)}
                          >
                            {isJustAdded
                              ? '✓ Ajouté'
                              : hasOptions
                                ? 'Choisir les options'
                                : 'Ajouter au panier'}
                          </button>
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