import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

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

  if (!isAuthenticated || !user) {
    return <Navigate to={requireAdmin ? '/admin/login' : '/login'} state={{ from: location }} replace />;
  }

  if (requireAdmin && !['admin', 'super_admin'].includes(user.role || '')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
