import { useState, useEffect } from 'react';
import { 
  User as UserIcon, 
  Lock, 
  Shield, 
  ChevronRight, 
  Check, 
  AlertCircle, 
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi, notificationsApi } from '@/services/api';
import { toast } from 'sonner';

interface SettingsTabProps {
  user: any;
}

export const SettingsTab = ({ user }: SettingsTabProps) => {
  // Profile settings
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Security password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Notification Preferences
  const [preferences, setPreferences] = useState({
    transactionAlerts: true,
    promotionalEmails: false,
    securityAlerts: true,
    priceAlerts: true
  });
  const [prefsLoading, setPrefsLoading] = useState(false);

  // Load profile details & notification preferences
  const fetchPreferences = async () => {
    try {
      setPrefsLoading(true);
      const res = await notificationsApi.getPreferences();
      if (res.data && res.data.success) {
        setPreferences(res.data.preferences || {
          transactionAlerts: true,
          promotionalEmails: false,
          securityAlerts: true,
          priceAlerts: true
        });
      }
    } catch (err) {
      console.error('Error fetching notification preferences:', err);
    } finally {
      setPrefsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
    }
    fetchPreferences();
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setProfileLoading(true);
      setProfileError(null);
      setProfileSuccess(null);

      const res = await authApi.updateProfile({
        firstName,
        lastName,
        phone
      });

      if (res.data && res.data.success) {
        setProfileSuccess('Profile changes saved successfully!');
      } else {
        setProfileError(res.error || 'Failed to update profile info.');
      }
    } catch (err: any) {
      console.error(err);
      setProfileError(err.message || 'Profile save error');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    try {
      setPasswordLoading(true);
      setPasswordError(null);
      setPasswordSuccess(null);

      const res = await authApi.changePassword({
        currentPassword,
        newPassword
      });

      if (res.data && res.data.success) {
        setPasswordSuccess('Password successfully updated!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(res.error || 'Failed to change password.');
      }
    } catch (err: any) {
      console.error(err);
      setPasswordError(err.message || 'Password update failed');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleTogglePreference = async (key: keyof typeof preferences) => {
    const updated = {
      ...preferences,
      [key]: !preferences[key]
    };
    setPreferences(updated);

    try {
      await notificationsApi.updatePreferences(updated);
    } catch (err) {
      console.error('Failed to sync notification updates:', err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <h1 className="text-2xl font-bold text-[#1a1a1a]">Settings</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column: Profile Form */}
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-6 h-fit">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a]">Profile Details</h3>
            <p className="text-xs text-[#999]">Update your personal contact details</p>
          </div>

          <div className="flex items-center gap-4 py-2">
            <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center text-white shadow-sm">
              <UserIcon className="w-8 h-8" />
            </div>
            <div>
              <p className="text-lg font-bold text-[#1a1a1a]">{firstName} {lastName}</p>
              <p className="text-xs text-[#666]">{email}</p>
            </div>
          </div>

          {profileSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3.5 rounded-xl flex gap-2">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p>{profileSuccess}</p>
            </div>
          )}

          {profileError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl flex gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p>{profileError}</p>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">First Name</label>
                <Input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="h-12 rounded-xl border-[#e2e2e2]"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Last Name</label>
                <Input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-12 rounded-xl border-[#e2e2e2]"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#1a1a1a]">Email Address (Cannot change)</label>
              <Input
                type="email"
                value={email}
                disabled
                className="h-12 rounded-xl border-[#e2e2e2] bg-[#f5f5f5] cursor-not-allowed"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#1a1a1a]">Phone Number</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 rounded-xl border-[#e2e2e2]"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={profileLoading}
              className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
            >
              {profileLoading ? 'Saving Changes...' : 'Save Profile Changes'}
            </Button>
          </form>
        </div>

        {/* Right Column: Security and Password */}
        <div className="space-y-6">
          {/* Security / Password updates */}
          <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[#1a1a1a]">Update Security Password</h3>
              <p className="text-xs text-[#999]">Ensure a strong password to protect assets</p>
            </div>

            {passwordSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3.5 rounded-xl flex gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p>{passwordSuccess}</p>
              </div>
            )}

            {passwordError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p>{passwordError}</p>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Current Password</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-12 rounded-xl border-[#e2e2e2]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">New Password</label>
                  <Input
                    type="password"
                    placeholder="Min 6 chars"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Confirm Password</label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={passwordLoading}
                className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
              >
                {passwordLoading ? 'Updating Password...' : 'Save New Password'}
              </Button>
            </form>
          </div>

          {/* Quick Actions / Two-Factor Settings */}
          <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-[#1a1a1a] mb-1">Security Standards</h3>
            
            <button
              type="button"
              onClick={() => toast.info('Transaction PIN controls are managed through your wallet security flow.')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-[#e2e2e2]/60 hover:border-[#ea580c] transition-all bg-[#fcfcfc] text-left"
            >
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-[#ea580c]" />
                <div>
                  <span className="font-bold text-xs text-[#1a1a1a] block">Transaction PIN</span>
                  <span className="text-[10px] text-[#999]">Requires 4-digit code to authorize transfers/withdrawals</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#999]" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (user?.twoFactorEnabled) {
                  toast.success('Two-factor authentication is already active.');
                } else {
                  toast.info('Two-factor authentication is available during account security setup.');
                }
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-[#e2e2e2]/60 hover:border-[#ea580c] transition-all bg-[#fcfcfc] text-left"
            >
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-[#ea580c]" />
                <div>
                  <span className="font-bold text-xs text-[#1a1a1a] block">Two-Factor Authentication (2FA)</span>
                  <span className="text-[10px] text-[#999]">Adds extra protection on logins</span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-green-50 border border-green-200 text-green-600 text-[10px] font-bold rounded-full">Active</span>
            </button>
          </div>

          {/* Notifications Preferences */}
          <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[#1a1a1a]">Notification Settings</h3>
              <p className="text-xs text-[#999]">Configure notification toggle defaults</p>
            </div>

            {prefsLoading ? (
              <div className="text-center py-4">
                <RefreshCw className="w-5 h-5 text-[#ea580c] animate-spin mx-auto" />
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { key: 'transactionAlerts', label: 'Transaction Live Alerts' },
                  { key: 'promotionalEmails', label: 'Promotional Offers & News' },
                  { key: 'securityAlerts', label: 'Critical Security Warnings' },
                  { key: 'priceAlerts', label: 'Crypto & Forex Price Alerts' },
                ].map((item) => {
                  const val = preferences[item.key as keyof typeof preferences];
                  return (
                    <div key={item.key} className="flex items-center justify-between p-3.5 rounded-xl border border-[#e2e2e2]/60 bg-[#fcfcfc]">
                      <span className="font-semibold text-xs text-[#1a1a1a]">{item.label}</span>
                      <button
                        type="button"
                        onClick={() => handleTogglePreference(item.key as any)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${
                          val ? 'bg-[#ea580c]' : 'bg-[#e2e2e2]'
                        }`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${
                          val ? 'left-6.5' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
