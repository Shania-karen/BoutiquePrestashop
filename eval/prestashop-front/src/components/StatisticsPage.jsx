import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer } from 'recharts';
import { calculateDashboardStats } from '../services/statService';
import { BASE_URL, API_KEY } from '../services/apiClient'; 

export default function StatisticsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        const [ordersRes, productsRes, categoriesRes, stocksRes] = await Promise.all([
          fetch(`${BASE_URL}/orders?display=full&limit=0,5000&ws_key=${API_KEY}&output_format=JSON`),
          fetch(`${BASE_URL}/products?display=[id,id_category_default,wholesale_price,supplier_reference,price]&limit=0,5000&ws_key=${API_KEY}&output_format=JSON`),
          fetch(`${BASE_URL}/categories?display=[id,name]&limit=0,5000&ws_key=${API_KEY}&output_format=JSON`),
          fetch(`${BASE_URL}/stock_availables?display=[id_product,id_product_attribute,quantity]&limit=0,5000&ws_key=${API_KEY}&output_format=JSON`)
        ]);

        if (!ordersRes.ok) throw new Error("Échec de la synchronisation.");

        const [ordersData, productsData, categoriesData, stocksData] = await Promise.all([
          ordersRes.json(),
          productsRes.json(),
          categoriesRes.json(),
          stocksRes.json()
        ]);
        
        // Extracteur de tableau universel pour contrer le formatage imprévisible de PrestaShop
        const extractPrestaArray = (data, mainKey, subKey) => {
          if (!data || !data[mainKey]) return [];
          if (Array.isArray(data[mainKey])) return data[mainKey]; // Format JSON classique
          if (data[mainKey][subKey]) {
            return Array.isArray(data[mainKey][subKey]) ? data[mainKey][subKey] : [data[mainKey][subKey]]; // Format XML-like
          }
          return Object.values(data[mainKey]); // Fallback final
        };

        const rawOrders = extractPrestaArray(ordersData, 'orders', 'order');
        const rawProducts = extractPrestaArray(productsData, 'products', 'product');
        const rawCategories = extractPrestaArray(categoriesData, 'categories', 'category');
        const rawStocks = extractPrestaArray(stocksData, 'stock_availables', 'stock_available');

        const calculatedStats = calculateDashboardStats(rawOrders, rawProducts, rawCategories, rawStocks);
        setStats(calculatedStats);
      } catch (err) {
        console.error("Erreur de récupération :", err);
        setError(err.message || "Erreur lors de la génération des statistiques.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center text-gray-500 text-sm font-medium">Chargement des statistiques...</div>
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-red-600 font-bold">{error}</div>;
  }

  const kpiCard = (title, value, subtitle, bgColor = '#fff', textColor = '#000') => (
    <div style={{
      backgroundColor: bgColor,
      color: textColor,
      padding: '20px',
      borderRadius: '4px',
      border: bgColor === '#fff' ? '1px solid #e0e0e0' : 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
    }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>{title}</span>
      <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{value}</span>
      {subtitle && <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{subtitle}</span>}
    </div>
  );

  return (
    <div style={{ padding: '20px', backgroundColor: '#f9fafb', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#000', marginBottom: '4px' }}>Rapports Financiers</h2>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '20px' }}>Analyse des commandes payées et livrées (Hors Taxe)</p>
        
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        {kpiCard('Montant total des ventes HT', formatCurrency(stats?.totalSalesHT), "Chiffre d'affaires", '#fff', '#000')}
        {kpiCard('Achat Total Produits (HT)', formatCurrency(stats?.initialInventoryValueHT), 'wholesale_price x stock initial', '#fff', '#000')}
        {kpiCard('Coût des Ventes (HT)', formatCurrency(stats?.totalPurchasesHT), 'Coût de revient des marchandises', '#fff', '#000')}
        {kpiCard('Bénéfice Brut (HT)', formatCurrency(stats?.totalProfitHT), 'Ventes HT - Coût des Ventes HT', '#000', '#fff')}
      </div>

    </div>
  );
}