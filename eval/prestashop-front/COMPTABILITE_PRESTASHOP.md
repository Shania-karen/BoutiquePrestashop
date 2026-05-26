# Guide Complet : Prix, Taxes et Comptabilité dans PrestaShop

Ce document explique en détail comment PrestaShop calcule les prix, gère les taxes, les réductions, et comment exploiter ces données pour calculer ton Chiffre d'Affaires (CA) et tes bénéfices (Marge). C'est le cœur du réacteur pour tout projet e-commerce.

---

## 1. L'anatomie d'un Prix dans PrestaShop

Dans PrestaShop, la règle d'or est simple : **Tout se calcule d'abord en HT (Hors Taxes).** La taxe n'est qu'une couche ajoutée à la toute fin pour l'affichage au client.

### Les champs essentiels d'un produit (API)
- **`wholesale_price` (Prix d'achat HT)** : C'est ce que te coûte le produit chez ton fournisseur. C'est la base pour calculer ton bénéfice.
- **`price` (Prix de vente de base HT)** : C'est le prix auquel tu vends le produit, avant toute taxe, déclinaison ou réduction.
- **`id_tax_rules_group`** : L'identifiant de la règle de taxe applicable (ex: 20% TVA).
- **`ecotax`** : L'éco-participation (généralement TTC ou HT selon la configuration, mais à gérer à part).

---

## 2. La gestion des Déclinaisons (Combinations)

Si un produit a des déclinaisons (ex: Taille L, Couleur Rouge), cette déclinaison peut modifier le prix de base.
- **`price` (dans l'objet `combination`)** : C'est l'**impact sur le prix**. 
  *Exemple : Le T-Shirt de base coûte 10€ HT. La déclinaison "Rouge" a un impact `price` de `2.000000`. Le prix du T-Shirt Rouge est donc de `12€ HT`.*

**Formule du Prix de Vente HT (Avant réduction) :**
> `Prix_Vente_HT = price (Produit) + price (Déclinaison)`

---

## 3. Les Taxes (Tax Rules)

PrestaShop ne stocke pas directement le pourcentage de TVA sur le produit. Il stocke un `id_tax_rules_group`.
Pour trouver le taux réel (ex: 20%), il faut :
1. Chercher le groupe de taxes via `/api/tax_rules?filter[id_tax_rules_group]=X`
2. Récupérer l'`id_tax` associé.
3. Chercher la taxe via `/api/taxes/Y` pour obtenir le `rate` (ex: `20.000`).

**Formule du Prix TTC :**
> `Prix_TTC = Prix_Vente_HT * (1 + (Taux_TVA / 100))`

---

## 4. Les Réductions (Specific Prices)

PrestaShop gère les promotions via la table `specific_prices` (Prix spécifiques). Une réduction peut être :
- **Un montant fixe** (ex: -5€) : Le champ `reduction_type` vaut `amount`.
- **Un pourcentage** (ex: -20%) : Le champ `reduction_type` vaut `percentage`.

### La subtilité des réductions : HT ou TTC ?
La table `specific_prices` possède un champ `reduction_tax`.
- `reduction_tax = 0` : La réduction s'applique sur le prix HT.
- `reduction_tax = 1` : La réduction s'applique sur le prix TTC.

**Exemple de calcul avec -20% (percentage) :**
> `Nouveau_Prix_HT = Prix_Vente_HT * (1 - 0.20)`
> `Nouveau_Prix_TTC = Nouveau_Prix_HT * (1 + 0.20)`

**Exemple de calcul avec -5€ TTC (amount, reduction_tax = 1) :**
> `Nouveau_Prix_TTC = Prix_Vente_TTC - 5`
> `Nouveau_Prix_HT = Nouveau_Prix_TTC / 1.20`

---

## 5. La Comptabilité : Commandes et Factures

Quand une commande est passée, PrestaShop "fige" les prix dans l'objet `order` et dans les `order_rows` (lignes de la commande). C'est crucial car si tu changes le prix du produit le lendemain, la facture d'hier ne doit pas changer !

### Les champs clés d'une Commande (`/api/orders`)
- **`total_products`** : Total des produits HT (Le Chiffre d'Affaires HT).
- **`total_products_wt`** : Total des produits TTC (*with tax*).
- **`total_shipping_tax_excl` / `_incl`** : Frais de port HT / TTC.
- **`total_paid_tax_excl`** : Total final HT payé par le client (Produits + Port).
- **`total_paid_tax_incl`** : Total final TTC payé par le client (Ce qui a été débité sur sa carte).

### Calcul du Chiffre d'Affaires (CA)
En comptabilité française, **le CA se calcule toujours en HT**.
Si tu veux afficher le CA de la journée dans ton Dashboard :
1. Récupérer les commandes du jour dont l'état est "Payé" ou "Livré".
2. Additionner le champ `total_products` (si tu ne comptes que la marchandise) ou `total_paid_tax_excl` (si tu inclus les frais de port facturés).

### Calcul du Bénéfice (Marge Brute)
> `Marge = Chiffre d'Affaires HT - Coût d'Achat des marchandises vendues (COGS)`

Pour trouver le coût d'achat (COGS) d'une commande :
1. Parcours les `order_rows` de la commande.
2. Pour chaque ligne, PrestaShop a sauvegardé le `purchase_supplier_price` (le prix d'achat au moment de la commande).
3. `COGS Ligne = purchase_supplier_price * product_quantity`.
4. `Bénéfice de la commande = total_products - Somme(COGS Lignes)`.

---

## 6. Exporter des données (CSV / PDF)

### Logique d'Export CSV (Commandes ou Compta)
Si tu dois créer un bouton "Exporter la comptabilité en CSV" dans ton Front React :
1. Fais une requête API pour récupérer toutes les commandes du mois (filtre par date).
2. Boucle sur les commandes pour extraire : `ID`, `Date`, `Total HT`, `TVA`, `Total TTC`.
3. La TVA payée se calcule facilement : `TVA_Collectée = total_paid_tax_incl - total_paid_tax_excl`.
4. Formate ces données dans une chaîne de caractères séparée par des points-virgules (`;`).
5. Utilise la fonction native du navigateur pour déclencher le téléchargement du fichier généré.

### Logique de Génération de Facture PDF
PrestaShop génère déjà des PDF en interne (accessible via le BackOffice). 
Cependant, via l'API Webservice classique, tu ne peux pas télécharger le PDF directement (l'API renvoie de la data, pas des fichiers).

**Pour faire de la facture en React :**
1. Tu dois récupérer la commande (`/orders/ID`) et ses lignes (`order_rows`).
2. Tu récupères l'adresse de facturation (`/addresses/ID`).
3. Tu récupères les détails du client (`/customers/ID`).
4. Tu crées un joli composant HTML caché dans React qui ressemble à une facture (avec le logo, les adresses, le tableau des prix avec les colonnes : `PU HT`, `Qté`, `Total HT`, `TVA`, `Total TTC`).
5. Tu utilises une librairie comme `@react-pdf/renderer` ou `html2canvas` + `jspdf`. Ces librairies vont "photographier" ton HTML et le transformer en un vrai fichier PDF que l'utilisateur pourra télécharger.

### En résumé
Ne calcule **JAMAIS** de TTC ou de HT à la main en te basant sur le catalogue lors d'une exportation de commande passée ! Sers-toi toujours des valeurs figées dans les `orders` et `order_rows` de l'API. C'est la seule garantie d'une comptabilité juste (qui prend en compte les bons de réduction utilisés, les changements de prix passés, etc.).
