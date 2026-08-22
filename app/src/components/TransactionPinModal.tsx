import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, ShieldCheck, KeyRound, Loader2, Delete } from 'lucide-react';
import { authApi } from '@/services/api';
import { toast } from 'sonner';

interface TransactionPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void;
  title?: string;
  description?: string;
}

export const TransactionPinModal: React.FC<TransactionPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Authorize Transaction',
  description = 'Enter your 4-digit security PIN to confirm this action'
}) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetStep, setResetStep] = useState<'none' | 'requesting' | 'otp_sent'>('none');
  const [otp, setOtp] = useState('');
  const [newPin, setNewPin] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setResetStep('none');
      setOtp('');
      setNewPin('');
    }
  }, [isOpen]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4) {
        verifyAndSubmit(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const verifyAndSubmit = async (pinToVerify: string) => {
    try {
      setLoading(true);
      const res = await authApi.verifyTransactionPin(pinToVerify);
      if (res.data?.success) {
        toast.success('PIN verified');
        onSuccess(pinToVerify);
        onClose();
      } else {
        toast.error(res.error || res.data?.message || 'Incorrect transaction PIN');
        setPin('');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PIN verification failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateReset = async () => {
    try {
      setLoading(true);
      const res = await authApi.requestPinReset();
      if (res.data?.success) {
        toast.success('Reset OTP sent to your registered email & phone');
        setResetStep('otp_sent');
      } else {
        toast.error(res.error || 'Failed to send reset code');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!otp || otp.length !== 6) {
      toast.error('Please enter the 6-digit OTP');
      return;
    }
    if (!newPin || newPin.length !== 4) {
      toast.error('New PIN must be exactly 4 digits');
      return;
    }

    try {
      setLoading(true);
      const res = await authApi.confirmPinReset({ otp, newPin });
      if (res.data?.success) {
        toast.success('Transaction PIN reset successfully! Please verify now.');
        setResetStep('none');
        setPin(newPin);
        verifyAndSubmit(newPin);
      } else {
        toast.error(res.error || 'Failed to reset PIN');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl p-6 bg-white shadow-2xl">
        <DialogHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-[#ea580c]">
            {resetStep === 'none' ? <Lock className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900">
            {resetStep === 'none' ? title : 'Reset Transaction PIN'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {resetStep === 'none' ? description : 'Enter the authorization code sent to your registered contact'}
          </DialogDescription>
        </DialogHeader>

        {resetStep === 'none' ? (
          <div className="space-y-6 pt-2">
            {/* PIN Dots Display */}
            <div className="flex justify-center items-center gap-4 py-2">
              {[0, 1, 2, 3].map((index) => {
                const filled = index < pin.length;
                return (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full transition-all duration-200 ${
                      filled ? 'bg-[#ea580c] scale-110 shadow-sm' : 'bg-slate-200'
                    }`}
                  />
                );
              })}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  disabled={loading}
                  onClick={() => handleKeyPress(num)}
                  className="h-12 rounded-xl text-lg font-semibold text-slate-800 bg-slate-50 hover:bg-orange-50 hover:text-[#ea580c] active:scale-95 transition-all border border-slate-100 flex items-center justify-center"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleInitiateReset}
                className="h-12 text-[11px] font-medium text-slate-500 hover:text-[#ea580c] flex items-center justify-center text-center leading-tight"
              >
                Forgot PIN?
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleKeyPress('0')}
                className="h-12 rounded-xl text-lg font-semibold text-slate-800 bg-slate-50 hover:bg-orange-50 hover:text-[#ea580c] active:scale-95 transition-all border border-slate-100 flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleDelete}
                className="h-12 rounded-xl text-slate-600 bg-slate-50 hover:bg-red-50 hover:text-red-600 active:scale-95 transition-all border border-slate-100 flex items-center justify-center"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-xs text-[#ea580c] font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Verifying PIN...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs">6-Digit Reset Code (OTP)</Label>
              <Input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="font-mono text-center text-lg tracking-widest"
              />
            </div>
            <div>
              <Label className="text-xs">New 4-Digit PIN</Label>
              <Input
                type="password"
                maxLength={4}
                placeholder="••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                className="font-mono text-center text-lg tracking-widest"
              />
            </div>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row pt-2">
              <Button variant="outline" size="sm" onClick={() => setResetStep('none')} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmReset}
                disabled={loading || otp.length !== 6 || newPin.length !== 4}
                className="bg-[#ea580c] hover:bg-[#c2410c] text-white w-full sm:w-auto"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                Confirm & Set PIN
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TransactionPinModal;
