import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import ProductList from './ProductList';
import ResetDashboard from './ResetDashboard';
import ImportExportManager from './ImportExportManager';
import AdminOrders from './AdminOrders';
import StockManager from './StockManager';
import '../assets/css/Backoffice.css';

/**
 * Page principale du backoffice (Admin)
 * Accessible uniquement aux administrateurs
 */
export default function Backoffice() {
  const [currentView, setCurrentView] = useState('dashboard');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderView = () => {
    switch (currentView) {
      case 'products':
        return <ProductList />;
      case 'orders':
        return <AdminOrders />;
      case 'stock':
        return <StockManager />;

      case 'dashboard':
        return <Dashboard />;
      case 'reset':
        return <ResetDashboard />;
      case 'import':
        return <ImportExportManager />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="backoffice-layout">
      {/* Header Admin */}
      <header className="admin-header">
        <div className="admin-header-left">
          <h1>Backoffice PrestaShop</h1>
          <p className="admin-role">Admin Dashboard</p>
        </div>
        <div className="admin-header-right">
          <div className="user-info">
            <span className="user-name">{user?.firstname} {user?.lastname}</span>
            <span className="user-email">{user?.email}</span>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </header>

      <div className="backoffice-container">
        {/* Sidebar */}
        <aside className="backoffice-sidebar">
          <nav className="admin-nav">
            <button
              className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setCurrentView('dashboard')}
            >
              Tableau de bord
            </button>
            <button
              className={`nav-item ${currentView === 'orders' ? 'active' : ''}`}
              onClick={() => setCurrentView('orders')}
            >
              Commandes
            </button>
            <button
              className={`nav-item ${currentView === 'products' ? 'active' : ''}`}
              onClick={() => setCurrentView('products')}
            >
              Produits
            </button>
            <button
              className={`nav-item ${currentView === 'stock' ? 'active' : ''}`}
              onClick={() => setCurrentView('stock')}
            >
              Stock
            </button>
            <button
              className={`nav-item ${currentView === 'import' ? 'active' : ''}`}
              onClick={() => setCurrentView('import')}
            >
              Import/Export
            </button>
            <button
              className={`nav-item ${currentView === 'reset' ? 'active' : ''}`}
              onClick={() => setCurrentView('reset')}
            >
              Réinitialiser DB
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="backoffice-content">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
