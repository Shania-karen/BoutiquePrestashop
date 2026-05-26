const fs = require('fs');
const Papa = require('papaparse');

const sanitize = {
  price: (val) => {
    if (!val) return "0.00";
    let cleaned = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    return parseFloat(cleaned).toFixed(2);
  },
  text: (val) => String(val || '').trim().replace(/\s+/g, ' '),
  ref: (val) => String(val || '').trim()
};

const getRowVal = (row, possibleKeys) => {
  if (!row) return undefined;
  const keys = Object.keys(row);
  for (const pKey of possibleKeys) {
    const target = pKey.toLowerCase();
    const foundKey = keys.find(k => k.replace(/^\uFEFF/, '').trim().toLowerCase() === target);
    if (foundKey && row[foundKey] !== undefined) return row[foundKey];
  }
  return undefined;
};

const catCsv = fs.readFileSync('d:/shania/itu/L3/BoutiquePrestashop/eval/data-import-essai/data-import/import-csv-data-18-mai-26 - produit.csv', 'utf8');
const decCsv = fs.readFileSync('d:/shania/itu/L3/BoutiquePrestashop/eval/data-import-essai/data-import/import-csv-data-18-mai-26 - produit_declinaison.csv', 'utf8');
const ordCsv = fs.readFileSync('d:/shania/itu/L3/BoutiquePrestashop/eval/data-import-essai/data-import/import-csv-data-18-mai-26 - commande.csv', 'utf8');

const catData = Papa.parse(catCsv, { header: true, skipEmptyLines: true }).data;
const decData = Papa.parse(decCsv, { header: true, skipEmptyLines: true }).data;
const ordData = Papa.parse(ordCsv, { header: true, skipEmptyLines: true }).data;

// ACHAT TOTAL PRODUITS = wholesale_price x stock reel
let inventoryValue = 0;
let inventoryValueInitial = 0;

for (const pRow of catData) {
  const pRef = sanitize.ref(getRowVal(pRow, ['reference', 'ref']));
  const wholesalePriceStr = getRowVal(pRow, ['prix_achat', 'wholesale_price', 'prix_achat_ht']);
  const wholesalePrice = parseFloat(sanitize.price(wholesalePriceStr)) || 0;
  
  // What is "stock reel" in the CSV?
  // Is it `quantite` or `stock`?
  const stockStr = getRowVal(pRow, ['quantité', 'stock', 'quantite']);
  const stock = parseInt(stockStr, 10) || 0;
  
  inventoryValueInitial += wholesalePrice * stock;
}

console.log("Inventaire initial (produits seulement):", inventoryValueInitial);

let decInventoryValue = 0;
for (const dRow of decData) {
  const pRef = sanitize.ref(getRowVal(dRow, ['reference', 'ref']));
  const stockStr = getRowVal(dRow, ['stock_initial', 'stock', 'quantite']);
  const stock = parseInt(stockStr, 10) || 0;
  
  const pRow = catData.find(r => sanitize.ref(getRowVal(r, ['reference', 'ref'])) === pRef);
  if (pRow) {
    const wholesalePriceStr = getRowVal(pRow, ['prix_achat', 'wholesale_price', 'prix_achat_ht']);
    const wholesalePrice = parseFloat(sanitize.price(wholesalePriceStr)) || 0;
    decInventoryValue += wholesalePrice * stock;
  }
}

console.log("Inventaire déclinaisons (utilise prix_achat parent):", decInventoryValue);

// MONTANT TOTAL DES VENTES
let totalSalesHT = 0;
let totalSalesTTC = 0;

for (const row of ordData) {
  const achatRaw = getRowVal(row, ['achat']) || "";
  const regex = /\("([^"]+)";(\d+);"([^"]*)"\)/g;
  let match;
  while ((match = regex.exec(achatRaw)) !== null) {
    const pRef = match[1];
    const pQty = parseInt(match[2], 10);
    const pVar = match[3];

    const pRow = catData.find(r => sanitize.ref(getRowVal(r, ['reference', 'ref'])) === pRef);
    if (pRow) {
      let taxRate = 0;
      const taxRaw = getRowVal(pRow, ['taxe', 'tax']) || "";
      if (taxRaw) taxRate = parseFloat(taxRaw.replace(',', '.').replace('%', ''));

      let unitTTC = parseFloat(sanitize.price(getRowVal(pRow, ['prix_ttc', 'prix']))) || 0;

      const dRow = decData.find(r => sanitize.ref(getRowVal(r, ['reference', 'ref'])) === pRef && sanitize.text(getRowVal(r, ['karazany', 'valeur'])) === pVar);
      if (dRow) {
        const dPrice = getRowVal(dRow, ['prix_vente_ttc']);
        if (dPrice) {
          unitTTC = parseFloat(sanitize.price(dPrice));
        }
      }

      const unitHT = unitTTC / (1 + (taxRate / 100));
      totalTTC += unitTTC * pQty;
      totalSalesHT += unitHT * pQty;
    }
  }
}

console.log("Total Ventes HT:", totalSalesHT);
