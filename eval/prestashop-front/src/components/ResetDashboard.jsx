import React, { useState } from 'react';
import { fetchPrestaData} from '../services/apiClient';
import {  deletePrestaData } from '../services/adminService';

export default function ResetDatabase() {
  const [logs, setLogs] = useState([]);
  const [isResetting, setIsResetting] = useState(false);
  
  // Les ressources que l'utilisateur peut choisir de réinitialiser
  const [selection, setSelection] = useState({
    orders: false,
    customers: false,
    products: false,
  });

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev]);
  };

  const handleToggle = (key) => {
    setSelection(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Fonction générique pour récupérer tous les IDs et les supprimer un par un
  const purgeResource = async (resourceName, label) => {
    addLog(`Analyse de la ressource [${label}]...`);
    try {
      // On demande à l'API de ne renvoyer QUE les IDs pour aller plus vite
      const data = await fetchPrestaData(`${resourceName}?display=[id]`);
      
      // PrestaShop peut renvoyer undefined, un objet unique, ou un tableau
      const items = data[resourceName]?.[resourceName.slice(0, -1)] || [];
      const itemArray = Array.isArray(items) ? items : [items];

      if (itemArray.length === 0 || !itemArray[0].id) {
        addLog(`Rien à supprimer pour [${label}].`, 'success');
        return;
      }

      addLog(`${itemArray.length} élément(s) trouvé(s). Suppression en cours...`);
      
      let deletedCount = 0;
      for (const item of itemArray) {
        await deletePrestaData(resourceName, item.id);
        deletedCount++;
        // On affiche un log tous les 10 éléments pour ne pas spammer la console
        if (deletedCount % 10 === 0) addLog(`${deletedCount} ${label} supprimés...`);
      }
      
      addLog(`✅ [${label}] vidé avec succès (${deletedCount} éléments).`, 'success');

    } catch (err) {
      addLog(`Erreur sur [${label}] : ${err.message}`, 'error');
      throw err; // On remonte l'erreur pour stopper le processus global
    }
  };

  const handleExecuteReset = async () => {
    const hasSelection = Object.values(selection).some(v => v);
    if (!hasSelection) {
      alert("Veuillez sélectionner au moins une donnée à réinitialiser.");
      return;
    }

    const conf1 = window.confirm("ATTENTION : Vous allez supprimer définitivement des données via l'API. Continuer ?");
    if (!conf1) return;

    const conf2 = window.confirm("Êtes-vous absolument sûr ? Cette action est IRREVERSIBLE.");
    if (!conf2) return;

    setIsResetting(true);
    setLogs([]);
    addLog("DÉMARRAGE DU NETTOYAGE...", "warning");

    try {
      // L'ORDRE EST IMPORTANT (Contraintes de clés étrangères)
      // On supprime d'abord les commandes (qui dépendent des clients et produits)
      if (selection.orders) {
        await purgeResource('orders', 'Commandes');
        await purgeResource('carts', 'Paniers');
      }

      // Ensuite les clients
      if (selection.customers) {
        await purgeResource('customers', 'Clients');
        await purgeResource('addresses', 'Adresses');
      }

      // Enfin le catalogue
      if (selection.products) {
        await purgeResource('products', 'Produits');
        // Attention: la suppression d'un produit supprime souvent ses déclinaisons et images liées via l'API, 
        // mais tu pourrais ajouter purgeResource('combinations', 'Déclinaisons') si nécessaire.
      }

      addLog("🎉 NETTOYAGE TERMINÉ AVEC SUCCÈS.", "success");
    } catch (globalError) {
      addLog("Le nettoyage a été interrompu suite à une erreur.", "error");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] p-10 font-sans text-[#363a41]">
      <div className="max-w-2xl mx-auto bg-white border border-[#dbe6e9] shadow-sm rounded-sm">
        
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-[#dbe6e9] flex justify-between items-center bg-[#fffafa]">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-[#e74c3c]">
            Zone de Danger : Réinitialisation
          </h2>
          <span className="text-xs bg-[#fdedec] px-2 py-1 text-[#e74c3c] font-bold rounded-sm border border-[#fadbd8]">
            API DELETE
          </span>
        </div>

        {/* CONTENU */}
        <div className="p-8 space-y-8">
          <p className="text-sm text-[#6c868e] leading-relaxed">
            Sélectionnez les modules à vider. Le système utilisera l'API PrestaShop pour supprimer chaque élément un par un. 
            <strong className="text-[#363a41] block mt-2">Attention : Ce processus peut être long si votre base contient des milliers de lignes.</strong>
          </p>

          <div className="space-y-3">
            <label className="flex items-center p-4 border border-[#dbe6e9] rounded-sm cursor-pointer hover:bg-[#fafafa] transition">
              <input 
                type="checkbox" 
                checked={selection.products} 
                onChange={() => handleToggle('products')}
                className="w-5 h-5 accent-[#363a41] cursor-pointer" 
              />
              <span className="ml-4 font-semibold text-sm uppercase">1. Catalogue (Produits, Images, Déclinaisons)</span>
            </label>

            <label className="flex items-center p-4 border border-[#dbe6e9] rounded-sm cursor-pointer hover:bg-[#fafafa] transition">
              <input 
                type="checkbox" 
                checked={selection.customers} 
                onChange={() => handleToggle('customers')}
                className="w-5 h-5 accent-[#363a41] cursor-pointer" 
              />
              <span className="ml-4 font-semibold text-sm uppercase">2. Clients & Adresses</span>
            </label>

            <label className="flex items-center p-4 border border-[#dbe6e9] rounded-sm cursor-pointer hover:bg-[#fafafa] transition">
              <input 
                type="checkbox" 
                checked={selection.orders} 
                onChange={() => handleToggle('orders')}
                className="w-5 h-5 accent-[#363a41] cursor-pointer" 
              />
              <span className="ml-4 font-semibold text-sm uppercase">3. Ventes (Commandes & Paniers)</span>
            </label>
          </div>

          <button 
            onClick={handleExecuteReset}
            disabled={isResetting || !Object.values(selection).some(v => v)}
            className={`w-full py-4 font-bold uppercase tracking-widest text-sm transition-all border-2 ${
              isResetting || !Object.values(selection).some(v => v)
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                : 'bg-white text-[#e74c3c] border-[#e74c3c] hover:bg-[#e74c3c] hover:text-white'
            }`}
          >
            {isResetting ? 'Suppression en cours...' : 'Exécuter la purge API'}
          </button>
        </div>

        {/* CONSOLE DE LOGS NOIR ET BLANC */}
        <div className="bg-[#1e1e1e] p-4 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed border-t border-gray-800">
          {logs.length === 0 ? (
            <div className="text-[#7f8c8d] italic">En attente de vos instructions...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1 border-l-2 border-gray-600 pl-2">
                <span className="text-gray-500">[{log.time}]</span>
                <span className={`ml-2 ${
                  log.type === 'error' ? 'text-[#e74c3c] font-bold' : 
                  log.type === 'success' ? 'text-[#2ecc71]' : 
                  log.type === 'warning' ? 'text-[#f1c40f]' : 'text-[#ecf0f1]'
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