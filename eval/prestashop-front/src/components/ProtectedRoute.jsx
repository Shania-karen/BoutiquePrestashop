import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Composant de route protégée
 * Redirige vers login si non authentifié
 */
export function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader">Chargement...</div>
      </div>
    );
  }

  // Non authentifié
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Nécessite admin
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}

/**
 * Composant pour les pages d'accès refusé
 */
export function AccessDenied() {
  return (
    <div className="access-denied-container">
      <div className="access-denied-card">
        <h1> Accès refusé</h1>
        <p>Vous n'avez pas les permissions pour accéder à cette page.</p>
        <p>Cette page est réservée aux administrateurs.</p>
        <a href="/frontoffice" className="btn-back">Retourner à l'accueil</a>
      </div>
    </div>
  );
}

const styles = `
.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f5f5f5;
}

.loader {
  font-size: 18px;
  color: #667eea;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.access-denied-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.access-denied-card {
  background: white;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 500px;
}

.access-denied-card h1 {
  color: #c00;
  margin-bottom: 15px;
}

.access-denied-card p {
  color: #666;
  margin-bottom: 10px;
}

.btn-back {
  display: inline-block;
  margin-top: 20px;
  padding: 10px 20px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-back:hover {
  background: #764ba2;
}
`;

// Injecter les styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}
