import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Génère et télécharge la facture PDF d'une commande PrestaShop.
 * @param {Object} order - L'objet complet de la commande contenant les détails, produits et client.
 */
export const exportInvoiceToPDF = (order) => {
  if (!order) {
    console.error("Aucune donnée de commande fournie pour l'export.");
    return;
  }

  // 1. Initialiser le document PDF (Format A4, unité en mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Configuration des marges et de la largeur disponible
  const margin = 15;
  const pageWidth = doc.internal.pageSize.width;
  
  // 2. EN-TÊTE : Informations de l'entreprise / Boutique
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("FACTURE", margin, 25);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Votre Boutique PrestaShop", margin, 32);
  doc.text("Antananarivo, Madagascar", margin, 37);
  doc.text("Email : contact@boutique.mg", margin, 42);

  // Ligne de séparation horizontale fine
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, 48, pageWidth - margin, 48);

  // 3. BLOC MÉTADONNÉES : Infos Commande & Infos Client
  // Colonne Gauche : Détails Facture
  doc.setFont("helvetica", "bold");
  doc.text("DÉTAILS DE LA FACTURE", margin, 58);
  doc.setFont("helvetica", "normal");
  doc.text(`Numéro de Commande : #${order.id}`, margin, 64);
  doc.text(`Référence : ${order.reference || '—'}`, margin, 69);
  doc.text(`Date : ${order.date_add || new Date().toLocaleDateString()}`, margin, 74);
  doc.text(`Statut de Paiement : ${order.payment_status || 'En attente'}`, margin, 79);

  // Colonne Droite : Informations Client (Aligné à droite du document)
  const rightColumnX = pageWidth - margin - 60;
  doc.setFont("helvetica", "bold");
  doc.text("ADRESSE DE LIVRAISON", rightColumnX, 58);
  doc.setFont("helvetica", "normal");
  
  const clientName = order.customer_name || `${order.firstname || ''} ${order.lastname || 'Client'}`;
  doc.text(clientName, rightColumnX, 64);
  
  if (order.shipping_address) {
    doc.text(order.shipping_address.address || '', rightColumnX, 69);
    doc.text(`${order.shipping_address.postcode || ''} ${order.shipping_address.city || ''}`, rightColumnX, 74);
  } else {
    doc.text("Adresse non renseignée", rightColumnX, 69);
  }

  // 4. TABLEAU DES PRODUITS (Généré automatiquement avec autoTable)
  const tableColumn = ["ID", "Désignation", "Déclinaison", "Qté", "Prix Unit.", "Total"];
  const tableRows = [];

  // Vérifier et parcourir la liste des produits associés à la commande
  const productsList = order.products || [];
  
  productsList.forEach((product) => {
    const qty = Number(product.quantity || product.product_quantity || 0);
    const unitPrice = Number(product.price || product.product_price || 0);
    const totalPrice = qty * unitPrice;

    const rowData = [
      product.product_id || product.id || '—',
      product.product_name || product.name || 'Produit sans nom',
      product.combination_ref || (product.product_attribute_id && product.product_attribute_id !== '0' ? `#${product.product_attribute_id}` : '—'),
      qty.toString(),
      `${unitPrice.toFixed(2)}`,
      `${totalPrice.toFixed(2)}`
    ];
    tableRows.push(rowData);
  });

  // Rendu du tableau stylisé
  doc.autoTable({
    startY: 88,
    head: [tableColumn],
    body: tableRows,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: {
      fillColor: [0, 0, 0], // En-tête noir minimaliste et professionnel
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      3: { halign: 'center' }, // Aligner la quantité au centre
      4: { halign: 'right' },  // Aligner le prix unitaire à droite
      5: { halign: 'right' }   // Aligner le total à droite
    },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 3
    }
  });

  // 5. ZONE DES TOTAUX (Calculée juste en dessous du tableau automatique)
  const finalY = doc.lastAutoTable.finalY + 10;
  const totalsX = pageWidth - margin - 50;

  const totalPaid = Number(order.total_paid || order.total_paid_tax_incl || 0);
  const totalProducts = Number(order.total_products || order.total_products_wt || totalPaid);
  const totalShipping = totalPaid - totalProducts > 0 ? totalPaid - totalProducts : 0;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Sous-total :`, totalsX, finalY);
  doc.text(`${totalProducts.toFixed(2)}`, pageWidth - margin, finalY, { align: 'right' });

  doc.text(`Frais de livraison :`, totalsX, finalY + 5);
  doc.text(`${totalShipping.toFixed(2)}`, pageWidth - margin, finalY + 5, { align: 'right' });

  // Ligne de délimitation pour le montant total global
  doc.setDrawColor(150, 150, 150);
  doc.line(totalsX, finalY + 8, pageWidth - margin, finalY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Total Général :`, totalsX, finalY + 13);
  doc.text(`${totalPaid.toFixed(2)}`, pageWidth - margin, finalY + 13, { align: 'right' });

  // 6. PIED DE PAGE
  const pageHeight = doc.internal.pageSize.height;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Merci pour votre confiance ! Pour toute réclamation, contactez notre support technique.", pageWidth / 2, pageHeight - 10, { align: 'center' });

  // 7. DÉCLENCHER LE TÉLÉCHARGEMENT AUTOMATIQUE
  const fileName = `Facture_${order.reference || order.id || '0000'}.pdf`;
  doc.save(fileName);
};