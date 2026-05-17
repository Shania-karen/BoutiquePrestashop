import jsPDF from 'jspdf';
import 'jspdf-autotable';
return (
    <div className="order-list-container">
      {/* ... ton titre, tes filtres ... */}

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Référence</th>
            <th>Date</th>
            <th>Total</th>
            {/* 3️⃣ AJOUTER L'EN-TÊTE DE LA COLONNE ICI */}
            <th>Facture</th> 
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>#{order.id}</td>
              <td>{order.reference}</td>
              <td>{order.date_add}</td>
              <td>{order.total_paid} €</td>
              
              {/* 3️⃣ AJOUTER LA CELLULE AVEC LE BOUTON ICI */}
              <td style={{ textAlign: 'center' }}>
                <button 
                  onClick={() => exportInvoiceToPDF(order)}
                  style={{
                    padding: '6px 12px',
                    background: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                >
                  📄 Télécharger
                </button>
              </td>
              
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}