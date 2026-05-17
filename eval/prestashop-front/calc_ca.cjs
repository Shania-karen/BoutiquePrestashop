// Calcul en comptant SEULEMENT les commandes avec etat "paiement accepté"
// car le chiffre d'affaires = seulement les ventes confirmées, pas les paniers
const fs = require('fs');
const dec = {
  'T_01': {'M':12.5,'S':12.5,'L':12.5,'XL':12.5},
  'P_01': {'38':18.99,'40':18.99,'42':18.99,'44':18.99},
  'C_03': {'noir':5,'rouge':5},
  'M_02': {'argent':56,'noir':56},
  'S_01': {'noir':45.99,'bleu':45.99,'gris':45.99},
  'CH_01': {'40':79.99,'41':79.99,'42':79.99,'43':79.99},
  'P_02': {'S':35.5,'M':35.5,'L':35.5},
  'C_04': {'noir':19.99,'marron':19.99},
  'L_01': {'noir':89.99,'bleu':89.99},
  'PO_01': {'noir':49.99,'marron':49.99},
  'CH_02': {'S':49.99,'M':49.99,'L':49.99},
  'S_02': {'S':24.99,'M':24.99,'L':24.99},
  'V_01': {'M':99.99,'L':99.99,'XL':99.99},
  'G_01': {'unique':14.99},
  'E_01': {'rouge':29.99,'bleu':29.99},
  'CH_03': {'unique':19.99},
  'B_01': {'40':129.99,'41':129.99},
  'SA_01': {'38':39.99,'39':39.99,'40':39.99},
  'R_01': {'S':69.99,'M':69.99},
  'J_01': {'38':44.99,'40':44.99}
};

const content = fs.readFileSync('D:/shania/itu/L3/eval/100 lignes/commandes.csv', 'utf8');
const lines = content.split('\n').slice(1).filter(l => l.trim());

let totalTous = 0, totalAccepte = 0, totalPanier = 0, totalVide = 0;
let countTous = 0, countAccepte = 0, countPanier = 0, countVide = 0;

lines.forEach((line) => {
  const m = line.match(/""([^"]+)"";(\d+);""([^"]*)""/);
  if (!m) return;
  const ref = m[1], qty = parseInt(m[2]), val = m[3];
  if (!dec[ref] || dec[ref][val] === undefined) return;
  
  const montant = dec[ref][val] * qty;
  const etat = line.split(',').pop().trim().replace(/\r/,'').toLowerCase();
  
  totalTous += montant; countTous++;
  
  if (etat.includes('accept') || etat.includes('effectu')) {
    totalAccepte += montant; countAccepte++;
  } else if (etat.includes('panier')) {
    totalPanier += montant; countPanier++;
  } else {
    totalVide += montant; countVide++;  // etat vide
  }
});

console.log('--- Calcul CA depuis commandes.csv ---');
console.log('TOUTES commandes:    ', totalTous.toFixed(2), '€ (', countTous, 'lignes )');
console.log('Paiement accepté:    ', totalAccepte.toFixed(2), '€ (', countAccepte, 'lignes )');
console.log('Dans le panier:      ', totalPanier.toFixed(2), '€ (', countPanier, 'lignes )');
console.log('Etat vide:           ', totalVide.toFixed(2), '€ (', countVide, 'lignes )');
console.log('Accepté + Vide:      ', (totalAccepte + totalVide).toFixed(2), '€');
console.log('Attendu: 2824.96');
