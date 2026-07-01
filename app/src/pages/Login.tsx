import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, ArrowLeft, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    twoFactorCode: '',
  });

  const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (isAuthenticated && !requires2FA) {
      navigate(fromPath, { replace: true });
    }
  }, [isAuthenticated, requires2FA, navigate, fromPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await login(
        formData.email,
        formData.password,
        requires2FA ? formData.twoFactorCode : undefined
      );

      if (result.requires2FA) {
        setRequires2FA(true);
        setIsLoading(false);
        return;
      }
      setRequires2FA(false);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ea580c]/5 via-white to-[#f97316]/5 flex items-center justify-center p-4">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="gradient-orb w-[500px] h-[500px] bg-[#ea580c] -top-40 -left-40 animate-blob" />
        <div className="gradient-orb w-[400px] h-[400px] bg-[#f97316] bottom-0 right-0 animate-blob" style={{ animationDelay: '-4s' }} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Back Button */}
        <Link
          to="/"
          className="absolute -top-16 left-0 flex items-center gap-2 text-[#666] hover:text-[#ea580c] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back to Home</span>
        </Link>

        {/* Login Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden mb-4">
              <img src="/logo.jpg" alt="Nadi Digital Service" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Welcome Back</h1>
            <p className="text-[#666] mt-1">Login to your Nadi Digital account</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {!requires2FA ? (
              <>
                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="pl-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="pl-12 pr-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#ea580c] transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Forgot Password */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => navigate('/forgot-password')}
                    className="text-sm text-[#ea580c] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
              </>
            ) : (
              /* 2FA Code Input */
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-[#ea580c]/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Shield className="w-8 h-8 text-[#ea580c]" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#1a1a1a]">Two-Factor Authentication</h3>
                  <p className="text-sm text-[#666] mt-1">Enter the 6-digit code from your authenticator app</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Verification Code</label>
                  <Input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={formData.twoFactorCode}
                    onChange={(e) => setFormData({...formData, twoFactorCode: e.target.value.replace(/\D/g, '').slice(0, 6)})}
                    className="h-14 rounded-xl border-[#e2e2e2] text-center text-2xl tracking-[0.5em] font-mono"
                    maxLength={6}
                    required
                    autoFocus
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setRequires2FA(false); setError(''); }}
                  className="text-sm text-[#ea580c] hover:underline"
                >
                  ← Back to login
                </button>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white font-semibold text-lg btn-magnetic disabled:opacity-70"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{requires2FA ? 'Verifying...' : 'Logging in...'}</span>
                </div>
              ) : (
                requires2FA ? 'Verify Code' : 'Login'
              )}
            </Button>
          </form>

          {/* Divider */}
          {!requires2FA && (
            <>
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-[#e2e2e2]" />
                <span className="text-sm text-[#999]">Or continue with</span>
                <div className="flex-1 h-px bg-[#e2e2e2]" />
              </div>

              {/* Social Login */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => toast.info('Google sign-in is not enabled yet.')}
                  className="flex items-center justify-center gap-2 h-12 rounded-xl border border-[#e2e2e2] hover:bg-[#f5f5f5] transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-sm font-medium">Google</span>
                </button>
                <button
                  type="button"
                  onClick={() => toast.info('Apple sign-in is not enabled yet.')}
                  className="flex items-center justify-center gap-2 h-12 rounded-xl border border-[#e2e2e2] hover:bg-[#f5f5f5] transition-colors"
                >
                  <svg className="w-5 h-5" fill="#000" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <span className="text-sm font-medium">Apple</span>
                </button>
              </div>

              {/* Register Link */}
              <p className="text-center mt-6 text-[#666]">
                Don't have an account?{' '}
                <Link
                  to="/register"
                  className="text-[#ea580c] font-semibold hover:underline"
                >
                  Sign up
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
