import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../assets/css/Login.css';

const DEFAULT_CREDENTIALS = {
  customer: {
    email: 'anonymous@psgdpr.com',
    password: '$2y$10$nhA2hYwdcwVUCkXn0LBPWe1yc3wBK04zkoQmxoa33vuudFeKoQBsC',
  },
  admin: {
    email: 'admin@prestashop.com',
    password: 'admin123',
  },
};

export default function Login() {
  const [email, setEmail] = useState(DEFAULT_CREDENTIALS.customer.email);
  const [password, setPassword] = useState(DEFAULT_CREDENTIALS.customer.password);
  const [userType, setUserType] = useState('customer'); // 'customer' ou 'admin'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { loginCustomer, loginAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  useEffect(() => {
    const defaults = DEFAULT_CREDENTIALS[userType] || DEFAULT_CREDENTIALS.customer;
    setEmail(defaults.email);
    setPassword(defaults.password);
  }, [userType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (userType === 'admin') {
        await loginAdmin(email, password);
        navigate('/backoffice');
      } else {
        await loginCustomer(email, password);
        navigate(redirect || '/frontoffice');
      }
    } catch (err) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>PrestaShop Manager</h1>

        {/* Sélection du type d'utilisateur */}
        <div className="user-type-selector">
          <label>
            <input
              type="radio"
              value="customer"
              checked={userType === 'customer'}
              onChange={(e) => setUserType(e.target.value)}
            />
            <span> Client</span>
          </label>
          <label>
            <input
              type="radio"
              value="admin"
              checked={userType === 'admin'}
              onChange={(e) => setUserType(e.target.value)}
            />
            <span> Admin</span>
          </label>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="btn-login">
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        {/* Info pour la démo */}
        {userType === 'admin' && (
          <div className="demo-info">
            <p><strong>Demo Admin:</strong></p>
            <p>Email: {DEFAULT_CREDENTIALS.admin.email}</p>
            <p>Mot de passe: {DEFAULT_CREDENTIALS.admin.password}</p>
          </div>
        )}

        {userType === 'customer' && (
          <div className="demo-info">
            <p><strong>Connexion client par défaut</strong></p>
            <p>Email: {DEFAULT_CREDENTIALS.customer.email}</p>
            <p>Mot de passe: {DEFAULT_CREDENTIALS.customer.password}</p>
          </div>
        )}
      </div>
    </div>
  );
}
