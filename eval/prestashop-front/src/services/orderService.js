import { XMLParser } from 'fast-xml-parser';
import { extractValue } from './apiClient';
import { decrementStock } from './productservice';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});

const API_KEY = '77KUX2NEZ7SIRLUVUKXR5EDA5U7TWM2I';
const BASE_URL = '/api-presta/api';

function toNumber(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function formatPrestaDate(date = new Date()) {
  const pad = (v) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Enregistrer un paiement dans PrestaShop (ps_order_payment) via Webservice.
 * Attention: cela ne remplace pas la logique des modules de paiement, mais permet
 * de synchroniser "payé" côté BO si vous gérez le paiement vous-même.
 */
export async function createOrderPayment({
  orderReference,
  amount,
  paymentMethod,
  transactionId = '',
  idCurrency = 1,
  conversionRate = '1.000000',
  idEmployee = 1,
  dateAdd = formatPrestaDate(),
}) {
  if (!orderReference) throw new Error('createOrderPayment: orderReference manquant');
  if (!paymentMethod) throw new Error('createOrderPayment: paymentMethod manquant');

  const amountFixed = toNumber(amount, 0).toFixed(6);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_payment>
    <order_reference><![CDATA[${orderReference}]]></order_reference>
    <id_currency><![CDATA[${idCurrency}]]></id_currency>
    <amount><![CDATA[${amountFixed}]]></amount>
    <payment_method><![CDATA[${paymentMethod}]]></payment_method>
    <conversion_rate><![CDATA[${conversionRate}]]></conversion_rate>
    <transaction_id><![CDATA[${transactionId}]]></transaction_id>
    <date_add><![CDATA[${dateAdd}]]></date_add>
    <id_employee><![CDATA[${idEmployee}]]></id_employee>
  </order_payment>
</prestashop>`;

  const res = await fetch(`${BASE_URL}/order_payments?ws_key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`createOrderPayment: ${res.status} - ${text}`);
  }

  const parsed = parser.parse(text);
  const id = parsed.prestashop?.order_payment?.id;
  return { id };
}

export async function getOrderReference(orderId) {
  const res = await fetch(`${BASE_URL}/orders/${orderId}?ws_key=${API_KEY}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`getOrderReference: ${res.status} - ${text}`);
  const parsed = parser.parse(text);
  return extractValue(parsed.prestashop?.order?.reference);
}

export async function deleteDefaultOrderHistory(orderId) {
  try {
    // 1. Récupérer tous les historiques de cette commande
    const res = await fetch(`${BASE_URL}/order_histories?ws_key=${API_KEY}&filter[id_order]=[${orderId}]&display=[id]&sort=[id_ASC]&limit=1`);

    if (!res.ok) return;

    const text = await res.text();
    const parsed = parser.parse(text);
    const history = parsed.prestashop?.order_histories?.order_history;

    if (history) {
      const historyId = Array.isArray(history) ? history[0].id : history.id;

      // 2. Supprimer ce premier historique forcé par le système
      await fetch(`${BASE_URL}/order_histories/${historyId}?ws_key=${API_KEY}`, {
        method: 'DELETE'
      });
      console.log(`✓ Historique par défaut ${historyId} supprimé.`);
    }
  } catch (error) {
    console.error('Erreur nettoyage historique:', error.message);
  }
}

export async function submitOrderToPrestashop(cartItems, shippingInfo, customer, totals) {
  try {
    let id_customer = customer?.id;
    let secure_key = customer?.secure_key;
    let customerExists = false;

    // 1. Vérifier si le client actuel (depuis la session) existe vraiment dans PrestaShop
    if (id_customer && id_customer !== 'admin-1' && !isNaN(parseInt(id_customer))) {
      try {
        const custCheck = await fetch(`${BASE_URL}/customers/${id_customer}?ws_key=${API_KEY}`);
        if (custCheck.ok) {
          customerExists = true;
          const custParsed = parser.parse(await custCheck.text());
          const fetchedKey = custParsed.prestashop?.customer?.secure_key;
          if (fetchedKey) secure_key = fetchedKey;
        } else {
          console.warn(`Customer ${id_customer} n'existe plus dans PrestaShop (404).`);
        }
      } catch (e) { }
    }

    // 2. Si le client n'existe pas ou est admin factice, on cherche un vrai client valide
    if (!customerExists) {
      console.log('Recherche d\'un vrai customer ID...');
      try {
        const listRes = await fetch(`${BASE_URL}/customers?ws_key=${API_KEY}&display=[id,secure_key]&limit=1`);
        if (listRes.ok) {
          const listParsed = parser.parse(await listRes.text());
          const cList = listParsed.prestashop?.customers?.customer;
          if (cList) {
            const firstCustomer = Array.isArray(cList) ? cList[0] : cList;
            id_customer = firstCustomer.id;
            secure_key = firstCustomer.secure_key;
            console.log(`Fallback sur le vrai client existant ID: ${id_customer}`);
          }
        }
      } catch (e) {
        console.warn('Impossible de fetch un customer', e);
      }
    }

    // Fallback ultime si la base est vide
    if (!id_customer || isNaN(parseInt(id_customer))) {
      id_customer = 1;
    }
    if (!secure_key) {
      secure_key = '00000000000000000000000000000000';
    }

    const id_currency = 1;
    const id_lang = 1;
    const id_country = 8;

    console.log('=== ÉTAPE 1: Créer l\'adresse ===');
    const addressXml = `<?xml version="1.0" encoding="UTF-8"?><prestashop><address><id_customer><![CDATA[${id_customer}]]></id_customer><id_country><![CDATA[${id_country}]]></id_country><alias><![CDATA[Livraison]]></alias><lastname><![CDATA[${customer?.lastname || 'Client'}]]></lastname><firstname><![CDATA[${customer?.firstname || 'React'}]]></firstname><address1><![CDATA[${shippingInfo.address}]]></address1><postcode><![CDATA[${shippingInfo.postalCode}]]></postcode><city><![CDATA[${shippingInfo.city}]]></city></address></prestashop>`;

    const addrRes = await fetch(`${BASE_URL}/addresses?ws_key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: addressXml
    });

    if (!addrRes.ok) throw new Error(`Adresse création: ${addrRes.status}`);
    const addrParsed = parser.parse(await addrRes.text());
    const id_address = addrParsed.prestashop?.address?.id;
    if (!id_address) throw new Error('Pas d\'id_address');
    console.log('✓ Adresse créée:', id_address);

    // 2. Créer le panier (IMPORTANT: id_lang est obligatoire!)
    console.log('=== ÉTAPE 2: Créer le panier ===');
    let cartRows = '';
    cartItems.forEach(item => {
      cartRows += `<cart_row><id_product><![CDATA[${item.id}]]></id_product><id_product_attribute><![CDATA[${item.combinationId || 0}]]></id_product_attribute><quantity><![CDATA[${item.quantity}]]></quantity></cart_row>`;
    });

    const cartXml = `<?xml version="1.0" encoding="UTF-8"?><prestashop><cart>
<id_customer><![CDATA[${id_customer}]]></id_customer>
<id_address_delivery><![CDATA[${id_address}]]></id_address_delivery>
<id_address_invoice><![CDATA[${id_address}]]></id_address_invoice>
<id_currency><![CDATA[${id_currency}]]></id_currency>
<id_lang><![CDATA[${id_lang}]]></id_lang>
<associations><cart_rows>${cartRows}</cart_rows></associations>
</cart></prestashop>`;

    console.log('Envoi du panier...');
    const cartRes = await fetch(`${BASE_URL}/carts?ws_key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: cartXml
    });

    if (!cartRes.ok) throw new Error(`Panier création: ${cartRes.status}`);
    const cartParsed = parser.parse(await cartRes.text());
    const id_cart = cartParsed.prestashop?.cart?.id;
    if (!id_cart) throw new Error('Pas d\'id_cart');
    console.log('✓ Panier créé:', id_cart);

    // 3. Créer la commande réelle via /orders endpoint
    console.log('=== ÉTAPE 3: Créer la commande ===');
    const total_paid = totals?.total || 0;

    const subtotal = Number(totals?.subtotal || 0).toFixed(6);
    const total = Number(totals?.total || 0).toFixed(6);

    const isPaid = Boolean(totals?.isPaid);
    const currentState = isPaid ? 2 : 3; // 3 = En cours de préparation
    const totalPaidReal = isPaid ? total : '0.000000';

    const orderXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_cart>${id_cart}</id_cart>
    <id_address_delivery>${id_address}</id_address_delivery>
    <id_address_invoice>${id_address}</id_address_invoice>
    <id_currency>${id_currency}</id_currency>
    <id_lang>${id_lang}</id_lang>
    <id_customer>${id_customer}</id_customer>
    <id_carrier>1</id_carrier>
    <module>ps_cashondelivery</module>
    <payment>Paiement comptant a la livraison (Cash on delivery)</payment>
    <total_paid>${total}</total_paid>
    <total_paid_real>${totalPaidReal}</total_paid_real>
    <total_products>${subtotal}</total_products>
    <total_products_wt>${total}</total_products_wt>
    <conversion_rate>1.000000</conversion_rate>
    <secure_key>${secure_key}</secure_key>
  </order>
</prestashop>`;

    console.log('Envoi création commande...');
    const orderRes = await fetch(`${BASE_URL}/orders?ws_key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: orderXml
    });

    const orderText = await orderRes.text();
    let orderId;

    if (!orderRes.ok) {
      console.warn(`Erreur API commande (${orderRes.status}), vérification de la création...`);
      // Attendre un peu que PrestaShop finalise l'insertion en base
      await new Promise(r => setTimeout(r, 500));

      try {
        const checkRes = await fetch(`${BASE_URL}/orders?ws_key=${API_KEY}&filter[id_cart]=[${id_cart}]&display=[id]`);
        if (checkRes.ok) {
          const checkParsed = parser.parse(await checkRes.text());
          if (checkParsed.prestashop?.orders?.order) {
            let ordersList = checkParsed.prestashop.orders.order;
            if (!Array.isArray(ordersList)) ordersList = [ordersList];
            orderId = ordersList[0].id || ordersList[0]['@_id'];
            console.log('✅ Commande trouvée malgré l\'erreur 500 (ID:', orderId, ')');
          }
        }
      } catch (checkErr) {
        console.warn('Vérification impossible:', checkErr);
      }

      if (!orderId) {
        console.error('Erreur brute PrestaShop:', orderText);
        const cleanMsg = orderText.replace(/<[^>]+>/g, '').substring(0, 150);
        throw new Error(`Commande: ${orderRes.status} - ${cleanMsg}`);
      }
    } else {
      const orderParsed = parser.parse(orderText);
      orderId = orderParsed.prestashop?.order?.id;
    }

    if (!orderId) throw new Error('Pas d\'id dans réponse');

    console.log('✓✓ Commande créée avec ID:', orderId);

    // Si payé: enregistrer un vrai paiement (ps_order_payment)
    if (isPaid) {
      try {
        const orderReference = await getOrderReference(orderId);
        await createOrderPayment({
          orderReference,
          amount: total,
          paymentMethod: extractValue(orderParsed?.prestashop?.order?.payment) || 'Online',
        });
      } catch (payErr) {
        console.error('Erreur création order_payment:', payErr?.message || payErr);
      }
    }

    // FINI ! Plus de boucle de décrémentation manuelle ici.
    return orderId;

  } catch (error) {
    console.error('❌ ERREUR:', error.message);
    throw error;
  }
}

/**
 * Mettre à jour le statut d'une commande
 * @param {number} orderId - ID de la commande
 * @param {number} newStateId - Nouveau statut (ex: 2, 3, 4, 5, 6, 7, 8, 9, 10)
 * @returns {number} ID de l'order_history créé
 */
export async function updateOrderState(orderId, newStateId) {
  try {
    console.log(`=== Mise à jour statut commande ${orderId} → ${newStateId} ===`);

    const historyXml = `<?xml version="1.0" encoding="UTF-8"?><prestashop><order_history>
<id_order><![CDATA[${orderId}]]></id_order>
<id_order_state><![CDATA[${newStateId}]]></id_order_state>
<id_employee><![CDATA[1]]></id_employee>
</order_history></prestashop>`;

    const response = await fetch(`${BASE_URL}/order_histories?ws_key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: historyXml
    });

    if (!response.ok) {
      throw new Error(`Statut: ${response.status}`);
    }

    const responseText = await response.text();
    const parsed = parser.parse(responseText);
    const historyId = parsed.prestashop?.order_history?.id;

    console.log('✓ Statut mis à jour, order_history ID:', historyId);
    return historyId;

  } catch (error) {
    console.error('❌ Erreur mise à jour statut:', error.message);
    throw error;
  }
}

/**
 * Récupérer le statut de paiement d'une commande
 * @param {number} orderId - ID de la commande
 * @returns {object} Objet avec id et name du statut de paiement
 */
export async function getOrderPaymentStatus(orderId) {
  try {
    console.log(`=== Récupération statut paiement commande ${orderId} ===`);

    // Récupérer les détails de la commande pour voir si elle est payée
    const response = await fetch(`${BASE_URL}/orders/${orderId}?display=full&ws_key=${API_KEY}`);

    if (!response.ok) {
      throw new Error(`Erreur: ${response.status}`);
    }

    const responseText = await response.text();
    const parsed = parser.parse(responseText);
    const order = parsed.prestashop?.order;

    if (!order) {
      console.log('Commande non trouvée');
      return { id: '0', name: 'Non payé' };
    }

    const totalPaidReal = toNumber(extractValue(order.total_paid_real), 0);
    const totalDue = toNumber(
      extractValue(order.total_paid_tax_incl) || extractValue(order.total_paid),
      0
    );
    const currentState = toNumber(extractValue(order.current_state), 0);

    // PrestaShop: le champ <payment> est le MODE de paiement, pas le statut.
    // Le plus fiable pour "Payé" est: paiements enregistrés / total_paid_real cohérent.
    const epsilon = 0.005;
    const isPaid = totalDue > 0 && totalPaidReal + epsilon >= totalDue;

    // Fallback: si l'état est un état "payé" typique (2 = Paiement accepté)
    const paidByState = currentState === 2;

    const paymentStatusId = (isPaid || paidByState) ? '1' : '0';
    return { id: paymentStatusId, name: paymentStatusId === '1' ? 'Payé' : 'Non payé' };

  } catch (error) {
    console.error('❌ Erreur récupération paiement:', error.message);
    return { id: '0', name: 'Non payé' };
  }
}

/**
 * Mettre à jour le statut de paiement d'une commande
 * @param {number} orderId - ID de la commande
 * @param {number} paymentStatusId - Nouveau statut de paiement (0=Non payé, 1=Payé)
 * @returns {void}
 */
export async function updateOrderPaymentStatus(orderId, paymentStatusId) {
  try {
    console.log(`=== Mise à jour paiement commande ${orderId} → ${paymentStatusId} ===`);

    // Récupérer la commande actuelle
    const response = await fetch(`${BASE_URL}/orders/${orderId}?display=full&ws_key=${API_KEY}`);

    if (!response.ok) {
      throw new Error(`Erreur: ${response.status}`);
    }

    const responseText = await response.text();
    const parsed = parser.parse(responseText);
    const order = parsed.prestashop?.order;

    if (!order) {
      throw new Error('Commande non trouvée');
    }

    // Déterminer le nouvel état basé sur le statut de paiement
    // Si non payé (0), utiliser l'état "En attente de paiement" (état 1)
    // Si payé (1), utiliser l'état "Paiement accepté" (état 2)
    let newOrderState = '1'; // En attente de paiement
    if (paymentStatusId === '1') {
      newOrderState = '2'; // Paiement accepté
    }

    // Mettre à jour l'état de la commande
    await updateOrderState(orderId, newOrderState);

    console.log('✓ Statut paiement mis à jour');

  } catch (error) {
    console.error('❌ Erreur mise à jour paiement:', error.message);
    throw error;
  }
}