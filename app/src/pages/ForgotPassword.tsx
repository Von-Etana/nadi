import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/services/api';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSent(false);

    try {
      const response = await authApi.forgotPassword(email);
      if (response.error) {
        throw new Error(response.error);
      }

      setSent(true);
      toast.success('Password reset instructions sent');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset instructions.');
    } finally {
      setLoading(false);
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
            <div className="w-20 h-20 rounded-2xl bg-[#ea580c]/10 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-9 h-9 text-[#ea580c]" />
            </div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Reset Password</h1>
            <p className="text-[#666] mt-1">We’ll send a secure reset link to your email address.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {sent && !error && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
              If the email exists in our system, reset instructions have been sent.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1a1a1a]">Email Address</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                required
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-14 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white font-semibold"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
