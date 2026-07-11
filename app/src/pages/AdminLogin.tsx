import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

const ADMIN_ROLES = ['admin', 'super_admin'];

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login, logout, resetAuth, isAuthenticated, isLoading, user } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    twoFactorCode: '',
  });

  const isAdminUser = ADMIN_ROLES.includes(user?.role || '');

  useEffect(() => {
    resetAuth().catch(() => undefined);
  }, [resetAuth]);

  useEffect(() => {
    if (!isAuthenticated || requires2FA || isLoading) {
      return;
    }

    if (user && isAdminUser) {
      navigate('/admin', { replace: true });
      return;
    }

    if (user && !isAdminUser) {
      setError('Admin access is required to use this page.');
      void logout();
    }
  }, [isAuthenticated, requires2FA, isLoading, user, isAdminUser, navigate, logout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const result = await login(
        formData.email,
        formData.password,
        requires2FA ? formData.twoFactorCode : undefined
      );

      if (result.requires2FA) {
        setRequires2FA(true);
        return;
      }

      if (result.authenticated === true) {
        setRequires2FA(false);
        return;
      }

      throw new Error('Admin login failed. Please check your credentials.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Admin login failed. Please check your credentials.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a]/5 via-white to-[#ea580c]/5 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="gradient-orb w-[500px] h-[500px] bg-[#0f172a] -top-40 -left-40 animate-blob" />
        <div
          className="gradient-orb w-[400px] h-[400px] bg-[#ea580c] bottom-0 right-0 animate-blob"
          style={{ animationDelay: '-4s' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Link
          to="/login"
          className="absolute -top-16 left-0 flex items-center gap-2 text-[#666] hover:text-[#ea580c] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back to Login</span>
        </Link>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#0f172a]/5 text-[#0f172a] mb-4">
              <Shield className="w-9 h-9" />
            </div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Admin Sign In</h1>
            <p className="text-[#666] mt-1">Use an approved admin account to access operations and controls</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {!requires2FA ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                    <Input
                      type="email"
                      placeholder="Enter your admin email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="pl-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="pl-12 pr-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                      required
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#ea580c] transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-[#ea580c]/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Shield className="w-8 h-8 text-[#ea580c]" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#1a1a1a]">Two-Factor Authentication</h3>
                  <p className="text-sm text-[#666] mt-1">Enter the admin authenticator code or a backup code</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Verification Code</label>
                  <Input
                    type="text"
                    placeholder="Enter code"
                    value={formData.twoFactorCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        twoFactorCode: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12),
                      })
                    }
                    className="h-14 rounded-xl border-[#e2e2e2] text-center text-xl tracking-[0.25em] font-mono"
                    maxLength={12}
                    required
                    autoFocus
                    disabled={isSubmitting}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRequires2FA(false);
                    setError('');
                  }}
                  className="text-sm text-[#ea580c] hover:underline"
                >
                  Back to admin login
                </button>
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-14 rounded-xl bg-gradient-to-r from-[#0f172a] to-[#ea580c] text-white font-semibold text-lg btn-magnetic disabled:opacity-70"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{requires2FA ? 'Verifying...' : 'Signing in...'}</span>
                </div>
              ) : requires2FA ? (
                'Verify Code'
              ) : (
                'Admin Login'
              )}
            </Button>
          </form>

          {!requires2FA && (
            <p className="text-center mt-6 text-[#666] text-sm">
              Need a regular account?{' '}
              <Link to="/login" className="text-[#ea580c] font-semibold hover:underline">
                Go to user login
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
