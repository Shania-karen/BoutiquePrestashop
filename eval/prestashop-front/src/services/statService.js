const STATUS_PAYE = 2; // ⚠️ Si ton statut "Payé" n'a pas l'ID 2 dans ton back-office, change cette valeur !
const STATUS_LIVRE = 5; // ⚠️ Pareil pour "Livré"

export const calculateDashboardStats = (orders = [], products = [], categories = []) => {
  let totalSalesHT = 0;
  let totalPurchasesHT = 0;
  const categoryStats = {};

  console.log("--- DÉBUG STATISTIQUES ---");
  console.log(`Commandes reçues: ${orders.length}, Produits: ${products.length}`);

  // Fonction pour extraire un texte d'un champ multilingue
  const getMultilangValue = (field) => {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (Array.isArray(field)) return field[0]?.value || '';
    if (field.value) return field.value;
    return String(field);
  };

  // Création du dictionnaire des produits
  const productsMap = products.reduce((acc, prod) => {
    if (prod && prod.id) {
      acc[prod.id] = {
        categoryId: prod.id_category_default,
        wholesalePrice: parseFloat(prod.wholesale_price || 0)
      };
    }
    return acc;
  }, {});

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
        
        // Gère les deux noms de variables possibles pour le prix
        const sellingPriceHT = parseFloat(row.unit_price_tax_excl || row.product_price || 0); 
        const productInfo = productsMap[productId];

        if (productInfo) {
          const purchasePriceHT = productInfo.wholesalePrice;
          const categoryId = productInfo.categoryId;

          const rowSales = sellingPriceHT * qty;
          const rowPurchases = purchasePriceHT * qty;
          const rowProfit = rowSales - rowPurchases;

          totalSalesHT += rowSales;
          totalPurchasesHT += rowPurchases;

          if (categoryId) {
            if (!categoryStats[categoryId]) {
              categoryStats[categoryId] = { sales: 0, purchases: 0, profit: 0 };
            }
            categoryStats[categoryId].sales += rowSales;
            categoryStats[categoryId].purchases += rowPurchases;
            categoryStats[categoryId].profit += rowProfit;
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
    return {
      categoryId: catId,
      categoryName: category ? getMultilangValue(category.name) : `Catégorie ${catId}`,
      ventes: categoryStats[catId].sales,
      achats: categoryStats[catId].purchases,
      profit: categoryStats[catId].profit
    };
  });

  console.log("Total Ventes HT:", totalSalesHT);
  console.log("--------------------------");

  return {
    totalSalesHT,
    totalPurchasesHT,
    totalProfitHT: totalSalesHT - totalPurchasesHT,
    profitByCategory
  };
};