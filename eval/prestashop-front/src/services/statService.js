const STATUS_PAYE = 2; // ⚠️ Si ton statut "Payé" n'a pas l'ID 2 dans ton back-office, change cette valeur !
const STATUS_LIVRE = 5; // ⚠️ Pareil pour "Livré"

export const calculateDashboardStats = (orders = [], products = [], categories = [], stocks = []) => {
  let totalSalesHT = 0;
  let totalPurchasesHT = 0;
  let inventoryValueHT = 0;
  const categoryStats = {};

  console.log("--- DÉBUG STATISTIQUES ---");
  console.log(`Commandes reçues: ${orders.length}, Produits: ${products.length}`);

  // Fonction pour extraire un texte d'un champ multilingue
  const getMultilangValue = (field) => {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (Array.isArray(field)) return field[0]?.value || '';
    if (field.value !== undefined) return field.value;
    return String(field);
  };

  const productsMap = products.reduce((acc, prod) => {
    if (prod && prod.id) {
      acc[prod.id] = {
        categoryId: getMultilangValue(prod.id_category_default),
        wholesalePrice: parseFloat(getMultilangValue(prod.wholesale_price) || 0),
        taxRate: parseFloat(getMultilangValue(prod.supplier_reference) || 0),
        priceTTC: parseFloat(getMultilangValue(prod.price) || 0)
      };
    }
    return acc;
  }, {});

  // Création du dictionnaire des stocks et calcul de la valeur de l'inventaire
  const stockMap = {};
  stocks.forEach(s => {
    if (s.id_product_attribute === '0' || s.id_product_attribute === 0) {
      stockMap[s.id_product] = parseInt(s.quantity, 10) || 0;
    }
  });

  Object.entries(productsMap).forEach(([prodId, info]) => {
    const qty = stockMap[prodId] || 0;
    if (qty > 0) {
      inventoryValueHT += info.wholesalePrice * qty;
    }
  });

  orders.forEach(order => {
    if (!order) return;
    const currentStateId = parseInt(order.current_state, 10);
    
    // Extraction des lignes de commande (gère tous les formats bizarres de PrestaShop)
    let orderRows = [];
    if (order.associations && order.associations.order_rows) {
      const rowsData = order.associations.order_rows;
      if (Array.isArray(rowsData)) {
        orderRows = rowsData;
      } else if (rowsData.order_row) {
        orderRows = Array.isArray(rowsData.order_row) ? rowsData.order_row : [rowsData.order_row];
      } else {
        orderRows = Object.values(rowsData);
      }
    }

    console.log(`Commande ID ${order.id} | Statut: ${currentStateId} | Lignes: ${orderRows.length}`);

    // Filtre sur Payé (2) et Livré (5)
    if (currentStateId === STATUS_PAYE || currentStateId === STATUS_LIVRE) {
      orderRows.forEach(row => {
        const productId = parseInt(row.product_id, 10);
        const qty = parseInt(row.product_quantity || 1, 10);
        
        // Utiliser explicitement unit_price_tax_excl, et ne fallback sur product_price que si c'est vraiment manquant
        let sellingPriceStored = 0;
        const unitExcl = getMultilangValue(row.unit_price_tax_excl);
        const prodPrice = getMultilangValue(row.product_price);
        
        if (unitExcl !== undefined && unitExcl !== null && unitExcl !== "") {
          sellingPriceStored = parseFloat(unitExcl);
        } else {
          sellingPriceStored = parseFloat(prodPrice || 0);
        }
        
        const productInfo = productsMap[productId];

        if (productInfo) {
          const purchasePriceHT = productInfo.wholesalePrice;
          const taxRate = productInfo.taxRate || 0;
          const parentTTC = productInfo.priceTTC || 0;
          const categoryId = productInfo.categoryId;

          // Récupération du VRAI HT : sellingPriceStored contient le Prix de Base TTC + l'Impact HT
          let sellingPriceHT = 0;
          if (taxRate > 0) {
            const impactHT = sellingPriceStored - parentTTC;
            const parentHT = parentTTC / (1 + (taxRate / 100));
            sellingPriceHT = parentHT + impactHT;
          } else {
            sellingPriceHT = sellingPriceStored;
          }

          const rowSales = sellingPriceHT * qty;
          const rowPurchases = purchasePriceHT * qty;
          const rowProfit = rowSales - rowPurchases;

          totalSalesHT += rowSales;
          totalPurchasesHT += rowPurchases;

          if (categoryId) {
            if (!categoryStats[categoryId]) {
              categoryStats[categoryId] = { 
                qty: 0, sales: 0, salesTTC: 0, purchases: 0, purchasesTTC: 0, profit: 0, profitTTC: 0 
              };
            }
            
            const sellingPriceTTC = sellingPriceHT * (1 + (taxRate / 100));
            const purchasePriceTTC = purchasePriceHT * (1 + (taxRate / 100));
            
            const rowSalesTTC = sellingPriceTTC * qty;
            const rowPurchasesTTC = purchasePriceTTC * qty;

            categoryStats[categoryId].qty += qty;
            categoryStats[categoryId].sales += rowSales;
            categoryStats[categoryId].salesTTC += rowSalesTTC;
            categoryStats[categoryId].purchases += rowPurchases;
            categoryStats[categoryId].purchasesTTC += rowPurchasesTTC;
            categoryStats[categoryId].profit += rowProfit;
            categoryStats[categoryId].profitTTC += (rowSalesTTC - rowPurchasesTTC);
          }
        } else {
          console.warn(`Produit ID ${productId} introuvable dans le catalogue !`);
        }
      });
    } else {
      console.log(`-> Ignorée car statut ${currentStateId} n'est ni ${STATUS_PAYE} (Payé) ni ${STATUS_LIVRE} (Livré)`);
    }
  });

  const profitByCategory = Object.keys(categoryStats).map(catId => {
    const category = categories.find(c => String(c.id) === String(catId));
    const stats = categoryStats[catId];
    const marge = stats.sales > 0 ? (stats.profit / stats.sales) * 100 : 0;
    
    return {
      categoryId: catId,
      categoryName: category ? getMultilangValue(category.name) : `Catégorie ${catId}`,
      qty: stats.qty,
      ventes: stats.sales,
      ventesTTC: stats.salesTTC,
      achats: stats.purchases,
      achatsTTC: stats.purchasesTTC,
      profit: stats.profit,
      profitTTC: stats.profitTTC,
      marge: marge
    };
  });

  console.log("Total Ventes HT:", totalSalesHT);
  console.log("--------------------------");

  return {
    totalSalesHT,
    totalPurchasesHT,
    inventoryValueHT,
    initialInventoryValueHT: inventoryValueHT + totalPurchasesHT,
    totalProfitHT: totalSalesHT - totalPurchasesHT,
    profitByCategory
  };
};