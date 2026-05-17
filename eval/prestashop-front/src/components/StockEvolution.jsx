import React, { useState, useEffect } from 'react';
import { fetchPrestaData, extractValue } from '../services/apiClient';
import DailyStockTable from './DailyStockTable';

export default function StockEvolution() {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFocused, setIsFocused] = useState(false);

  // Charger la liste des produits pour la recherche
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        const prodsData = await fetchPrestaData('products', 0, 200);
        let prods = prodsData?.products?.product || [];
        if (!Array.isArray(prods)) prods = prods ? [prods] : [];
        setProducts(prods);
      } catch (error) {
        console.error("Erreur chargement produits :", error);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, []);

  const filteredProducts = products.filter(p => {
    const name = extractValue(p.name).toLowerCase();
    const ref = extractValue(p.reference).toLowerCase();
    const id = String(extractValue(p.id));
    const term = searchTerm.toLowerCase();
    return name.includes(term) || ref.includes(term) || id.includes(term);
  });

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setSearchTerm(`${extractValue(product.id)} - ${extractValue(product.name)}`);
    setIsFocused(false);
  };

  if (loading) {
    return <div style={{ padding: '20px', color: '#666' }}>⏳ Initialisation des moteurs de recherche...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #ddd', marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#000' }}> Configuration du suivi de stock</h2>
        
        {/* Filtres */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* 1. Formulaire Produit */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '5px', textTransform: 'uppercase' }}>1. Sélectionner un produit</label>
            <input
              type="text"
              placeholder="Tapez le nom, la référence ou l'ID..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (selectedProduct) setSelectedProduct(null);
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
              style={inputStyle}
            />

            {/* Suggestions de recherche */}
            {isFocused && searchTerm.length > 0 && (
              <ul style={dropdownStyle}>
                {filteredProducts.length === 0 ? (
                  <li style={{ padding: '10px 14px', color: '#999', fontSize: '13px' }}>Aucun produit trouvé</li>
                ) : (
                  filteredProducts.map(p => (
                    <li
                      key={extractValue(p.id)}
                      onMouseDown={() => handleSelectProduct(p)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                      onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                      onMouseLeave={(e) => e.target.style.background = '#fff'}
                    >
                      <strong>#{extractValue(p.id)}</strong> - {extractValue(p.name)}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          {/* 2. Filtre par période */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase' }}>
              Filtrer entre deux dates
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ ...inputStyle, maxWidth: '220px' }}
            />
            <span style={{ fontSize: '13px', color: '#666' }}>à</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ ...inputStyle, maxWidth: '220px' }}
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                style={{ padding: '0 15px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', height: '42px' }}
              >
                Effacer
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Affichage conditionnel du tableau d'évolution */}
      {selectedProduct ? (
        <DailyStockTable 
          productId={extractValue(selectedProduct.id)} 
          startDate={startDate}
          endDate={endDate}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', border: '2px dashed #ddd', color: '#999', borderRadius: '4px', background: '#fafafa' }}>
           Sélectionnez un produit ci-dessus pour générer son tableau d'évolution chronologique.
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '14px',
  boxSizing: 'border-box',
  outline: 'none'
};

const dropdownStyle = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  background: '#fff',
  border: '1px solid #ccc',
  borderRadius: '0 0 4px 4px',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  maxHeight: '200px',
  overflowY: 'auto',
  zIndex: 1000,
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
};