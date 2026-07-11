import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/services/api';
import { supabase } from '@/lib/supabase';

const getRecoveryParams = () => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  return {
    accessToken: hashParams.get('access_token') || queryParams.get('access_token') || queryParams.get('token') || '',
    refreshToken: hashParams.get('refresh_token') || queryParams.get('refresh_token') || '',
    type: hashParams.get('type') || queryParams.get('type') || '',
  };
};

const passwordIsStrong = (password: string) => (
  password.length >= 8
  && /[A-Z]/.test(password)
  && /[a-z]/.test(password)
  && /[0-9]/.test(password)
  && /[!@#$%^&*(),.?":{}|<>]/.test(password)
);

const ResetPassword = () => {
  const navigate = useNavigate();
  const recovery = useMemo(getRecoveryParams, []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const prepareRecoverySession = async () => {
      if (!recovery.accessToken || recovery.type !== 'recovery') {
        setError('This password reset link is invalid or expired.');
        setIsPreparing(false);
        return;
      }

      if (recovery.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: recovery.accessToken,
          refresh_token: recovery.refreshToken,
        });

        if (sessionError) {
          setError('This password reset link is invalid or expired.');
        }
      }

      window.history.replaceState(null, document.title, window.location.pathname);
      setIsPreparing(false);
    };

    prepareRecoverySession();
  }, [recovery]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!passwordIsStrong(password)) {
      setError('Password must include uppercase, lowercase, number, special character, and at least 8 characters');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await authApi.resetPassword(recovery.accessToken, password, recovery.refreshToken || undefined);

      if (response.error || !response.data?.success) {
        setError(response.error || 'Failed to reset password');
        return;
      }

      await supabase.auth.signOut().catch(() => undefined);
      setSuccess('Password reset successful. You can now log in with your new password.');
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => navigate('/login', { replace: true }), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ea580c]/5 via-white to-[#f97316]/5 flex items-center justify-center p-4">
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
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden mb-4">
              <img src="/logo.jpg" alt="Nadi Digital Service" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Reset Password</h1>
            <p className="text-[#666] mt-1">Choose a new password for your account</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1a1a1a]">New Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pl-12 pr-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                  required
                  disabled={isPreparing || isSubmitting || !!success}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#ea580c] transition-colors"
                  disabled={isPreparing || isSubmitting}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1a1a1a]">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="pl-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                  required
                  disabled={isPreparing || isSubmitting || !!success}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPreparing || isSubmitting || !!success || !recovery.accessToken}
              className="w-full h-14 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white font-semibold text-lg disabled:opacity-70"
            >
              {isSubmitting ? 'Saving Password...' : isPreparing ? 'Preparing Reset...' : 'Save New Password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
