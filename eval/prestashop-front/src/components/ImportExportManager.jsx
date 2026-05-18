import React, { useState } from 'react';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { fetchPrestaData, updatePrestaData, BASE_URL, API_KEY } from '../services/apiClient';
import { postPrestaData, uploadPrestaImage, deletePrestaData, resetEntireResource } from '../services/adminService';

// --- UTILITAIRES ---
const sanitize = {
  price: (val) => {
    if (!val) return "0.00";
    let cleaned = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    return parseFloat(cleaned).toFixed(2);
  },
  text: (val) => String(val || '').trim().replace(/\s+/g, ' '),
  ref: (val) => String(val || '').trim()
  // ref: (val) => String(val || '').trim().replace(/-/g,'_')
};

// --- COLONNES ATTENDUES PAR FICHIER (en minuscules pour comparaison insensible à la casse) ---
// Fichier 1 : Catalogue Produits
const EXPECTED_COLS_CAT = [
  'date_availability_produit', 'date_produit', 'date',
  'nom', 'name',
  'reference', 'ref',
  'prix_ttc', 'prix',
  'taxe', 'tax',
  'categorie', 'category',
  'prix_achat'
];

// Fichier 2 : Déclinaisons
const EXPECTED_COLS_DEC = [
  'reference',
  'karazany', 'valeur',
  'stock_initial',
  'prix_vente_ttc'
  // Note : les colonnes commençant par "specifi" sont acceptées dynamiquement
];

// Fichier 3 : Commandes
const EXPECTED_COLS_ORD = [
  'date',
  'nom',
  'email',
  'pwd',
  'adresse',
  'achat',
  'etat'
];

// Colonnes contenant des dates (en minuscules)
const DATE_COLUMNS = ['date_availability_produit', 'date_produit', 'date'];

// Colonnes contenant des montants devant être positifs (en minuscules)
const AMOUNT_COLS_CAT = ['prix_ttc', 'prix', 'prix_achat'];
const AMOUNT_COLS_DEC = ['prix_vente_ttc', 'stock_initial'];

/**
 * Normalise un nom de colonne pour comparaison : met en minuscules SANS toucher aux accents.
 * "NOM" → "nom", "Spécificité" → "spécificité", mais "làlana" reste "làlana" (≠ "lalàna")
 */
const normalizeColName = (col) => col.trim().toLowerCase();

/**
 * Vérifie le format DD/MM/YYYY strict
 */
const isValidDateDMY = (dateStr) => {
  if (!dateStr || !dateStr.trim()) return true; // Champ vide = pas d'erreur
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateStr.trim().match(regex);
  if (!match) return false;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;
  // Vérification des jours par mois
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
};

/**
 * Vérifie si un montant est strictement positif (quand il est renseigné)
 */
const isPositiveAmount = (val) => {
  if (!val || String(val).trim() === '') return true; // Champ vide = pas d'erreur
  const cleaned = String(val).replace(',', '.').replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return true; // Pas un nombre → on laisse passer, le sanitize gèrera
  return num > 0;
};

/**
 * Validation complète des fichiers CSV avant import.
 * Retourne { valid: true } ou { valid: false, errors: [...] }
 */
const validateCSVFiles = (catData, decData, ordData) => {
  const errors = [];

  const checkColumns = (data, expectedCols, label, allowSpecifiPrefix = false) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    for (const header of headers) {
      const normalized = normalizeColName(header);
      // Vérification spéciale pour les colonnes commençant par "specifi" (spécificité, specificite, etc.)
      if (allowSpecifiPrefix && normalized.startsWith('specifi')) continue;
      if (!expectedCols.includes(normalized)) {
        errors.push({
          type: 'COLONNE_INCONNUE',
          file: label,
          message: `Colonne inconnue "${header}" détectée. Colonnes attendues : ${expectedCols.join(', ')}${allowSpecifiPrefix ? ' + toute colonne commençant par "specifi"' : ''}`
        });
      }
    }
  };

  const checkDates = (data, label) => {
    if (!data || data.length === 0) return;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      for (const key of Object.keys(row)) {
        const normalized = normalizeColName(key);
        if (DATE_COLUMNS.includes(normalized)) {
          const val = String(row[key] || '').trim();
          if (val && !isValidDateDMY(val)) {
            errors.push({
              type: 'FORMAT_DATE',
              file: label,
              message: `Format de date invalide à la ligne ${i + 2} : colonne "${key}" = "${val}" — Format attendu : DD/MM/YYYY`
            });
          }
        }
      }
    }
  };

  const checkAmounts = (data, amountCols, label) => {
    if (!data || data.length === 0) return;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      for (const key of Object.keys(row)) {
        const normalized = normalizeColName(key);
        if (amountCols.includes(normalized)) {
          const val = row[key];
          if (!isPositiveAmount(val)) {
            errors.push({
              type: 'MONTANT_NEGATIF',
              file: label,
              message: `Montant négatif ou nul à la ligne ${i + 2} : colonne "${key}" = "${val}" — Les montants doivent être strictement positifs`
            });
          }
        }
      }
    }
  };

  // --- Validation Fichier 1 : Catalogue Produits ---
  if (catData) {
    checkColumns(catData, EXPECTED_COLS_CAT, 'Catalogue Produits');
    checkDates(catData, 'Catalogue Produits');
    checkAmounts(catData, AMOUNT_COLS_CAT, 'Catalogue Produits');
  }

  // --- Validation Fichier 2 : Déclinaisons ---
  if (decData) {
    checkColumns(decData, EXPECTED_COLS_DEC, 'Déclinaisons', true);
    checkAmounts(decData, AMOUNT_COLS_DEC, 'Déclinaisons');
  }

  // --- Validation Fichier 3 : Commandes ---
  if (ordData) {
    checkColumns(ordData, EXPECTED_COLS_ORD, 'Commandes');
    checkDates(ordData, 'Commandes');
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
};

const extractXmlId = (xmlText, tag) => {
  const regex = new RegExp(`<${tag}><!\\[CDATA\\[(\\d+)\\]\\]></${tag}>|<${tag}>(\\d+)</${tag}>`);
  const match = xmlText.match(regex);
  return match ? (match[1] || match[2]) : null;
};

export default function ImportExportManager() {
  const [files, setFiles] = useState({ cat: null, dec: null, ord: null, zip: null });
  const [logs, setLogs] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => {
      const newLogs = [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev];
      return newLogs.slice(0, 200); // Garder uniquement les 200 derniers logs pour la performance
    });
  };

  const handleFile = (e, key) => {
    const file = e.target.files[0];
    if (!file) return;
    if (key === 'zip') {
      setFiles(prev => ({ ...prev, [key]: file }));
      addLog("Archive ZIP chargée.");
    } else {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (res) => {
          setFiles(prev => ({ ...prev, [key]: res.data }));
          addLog(`Fichier ${key.toUpperCase()} prêt (${res.data.length} lignes).`, 'success');
        }
      });
    }
  };

  const rollback = async (history) => {
    addLog(" DÉBUT DU ROLLBACK : Annulation des insertions...", "error");
    try {
      for (const id of history.orders.reverse()) await deletePrestaData('orders', id).catch(e => null);
      for (const id of history.carts.reverse()) await deletePrestaData('carts', id).catch(e => null);
      for (const id of history.addresses.reverse()) await deletePrestaData('addresses', id).catch(e => null);
      for (const id of history.customers.reverse()) await deletePrestaData('customers', id).catch(e => null);
      for (const id of history.combinations.reverse()) await deletePrestaData('combinations', id).catch(e => null);
      for (const id of history.product_option_values.reverse()) await deletePrestaData('product_option_values', id).catch(e => null);
      for (const id of history.product_options.reverse()) await deletePrestaData('product_options', id).catch(e => null);
      for (const id of history.products.reverse()) await deletePrestaData('products', id).catch(e => null);
      addLog(" ROLLBACK TERMINÉ. La base a été nettoyée des données de cet import partiel.", "info");
    } catch (e) {
      addLog("Erreur critique lors du rollback manuel.", "error");
    }
  };

  const handleResetAll = async () => {
    if (!window.confirm("Voulez-vous vraiment TOUT effacer (Produits, Commandes, Clients, etc.) ? Cette action est irréversible.")) return;
    setIsResetting(true);
    setLogs([]);
    addLog(" DÉBUT DE LA RÉINITIALISATION GLOBALE...", "info");

    const reset = async (resourceName, label) => {
      addLog(`Suppression des ${label}...`);
      const res = await resetEntireResource(resourceName);
      if (res && res.failed > 0) {
        addLog(` ${res.failed} ${label.toLowerCase()} n'ont pas pu être supprimés.`, "error");
      }
    };

    try {
      await reset('orders', 'Commandes');
      await reset('carts', 'Paniers');
      await reset('addresses', 'Adresses');
      await reset('customers', 'Clients');
      await reset('products', 'Produits');
      await reset('combinations', 'Déclinaisons');
      await reset('product_option_values', 'Valeurs des attributs');
      await reset('product_options', 'Options de Produits');
      addLog(" RÉINITIALISATION GLOBALE TERMINÉE.", "success");
    } catch (error) {
      addLog(`ERREUR lors de la réinitialisation : ${error.message}`, "error");
    } finally {
      setIsResetting(false);
    }
  };

  const runImport = async () => {
    setIsImporting(true);
    setLogs([]);

    // === PHASE DE VALIDATION (avant toute insertion) ===
    addLog(" PHASE DE VALIDATION : Vérification des fichiers CSV...", "info");
    const validation = validateCSVFiles(files.cat, files.dec, files.ord);

    if (!validation.valid) {
      addLog(` VALIDATION ÉCHOUÉE : ${validation.errors.length} erreur(s) détectée(s)`, "error");
      for (const err of validation.errors) {
        const icon = err.type === 'COLONNE_INCONNUE' ? '📋' :
          err.type === 'FORMAT_DATE' ? '📅' : '💰';
        addLog(`${icon} [${err.file}] ${err.message}`, "error");
      }
      addLog("Import annulé. Corrigez les fichiers CSV et rechargez-les. Voir GUIDE_CORRECTION_IMPORT.md pour l'aide.", "error");
      // Réinitialiser les fichiers chargés
      setFiles({ cat: null, dec: null, ord: null, zip: null });
      setIsImporting(false);
      return;
    }

    addLog(" Validation réussie — tous les fichiers sont conformes.", "success");

    const localHistory = {
      categories: [], products: [], product_options: [], product_option_values: [], combinations: [],
      customers: [], addresses: [], carts: [], orders: []
    };
    const refToIdMap = {}; // Product Ref -> Product ID
    const refToCombMap = {}; // Comb Ref (ProductRef_Variation) -> Comb ID
    const catToIdMap = {}; // Category Name -> Category ID
    const specToOptIdMap = {}; // Spec Name (ex: "taille") -> product_option ID
    const valToValIdMap = {}; // "optId_valName" -> product_option_value ID

    try {
      // --- ÉTAPE 1 : PRODUITS (fichier 1) ---
      if (files.cat) {
        addLog("▶ ÉTAPE 1 : Importation des produits...", "info");
        let i = 0;
        for (const row of files.cat) {
          i++;
          const name = sanitize.text(row.nom || row.name);
          const ref = sanitize.ref(row.reference || row.ref);

          const priceTTC = parseFloat(sanitize.price(row.prix_ttc || row.prix)) || 0;
          const wholesalePrice = parseFloat(sanitize.price(row.prix_achat)) || 0;

          let taxRate = 0;
          const taxRaw = row.Taxe || row.taxe || row.tax;
          if (taxRaw) {
            taxRate = parseFloat(taxRaw.replace(',', '.').replace('%', ''));
          }
          // Produit stocké en TTC, taux de taxe dans ecotax pour calcul HT côté Dashboard

          // Détection flexible de la date
          const dateRaw = sanitize.text(row.date_availability_produit || row.date_produit || row.date);
          const date = dateRaw ? dateRaw.split('/').reverse().join('-') : "";
         // console.log("Date détectée pour le produit", ref, ":", date);
          if (!name || !ref) continue;

          // Gestion de la catégorie
          let catId = 2; // Accueil par défaut
          const catNameRaw = sanitize.text(row.categorie || row.category);
          if (catNameRaw) {
            const catName = catNameRaw.toLowerCase();
            if (!catToIdMap[catName]) {
              const catLink = catName.replace(/[^a-z0-9]/g, '-');
              const catXml = `<prestashop><category><name><language id="1">${catNameRaw}</language></name><active>1</active><id_parent>2</id_parent><link_rewrite><language id="1">${catLink}</language></link_rewrite></category></prestashop>`;
              try {
                const catRes = await postPrestaData('categories', catXml);
                const newCatId = extractXmlId(catRes, 'id');
                if (newCatId) {
                  catToIdMap[catName] = newCatId;
                  localHistory.categories.push(newCatId);
                }
              } catch (e) {
                // Ignore et garde la catégorie par défaut
              }
            }
            if (catToIdMap[catName]) catId = catToIdMap[catName];
          }

          // Création du produit : prix = TTC, supplier_reference = taux de taxe
          const xml = `
            <prestashop>
              <product>
                <id_category_default>${catId}</id_category_default>
                <price>${priceTTC.toFixed(6)}</price>
                <supplier_reference>${taxRate.toFixed(2)}</supplier_reference>
                <wholesale_price>${wholesalePrice.toFixed(6)}</wholesale_price>
                <id_tax_rules_group>0</id_tax_rules_group>
                <active>1</active>
                <state>1</state>
                <available_date>${date}</available_date>
                <reference>${ref}</reference>
                <name><language id="1">${name}</language></name>
                <link_rewrite><language id="1">${ref.toLowerCase()}</language></link_rewrite>
              </product>
            </prestashop>`;

          const res = await postPrestaData('products', xml);
          const id = extractXmlId(res, 'id');
          if (!id) throw new Error(`ID introuvable après création du produit ${ref}`);

          refToIdMap[ref] = id;
          localHistory.products.push(id);
          addLog(`Produit créé : ${name} (${ref}) -> ID ${id}`, 'success');
        }
      }

      // --- ÉTAPE 2 : IMAGES (ZIP) ---
      if (files.zip) {
        addLog("▶ ÉTAPE 2 : Traitement des images...", "info");
        const zip = new JSZip();
        const content = await zip.loadAsync(files.zip);
        for (let filename of Object.keys(content.files)) {
          const refInName = filename.split('.')[0];
          if (refToIdMap[refInName]) {
            const blob = await content.files[filename].async("blob");
            await uploadPrestaImage(refToIdMap[refInName], blob);
            addLog(`Image ajoutée au produit ${refInName}`, 'success');
          }
        }
      }

      // --- ÉTAPE 3 : DÉCLINAISONS (fichier 2) ---
      if (files.dec) {
        addLog(`▶ ÉTAPE 3 : Création des déclinaisons & stock (${files.dec.length} lignes)...`, "info");
        let i = 0;
        const productTotalStock = {}; // pId -> total stock des déclinaisons
        for (const row of files.dec) {
          i++;
          const ref = sanitize.ref(row.reference);
          const pId = refToIdMap[ref];

          // Recherche flexible de la clé "specificité"
          const specKey = Object.keys(row).find(k => k.toLowerCase().startsWith('specifi'));
          const spec = specKey ? sanitize.text(row[specKey]) : "";
          const val = sanitize.text(row.karazany || row.valeur);
          const stock = parseInt(row.stock_initial) || 0;
          const decPriceTTC = row.prix_vente_ttc ? parseFloat(sanitize.price(row.prix_vente_ttc)) : null;

          // Impact de prix = différence TTC entre la déclinaison et le produit parent
          let impactPrice = 0;
          if (decPriceTTC !== null && files.cat) {
            const parentRow = files.cat.find(r => sanitize.ref(r.reference || r.ref) === ref);
            if (parentRow) {
              const parentTTC = parseFloat(sanitize.price(parentRow.prix_ttc || parentRow.prix)) || 0;
              impactPrice = decPriceTTC - parentTTC;
            }
          }

          if (!pId) {
            throw new Error(`Produit introuvable pour la référence ${ref} (impossible de créer la déclinaison)`);
          }

          if (!spec || !val) {
            // Pas de déclinaison mais un stock_initial → mettre à jour le stock principal du produit
            if (stock > 0 && pId) {
              try {
                const stockData = await fetchPrestaData(`stock_availables?filter[id_product]=[${pId}]&filter[id_product_attribute]=[0]&display=full`);
                let stockItems = stockData?.stock_availables?.stock_available;
                if (stockItems) {
                  if (!Array.isArray(stockItems)) stockItems = [stockItems];
                  const mainStock = stockItems[0];
                  if (mainStock) {
                    const stockId = mainStock.id || mainStock['@_id'];
                    const resp = await fetch(`${BASE_URL}/stock_availables/${stockId}?ws_key=${API_KEY}`);
                    let xmlStock = await resp.text();
                    xmlStock = xmlStock.replace(/<quantity><!\[CDATA\[.*?\]\]><\/quantity>/, `<quantity><![CDATA[${stock}]]></quantity>`);
                    if (!xmlStock.includes(`<![CDATA[${stock}]]>`)) {
                      xmlStock = xmlStock.replace(/<quantity>.*?<\/quantity>/, `<quantity><![CDATA[${stock}]]></quantity>`);
                    }
                    await updatePrestaData('stock_availables', stockId, xmlStock);
                    addLog(`Stock principal de ${ref} initialisé à ${stock}`, 'success');
                  }
                }
              } catch (e) {
                addLog(` Impossible d'initialiser le stock de ${ref}: ${e.message}`, 'warning');
              }
            }
            addLog(`Aucune déclinaison spécifiée pour le produit ${ref}, ignoré`, 'info');
            continue;
          }

          // Créons l'option (groupe d'attributs) seulement si elle n'existe pas déjà
          const specCacheKey = spec.toLowerCase();
          let optId = specToOptIdMap[specCacheKey];
          if (!optId) {
            const optXml = `<prestashop><product_option><is_color_group>0</is_color_group><group_type>select</group_type><name><language id="1">${spec}</language></name><public_name><language id="1">${spec}</language></public_name></product_option></prestashop>`;
            const optRes = await postPrestaData('product_options', optXml);
            optId = extractXmlId(optRes, 'id');
            if (!optId) throw new Error("Erreur ID product_option");
            localHistory.product_options.push(optId);
            specToOptIdMap[specCacheKey] = optId;
          }

          // Créons la valeur d'attribut seulement si elle n'existe pas déjà dans ce groupe
          const valKey = `${optId}_${val.toLowerCase()}`;
          let valId = valToValIdMap[valKey];
          if (!valId) {
            const valXml = `<prestashop><product_option_value><id_attribute_group>${optId}</id_attribute_group><name><language id="1">${val}</language></name></product_option_value></prestashop>`;
            const valRes = await postPrestaData('product_option_values', valXml);
            valId = extractXmlId(valRes, 'id');
            if (!valId) throw new Error("Erreur ID product_option_value");
            localHistory.product_option_values.push(valId);
            valToValIdMap[valKey] = valId;
          }

          const combXml = `<prestashop><combination><id_product>${pId}</id_product><reference>${ref}_${val}</reference><price>${impactPrice.toFixed(6)}</price><minimal_quantity>1</minimal_quantity><associations><product_option_values><product_option_value><id>${valId}</id></product_option_value></product_option_values></associations></combination></prestashop>`;
          const combRes = await postPrestaData('combinations', combXml);
          const combId = extractXmlId(combRes, 'id');
          if (!combId) throw new Error("Erreur ID combination");
          localHistory.combinations.push(combId);

          refToCombMap[`${ref}_${val}`] = combId;

          // --- INITIALISATION DU STOCK DE LA DÉCLINAISON ---
          if (stock > 0) {
            try {
              // Attendre un peu que PrestaShop crée l'entrée stock_available
              const stockData = await fetchPrestaData(`stock_availables?filter[id_product]=[${pId}]&filter[id_product_attribute]=[${combId}]&display=full`);
              let stockItems = stockData?.stock_availables?.stock_available;
              if (stockItems) {
                if (!Array.isArray(stockItems)) stockItems = [stockItems];
                const combStock = stockItems[0];
                if (combStock) {
                  const stockId = combStock.id || combStock['@_id'];
                  const resp = await fetch(`${BASE_URL}/stock_availables/${stockId}?ws_key=${API_KEY}`);
                  let xmlStock = await resp.text();
                  xmlStock = xmlStock.replace(/<quantity><!\[CDATA\[.*?\]\]><\/quantity>/, `<quantity><![CDATA[${stock}]]></quantity>`);
                  if (!xmlStock.includes(`<![CDATA[${stock}]]>`)) {
                    xmlStock = xmlStock.replace(/<quantity>.*?<\/quantity>/, `<quantity><![CDATA[${stock}]]></quantity>`);
                  }
                  await updatePrestaData('stock_availables', stockId, xmlStock);
                }
              }
            } catch (e) {
              addLog(` Stock non initialisé pour ${ref}_${val}: ${e.message}`, 'warning');
            }
          }

          addLog(`Déclinaison ${val} ajoutée au produit ${ref} (stock: ${stock})`, 'success');
          
          // Accumuler le stock pour le produit parent
          if (stock > 0) {
            productTotalStock[pId] = (productTotalStock[pId] || 0) + stock;
          }
        }
        
        // Mise à jour du stock principal (id_product_attribute=0) pour chaque produit ayant des déclinaisons
        for (const pId of Object.keys(productTotalStock)) {
          const totalStock = productTotalStock[pId];
          try {
            const stockData = await fetchPrestaData(`stock_availables?filter[id_product]=[${pId}]&filter[id_product_attribute]=[0]&display=full`);
            let stockItems = stockData?.stock_availables?.stock_available;
            if (stockItems) {
              if (!Array.isArray(stockItems)) stockItems = [stockItems];
              const mainStock = stockItems[0];
              if (mainStock) {
                const stockId = mainStock.id || mainStock['@_id'];
                const resp = await fetch(`${BASE_URL}/stock_availables/${stockId}?ws_key=${API_KEY}`);
                let xmlStock = await resp.text();
                xmlStock = xmlStock.replace(/<quantity><!\[CDATA\[.*?\]\]><\/quantity>/, `<quantity><![CDATA[${totalStock}]]></quantity>`);
                if (!xmlStock.includes(`<![CDATA[${totalStock}]]>`)) {
                  xmlStock = xmlStock.replace(/<quantity>.*?<\/quantity>/, `<quantity><![CDATA[${totalStock}]]></quantity>`);
                }
                await updatePrestaData('stock_availables', stockId, xmlStock);
                addLog(`Stock global du produit (ID: ${pId}) mis à jour à ${totalStock} (somme des déclinaisons)`, 'success');
              }
            }
          } catch (e) {
            console.warn(`Erreur maj stock global pour produit ${pId}:`, e);
          }
        }
      }

      // --- ÉTAPE 4 : COMMANDES (fichier 3) ---
      if (files.ord) {
        addLog(`▶ ÉTAPE 4 : Importation des commandes & paniers (${files.ord.length} lignes)...`, "info");
        let i = 0;
        const emailToCustIdMap = {};
        const emailToAddrIdMap = {};

        for (const row of files.ord) {
          i++;
          const email = sanitize.text(row.email);
          const nom = sanitize.text(row.nom);
          const adresse = sanitize.text(row.adresse);
          const etatStr = sanitize.text(row.etat).toLowerCase();
          const dateRaw = sanitize.text(row.date);
          let dateFormatted = "";
          if (dateRaw) {
            const parts = dateRaw.split('/');
            if (parts.length === 3) {
              dateFormatted = `${parts[2]}-${parts[1]}-${parts[0]} 12:00:00`;
            } else {
              dateFormatted = `${dateRaw} 12:00:00`;
            }
          }
         // console.log(`Traitement de la ligne ${i} pour ${email} : date="${dateRaw}", nom="${nom}", adresse="${adresse}", achat="${row.achat}", etat="${etatStr}"`);

          // Créer Client s'il n'existe pas déjà dans cet import
          let custId = emailToCustIdMap[email];
          if (!custId) {
            const custXml = `<prestashop><customer><passwd>pass1234</passwd><lastname>${nom}</lastname><firstname>Client</firstname><email>${email}</email><active>1</active></customer></prestashop>`;
            const custRes = await postPrestaData('customers', custXml);
            custId = extractXmlId(custRes, 'id');
            if (!custId) throw new Error("Erreur ID customer");
            localHistory.customers.push(custId);
            emailToCustIdMap[email] = custId;
          }

          // Créer Adresse s'il n'existe pas déjà
          let addrId = emailToAddrIdMap[email];
          if (!addrId) {
            const addrXml = `<prestashop><address><id_customer>${custId}</id_customer><id_country>8</id_country><alias>Maison</alias><lastname>${nom}</lastname><firstname>Client</firstname><address1>${adresse}</address1><city>Ville</city></address></prestashop>`;
            const addrRes = await postPrestaData('addresses', addrXml);
            addrId = extractXmlId(addrRes, 'id');
            if (!addrId) throw new Error("Erreur ID address");
            localHistory.addresses.push(addrId);
            emailToAddrIdMap[email] = addrId;
          }

          // Parser les achats : [("T_01";3;"ngoza"), ...]
          const achatRaw = row.achat || "";
          const regex = /\("([^"]+)";(\d+);"([^"]*)"\)/g;
          let match;
          let cartRows = "";
          let orderTTC = 0;
          let orderHT = 0;

          while ((match = regex.exec(achatRaw)) !== null) {
            const pRef = match[1];
            const pQty = parseInt(match[2], 10);
            const pVar = match[3];

            const productId = refToIdMap[pRef];
            const combId = refToCombMap[`${pRef}_${pVar}`] || 0;
            //const combId = refToCombMap[`${pRef}_${pVar}`] ?? refToCombMap[`${pRef}-${pVar}`] ?? 0;
            if (!productId) throw new Error(`Référence produit ${pRef} non trouvée dans le panier de ${email}`);

            // === CALCUL DES TAXES ET TOTAUX DE LA COMMANDE ===
            if (files.cat) {
              const pRow = files.cat.find(r => sanitize.ref(r.reference || r.ref) === pRef);
              if (pRow) {
                let taxRate = 0;
                const taxRaw = pRow.Taxe || pRow.taxe || "";
                if (taxRaw) taxRate = parseFloat(taxRaw.replace(',', '.').replace('%', ''));

                let unitTTC = parseFloat(sanitize.price(pRow.prix_ttc || pRow.prix)) || 0;

                // Vérifier si la déclinaison a un prix TTC spécifique
                if (files.dec) {
                  const dRow = files.dec.find(r => sanitize.ref(r.reference || r.ref) === pRef && sanitize.text(r.karazany || r.valeur) === pVar);
                  if (dRow && dRow.prix_vente_ttc) {
                    unitTTC = parseFloat(sanitize.price(dRow.prix_vente_ttc));
                  }
                }

                const unitHT = unitTTC / (1 + (taxRate / 100));

                orderTTC += unitTTC * pQty;
                orderHT += unitHT * pQty;
              }
            }

            cartRows += `<cart_row><id_product>${productId}</id_product><id_product_attribute>${combId}</id_product_attribute><id_address_delivery>${addrId}</id_address_delivery><quantity>${pQty}</quantity></cart_row>`;
          }

          if (!cartRows) throw new Error(`Panier vide détecté pour ${email}`);

          // Créer Panier
          const dateXml = dateFormatted ? `<date_add><![CDATA[${dateFormatted}]]></date_add><date_upd><![CDATA[${dateFormatted}]]></date_upd>` : '';
          const cartXml = `<prestashop><cart><id_currency>1</id_currency><id_lang>1</id_lang><id_customer>${custId}</id_customer><id_address_delivery>${addrId}</id_address_delivery><id_address_invoice>${addrId}</id_address_invoice>${dateXml}<associations><cart_rows>${cartRows}</cart_rows></associations></cart></prestashop>`;
          const cartRes = await postPrestaData('carts', cartXml);
          const cartId = extractXmlId(cartRes, 'id');
          if (!cartId) throw new Error("Erreur ID cart");
          localHistory.carts.push(cartId);

          // Vérifier État de la commande de manière flexible
          const isCartOnly = !etatStr || etatStr.includes("dans le panier");
          if (isCartOnly) {
            addLog(`Panier créé pour ${email} (Pas de commande)`, 'success');
          } else {
            let stateId = 3; // En cours par défaut
            if (etatStr.includes('accept') || etatStr.includes('effectu')) stateId = 2;
            if (etatStr.includes('annul')) stateId = 6;

            // Créer la commande directement avec l'état final voulu
            // (pas d'état intermédiaire → pas de double transition → pas de "Erreur de paiement")
           const orderXml = `<prestashop><order><id_cart>${cartId}</id_cart><id_carrier>1</id_carrier><id_currency>1</id_currency><id_lang>1</id_lang><id_customer>${custId}</id_customer><id_address_delivery>${addrId}</id_address_delivery><id_address_invoice>${addrId}</id_address_invoice><current_state>${stateId}</current_state><module>ps_wirepayment</module><payment>Virement</payment><total_paid>${orderTTC.toFixed(6)}</total_paid><total_paid_tax_incl>${orderTTC.toFixed(6)}</total_paid_tax_incl><total_paid_tax_excl>${orderHT.toFixed(6)}</total_paid_tax_excl><total_paid_real>${orderTTC.toFixed(6)}</total_paid_real><total_products>${orderHT.toFixed(6)}</total_products><total_products_wt>${orderTTC.toFixed(6)}</total_products_wt><conversion_rate>1</conversion_rate>${dateXml}</order></prestashop>`;
            let orderId;
            try {
              const orderRes = await postPrestaData('orders', orderXml);
              orderId = extractXmlId(orderRes, 'id');
            } catch (err) {
              // PrestaShop renvoie souvent une 500 à cause de hooks internes (gamification, etc.)
              // mais la commande est quand même insérée en base
              addLog(` Erreur API commande (${err.message.substring(0, 100)}), vérification...`, 'warning');
              
              // Attendre un peu que PrestaShop finalise l'insertion
              await new Promise(r => setTimeout(r, 500));
              
              try {
                const checkRes = await fetchPrestaData(`orders?filter[id_cart]=[${cartId}]&display=[id]`);
                if (checkRes && checkRes.orders && checkRes.orders.order) {
                  let ordersList = checkRes.orders.order;
                  if (!Array.isArray(ordersList)) ordersList = [ordersList];
                  orderId = ordersList[0].id || ordersList[0]['@_id'];
                  addLog(`✅ Commande trouvée malgré l'erreur hook (ID: ${orderId})`, 'success');
                }
              } catch (checkErr) {
                addLog(`⚠️ Vérification impossible: ${checkErr.message}`, 'warning');
              }
              
              if (!orderId) throw new Error(`Impossible de créer la commande pour ${email}: ${err.message.substring(0, 150)}`);
            }
            if (!orderId) throw new Error("Erreur ID order");
            localHistory.orders.push(orderId);

    
            if (dateFormatted && orderId) {
              try {
               
                const orderResp = await fetch(`${BASE_URL}/orders/${orderId}?ws_key=${API_KEY}`);
                let xmlOrder = await orderResp.text();

                if (xmlOrder.includes('<date_add><![CDATA[')) {
                  xmlOrder = xmlOrder.replace(/<date_add><!\[CDATA\[.*?\]\]><\/date_add>/, `<date_add><![CDATA[${dateFormatted}]]></date_add>`);
                } else {
                  xmlOrder = xmlOrder.replace(/<date_add>.*?<\/date_add>/, `<date_add><![CDATA[${dateFormatted}]]></date_add>`);
                }

                if (xmlOrder.includes('<date_upd><![CDATA[')) {
                  xmlOrder = xmlOrder.replace(/<date_upd><!\[CDATA\[.*?\]\]><\/date_upd>/, `<date_upd><![CDATA[${dateFormatted}]]></date_upd>`);
                } else {
                  xmlOrder = xmlOrder.replace(/<date_upd>.*?<\/date_upd>/, `<date_upd><![CDATA[${dateFormatted}]]></date_upd>`);
                }
                await updatePrestaData('orders', orderId, xmlOrder);
                addLog(`Commande #${orderId} créée et antidatée au ${dateFormatted}`, 'success');
              } catch (err) {
                addLog(`Commande #${orderId} créée, mais impossible de forcer la date: ${err.message}`, 'warning');
              }
            } else {
              addLog(`Commande #${orderId} créée pour ${email} (Date par défaut : Aujourd'hui)`, 'success');
            }
          }
        }
      }

      addLog(" IMPORTATION TERMINÉE", "success");
    } catch (err) {
      addLog(` ERREUR GLOBALE : ${err.message}`, "error");
      await rollback(localHistory);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] p-10 font-sans text-[#363a41]">
      <div className="max-w-3xl mx-auto bg-white border border-[#dbe6e9] shadow-sm rounded-sm">

        {/* HEADER STYLE PRESTASHOP */}
        <div className="px-6 py-4 border-b border-[#dbe6e9] flex justify-between items-center">
          <h2 className="text-lg font-semibold uppercase tracking-wide">Importation de données CSV/ZIP</h2>
          <span className="text-xs bg-[#eff6f7] px-2 py-1 text-[#25b9d7] font-bold rounded-sm">V2.0 PRO</span>
        </div>

        {/* FORMULAIRE MINIMALISTE */}
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            {[
              { id: 'cat', label: '1. Catalogue Produits (CSV)', accept: '.csv' },
              { id: 'dec', label: '2. Déclinaisons / Options (CSV)', accept: '.csv' },
              { id: 'ord', label: '3. Commandes & États (CSV)', accept: '.csv' },
              { id: 'zip', label: '4. Images Produits (ZIP)', accept: '.zip' }
            ].map(f => (
              <div key={f.id} className="flex flex-col">
                <label className="text-xs font-bold text-[#6c868e] uppercase mb-2">{f.label}</label>
                <input
                  type="file" accept={f.accept}
                  onChange={(e) => handleFile(e, f.id)}
                  className="text-sm border border-[#bbcdd2] p-2 focus:outline-none focus:border-[#25b9d7] transition-colors"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              onClick={runImport}
              disabled={isImporting || isResetting || !files.cat}
              className={`flex-1 py-3 font-bold uppercase tracking-widest text-sm transition-all ${(isImporting || isResetting || !files.cat) ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-[#000000] text-white hover:bg-[#333333]'
                }`}
            >
              {isImporting ? 'Traitement en cours...' : 'Lancer l\'importation'}
            </button>

            <button
              onClick={handleResetAll}
              disabled={isImporting || isResetting}
              className={`px-6 py-3 font-bold uppercase tracking-widest text-sm transition-all border ${(isImporting || isResetting) ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-[#ff4c4c] text-[#ff4c4c] hover:bg-[#ff4c4c] hover:text-white'
                }`}
            >
              {isResetting ? 'Effacement...' : 'Réinitialiser la Base'}
            </button>
          </div>
        </div>

        {/* CONSOLE DE LOGS NOIR ET BLANC */}
        <div className="bg-[#111111] p-4 h-80 overflow-y-auto font-mono text-[12px] leading-relaxed">
          {logs.length === 0 ? (
            <div className="text-[#777777] italic">Système prêt. Sélectionnez les fichiers puis lancez l'import.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1 border-l-2 border-[#333333] pl-2">
                <span className="text-[#777777]">[{log.time}]</span>
                <span className={`ml-2 ${log.type === 'error' ? 'text-[#ff4c4c] font-bold' :
                  log.type === 'success' ? 'text-[#4cbb6c]' : 'text-[#ffffff]'
                  }`}>
                  {log.msg}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}