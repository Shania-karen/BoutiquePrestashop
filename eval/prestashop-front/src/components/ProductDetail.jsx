import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { fetchPrestaData, extractValue } from '../services/apiClient';
import { 
    fetchAttributeGroups, 
    fetchAttributeValues, 
    fetchStockAvailable, 
    getProductImageUrl, 
    fetchProductCombinations,
    fetchTaxRate,
    fetchProductReduction
} from '../services/productservice';
import '../assets/css/ProductDetail.css';

export default function ProductDetail() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [taxRate, setTaxRate] = useState(0);
  const [baseStock, setBaseStock] = useState(null);
  const [combinations, setCombinations] = useState([]);
  const [attrGroups, setAttrGroups] = useState({});
  const [selectedAttrs, setSelectedAttrs] = useState({});
  const [selectedCombination, setSelectedCombination] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [ specificPrice, setSpecificPrice ] = useState(null);

    useEffect(() => {
    if (!productId) return;
    
    const loadProduct = async () => {
      try {
        setLoading(true);
        const data = await fetchPrestaData(`products/${productId}`);
        const currentProduct = data.product;
        setProduct(currentProduct);

        // Récupération de la taxe
        const idTaxGroup = extractValue(currentProduct.id_tax_rules_group);
        const rate = await fetchTaxRate(idTaxGroup);
        setTaxRate(rate);

        // 3. NOUVEAU : Récupération indépendante de la réduction
        const reductionData = await fetchProductReduction(productId);
        setSpecificPrice(reductionData);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [productId]);

  const handleAttrSelect = useCallback((groupId, valueId) => {
    const nextSelected = { ...selectedAttrs, [groupId]: valueId };
    setSelectedAttrs(nextSelected);

    const matched = combinations.find((combo) =>
      Object.entries(nextSelected).every(([gId, vId]) =>
        combo.attributes.some((a) => String(a.groupId) === String(gId) && String(a.valueId) === String(vId))
      )
    );

    setSelectedCombination(matched || null);
    setQuantity(1);
  }, [selectedAttrs, combinations]);


  // Chargement des déclinaisons et du stock (Logique identique à ton fichier initial)
  useEffect(() => {
    if (!product) return;
    const loadDetails = async () => {
        try {
            const combAssoc = product.associations?.combinations?.combination;
            if (!combAssoc) {
                const stock = await fetchStockAvailable(productId, 0);
                setBaseStock(stock);
                return;
            }
            const [rawCombos, allAttrValues, allAttrGroupsArr] = await Promise.all([
                fetchProductCombinations(productId),
                fetchAttributeValues(),
                fetchAttributeGroups(),
            ]);

            const attrValueMap = {};
            allAttrValues.forEach(av => {
                attrValueMap[extractValue(av.id)] = { name: extractValue(av.name), groupId: extractValue(av.id_attribute_group) };
            });

            const attrGroupMap = {};
            allAttrGroupsArr.forEach(ag => {
                attrGroupMap[extractValue(ag.id)] = extractValue(ag.public_name) || extractValue(ag.name);
            });

            const enriched = await Promise.all(rawCombos.map(async (combo) => {
                const comboId = extractValue(combo.id);
                const povRaw = combo.associations?.product_option_values?.product_option_value;
                const povs = Array.isArray(povRaw) ? povRaw : [povRaw];
                const attributes = povs.filter(Boolean).map(pov => ({
                    groupId: attrValueMap[pov.id || pov]?.groupId || '',
                    groupName: attrGroupMap[attrValueMap[pov.id || pov]?.groupId] || 'Option',
                    valueId: pov.id || pov,
                    valueName: attrValueMap[pov.id || pov]?.name || '?',
                }));
                const qty = await fetchStockAvailable(productId, comboId);
                return { id: comboId, attributes, priceImpact: parseFloat(extractValue(combo.price)) || 0, quantity: qty, isDefault: extractValue(combo.default_on) === '1' };
            }));

            // --- FUSION DES GROUPES DUPLIQUÉS PAR NOM ---
            // Si l'import a créé plusieurs groupes "taille" (id 5, 6, 7...), on les fusionne
            // en un seul groupe logique identifié par le nom.
            const nameToCanonicalId = {}; // groupName -> premier groupId rencontré
            const groupIdRemap = {};      // groupId original -> groupId canonique

            enriched.forEach(c => c.attributes.forEach(a => {
                const gName = (a.groupName || '').toLowerCase();
                if (!nameToCanonicalId[gName]) {
                    nameToCanonicalId[gName] = a.groupId; // premier ID = canonique
                }
                groupIdRemap[a.groupId] = nameToCanonicalId[gName];
            }));

            // Réécrire les groupId dans chaque attribut de chaque combinaison
            enriched.forEach(c => {
                c.attributes = c.attributes.map(a => ({
                    ...a,
                    groupId: groupIdRemap[a.groupId] || a.groupId
                }));
            });

            setCombinations(enriched);
            const groups = {};
            enriched.forEach(c => c.attributes.forEach(a => {
                if (!groups[a.groupId]) groups[a.groupId] = { name: a.groupName, values: new Map() };
                groups[a.groupId].values.set(a.valueId, a.valueName);
            }));
            setAttrGroups(groups);

            const def = enriched.find(c => c.isDefault) || enriched[0];
            if (def) {
                const init = {}; def.attributes.forEach(a => init[a.groupId] = a.valueId);
                setSelectedAttrs(init);
                setSelectedCombination(def);
            }
        } catch (e) { console.error(e); }
    };
    loadDetails();
  }, [product, productId]);

  // ── CALCUL DES PRIX & RÉDUCTIONS ──
  const priceDisplay = useMemo(() => {
    if (!product) return null;
    
    const baseHT = parseFloat(extractValue(product.price)) || 0;
    const impactHT = selectedCombination?.priceImpact || 0;
    const totalBaseHT = baseHT + impactHT;
    
    let reductionAmountHT = 0;
    let discountLabel = "";

    // On utilise maintenant notre état specificPrice récupéré via l'API dédiée
    if (specificPrice) {
      const reduction = parseFloat(extractValue(specificPrice.reduction)) || 0;
      const type = extractValue(specificPrice.reduction_type);

      if (type === 'percentage' && reduction > 0) {
        reductionAmountHT = totalBaseHT * reduction;
        // L'API renvoie souvent 0.20 pour 20%, on multiplie par 100
        discountLabel = `-${Math.round(reduction * 100)}%`;
      } else if (type === 'amount' && reduction > 0) {
        reductionAmountHT = reduction; 
        discountLabel = `-${reduction.toFixed(2)}€`;
      }
    }

    const finalHT = totalBaseHT - reductionAmountHT;
    const taxMultiplier = 1 + (taxRate / 100);

    return {
      regularPriceTTC: totalBaseHT * taxMultiplier,
      finalPriceTTC: finalHT * taxMultiplier,
      finalPriceHT: finalHT,
      hasDiscount: reductionAmountHT > 0,
      discountLabel
    };
  }, [product, selectedCombination, taxRate, specificPrice]);

  if (loading || !product) return <div className="ps-loading">Chargement...</div>;

  const displayStock = combinations.length > 0 ? (selectedCombination?.quantity || 0) : baseStock;

  return (
    <div className="ps-product-container">
      <nav className="ps-breadcrumb">
        <span onClick={() => navigate('/frontoffice')}>Accueil</span> / {extractValue(product.name)}
      </nav>

      <div className="ps-product-main">
        {/* Section Gauche : Image */}
        <div className="ps-image-column">
          <img 
            src={getProductImageUrl(extractValue(product.id), product.associations?.images?.image?.[0]?.id || product.associations?.images?.image?.id)} 
            alt="Product" 
            className="ps-main-image" 
          />
        </div>

        {/* Section Droite : Infos */}
        <div className="ps-info-column">
          <h1 className="ps-product-name">{extractValue(product.name)}</h1>
          
          <div className="ps-price-container">
            {priceDisplay.hasDiscount && (
              <div className="ps-discount-wrapper">
                <span className="ps-regular-price">{priceDisplay.regularPriceTTC.toFixed(2)} €</span>
                <span className="ps-discount-badge">ÉCONOMISEZ {priceDisplay.discountLabel}</span>
              </div>
            )}
            
            <div className="ps-current-price">
              <span className="ps-price-ttc">{priceDisplay.finalPriceTTC.toFixed(2)} €</span>
              <span className="ps-tax-label">TTC</span>
            </div>
            
            <div className="ps-price-ht">
              {priceDisplay.finalPriceHT.toFixed(2)} € HT
            </div>
          </div>

          <div className="ps-short-description" dangerouslySetInnerHTML={{ __html: extractValue(product.description_short) }} />

          {/* Déclinaisons */}
          <div className="ps-variants">
            {Object.entries(attrGroups).map(([gId, group]) => {
              const groupName = (group?.name || '').toString();
              const normalized = groupName.toLowerCase();
              const isSizeGroup = normalized.includes('taille') || normalized.includes('size');

              return (
                <div key={gId} className={`ps-variant-group${isSizeGroup ? ' ps-variant-group--size' : ''}`}>
                  <span className="ps-variant-label">{groupName}</span>
                  <div className="ps-variant-options">
                    {[...group.values.entries()].map(([vId, vName]) => (
                      <button
                        key={vId}
                        className={`ps-variant-btn${isSizeGroup ? ' ps-variant-btn--size' : ''} ${selectedAttrs[gId] === vId ? 'selected' : ''}`}
                        onClick={() => handleAttrSelect(gId, vId)}
                      >
                        {vName}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="ps-add-section">
            <div className="ps-qty-input-group">
              <span className="ps-qty-label">Quantité</span>
              <input type="number" value={quantity} min="1" onChange={(e) => setQuantity(parseInt(e.target.value))} />
            </div>
            
            <button 
              className="ps-btn-primary" 
              disabled={displayStock <= 0}
              onClick={() => {
                if (!isAuthenticated) {
                  navigate(`/login?redirect=${encodeURIComponent(`/product/${productId}`)}`);
                  return;
                }

                const id = extractValue(product.id) || productId;
                const name = extractValue(product.name) || 'Produit';
                const combinationId = selectedCombination?.id || '0';
                const variantLabel = selectedCombination?.attributes?.length
                  ? selectedCombination.attributes
                    .map((a) => `${a.groupName}: ${a.valueName}`)
                    .join(', ')
                  : '';

                const images = product.associations?.images?.image;
                const imageArray = images ? (Array.isArray(images) ? images : [images]) : [];
                const imageId = imageArray.length > 0 ? (imageArray[0]?.id || imageArray[0]) : null;
                const image = imageId ? getProductImageUrl(id, imageId) : '';

                addToCart({
                  id,
                  combinationId,
                  name,
                  variantLabel,
                  price: priceDisplay?.finalPriceTTC || 0,
                  image,
                  stock: displayStock || 0,
                  quantity,
                });
              }}
            >
              {displayStock > 0 ? "AJOUTER AU PANIER" : "RUPTURE DE STOCK"}
            </button>
          </div>

          <div className="ps-stock-status">
            <i className={`ps-stock-icon ${displayStock > 0 ? 'in-stock' : 'out-of-stock'}`}></i>
            {displayStock > 0 ? `${displayStock} articles en stock` : 'Produit indisponible'}
          </div>
        </div>
      </div>
    </div>
  );
}