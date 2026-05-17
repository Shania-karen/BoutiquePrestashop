import React, { useState, useEffect } from 'react';
import { XMLParser } from 'fast-xml-parser';
import { extractValue, BASE_URL, API_KEY } from '../services/apiClient';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export default function DailyStockTable({ productId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }

    const fetchHistory = async () => {
      try {
        setLoading(true);
        
        // On récupère tout l'historique, trié par ID décroissant (le plus récent en haut)
        const url = `${BASE_URL}/daily_stocks?ws_key=${API_KEY}&display=full&filter[id_product]=[${productId}]&sort=[id_DESC]`;
        const res = await fetch(url);
        
        if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
        
        const text = await res.text();
        const parsed = parser.parse(text);
        
        let records = parsed.prestashop?.daily_stocks?.daily_stock || [];
        if (!Array.isArray(records)) records = [records];

        // Formatage et calcul du Delta (Mouvement)
        const formattedData = records.map((record, index, array) => {
          const currentQty = parseInt(extractValue(record.quantity), 10);
          
          // L'élément suivant dans le tableau "array" est en fait l'événement chronologiquement PRÉCÉDENT
          const previousRecord = array[index + 1];
          const previousQty = previousRecord ? parseInt(extractValue(previousRecord.quantity), 10) : currentQty;
          
          const delta = currentQty - previousQty;
          
          return {
            id: extractValue(record.id) || record['@_id'] || record.id,
            date: extractValue(record.date_upd).split(' ')[0],
            time: extractValue(record.date_upd).split(' ')[1],
            quantity: currentQty,
            delta: delta, // La différence (+ ou -)
            isInitial: !previousRecord, // Si c'est la toute première ligne enregistrée
            combinationId: extractValue(record.id_product_attribute)
          };
        });

        setHistory(formattedData);
      } catch (error) {
        console.error("❌ Erreur lors de la récupération :", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [productId]);

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>⏳ Chargement de l'historique détaillé...</div>;
  if (history.length === 0) return <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Aucun mouvement enregistré pour ce produit.</div>;

  return (
    <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #ddd' }}>
      <h3 style={{ marginTop: 0, fontSize: '18px' }}>⏱️ Historique détaillé des mouvements (Produit #{productId})</h3>
      
      <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '15px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5', zIndex: 1 }}>
            <tr style={{ borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '12px' }}>Date</th>
              <th style={{ padding: '12px' }}>Heure exacte</th>
              <th style={{ padding: '12px' }}>Déclinaison</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Mouvement</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Nouveau Stock</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px', fontWeight: '500' }}>{row.date}</td>
                <td style={{ padding: '12px', color: '#666' }}>{row.time}</td>
                <td style={{ padding: '12px' }}>
                  {row.combinationId === '0' || !row.combinationId ? (
                    <span style={{ background: '#e0e0e0', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>Principal</span>
                  ) : (
                    `#${row.combinationId}`
                  )}
                </td>
                
                {/* Colonne du Mouvement (Le Delta) */}
                <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                  {row.isInitial ? (
                    <span style={{ color: '#888', fontSize: '12px' }}>Point de départ</span>
                  ) : row.delta > 0 ? (
                    <span style={{ color: '#4cbb6c', background: '#e8f5e9', padding: '4px 8px', borderRadius: '4px' }}>+{row.delta} (Ajout)</span>
                  ) : row.delta < 0 ? (
                    <span style={{ color: '#ff4c4c', background: '#ffebee', padding: '4px 8px', borderRadius: '4px' }}>{row.delta} (Retrait)</span>
                  ) : (
                    <span style={{ color: '#888' }}>0</span>
                  )}
                </td>

                {/* Colonne du Résultat Final */}
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '15px' }}>
                  {row.quantity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}