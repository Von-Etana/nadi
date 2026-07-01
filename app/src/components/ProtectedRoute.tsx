import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

/**
 * Route guard component that redirects unauthenticated users to login.
 * Optionally checks for admin role.
 */
export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Show nothing while checking auth state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#ea580c]/20 border-t-[#ea580c] rounded-full animate-spin" />
          <p className="text-[#666] font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check admin access if required
  if (requireAdmin && !['admin', 'super_admin'].includes(user?.role || '')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
