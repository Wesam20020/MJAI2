import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, isBootstrapped } = useAuth();

  if (!isBootstrapped) {
    return (
      <section className="page-section">
        <div className="card content-card">
          <p>Checking your session...</p>
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default AdminRoute;
