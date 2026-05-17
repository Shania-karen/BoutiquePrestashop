import React, { useState } from 'react';
import { fetchPrestaData } from '../services/apiClient';
import '../assets/css/ApiTest.css';

/**
 * Page de test pour diagnostiquer l'API PrestaShop
 */
export default function ApiTest() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testApi = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      console.log('=== TEST API PRESTASHOP ===');
      
      // Test 1: Récupérer les produits
      console.log('Test 1: Récupération des produits...');
      const productsData = await fetchPrestaData('products', 0, 12);
      
      console.log('Données brutes retournées:', productsData);
      
      const productsArray = productsData.products?.product 
        ? (Array.isArray(productsData.products.product) 
            ? productsData.products.product 
            : [productsData.products.product])
        : [];
      
      setResults({
        totalProducts: productsArray.length,
        firstProduct: productsArray[0] || null,
        allProducts: productsArray,
        rawData: JSON.stringify(productsData, null, 2)
      });
      
    } catch (err) {
      setError(err.message);
      console.error('Erreur complète:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="api-test-container">
      <h1>Test API PrestaShop</h1>
      
      <button onClick={testApi} disabled={loading} className="btn-test">
        {loading ? 'Test en cours...' : 'Lancer le test API'}
      </button>

      {error && (
        <div className="error-box">
          <h3>Erreur:</h3>
          <pre>{error}</pre>
        </div>
      )}

      {results && (
        <div className="results-box">
          <h2>Résultats du test:</h2>
          
          <div className="result-item">
            <strong>Nombre de produits trouvés:</strong> {results.totalProducts}
          </div>

          {results.totalProducts > 0 && results.firstProduct && (
            <div className="result-item">
              <strong>Premier produit:</strong>
              <pre>{JSON.stringify(results.firstProduct, null, 2)}</pre>
            </div>
          )}

          <div className="result-item">
            <strong>Données complètes:</strong>
            <pre>{results.rawData}</pre>
          </div>
        </div>
      )}

      <div className="info-box">
        <h3>Instructions:</h3>
        <ol>
          <li>Cliquez sur "Lancer le test API"</li>
          <li>Ouvrez la console (F12 → Console)</li>
          <li>Vérifiez les logs avec 🔍, 📦, ✅, ❌</li>
          <li>Vérifiez que des produits sont retournés</li>
          <li>Si 0 produit: vérifiez votre PrestaShop</li>
        </ol>
      </div>
    </div>
  );
}
