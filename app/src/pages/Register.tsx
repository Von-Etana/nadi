import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Phone, ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

const Register = () => {
  const navigate = useNavigate();
  const { register, isAuthenticated } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (step < 3) {
      setStep(step + 1);
      return;
    }

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setIsLoading(true);
    
    try {
      await register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { number: 1, label: 'Personal Info' },
    { number: 2, label: 'Contact' },
    { number: 3, label: 'Security' },
  ];

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

        {/* Register Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden mb-4">
              <img src="/logo.jpg" alt="Nadi Digital Service" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Create Account</h1>
            <p className="text-[#666] mt-1">Join Nadi Digital Service today</p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-8">
            {steps.map((s, index) => (
              <div key={s.number} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  step >= s.number 
                    ? 'bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white' 
                    : 'bg-[#f5f5f5] text-[#999]'
                }`}>
                  {step > s.number ? <Check className="w-4 h-4" /> : s.number}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 transition-colors ${
                    step > s.number ? 'bg-[#ea580c]' : 'bg-[#e2e2e2]'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1a1a1a]">First Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                      <Input
                        type="text"
                        placeholder="John"
                        value={formData.firstName}
                        onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                        className="pl-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1a1a1a]">Last Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                      <Input
                        type="text"
                        placeholder="Doe"
                        value={formData.lastName}
                        onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                        className="pl-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                        required
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="pl-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                    <Input
                      type="tel"
                      placeholder="+234 801 234 5678"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="pl-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a strong password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="pl-12 pr-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                      required
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                      className="pl-12 h-14 rounded-xl border-[#e2e2e2] focus:border-[#ea580c] focus:ring-[#ea580c]"
                      required
                    />
                  </div>
                </div>
                <div className="text-xs text-[#666] space-y-1">
                  <p>Password must contain:</p>
                  <ul className="space-y-1 ml-4">
                    <li className={formData.password.length >= 8 ? 'text-green-500' : ''}>• At least 8 characters</li>
                    <li className={/[A-Z]/.test(formData.password) ? 'text-green-500' : ''}>• One uppercase letter</li>
                    <li className={/[0-9]/.test(formData.password) ? 'text-green-500' : ''}>• One number</li>
                  </ul>
                </div>
              </>
            )}

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                  className="flex-1 h-14 rounded-xl border-[#e2e2e2]"
                >
                  Back
                </Button>
              )}
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1 h-14 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white font-semibold btn-magnetic disabled:opacity-70"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating...</span>
                  </div>
                ) : step === 3 ? (
                  'Create Account'
                ) : (
                  'Continue'
                )}
              </Button>
            </div>
          </form>

          {/* Login Link */}
          <p className="text-center mt-6 text-[#666]">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-[#ea580c] font-semibold hover:underline"
            >
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
