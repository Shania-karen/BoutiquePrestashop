import { fetchPrestaData, extractValue, IMAGE_BASE_URL, API_KEY, updatePrestaData } from './apiClient';

export function getProductImageUrl(productId, imageId) {
  return `${IMAGE_BASE_URL}/${productId}/${imageId}?ws_key=${API_KEY}`;
}

export async function fetchTaxRate(taxRulesGroupId) {
  try {
    if (!taxRulesGroupId || taxRulesGroupId === '0') return 0;

    // 1. Chercher les règles de taxe associées au groupe
    const rulesData = await fetchPrestaData(`tax_rules?filter[id_tax_rules_group]=[${taxRulesGroupId}]`, 0, 1);
    const rule = rulesData?.tax_rules?.tax_rule;
    const taxId = extractValue(Array.isArray(rule) ? rule[0].id_tax : rule?.id_tax);

    if (!taxId) return 0;

    const taxData = await fetchPrestaData(`taxes/${taxId}`);
    const rate = parseFloat(extractValue(taxData?.tax?.rate)) || 0;
    
    return rate;
  } catch (err) {
    console.error("Erreur lors de la récupération de la taxe:", err);
    return 0;
  }
}

// À ajouter dans productservice.js

/**
 * Cherche s'il existe un prix spécifique (réduction) pour un produit donné
 */
export async function fetchProductReduction(productId) {
  try {
    const data = await fetchPrestaData(`specific_prices?filter[id_product]=[${productId}]`, 0, 1);
    
    const spRaw = data?.specific_prices?.specific_price;
    if (!spRaw) return null; // Aucune réduction trouvée

    // Si l'API renvoie plusieurs règles, on prend la première applicable
    const sp = Array.isArray(spRaw) ? spRaw[0] : spRaw;
    return sp;
  } catch (err) {
    console.error("Erreur lors de la récupération de la réduction:", err);
    return null;
  }
}

export async function fetchStockAvailable(productId, combinationId = 0) {
  try {
    // Can return multiple rows (e.g., multi-shop). Fetch more than 1 and pick the most relevant.
    // For combinations, filtering by id_product_attribute only is more reliable (it's globally unique).
    const isCombination = String(combinationId ?? '0') !== '0';
    const resourcePath = isCombination
      ? `stock_availables?filter[id_product_attribute]=[${combinationId}]`
      : `stock_availables?filter[id_product]=[${productId}]&filter[id_product_attribute]=[0]`;

    const data = await fetchPrestaData(resourcePath, 0, 50);
    const raw = data?.stock_availables?.stock_available;
    if (!raw) return 0;
    const stocks = Array.isArray(raw) ? raw : [raw];

    // Defensive: in some setups (proxy/multishop), API may return multiple rows.
    // We manually filter to the exact requested product + attribute.
    const wantedProductId = String(productId ?? '');
    const wantedAttrId = String(combinationId ?? 0);

    const matching = stocks.filter((s) => {
      const sProductId = String(extractValue(s.id_product) || s.id_product || '');
      const sAttrId = String(extractValue(s.id_product_attribute) || s.id_product_attribute || '0');
      if (isCombination) return sAttrId === wantedAttrId;
      return sProductId === wantedProductId && sAttrId === wantedAttrId;
    });

    const candidates = matching.length > 0 ? matching : stocks;

    const preferred = candidates.find(s => String(extractValue(s.id_shop) || s.id_shop) === '1') || candidates[0];
    if (!preferred) return 0;
    return parseInt(extractValue(preferred.quantity) || preferred.quantity, 10) || 0;
  } catch (err) {
    return 0;
  }
}

export async function fetchProductCombinations(productId) {
  const data = await fetchPrestaData(`combinations?filter[id_product]=[${productId}]`, 0, 100);
  const raw = data?.combinations?.combination;
  return raw ? (Array.isArray(raw) ? raw : [raw]) : [];
}

/**
 * Trouver l'entrée stock_available correspondant au produit (+ combinaison)
 * Retourne l'objet brut ou null
 */
export async function findStockAvailableEntry(productId, combinationId = 0) {
  const isCombination = String(combinationId ?? '0') !== '0';
  const resourcePath = isCombination
    ? `stock_availables?filter[id_product_attribute]=[${combinationId}]`
    : `stock_availables?filter[id_product]=[${productId}]&filter[id_product_attribute]=[0]`;

  const data = await fetchPrestaData(resourcePath, 0, 50);
  const raw = data?.stock_availables?.stock_available;
  if (!raw) return null;
  const stocks = Array.isArray(raw) ? raw : [raw];

  // Try to find exact match
  const wantedProductId = String(productId ?? '');
  const wantedAttrId = String(combinationId ?? 0);

  const matching = stocks.filter((s) => {
    const sProductId = String(extractValue(s.id_product) || s.id_product || '');
    const sAttrId = String(extractValue(s.id_product_attribute) || s.id_product_attribute || '0');
    if (isCombination) return sAttrId === wantedAttrId;
    return sProductId === wantedProductId && sAttrId === wantedAttrId;
  });

  return matching.length > 0 ? matching[0] : stocks[0];
}

/**
 * Mettre à jour la quantité d'une entrée stock_available
 * @param {Object} entry - L'objet stock_available complet récupéré précédemment
 * @param {number} newQuantity
 */
export async function updateStockAvailableQuantity(entry, newQuantity) {
  const stockId = extractValue(entry.id) || entry['@_id'] || entry.id;
  const idProduct = extractValue(entry.id_product) || entry.id_product || '';
  const idProductAttribute = extractValue(entry.id_product_attribute) || entry.id_product_attribute || '0';
  const idShop = extractValue(entry.id_shop) || entry.id_shop || '1';
  const idShopGroup = extractValue(entry.id_shop_group) || entry.id_shop_group || '0';
  const dependsOnStock = extractValue(entry.depends_on_stock) || entry.depends_on_stock || '0';
  const outOfStock = extractValue(entry.out_of_stock) || entry.out_of_stock || '2';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <stock_available>
    <id><![CDATA[${stockId}]]></id>
    <id_product><![CDATA[${idProduct}]]></id_product>
    <id_product_attribute><![CDATA[${idProductAttribute}]]></id_product_attribute>
    <id_shop><![CDATA[${idShop}]]></id_shop>
    <id_shop_group><![CDATA[${idShopGroup}]]></id_shop_group>
    <quantity><![CDATA[${newQuantity}]]></quantity>
    <depends_on_stock><![CDATA[${dependsOnStock}]]></depends_on_stock>
    <out_of_stock><![CDATA[${outOfStock}]]></out_of_stock>
  </stock_available>
</prestashop>`;

  return await updatePrestaData('stock_availables', stockId, xml);
}

/**
 * Décrémente le stock pour un produit / combinaison
 * @param {string|number} productId
 * @param {string|number} combinationId
 * @param {number} decrement
 */
export async function decrementStock(productId, combinationId = 0, decrement = 1) {
  try {
    const entry = await findStockAvailableEntry(productId, combinationId);
    if (!entry) throw new Error('Entrée stock introuvable');

    const stockId = extractValue(entry.id) || entry['@_id'] || entry.id;
    const currentQty = parseInt(extractValue(entry.quantity) || entry.quantity || 0, 10) || 0;
    const newQty = currentQty - Number(decrement || 0);

    await updateStockAvailableQuantity(entry, newQty);
    console.log(`✓ Stock updated for product ${productId} attr ${combinationId}: ${currentQty} -> ${newQty}`);
    return { stockId, old: currentQty, new: newQty };
  } catch (err) {
    console.error('Erreur decrementStock:', err);
    throw err;
  }
}

export async function fetchAttributeValues() {
  const data = await fetchPrestaData('product_option_values', 0, 200);
  const raw = data?.product_option_values?.product_option_value;
  return raw ? (Array.isArray(raw) ? raw : [raw]) : [];
}

export async function fetchAttributeGroups() {
  const data = await fetchPrestaData('product_options', 0, 50);
  const raw = data?.product_options?.product_option;
  return raw ? (Array.isArray(raw) ? raw : [raw]) : [];
}