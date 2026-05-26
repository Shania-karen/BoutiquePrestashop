import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Login from './components/Login';
import Backoffice from './components/Backoffice';
import Frontoffice from './components/Frontoffice';
import ProductDetail from './components/ProductDetail';
import ShoppingCart from './components/ShoppingCart';
import { ProtectedRoute, AccessDenied } from './components/ProtectedRoute';
import OrderList from './components/OrderList';
import ProfileSelector from './components/ProfileSelector';
import CategoryStockManager from './components/CategoryStockManager';

import './App.css';

// Dans ton Router :


function App() {
  return (
    <Router>
      <AuthProvider>
        <CartProvider>
          <Routes>
            {/* Page de connexion (publique) */}
            <Route path="/login" element={<Login />} />
            {/* Accès refusé */}
            <Route path="/access-denied" element={<AccessDenied />} />

            {/* Backoffice - PROTÉGÉ ADMIN */}
            <Route 
              path="/backoffice" 
              element={
                <ProtectedRoute requireAdmin={true}>
                  <Backoffice />
                </ProtectedRoute>
              } 
            />

            {/* Frontoffice - PUBLIC (connexion requise seulement pour panier/commande) */}
            <Route path="/frontoffice" element={<Frontoffice />} />
            <Route path="/profile" element={<ProfileSelector />} />
            {/* Product Detail - PUBLIC */}
            <Route path="/product/:productId" element={<ProductDetail />} />
            <Route path="/mes-commandes" element={<OrderList />} />

            {/* Shopping Cart - PROTÉGÉ CLIENT */}
            <Route 
              path="/cart" 
              element={
                <ProtectedRoute requireAdmin={false}>
                  <ShoppingCart />
                </ProtectedRoute>
              } 
            />

            {/* Redirection par défaut */}
            <Route path="/" element={<Navigate to="/profile" replace />} />
            
            {/* Gestionnaire de stock (Admin seulement, dans le contexte Front) */}
            <Route 
              path="/category-stock-manager" 
              element={
                <ProtectedRoute requireAdmin={true}>
                  <CategoryStockManager />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;