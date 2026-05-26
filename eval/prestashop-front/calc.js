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

let totalTTC = 0;
let totalHT = 0;
let totalBaseTTC = 0;
let totalBaseHT = 0;

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

      let unitBaseTTC = parseFloat(sanitize.price(getRowVal(pRow, ['prix_ttc', 'prix']))) || 0;
      let unitTTC = unitBaseTTC;

      const dRow = decData.find(r => sanitize.ref(getRowVal(r, ['reference', 'ref'])) === pRef && sanitize.text(getRowVal(r, ['karazany', 'valeur'])) === pVar);
      if (dRow) {
        const dPrice = getRowVal(dRow, ['prix_vente_ttc']);
        if (dPrice) {
          unitTTC = parseFloat(sanitize.price(dPrice));
        }
      }

      const unitHT = unitTTC / (1 + (taxRate / 100));
      const unitBaseHT = unitBaseTTC / (1 + (taxRate / 100));

      totalTTC += unitTTC * pQty;
      totalHT += unitHT * pQty;
      totalBaseTTC += unitBaseTTC * pQty;
      totalBaseHT += unitBaseHT * pQty;
    }
  }
}

console.log("Calcul avec déclinaisons :");
console.log("Total TTC:", totalTTC.toFixed(2));
console.log("Total HT:", totalHT.toFixed(2));

console.log("\nCalcul avec prix de base uniquement :");
console.log("Total TTC:", totalBaseTTC.toFixed(2));
console.log("Total HT:", totalBaseHT.toFixed(2));
