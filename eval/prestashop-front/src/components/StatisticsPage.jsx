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
        
        const [ordersRes, productsRes, categoriesRes] = await Promise.all([
          fetch(`${BASE_URL}/orders?display=full&ws_key=${API_KEY}&output_format=JSON`),
          fetch(`${BASE_URL}/products?display=[id,id_category_default,wholesale_price]&ws_key=${API_KEY}&output_format=JSON`),
          fetch(`${BASE_URL}/categories?display=[id,name]&ws_key=${API_KEY}&output_format=JSON`)
        ]);

        if (!ordersRes.ok) throw new Error("Échec de la synchronisation.");

        const [ordersData, productsData, categoriesData] = await Promise.all([
          ordersRes.json(),
          productsRes.json(),
          categoriesRes.json()
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

        const calculatedStats = calculateDashboardStats(rawOrders, rawProducts, rawCategories);
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

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-800">
      <div className="max-w-7xl mx-auto">
        
        <div className="mb-8">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Rapports Financiers</h1>
          <p className="text-xs text-gray-400 mt-1">Analyse des commandes payées et livrées (Hors Taxe)</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          
          {/* Card Ventes */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase">Revenus</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
            </div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-tight">Total Ventes (HT)</h3>
            <p className="text-2xl font-black text-gray-900 mt-1 tracking-tight">{formatCurrency(stats?.totalSalesHT)}</p>
          </div>

          {/* Card Achats */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full uppercase">Charges</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
              </div>
            </div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-tight">Total Achats (HT)</h3>
            <p className="text-2xl font-black text-gray-900 mt-1 tracking-tight">{formatCurrency(stats?.totalPurchasesHT)}</p>
          </div>

          {/* Card Bénéfice */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">Rentabilité</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
              </div>
            </div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-tight">Benefice</h3>
            <p className={`text-2xl font-black mt-1 tracking-tight ${stats?.totalProfitHT >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatCurrency(stats?.totalProfitHT)}
            </p>
          </div>

        </div>

        {/* Graphique */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="mb-6">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-4 bg-indigo-600 rounded-full block"></span>
              Performance par catégorie
            </h2>
          </div>
          <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.profitByCategory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="categoryName" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={(v) => `${v} €`} />
                <Tooltip 
                  formatter={(value) => [formatCurrency(value), ""]}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} 
                />
                <Legend verticalAlign="top" height={40} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500 }} />
                <Bar dataKey="ventes" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Ventes (HT)" barSize={14} />
                <Bar dataKey="achats" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Achats (HT)" barSize={14} />
                <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} name="Bénéfice (HT)" barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}