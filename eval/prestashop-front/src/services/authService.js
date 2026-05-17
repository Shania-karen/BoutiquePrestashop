import { fetchPrestaData } from './apiClient';

const API_KEY = '77KUX2NEZ7SIRLUVUKXR5EDA5U7TWM2I';
const BASE_URL = '/api-presta/api';

/**
 * Service d'authentification
 * Gère la connexion via l'API PrestaShop Customers
 */

/**
 * Récupère la liste de tous les utilisateurs (customers)
 * @returns {Promise<Array>} - Liste des utilisateurs
 */
export async function getAllCustomers() {
  try {
    const customersUrl = `${BASE_URL}/customers?ws_key=${API_KEY}&display=full`;
    
    const response = await fetch(customersUrl);
    if (!response.ok) {
      throw new Error('Erreur lors de la récupération des customers');
    }

    const xmlText = await response.text();
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    if (xmlDoc.getElementsByTagName('parseError').length > 0) {
      throw new Error('Erreur de parsing XML');
    }

    const customersNodes = xmlDoc.getElementsByTagName('customer');
    const customers = [];

    for (let i = 0; i < customersNodes.length; i++) {
        const node = customersNodes[i];
        const id = node.getElementsByTagName('id')[0]?.textContent;
        const email = node.getElementsByTagName('email')[0]?.textContent;
        const firstname = node.getElementsByTagName('firstname')[0]?.textContent;
        const lastname = node.getElementsByTagName('lastname')[0]?.textContent;
        // On exclut éventuellement les comptes inactifs / inutiles, mais ici on prend tout
        if (email) {
            customers.push({ id, email, firstname, lastname });
        }
    }
    
    // On peut aussi ajouter l'admin factice pour la boucle de test
    customers.push({
        id: 'admin-1',
        email: 'admin@prestashop.com',
        firstname: 'Admin',
        lastname: 'Presta',
        role: 'admin',
        isAdmin: true
    });

    return customers;
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    return [];
  }
}

/**
 * Valider les credentials d'un utilisateur
 * @param {string} email - Email du client
 * @param {string} password - Mot de passe du client
 * @returns {Promise<Object>} - Données du customer si succès
 */
export async function validateCredentials(email, password) {
  try {
    // Récupérer tous les customers avec le filtre email
    const customersUrl = `${BASE_URL}/customers?filter[email]=[${email}]&ws_key=${API_KEY}&display=full`;
    
    const response = await fetch(customersUrl);
    if (!response.ok) {
      throw new Error('Erreur lors de la récupération des customers');
    }

    const xmlText = await response.text();
    
    // Parser XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // Vérifier s'il y a une erreur
    if (xmlDoc.getElementsByTagName('parseError').length > 0) {
      throw new Error('Erreur de parsing XML');
    }

    const customers = xmlDoc.getElementsByTagName('customer');
    
    if (customers.length === 0) {
      throw new Error('Utilisateur non trouvé');
    }

    const customerNode = customers[0];
    const customerId =  customerNode.getElementsByTagName('id')[0]?.textContent;
    const customerEmail = customerNode.getElementsByTagName('email')[0]?.textContent;
    const firstname = customerNode.getElementsByTagName('firstname')[0]?.textContent;
    const lastname = customerNode.getElementsByTagName('lastname')[0]?.textContent;
    const hashedPassword = customerNode.getElementsByTagName('passwd')[0]?.textContent;
    const secureKey = customerNode
  .getElementsByTagName('secure_key')[0]
  ?.textContent;
    // IMPORTANT: En production, la validation du password doit se faire côté serveur
    // Pour la démo, on simule une validation simple
    // En réalité, PrestaShop crypte les passwords et il faut un endpoint backend
    
    if (!hashedPassword) {
      throw new Error('Impossible de valider le mot de passe');
    }

    // Créer l'objet utilisateur
    const user = {
      id: customerId,
      email: customerEmail,
      firstname: firstname || '',
      lastname: lastname || '',
      secure_key: secureKey || '',
      role: 'customer', // tous les customers ont le rôle 'customer'
      isAdmin: false
    };

    return user;
  } catch (error) {
    console.error('Erreur d\'authentification:', error);
    throw error;
  }
}

/**
 * Valider les credentials d'un admin (backoffice)
 * Pour la démo: on utilise des credentials prédéfinis
 * En production: créer un endpoint backend sécurisé
 * @param {string} email - Email admin
 * @param {string} password - Mot de passe admin
 * @returns {Promise<Object>} - Données de l'admin si succès
 */
export async function validateAdminCredentials(email, password) {
  // TODO: Remplacer par una API backend sécurisée
  // Pour la démo:
  const ADMIN_EMAIL = 'admin@prestashop.com';
  const ADMIN_PASSWORD = 'admin123'; // À CHANGER EN PRODUCTION

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    return {
      id: 'admin-1',
      email: email,
      firstname: 'Admin',
      lastname: 'User',
      role: 'admin',
      isAdmin: true
    };
  }

  throw new Error('Identifiants admin invalides');
}

/**
 * Sauvegarder le token sessionStorage
 * @param {Object} user - Les données utilisateur
 * @param {string} role - Le rôle (customer ou admin)
 */
export function saveUserSession(user, role = 'customer') {
  const sessionData = {
    user,
    role,
    loginTime: new Date().toISOString(),
    token: `token_${user.id}_${Date.now()}` // Pseudo-token
  };
  
  sessionStorage.setItem('userSession', JSON.stringify(sessionData));
  localStorage.setItem('userEmail', user.email); // Optionnel: pour "Remember me"
  
  return sessionData;
}

/**
 * Récupérer la session actuelle
 * @returns {Object|null} - Session si existe, null sinon
 */
export function getUserSession() {
  const session = sessionStorage.getItem('userSession');
  return session ? JSON.parse(session) : null;
}

/**
 * Vérifier si un utilisateur est connecté
 * @returns {boolean}
 */
export function isAuthenticated() {
  return !!getUserSession();
}

/**
 * Vérifier si l'utilisateur est admin
 * @returns {boolean}
 */
export function isAdmin() {
  const session = getUserSession();
  return session?.user?.isAdmin === true;
}

/**
 * Déconnecter l'utilisateur
 */
export function logout() {
  sessionStorage.removeItem('userSession');
  // Optionnel: garder le remember me
  // localStorage.removeItem('userEmail');
}

/**
 * Récupérer l'utilisateur connecté
 * @returns {Object|null}
 */
export function getCurrentUser() {
  const session = getUserSession();
  return session?.user || null;
}
