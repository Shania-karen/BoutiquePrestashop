import React, { createContext, useState, useEffect, useCallback } from 'react';
import { 
  validateAdminCredentials, 
  validateCredentials,
  saveUserSession, 
  getUserSession, 
  logout as logoutService,
  getCurrentUser,
  isAdmin
} from '../services/authService';

/**
 * Contexte d'authentification global
 * Fournit: {user, isAuthenticated, isAdmin, login, logout}
 */
export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState(null);

  // Réhydrater depuis sessionStorage au montage
  useEffect(() => {
    const session = getUserSession();
    if (session) {
      setUser(session.user);
      setIsAdmin(session.user.isAdmin);
    }
    setLoading(false);
  }, []);

  /**
   * Connexion client (via email FormData de PrestaShop)
   */
  const loginCustomer = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      // Valider les credentials
      const userData = await validateCredentials(email, password);
      
      // Sauvegarder la session
      saveUserSession(userData, 'customer');
      
      // Mettre à jour le contexte
      setUser(userData);
      setIsAdmin(false);
      
      return userData;
    } catch (err) {
      const errorMsg = err.message || 'Erreur de connexion';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Connexion admin (backoffice)
   */
  const loginAdmin = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      // Valider les credentials admin
      const adminData = await validateAdminCredentials(email, password);
      
      // Sauvegarder la session
      saveUserSession(adminData, 'admin');
      
      // Mettre à jour le contexte
      setUser(adminData);
      setIsAdmin(true);
      
      return adminData;
    } catch (err) {
      const errorMsg = err.message || 'Erreur de connexion admin';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Connexion anonyme (mode invité)
   */
  const loginAnonymous = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const anonUser = {
        id: `anon-${Date.now()}`,
        email: 'anonymous@guest.local',
        firstname: 'Invité',
        lastname: '',
        role: 'guest',
        isAdmin: false
      };

      saveUserSession(anonUser, 'guest');
      setUser(anonUser);
      setIsAdmin(false);

      return anonUser;
    } catch (err) {
      const errorMsg = err.message || 'Erreur connexion anonyme';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Déconnexion
   */
  const logout = useCallback(() => {
    logoutService();
    setUser(null);
    setIsAdmin(false);
    setError(null);
  }, []);

  const value = {
    user,
    isAuthenticated: !!user,
    isAdmin,
    loading,
    error,
    loginCustomer,
    loginAdmin,
    loginAnonymous,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook pour utiliser le contexte Auth
 */
export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans AuthProvider');
  }
  return context;
}
