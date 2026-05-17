import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { submitOrderToPrestashop, updateOrderState } from '../services/orderService';
import '../assets/css/ShoppingCart.css';

export default function ShoppingCart() {
  const { user, isAuthenticated } = useAuth();
  const { cart, removeFromCart, updateQuantity, clearCart, getTotalPrice } = useCart();
  const navigate = useNavigate();

  const [shippingInfo, setShippingInfo] = useState({
    address:    '',
    city:       '',
    postalCode: '',
    country:    'FR',
  });

  // États : 'pending' | 'submitted' | 'completed' | 'error'
  const [orderStatus, setOrderStatus] = useState('pending');
  const [createdOrderId, setCreatedOrderId] = useState(null); // Pour stocker le VRAI ID PrestaShop

  const subtotal = parseFloat(getTotalPrice());
  // const shipping = subtotal > 50 ? 0 : 10;
  const total    = (subtotal ).toFixed(2);

  const handleCheckout = async (e) => {
    e.preventDefault();
    // Empêcher la commande si l'utilisateur n'est pas connecté (visiteur invité)
    const isGuest = !isAuthenticated || user?.role === 'guest' || String(user?.email || '').includes('anonymous');
    if (isGuest) {
      if (window.confirm("Vous êtes en visiteur : votre panier est stocké localement. Pour passer commande, vous devez vous connecter ou vous inscrire. Aller à la page de connexion ?")) {
        navigate('/login?redirect=/cart');
      }
      return;
    }

    if (!shippingInfo.address || !shippingInfo.city || !shippingInfo.postalCode) {
      alert('Veuillez remplir tous les champs de livraison');
      return;
    }

    setOrderStatus('submitted');

    try {
      // ÉTAPE 1: Créer la commande
      const prestashopOrderId = await submitOrderToPrestashop(
        cart, 
        shippingInfo, 
        user, 
        { subtotal, total }
      );
      
      console.log('✓ Commande créée:', prestashopOrderId);
      
      // ÉTAPE 2: Mettre à jour le statut de la commande
      console.log('Mise à jour du statut...');
      await updateOrderState(prestashopOrderId, 11); // 3 = En préparation
      
      setCreatedOrderId(prestashopOrderId);
      setOrderStatus('completed');
      clearCart(); // Vider le panier
    } catch (error) {
      alert("Une erreur est survenue: " + error.message);
      setOrderStatus('error');
    }
  };

  // ── Commande confirmée ────────────────────────────────────────────────────
  if (orderStatus === 'completed') {
    return (
      <div className="cart-success">
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⏳</div>
          <h2>Commande enregistrée !</h2>
          <p>Votre commande <strong>#{createdOrderId}</strong> a été transmise à notre équipe.</p>
          
          <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '15px', borderRadius: '5px', margin: '20px auto', maxWidth: '500px' }}>
            <strong>Information Paiement :</strong><br />
            Votre commande est actuellement <em>en attente de validation</em>. 
            Le paiement ne sera débité/validé qu'une fois la commande approuvée par notre administration.
          </div>

          <p style={{ color: '#888', fontSize: '0.9rem' }}>
            Un e-mail de suivi vous sera envoyé à {user?.email || 'votre adresse email'}.
          </p>
          <button
            className="btn-submit-order"
            style={{ marginTop: '24px' }}
            onClick={() => {
              clearCart();
              navigate('/frontoffice');
            }}
          >
            Retourner à la boutique
          </button>
        </div>
      </div>
    );
  }

  // Le reste du code JSX du composant (affichage du panier et formulaire) reste exactement le même
  return (
    <div className="shopping-cart-page">

      <div className="cart-header">
        <button
          onClick={() => navigate('/frontoffice')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#555' }}
        >
          ← Continuer les achats
        </button>
        <h1>Votre panier</h1>
      </div>

      <div className="cart-container">
        {cart.length === 0 ? (
          <div className="empty-cart">
            <p>Votre panier est vide.</p>
            <button onClick={() => navigate('/frontoffice')}>Continuer les achats</button>
          </div>
        ) : (
          <>
            <div className="cart-items">
              <h2>Articles ({cart.reduce((s, i) => s + i.quantity, 0)})</h2>
              <table className="cart-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Prix unitaire</th>
                    <th>Quantité</th>
                    <th>Sous-total</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.key}>
                      <td>
                        <div className="cart-item-name-cell">
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.name}
                              style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, marginRight: 10 }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                            {item.variantLabel && (
                              <div style={{ fontSize: '0.78rem', color: '#666', marginTop: 2 }}>
                                {item.variantLabel}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{item.price.toFixed(2)} EUR</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max={item.stock}
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.key, parseInt(e.target.value, 10) || 1)}
                          className="qty-input"
                          style={{ width: 60 }}
                        />
                      </td>
                      <td>{(item.price * item.quantity).toFixed(2)} EUR</td>
                      <td>
                        <button className="btn-remove" onClick={() => removeFromCart(item.key)}>Retirer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="checkout-section">
              <div className="order-summary">
                <h2>Résumé de la commande</h2>
                <div className="summary-row"><span>Sous-total :</span><span>{subtotal.toFixed(2)} EUR</span></div>
                {/* <div className="summary-row"><span>Frais de port :</span><span>{shipping === 0 ? 'Gratuit' : `${shipping} EUR`}</span></div> */}
                <div className="summary-row total"><span>Total :</span><span>{total} EUR</span></div>
              </div>

              {/* Si visiteur anonyme, afficher avertissement et désactiver la soumission */}
              {!isAuthenticated || user?.role === 'guest' || String(user?.email || '').includes('anonymous') ? (
                <div style={{ background: '#fff3f0', border: '1px solid #ffd6cc', padding: 16, borderRadius: 6, marginBottom: 12 }}>
                  <strong>Visiteur invité :</strong> votre panier est stocké localement dans votre navigateur.
                  <div style={{ marginTop: 8 }}>
                    Pour finaliser une commande, vous devez vous connecter ou créer un compte.
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button className="btn-submit-order" style={{ marginRight: 8 }} onClick={() => navigate('/login?redirect=/cart')}>Se connecter / S'inscrire</button>
                    <button className="btn-submit-order" disabled style={{ opacity: 0.6 }}>Transmettre la commande</button>
                  </div>
                </div>
              ) : (
                <form className="shipping-form" onSubmit={handleCheckout}>
                <h2>Adresse de livraison</h2>
                <div className="form-group">
                  <label>Adresse</label>
                  <input type="text" value={shippingInfo.address} onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Code postal</label>
                    <input type="text" value={shippingInfo.postalCode} onChange={(e) => setShippingInfo({ ...shippingInfo, postalCode: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Ville</label>
                    <input type="text" value={shippingInfo.city} onChange={(e) => setShippingInfo({ ...shippingInfo, city: e.target.value })} required />
                  </div>
                </div>
                <div className="form-group">
                  <label>Pays</label>
                  <select value={shippingInfo.country} onChange={(e) => setShippingInfo({ ...shippingInfo, country: e.target.value })}>
                    <option value="FR">France</option>
                    <option value="BE">Belgique</option>
                  </select>
                </div>
                  <button type="submit" className="btn-submit-order" disabled={orderStatus === 'submitted' || orderStatus === 'error'}>
                    {orderStatus === 'submitted' ? 'Transmission au serveur...' : 'Transmettre la commande'}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}