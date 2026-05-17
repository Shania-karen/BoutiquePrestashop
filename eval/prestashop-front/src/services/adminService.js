import { fetchPrestaData, deletePrestaItem, updatePrestaData, BASE_URL, API_KEY, parser, escapeXml } from './apiClient';

export const postPrestaData = async (resource, xmlData) => {
  const response = await fetch(`${BASE_URL}/${resource}?ws_key=${API_KEY}`, {
    method: 'POST',
    body: xmlData,
    headers: { 'Content-Type': 'application/xml' }
  });
  
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Erreur POST sur ${resource} (${response.status}): ${text.substring(0, 300)}`);
  }
  return text;
};

export async function safeDeleteCategory(categoryIdToDelete, fallbackCategoryId = 2) {
  try {
    // 1. Chercher les produits dans cette catégorie
    const urlFilter = `products?filter[id_category_default]=[${categoryIdToDelete}]`;
    const data = await fetchPrestaData(urlFilter);
    
    let products = data?.products?.product;
    if (!products) products = [];
    if (!Array.isArray(products)) products = [products];

    // 2. Réaffecter chaque produit trouvé
    for (const prod of products) {
      const productId = prod['@_id'] || prod.id; 
      
      const response = await fetch(`${BASE_URL}/products/${productId}?ws_key=${API_KEY}`);
      let xmlText = await response.text();

      // Remplacement de l'ID de la catégorie par défaut
      xmlText = xmlText.replace(
        /<id_category_default><!\[CDATA\[.*?\]\]><\/id_category_default>/g, 
        `<id_category_default><![CDATA[${fallbackCategoryId}]]></id_category_default>`
      );
      xmlText = xmlText.replace(
        /<id_category_default>.*?<\/id_category_default>/g, 
        `<id_category_default>${fallbackCategoryId}</id_category_default>`
      );

      await updatePrestaData('products', productId, xmlText);
      console.log(`Produit ${productId} réaffecté à la catégorie ${fallbackCategoryId}`);
    }

    // 3. Supprimer la catégorie une fois vidée
    await deletePrestaItem('categories', categoryIdToDelete);
    return true;

  } catch (error) {
    console.error(`Erreur lors de la suppression sécurisée de la catégorie ${categoryIdToDelete}:`, error);
    throw error;
  }
}


export async function exportToCSV(resourcePath, selectedColumns) {
  try {
    const data = await fetchPrestaData(resourcePath, 0, 1000); 
    
    const entityKeys = Object.keys(data[resourcePath]);
    const entityKey = entityKeys[0];
    let items = data[resourcePath][entityKey];
    
    if (!items) throw new Error("Aucune donnée trouvée à exporter pour cette table.");
    if (!Array.isArray(items)) items = [items];

    let csvContent = selectedColumns.join(";") + "\n";

    items.forEach(item => {
      let row = selectedColumns.map(col => {
        let value = item[col];

        if (value && typeof value === 'object') {
          if (value.language) {
            value = Array.isArray(value.language) ? value.language[0]['#text'] : value.language['#text'];
          } else if (value['#text'] !== undefined) {
            value = value['#text'];
          } else {
            value = JSON.stringify(value);
          }
        }

        value = (value !== null && value !== undefined) ? String(value) : "";
        return `"${value.replace(/"/g, '""')}"`;
      });

      csvContent += row.join(";") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `export_${resourcePath}.csv`;
    link.click();

  } catch (error) {
    console.error("Erreur lors de l'export CSV :", error);
    throw error;
  }
}

export async function createProductPrestaShop(productData) {
  console.log('Création du produit via API:', productData);
  const xmlData = `
    <prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
      <product>
        <id_category_default><![CDATA[${productData.category || 2}]]></id_category_default>
        <name><language id="1"><![CDATA[${escapeXml(productData.name)}]]></language></name>
        <description_short><language id="1"><![CDATA[${escapeXml(productData.description)}]]></language></description_short>
        <price><![CDATA[${productData.price}]]></price>
        <active><![CDATA[1]]></active>
        <state><![CDATA[1]]></state>
        <show_price><![CDATA[1]]></show_price>
        <available_for_order><![CDATA[1]]></available_for_order>
        <link_rewrite><language id="1"><![CDATA[${(productData.name || 'produit').toLowerCase().replace(/[^a-z0-9]/g, '-')}]]></language></link_rewrite>
      </product>
    </prestashop>
  `;

  // 1. POST du produit en XML
  const resultText = await postPrestaData('products', xmlData);
  const jsonResult = parser.parse(resultText);
  const productId = jsonResult.prestashop?.product?.id || jsonResult.prestashop?.product?.['@_id'];
  
  if (!productId) throw new Error("Erreur: Impossible de récupérer l'ID du produit nouvellement créé.");

  // 2. Gestion du stock
  await updateProductStock(productId, productData.quantity);
  return productId;
}

export async function updateProductPrestaShop(id, productData) {
  // 1. Récupération du XML natif de PrestaShop pour éviter de casser des champs obligatoires
  const response = await fetch(`${BASE_URL}/products/${id}?ws_key=${API_KEY}`);
  let xmlText = await response.text();
  if (!response.ok) throw new Error("Erreur lors de la récupération du produit (XML complet) pour édition");

  // 2. Injections Regex pour modifier uniquement les champs nécessaires
  xmlText = xmlText.replace(/<name>.*?<\/name>/s, `<name><language id="1"><![CDATA[${escapeXml(productData.name)}]]></language></name>`);
  xmlText = xmlText.replace(/<description_short>.*?<\/description_short>/s, `<description_short><language id="1"><![CDATA[${escapeXml(productData.description)}]]></language></description_short>`);
  
  // Remplacement du prix (gère avec ou sans CDATA)
  xmlText = xmlText.replace(/<price><!\[CDATA\[.*?\]\]><\/price>/, `<price><![CDATA[${productData.price}]]></price>`);
  if (!xmlText.includes(`<![CDATA[${productData.price}]]>`)) {
    xmlText = xmlText.replace(/<price>.*?<\/price>/, `<price><![CDATA[${productData.price}]]></price>`);
  }

  // Remplacement de la catégorie par défaut
  xmlText = xmlText.replace(/<id_category_default><!\[CDATA\[.*?\]\]><\/id_category_default>/, `<id_category_default><![CDATA[${productData.category}]]></id_category_default>`);
  if (!xmlText.includes(`<![CDATA[${productData.category}]]>`)) {
    xmlText = xmlText.replace(/<id_category_default>.*?<\/id_category_default>/, `<id_category_default><![CDATA[${productData.category}]]></id_category_default>`);
  }

  // 3. Envoi du PUT
  await updatePrestaData('products', id, xmlText);

  // 4. Mettre à jour le stock
  await updateProductStock(id, productData.quantity);
  return id;
}

export async function updateProductStock(productId, quantity) {
  // Le stock est géré dans stock_availables. Il faut trouver l'ID associé au produit.
  const stockData = await fetchPrestaData(`stock_availables?filter[id_product]=[${productId}]&display=full`);
  let stockItems = stockData?.stock_availables?.stock_available;
  if (!stockItems) return;
  if (!Array.isArray(stockItems)) stockItems = [stockItems];

  // Le stock principal (id_product_attribute = 0)
  const mainStock = stockItems.find(s => String(s.id_product_attribute) === '0' || s.id_product_attribute === '' || s.id_product_attribute === 0);
  if (!mainStock) return;

  const stockId = mainStock.id || mainStock['@_id'];
  
  // Récupérer le XML complet du stock
  const response = await fetch(`${BASE_URL}/stock_availables/${stockId}?ws_key=${API_KEY}`);
  let xmlStock = await response.text();

  // Injecter la quantité
  xmlStock = xmlStock.replace(/<quantity><!\[CDATA\[.*?\]\]><\/quantity>/, `<quantity><![CDATA[${quantity}]]></quantity>`);
  if (!xmlStock.includes(`<![CDATA[${quantity}]]>`)) {
    xmlStock = xmlStock.replace(/<quantity>.*?<\/quantity>/, `<quantity><![CDATA[${quantity}]]></quantity>`);
  }

  // Envoi du PUT
  await updatePrestaData('stock_availables', stockId, xmlStock);
}

export async function resetEntireResource(resourcePath) {
  try {
    const data = await fetchPrestaData(resourcePath, 0, 5000);
    
    if (!data || !data[resourcePath]) return { success: 0, failed: 0, skipped: true };

    const entityKeys = Object.keys(data[resourcePath]);
    if (entityKeys.length === 0) return { success: 0, failed: 0, skipped: true };
    
    const entityKey = entityKeys[0];
    let items = data[resourcePath][entityKey];
    
    if (!items) return { success: 0, failed: 0 };
    if (!Array.isArray(items)) items = [items];

    let successCount = 0;
    let failedCount = 0;
    let lastError = null;
    
    for (const item of items) {
      const id = item['@_id'] || item.id;
      
      if (resourcePath === 'categories' && (id === '1' || id === '2')) {
        console.log(`Suppression ignorée pour la catégorie système ID ${id}`);
        continue; 
      }

      if (id) {
        try {
          await deletePrestaItem(resourcePath, id);
          successCount++;
        } catch (e) {
          console.warn(`Impossible de supprimer l'ID ${id} dans ${resourcePath}:`, e.message);
          failedCount++;
        }
      }
    }
    
    return { success: successCount, failed: failedCount };
  } catch (error) {
    console.error(`Erreur lors de la réinitialisation de ${resourcePath}:`, error);
    throw error;
  }
}

// N'oublie pas de t'assurer que BASE_URL, API_KEY et parser sont bien importés depuis apiClient en haut du fichier :
// import { fetchPrestaData, deletePrestaItem, updatePrestaData, BASE_URL, API_KEY, parser } from './apiClient';

/**
 * [MÉTA-DONNÉES]
 * Récupère la liste de toutes les ressources (tables) disponibles sur l'API
 */
export async function fetchApiResources() {
  try {
    const response = await fetch(`${BASE_URL}?ws_key=${API_KEY}`);
    const xmlText = await response.text();
    const jsonObj = parser.parse(xmlText);
    
    if (jsonObj.prestashop && jsonObj.prestashop.api) {
      return Object.keys(jsonObj.prestashop.api).filter(key => !key.startsWith('@_'));
    }
    return [];
  } catch (error) {
    console.error("Erreur lors de la récupération des ressources :", error);
    throw error;
  }
}

/**
 * [MÉTA-DONNÉES]
 * Récupère dynamiquement les colonnes (champs) d'une ressource via le schéma vierge
 * @param {string} resourcePath - ex: 'products'
 */
export async function fetchResourceSchema(resourcePath) {
  try {
    const response = await fetch(`${BASE_URL}/${resourcePath}?schema=blank&ws_key=${API_KEY}`);
    const xmlText = await response.text();
    const jsonObj = parser.parse(xmlText);
    
    const schemaObj = Object.values(jsonObj.prestashop)[0];
    
    if (schemaObj) {
      return Object.keys(schemaObj).filter(key => !key.startsWith('@_'));
    }
    return [];
  } catch (error) {
    console.error(`Erreur lors de la récupération du schéma de ${resourcePath} :`, error);
    throw error;
  }
}
/**
 * Upload d'une image vers un produit spécifique via l'API PrestaShop
 */
export const uploadPrestaImage = async (productId, imageBlob) => {
  const formData = new FormData();
  // PrestaShop attend le fichier sous la clé 'image'
  formData.append('image', imageBlob, `product_${productId}.jpg`);

  try {
    const response = await fetch(`${BASE_URL}/images/products/${productId}`, {
      method: 'POST',
      headers: {
        // Attention : Ne pas mettre de Content-Type manuel ici, 
        // le navigateur le fera avec le bon boundary pour FormData
        'Authorization': `Basic ${btoa(API_KEY + ':')}`,
      },
      body: formData,
    });

    if (!response.ok) throw new Error(`Erreur upload image: ${response.statusText}`);
    return await response.text(); // L'API renvoie souvent du XML
  } catch (error) {
    console.error(`Erreur Image (ID:${productId}):`, error);
    throw error;
  }
};

/**
 * Crée une déclinaison et met à jour son stock initial
 */
export const createPrestaCombination = async (productId, combinationData) => {
  // 1. Structure XML pour la déclinaison (combinaison)
  const xmlCombination = `
    <prestashop>
      <combination>
        <id_product>${productId}</id_product>
        <reference>${combinationData.reference || ''}</reference>
        <price>${combinationData.impact_prix || 0}</price>
        <associations>
          <product_option_values>
            <product_option_value><id>${combinationData.id_option_valeur}</id></product_option_value>
          </product_option_values>
        </associations>
      </combination>
    </prestashop>`;

  const result = await postPrestaData('combinations', xmlCombination);
  const combinationId = result.combination.id;

  // 2. Mise à jour du stock (StockAvailable)
  // Il faut souvent récupérer l'ID du stock_available spécifique à cette combinaison d'abord
  if (combinationData.quantite) {
     await updatePrestaStock(productId, combinationId, combinationData.quantite);
  }

  return result;
};

/**
 * Orchestre la création d'un client et de sa commande
 */
export const processPrestaOrder = async (orderRow, referenceMap) => {
  // 1. Création du client (si nécessaire)
  const xmlCustomer = `
    <prestashop>
      <customer>
        <lastname>${orderRow.nom}</lastname>
        <firstname>${orderRow.prenom}</firstname>
        <email>${orderRow.email}</email>
        <passwd>password123</passwd>
        <active>1</active>
      </customer>
    </prestashop>`;
  
  const customerResult = await postPrestaData('customers', xmlCustomer);
  const customerId = customerResult.customer.id;

  // 2. Création du panier (Cart) - Étape obligatoire avant la commande
  // Ici vous utilisez referenceMap pour trouver l'ID PrestaShop à partir du CSV
  const xmlCart = `
    <prestashop>
      <cart>
        <id_customer>${customerId}</id_customer>
        <id_currency>1</id_currency>
        <id_lang>1</id_lang>
        <associations>
          <cart_rows>
            <cart_row>
              <id_product>${referenceMap[orderRow.ref_produit]}</id_product>
              <quantity>${orderRow.quantite}</quantity>
            </cart_row>
          </cart_rows>
        </associations>
      </cart>
    </prestashop>`;

  const cartResult = await postPrestaData('carts', xmlCart);

};

export const deletePrestaData = async (resource, id) => {
  try {
    const response = await fetch(`${BASE_URL}/${resource}/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${btoa(API_KEY + ':')}`,
        'Output-Format': 'JSON'
      }
    });

    if (!response.ok) {
      throw new Error(`Erreur lors de la suppression de l'ID ${id} dans ${resource}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Delete Error (${resource}/${id}):`, error);
    throw error;
  }
};