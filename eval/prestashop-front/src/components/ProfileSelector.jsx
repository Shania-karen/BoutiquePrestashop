import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllCustomers } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import './ProfileSelector.css'; // On va créer ce petit fichier CSS

const ProfileSelector = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, loginCustomer, loginAdmin, loginAnonymous } = useAuth();

  useEffect(() => {
    // Si déjà connecté, on redirige selon le rôle
    if (user) {
        if (user.isAdmin) {
            navigate('/backoffice');
        } else {
            navigate('/frontoffice');
        }
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchUsers = async () => {
      const data = await getAllCustomers();
      setUsers(data);
      setLoading(false);
    };

    fetchUsers();
  }, []);

  const handleProfileClick = async (selectedUser) => {
    try {
      if (selectedUser.isAdmin) {
        // Pour la démo, le mot de passe admin est fixe dans validateAdminCredentials
        await loginAdmin(selectedUser.email, 'admin123');
        navigate('/backoffice');
      } else {
        // validateCredentials n'utilise pas réellement le mot de passe côté client dans cette démo
        await loginCustomer(selectedUser.email, '');
        navigate('/frontoffice');
      }
    } catch (err) {
      console.error('Erreur lors de la connexion automatique :', err);
      // En cas d'erreur, basculer vers la page de login avec email prérempli
      navigate('/login', { state: { prefilledEmail: selectedUser.email } });
    }
  };

  if (loading) {
    return <div className="profile-selector-loading">Chargement des profils...</div>;
  }

  return (
    <div className="profile-selector-container">
      <div className="profile-selector-content">
        <h1>Qui est-ce ?</h1>
        <p>Sélectionnez votre profil pour continuer</p>
        
        <div className="profiles-grid">
          {users.map((u) => (
            <div 
              key={u.id} 
              className={`profile-card ${u.isAdmin ? 'admin-profile' : ''}`}
              onClick={() => handleProfileClick(u)}
            >
              <div className="profile-avatar">
                {u.firstname ? u.firstname.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
              </div>
              <div className="profile-info">
                <h3>{u.firstname} {u.lastname}</h3>
                <span className="profile-role">{u.isAdmin ? 'Admin' : 'Client'}</span>
              </div>
            </div>
          ))}

          <div className="profile-card anonymous-profile" onClick={async () => {
            try {
              await loginAnonymous();
              navigate('/frontoffice');
            } catch (err) {
              console.error('Erreur connexion anonyme', err);
              navigate('/frontoffice');
            }
          }}>
            <div className="profile-avatar">
              ?
            </div>
            <div className="profile-info">
              <h3>Invité</h3>
              <span className="profile-role">Anonyme</span>
            </div>
          </div>
          
          <div className="profile-card new-profile" onClick={() => navigate('/login')}>
            <div className="profile-avatar new-avatar">
              +
            </div>
            <div className="profile-info">
              <h3>Autre</h3>
              <span className="profile-role">Se connecter</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSelector;
