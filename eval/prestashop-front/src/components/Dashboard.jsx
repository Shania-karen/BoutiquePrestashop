import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar
} from 'recharts';
import { fetchPrestaData, extractValue } from '../services/apiClient';

const WIDGETS_DISPONIBLES = [
  { id: 'kpis', label: ' KPIs Généraux' },
  { id: 'salesGraph', label: ' Courbe des ventes' },
  { id: 'amountGraph', label: ' Courbe des revenus' },
  { id: 'dailyTable', label: ' Tableau par jour' }
];

function Dashboard() {
  const [activeWidgets, setActiveWidgets] = useState(['kpis', 'salesGraph', 'amountGraph', 'dailyTable']);
  const [allOrders, setAllOrders] = useState([]);
  const [taxRates, setTaxRates] = useState({});
  const [orphanCartCount, setOrphanCartCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filtres par date
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // 1. Charger les commandes
        const data = await fetchPrestaData('orders', 0, 1000);
        let orders = data?.orders?.order || [];
        if (!Array.isArray(orders)) orders = orders ? [orders] : [];

        // 2. Charger les produits pour récupérer le taux de taxe (stocké dans supplier_reference)
        const prodsData = await fetchPrestaData('products?display=[id,supplier_reference]', 0, 500);
        let prods = prodsData?.products?.product || [];
        if (!Array.isArray(prods)) prods = prods ? [prods] : [];
        const taxRateMap = {};
        prods.forEach(p => {
          const pid = extractValue(p.id);
          taxRateMap[pid] = parseFloat(extractValue(p.supplier_reference)) || 0;
        });

        setAllOrders(orders);
        setTaxRates(taxRateMap);

        // 2. Charger les paniers pour trouver les orphelins
        const ordersCartIds = new Set(orders.map(o => extractValue(o.id_cart)));
        const cartsData = await fetchPrestaData('carts', 0, 1000);
        let carts = cartsData?.carts?.cart || [];
        if (!Array.isArray(carts)) carts = carts ? [carts] : [];
        const orphans = carts.filter(c => {
          const cid = extractValue(c.id);
          return cid && !ordersCartIds.has(cid);
        });
        setOrphanCartCount(orphans.length);
      } catch (error) {
        console.error("Erreur chargement dashboard:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Calculs dérivés avec filtre de date
  const { dailyData, stats } = useMemo(() => {
    let totalCount = 0;
    let totalTTC = 0;
    let totalHT = 0;
    let cancelledCount = 0;
    const dayMap = {};

    // État 6 = Annulé dans PrestaShop
    const CANCELLED_STATE = '6';

    allOrders.forEach(order => {
      const currentState = String(extractValue(order.current_state));

      // Compter les annulations séparément (même hors filtre de date pour le KPI global)
      if (currentState === CANCELLED_STATE) {
        cancelledCount++;
        return; // Ne pas inclure dans les totaux CA/HT/TTC
      }

      const dateAdd = extractValue(order.date_add); 
      if (!dateAdd) return;
      const day = dateAdd.split(' ')[0];

      if (dateFrom && day < dateFrom) return;
      if (dateTo && day > dateTo) return;

      if (!dayMap[day]) {
        dayMap[day] = { name: day, ventes: 0, montantTTC: 0, montantHT: 0, taxes: 0 };
      }

      // TTC = total_paid (= somme des prix TTC des produits, car price = TTC et tax=0)
      const orderTTC = Number(extractValue(order.total_paid)) || Number(extractValue(order.total_paid_tax_incl)) || 0;
      
      // HT = calculé depuis les order_rows en utilisant le taux de taxe par produit
      let computedHT = 0;
      if (order.associations?.order_rows?.order_row) {
        let rows = order.associations.order_rows.order_row;
        if (!Array.isArray(rows)) rows = [rows];
        rows.forEach(r => {
          const qty = Number(extractValue(r.product_quantity)) || 0;
          const unitTTC = Number(extractValue(r.product_price)) || 0;
          const productId = extractValue(r.product_id);
          const rate = taxRates[productId] || 0;
          const unitHT = rate > 0 ? unitTTC / (1 + (rate / 100)) : unitTTC;
          computedHT += unitHT * qty;
        });
      }
      const orderHT = computedHT > 0 ? computedHT : orderTTC;

      dayMap[day].ventes     += 1;
      dayMap[day].montantTTC += orderTTC;
      dayMap[day].montantHT  += orderHT;
      dayMap[day].taxes      += (orderTTC - orderHT);

      totalCount += 1;
      totalTTC   += orderTTC;
      totalHT    += orderHT;
    });

    const dailyArray = Object.values(dayMap).sort((a, b) => new Date(a.name) - new Date(b.name));
    const nbDays = dailyArray.length || 1;

    return {
      dailyData: dailyArray,
      stats: {
        totalCommandes: totalCount,
        totalTTC,
        totalHT,
        taxes: totalTTC - totalHT,
        avgPerOrder: totalCount > 0 ? totalTTC / totalCount : 0,
        avgPerDay: totalTTC / nbDays,
        nbDays,
        cancelledCount,
        paniersOrphelins: orphanCartCount,
        totalCommandesPlusPaniers: totalCount + orphanCartCount
      }
    };
  }, [allOrders, dateFrom, dateTo, orphanCartCount, taxRates]);

  const handleToggleWidget = (widgetId) => {
    setActiveWidgets(prev => 
      prev.includes(widgetId) ? prev.filter(id => id !== widgetId) : [...prev, widgetId]
    );
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Chargement du dashboard...</div>;
  }

  const graphData = dailyData.slice(-14);

  // Style des cartes KPI
  const kpiCard = (title, value, subtitle, bgColor = '#fff', textColor = '#000') => (
    <div style={{
      backgroundColor: bgColor,
      color: textColor,
      padding: '20px',
      borderRadius: '4px',
      border: bgColor === '#fff' ? '1px solid #e0e0e0' : 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>{title}</span>
      <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{value}</span>
      {subtitle && <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{subtitle}</span>}
    </div>
  );

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ color: '#000' }}> Dashboard des Commandes</h2>

      {/* FILTRE PAR DATE */}
      <div style={selectorStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: '600' }}>📅 Filtrer par date :</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Du</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Au</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          {(dateFrom || dateTo) && (
            <button 
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ padding: '6px 14px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc', background: '#f5f5f5' }}
            >
              ✕ Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* SÉLECTEUR DE WIDGETS */}
      <div style={selectorStyle}>
        {WIDGETS_DISPONIBLES.map(widget => (
          <label key={widget.id} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={activeWidgets.includes(widget.id)} onChange={() => handleToggleWidget(widget.id)} />
            {widget.label}
          </label>
        ))}
      </div>

      {/* GRILLE DU DASHBOARD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        
        {/* === KPIs GÉNÉRAUX === */}
        {activeWidgets.includes('kpis') && (
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            {kpiCard('Total TTC (CA)', `${stats.totalTTC.toFixed(2)} €`, `Moy. ${stats.avgPerOrder.toFixed(2)} € / cmd`, '#000', '#fff')}
            {kpiCard('Total HT', `${stats.totalHT.toFixed(2)} €`, `Taxes : ${stats.taxes.toFixed(2)} €`)}
            {kpiCard('Commandes', `${stats.totalCommandes}`, `Moy. ${stats.avgPerDay.toFixed(1)} € / jour sur ${stats.nbDays} jour(s)`)}
            {kpiCard('Commandes annulées', `${stats.cancelledCount}`, 'Exclues du CA', '#fff')}
            {kpiCard('Paniers non commandés', `${stats.paniersOrphelins}`, 'Paniers abandonnés / en attente')}
            {kpiCard('Total (cmds + paniers)', `${stats.totalCommandesPlusPaniers}`, `${stats.totalCommandes} commandes + ${stats.paniersOrphelins} paniers`)}
          </div>
        )}

        {/* GRAPHE 1 : Nombre de commandes */}
        {activeWidgets.includes('salesGraph') && (
          <div style={widgetStyle}>
            <h3> Nombre de commandes par jour</h3>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <LineChart data={graphData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="ventes" name="Nb Commandes" stroke="#000" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* GRAPHE 2 : Montants */}
        {activeWidgets.includes('amountGraph') && (
          <div style={widgetStyle}>
            <h3> Montant des commandes par jour</h3>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <BarChart data={graphData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => `${Number(value).toFixed(2)} €`} />
                  <Bar dataKey="montantTTC" name="Montant TTC" fill="#333" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="montantHT" name="Montant HT" fill="#888" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* TABLEAU PAR JOUR */}
        {activeWidgets.includes('dailyTable') && (
          <div style={{...widgetStyle, gridColumn: '1 / -1'}}>
            <h3> Récapitulatif par jour</h3>
            <div style={{ overflowX: 'auto', marginTop: '15px' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Nb commandes</th>
                    <th style={thStyle}>Total HT</th>
                    <th style={thStyle}>Taxes (TVA)</th>
                    <th style={thStyle}>Total TTC</th>
                    <th style={thStyle}>Moyenne / cmd</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.slice().reverse().map(day => (
                    <tr key={day.name}>
                      <td style={tdStyle}>{day.name}</td>
                      <td style={tdStyle}>{day.ventes}</td>
                      <td style={tdStyle}>{(day.montantHT || 0).toFixed(2)} €</td>
                      <td style={tdStyle}>{(day.taxes || 0).toFixed(2)} €</td>
                      <td style={tdStyle}>{(day.montantTTC || 0).toFixed(2)} €</td>
                      <td style={tdStyle}>{day.ventes > 0 ? (day.montantTTC / day.ventes).toFixed(2) : '0.00'} €</td>
                    </tr>
                  ))}
                  {/* Ligne de total */}
                  {dailyData.length > 0 && (
                    <tr style={{ fontWeight: 700, borderTop: '2px solid #000' }}>
                      <td style={tdStyle}>TOTAL</td>
                      <td style={tdStyle}>{stats.totalCommandes}</td>
                      <td style={tdStyle}>{stats.totalHT.toFixed(2)} €</td>
                      <td style={tdStyle}>{stats.taxes.toFixed(2)} €</td>
                      <td style={tdStyle}>{stats.totalTTC.toFixed(2)} €</td>
                      <td style={tdStyle}>{stats.avgPerOrder.toFixed(2)} €</td>
                    </tr>
                  )}
                  {dailyData.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{...tdStyle, textAlign: 'center'}}>Aucune commande trouvée.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// STYLES
const widgetStyle = {
  backgroundColor: '#fff',
  padding: '20px',
  borderRadius: '4px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  border: '1px solid #e0e0e0'
};

const selectorStyle = {
  backgroundColor: '#fff', 
  padding: '15px', 
  borderRadius: '4px', 
  marginBottom: '15px',
  display: 'flex',
  gap: '25px',
  border: '1px solid #e0e0e0',
  flexWrap: 'wrap'
};

const inputStyle = {
  padding: '6px 10px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  fontSize: '14px'
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left'
};

const thStyle = {
  borderBottom: '2px solid #eee',
  padding: '12px 8px',
  color: '#000',
  fontWeight: '600'
};

const tdStyle = {
  borderBottom: '1px solid #eee',
  padding: '12px 8px',
  color: '#333'
};

export default Dashboard;