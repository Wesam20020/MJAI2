import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated, isBootstrapped } = useAuth();

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

  return children;
}

export default ProtectedRoute;
