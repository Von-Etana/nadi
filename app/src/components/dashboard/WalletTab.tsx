import { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Building2, 
  Smartphone, 
  TrendingUp, 
  Eye, 
  EyeOff, 
  Check, 
  ShieldCheck,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { walletApi } from '@/services/api';
import { paymentService } from '@/services/payment';

interface WalletTabProps {
  balance: number;
  showBalance: boolean;
  setShowBalance: (show: boolean) => void;
}

export const WalletTab = ({ 
  balance: initialBalance, 
  showBalance, 
  setShowBalance 
}: WalletTabProps) => {
  const { user } = useAuth();
  
  // Wallet state
  const [balance, setBalance] = useState(initialBalance);
  const [ledgerBalance, setLedgerBalance] = useState(initialBalance);
  const [virtualAccount, setVirtualAccount] = useState<any>(null);
  const [cryptoBalances, setCryptoBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [fundAmount, setFundAmount] = useState('');
  const [activeMethod, setActiveMethod] = useState<'card' | 'bank' | 'ussd' | 'crypto'>('card');
  const [fundingInProgress, setFundingInProgress] = useState(false);

  // Transfer State
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferPin, setTransferPin] = useState('');
  const [transferNarration, setTransferNarration] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Withdrawal State
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [withdrawPin, setWithdrawPin] = useState('');
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  
  // Bank List state
  const [banks, setBanks] = useState<any[]>([]);

  const paymentMethods = [
    { id: 'card', label: 'Debit Card', icon: CreditCard },
    { id: 'bank', label: 'Bank Transfer', icon: Building2 },
    { id: 'ussd', label: 'USSD', icon: Smartphone },
    { id: 'crypto', label: 'Crypto', icon: TrendingUp },
  ];

  // Fetch balance, virtual accounts, and banks
  const fetchWalletDetails = async () => {
    try {
      setLoading(true);
      const res = await walletApi.getBalance();
      if (res.data && res.data.success) {
        setBalance(res.data.balance.naira.balance);
        setLedgerBalance(res.data.balance.naira.ledgerBalance);
        setCryptoBalances(res.data.balance.crypto || []);
      }
    } catch (err: any) {
      console.error('Failed to get balance details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletDetails();
    
    // Load virtual accounts from local storage / context user profile
    if (user?.wallet?.virtual_account) {
      setVirtualAccount(user.wallet.virtual_account);
    } else {
      // Set a generic mock virtual account linked to the user's phone if none exists
      setVirtualAccount({
        bankName: 'Wema Bank',
        accountNumber: user?.phone ? user.phone.replace(/[^0-9]/g, '').slice(-10) : '8123456789',
        accountName: `${user?.firstName} ${user?.lastName} - Nadi`
      });
    }

    // Load banks
    const loadBanks = async () => {
      try {
        const res = await walletApi.getBanks();
        if (res.data && res.data.success) {
          setBanks(res.data.banks || []);
        } else {
          // Fallback static list of top banks
          setBanks([
            { code: '058', name: 'GTBank' },
            { code: '057', name: 'Zenith Bank' },
            { code: '044', name: 'Access Bank' },
            { code: '011', name: 'First Bank' },
            { code: '033', name: 'UBA' },
            { code: '050', name: 'Ecobank' },
            { code: '214', name: 'FCMB' },
            { code: '070', name: 'Fidelity Bank' },
            { code: '030', name: 'Heritage Bank' },
            { code: '221', name: 'Stanbic IBTC' },
            { code: '232', name: 'Sterling Bank' },
            { code: '032', name: 'Union Bank' },
            { code: '035', name: 'Wema Bank' }
          ]);
        }
      } catch (e) {
        console.error('Error fetching banks list:', e);
      }
    };
    loadBanks();
  }, [user]);

  // Resolve account number
  useEffect(() => {
    if (accountNumber.length === 10 && selectedBank) {
      const resolveAccount = async () => {
        try {
          setResolvingAccount(true);
          setAccountName('');
          const res = await walletApi.verifyAccount({
            bankCode: selectedBank,
            accountNumber: accountNumber
          });
          if (res.data && res.data.success) {
            setAccountName(res.data.account.name);
          } else {
            setAccountName('Account Name could not be resolved');
          }
        } catch (err) {
          console.error(err);
          setAccountName('Error resolving account number');
        } finally {
          setResolvingAccount(false);
        }
      };
      resolveAccount();
    }
  }, [accountNumber, selectedBank]);

  // Handle funding via Flutterwave
  const handleFundWallet = async () => {
    if (!fundAmount || isNaN(parseFloat(fundAmount)) || parseFloat(fundAmount) < 100) {
      alert('Please enter a valid amount (minimum ₦100)');
      return;
    }

    try {
      setFundingInProgress(true);

      // 1. Initialize fund transaction on the backend
      const fundResponse = await walletApi.fundWallet({
        amount: parseFloat(fundAmount),
        method: 'card',
        provider: 'flutterwave'
      });

      if (!fundResponse || !fundResponse.success) {
        throw new Error(fundResponse?.message || 'Failed to initialize funding');
      }

      const txRef = fundResponse.transaction.reference;
      
      // 2. Open Flutterwave Inline Modal
      await paymentService.flutterwave.pay({
        txRef,
        amount: parseFloat(fundAmount),
        email: user?.email || '',
        name: `${user?.firstName} ${user?.lastName}`,
        phone: user?.phone,
        onSuccess: (response: any) => {
          console.log('Flutterwave payment success:', response);
          setFundAmount('');
          // Re-fetch balance
          fetchWalletDetails();
          alert(`Successfully funded wallet with ₦${parseFloat(fundAmount).toLocaleString()}`);
        },
        onClose: () => {
          console.log('Flutterwave checkout closed');
        }
      });

    } catch (err: any) {
      console.error('Wallet funding error:', err);
      alert(err.message || 'Payment initialization failed. Please try again.');
    } finally {
      setFundingInProgress(false);
    }
  };

  // Handle Transfer
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferRecipient || !transferAmount || !transferPin) {
      setTransferError('Please fill all required fields');
      return;
    }

    try {
      setTransferLoading(true);
      setTransferError(null);
      setTransferSuccess(null);

      const fullData = {
        recipient: transferRecipient,
        amount: parseFloat(transferAmount),
        narration: transferNarration || undefined,
        transactionPin: transferPin
      };

      const response = await walletApi.transfer(fullData);

      if (response.data && response.data.success) {
        setTransferSuccess(`Successfully transferred ₦${parseFloat(transferAmount).toLocaleString()} to recipient.`);
        setTransferRecipient('');
        setTransferAmount('');
        setTransferPin('');
        setTransferNarration('');
        fetchWalletDetails();
      } else {
        setTransferError(response.error || 'Transfer failed');
      }
    } catch (err: any) {
      console.error(err);
      setTransferError(err.message || 'Transfer failed');
    } finally {
      setTransferLoading(false);
    }
  };

  // Handle Withdrawal
  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawAmount || !selectedBank || !accountNumber || !accountName || !withdrawPin) {
      setWithdrawError('Please fill all required fields');
      return;
    }

    try {
      setWithdrawLoading(true);
      setWithdrawError(null);
      setWithdrawSuccess(null);

      const response = await walletApi.withdraw({
        amount: parseFloat(withdrawAmount),
        bankCode: selectedBank,
        accountNumber,
        accountName,
        transactionPin: withdrawPin
      });

      if (response.data && response.data.success) {
        setWithdrawSuccess(`Withdrawal of ₦${parseFloat(withdrawAmount).toLocaleString()} initiated successfully.`);
        setWithdrawAmount('');
        setAccountNumber('');
        setAccountName('');
        setSelectedBank('');
        setWithdrawPin('');
        fetchWalletDetails();
      } else {
        setWithdrawError(response.error || 'Withdrawal failed');
      }
    } catch (err: any) {
      console.error(err);
      setWithdrawError(err.message || 'Withdrawal failed');
    } finally {
      setWithdrawLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">My Wallet</h1>
        <button 
          onClick={fetchWalletDetails}
          disabled={loading}
          className="p-2 rounded-xl hover:bg-[#e2e2e2]/60 text-[#666] transition-colors"
          title="Refresh Balance"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-primary rounded-3xl p-8 text-white relative overflow-hidden shadow-md">
        <div className="absolute top-0 right-0 w-60 h-60 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <p className="text-white/80 text-sm mb-2">Available Balance</p>
          <div className="flex items-center gap-3">
            <h2 className="text-4xl font-bold">
              {loading ? (
                <span className="inline-block w-44 h-10 bg-white/20 animate-pulse rounded" />
              ) : (
                showBalance ? paymentService.formatAmount(balance) : '₦*****'
              )}
            </h2>
            <button 
              onClick={() => setShowBalance(!showBalance)}
              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            >
              {showBalance ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {ledgerBalance !== balance && (
            <p className="text-white/70 text-xs mt-1">
              Ledger Balance: {paymentService.formatAmount(ledgerBalance)}
            </p>
          )}
          
          {virtualAccount && (
            <div className="mt-4 pt-4 border-t border-white/20 text-xs text-white/80 flex justify-between items-center">
              <div>
                <p>Deposit Bank: <span className="font-semibold text-white">{virtualAccount.bankName}</span></p>
                <p>Account Number: <span className="font-bold text-white tracking-wider">{virtualAccount.accountNumber}</span></p>
                <p>Name: <span className="font-medium text-white">{virtualAccount.accountName}</span></p>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(virtualAccount.accountNumber);
                  alert('Account number copied!');
                }}
                className="px-2.5 py-1 bg-white/15 hover:bg-white/25 rounded-md text-[10px] uppercase font-bold tracking-wider transition-colors"
              >
                Copy
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column: Fund Wallet */}
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a]">Fund Wallet</h3>
            <p className="text-xs text-[#999]">Top up your Naira wallet instantly</p>
          </div>
          
          {/* Payment Methods */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => setActiveMethod(method.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap text-sm font-semibold transition-all ${
                  activeMethod === method.id
                    ? 'bg-gradient-primary text-white shadow-sm'
                    : 'bg-[#f5f5f5] text-[#666] hover:bg-[#e2e2e2]'
                }`}
              >
                <method.icon className="w-4 h-4" />
                <span>{method.label}</span>
              </button>
            ))}
          </div>

          {/* Amount Input (Only relevant for processing cards/USSD, and displaying UI) */}
          {activeMethod !== 'bank' && activeMethod !== 'crypto' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#1a1a1a]">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999] text-lg font-medium">₦</span>
                <Input
                  type="number"
                  placeholder="Enter amount (min ₦100)"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="pl-10 h-14 rounded-xl border-[#e2e2e2] text-lg font-medium"
                />
              </div>
            </div>
          )}

          {/* Method Specific Display */}
          {activeMethod === 'card' && (
            <div className="space-y-4">
              <div className="bg-orange-50/60 border border-[#ea580c]/10 rounded-xl p-4 flex gap-3 text-xs text-[#c2410c]">
                <ShieldCheck className="w-5 h-5 text-[#ea580c] flex-shrink-0" />
                <p>Card transactions are fully secured. We do not store your credentials. Payments are processed natively via Flutterwave inline overlays.</p>
              </div>

              <Button 
                onClick={handleFundWallet}
                disabled={fundingInProgress}
                className="w-full h-14 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
              >
                {fundingInProgress ? 'Initializing Payment...' : 'Proceed to Card Checkout'}
              </Button>
            </div>
          )}

          {activeMethod === 'bank' && (
            <div className="bg-[#fcfcfc] border border-[#e2e2e2] rounded-2xl p-6 text-center space-y-4">
              <Building2 className="w-12 h-12 text-[#ea580c] mx-auto" />
              <div>
                <p className="text-[#1a1a1a] font-bold">Direct Bank Transfer</p>
                <p className="text-xs text-[#666] max-w-xs mx-auto">Transfer funds from any bank app to your Nadi dedicated account code to fund your wallet instantly.</p>
              </div>
              {virtualAccount ? (
                <div className="bg-white border border-[#e2e2e2] rounded-xl p-4 space-y-2 text-left shadow-sm">
                  <div className="flex justify-between">
                    <span className="text-xs text-[#666]">Bank Name</span>
                    <span className="font-bold text-sm text-[#1a1a1a]">{virtualAccount.bankName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#666]">Account Number</span>
                    <span className="font-extrabold text-base text-[#ea580c] tracking-wider">{virtualAccount.accountNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#666]">Account Name</span>
                    <span className="font-semibold text-xs text-[#1a1a1a] truncate max-w-[180px]">{virtualAccount.accountName}</span>
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(virtualAccount.accountNumber);
                      alert('Account number copied!');
                    }}
                    className="w-full mt-2 py-2 bg-gradient-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    Copy Account Number
                  </button>
                </div>
              ) : (
                <p className="text-sm text-red-500">Virtual account details not allocated.</p>
              )}
            </div>
          )}

          {activeMethod === 'ussd' && (
            <div className="space-y-4">
              <div className="bg-[#f5f5f5] rounded-2xl p-6 text-center space-y-3">
                <Smartphone className="w-12 h-12 text-[#ea580c] mx-auto" />
                <p className="text-[#1a1a1a] font-bold">Dial USSD Code</p>
                <p className="text-2xl font-black text-[#ea580c] tracking-wider">*565*6*{virtualAccount?.accountNumber || '8123456789'}#</p>
                <p className="text-xs text-[#666] max-w-xs mx-auto">Dial this code from your registered phone number, input your bank pin to complete the funding.</p>
              </div>

              <Button 
                onClick={handleFundWallet}
                disabled={fundingInProgress}
                className="w-full h-14 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
              >
                {fundingInProgress ? 'Initializing USSD payment...' : 'Pay with USSD Dialog Flow'}
              </Button>
            </div>
          )}

          {activeMethod === 'crypto' && (
            <div className="bg-[#1a1a1a] rounded-2xl p-6 text-center text-white space-y-4">
              <TrendingUp className="w-12 h-12 text-[#ea580c] mx-auto" />
              <div>
                <p className="font-bold">Fund with Cryptocurrency</p>
                <p className="text-xs text-white/60 max-w-xs mx-auto">Send USDT, BTC, or ETH to your unique wallet addresses. Deposits will automatically credit your Naira balance at current rates.</p>
              </div>
              <div className="space-y-3 text-left">
                {cryptoBalances.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <p className="text-xs text-white/50">No crypto address assigned. Visit the Crypto tab to generate addresses.</p>
                  </div>
                ) : (
                  cryptoBalances.map((coin, index) => (
                    <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-3 flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-white uppercase">{coin.symbol}</p>
                        <p className="text-[10px] text-white/50 truncate max-w-[150px]">{coin.address || 'Address pending'}</p>
                      </div>
                      <button 
                        onClick={() => {
                          if (coin.address) {
                            navigator.clipboard.writeText(coin.address);
                            alert(`${coin.symbol.toUpperCase()} address copied!`);
                          }
                        }}
                        disabled={!coin.address}
                        className="px-3 py-1 bg-[#ea580c] hover:bg-[#c2410c] text-white text-[10px] font-bold rounded transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Send & Withdraw */}
        <div className="space-y-6">
          {/* Send Money Section */}
          <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[#1a1a1a]">Send Money (Transfer)</h3>
              <p className="text-xs text-[#999]">Transfer to another Nadi account instantly</p>
            </div>

            {transferSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3.5 rounded-xl flex gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p>{transferSuccess}</p>
              </div>
            )}

            {transferError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p>{transferError}</p>
              </div>
            )}

            <form onSubmit={handleTransfer} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Recipient Email, Phone, or Account Number</label>
                <Input
                  type="text"
                  placeholder="e.g., recipient@nadi.com or phone number"
                  value={transferRecipient}
                  onChange={(e) => setTransferRecipient(e.target.value)}
                  className="h-12 rounded-xl border-[#e2e2e2]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999] text-sm">₦</span>
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="pl-8 h-12 rounded-xl border-[#e2e2e2]"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Transaction PIN</label>
                  <Input
                    type="password"
                    maxLength={4}
                    placeholder="4-digit PIN"
                    value={transferPin}
                    onChange={(e) => setTransferPin(e.target.value.replace(/[^0-9]/g, ''))}
                    className="h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Narration (Optional)</label>
                <Input
                  type="text"
                  placeholder="What is this transfer for?"
                  value={transferNarration}
                  onChange={(e) => setTransferNarration(e.target.value)}
                  className="h-12 rounded-xl border-[#e2e2e2]"
                />
              </div>

              <Button 
                type="submit"
                disabled={transferLoading}
                className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
              >
                {transferLoading ? 'Processing Transfer...' : 'Send Money'}
              </Button>
            </form>
          </div>

          {/* Withdraw to Bank Section */}
          <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[#1a1a1a]">Withdraw to Bank</h3>
              <p className="text-xs text-[#999]">Withdraw funds directly to your local bank account</p>
            </div>

            {withdrawSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3.5 rounded-xl flex gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p>{withdrawSuccess}</p>
              </div>
            )}

            {withdrawError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p>{withdrawError}</p>
              </div>
            )}

            <form onSubmit={handleWithdraw} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Select Bank</label>
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full h-12 rounded-xl border border-[#e2e2e2] px-3 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
                    required
                  >
                    <option value="">-- Choose Bank --</option>
                    {banks.map((bank) => (
                      <option key={bank.code} value={bank.code}>{bank.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Account Number</label>
                  <Input
                    type="text"
                    maxLength={10}
                    placeholder="10 Digits"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                    className="h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>

              {/* Resolved Name Preview */}
              {(resolvingAccount || accountName) && (
                <div className="bg-[#fcfcfc] border border-[#e2e2e2] rounded-xl p-3 flex justify-between items-center">
                  <span className="text-[10px] text-[#666] font-semibold">Account Owner</span>
                  <span className="text-xs font-bold text-[#1a1a1a]">
                    {resolvingAccount ? 'Resolving name...' : accountName}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999] text-sm">₦</span>
                    <Input
                      type="number"
                      placeholder="Min ₦500"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="pl-8 h-12 rounded-xl border-[#e2e2e2]"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Transaction PIN</label>
                  <Input
                    type="password"
                    maxLength={4}
                    placeholder="4-digit PIN"
                    value={withdrawPin}
                    onChange={(e) => setWithdrawPin(e.target.value.replace(/[^0-9]/g, ''))}
                    className="h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit"
                disabled={withdrawLoading || resolvingAccount || !accountName || accountName.includes('Error')}
                className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
              >
                {withdrawLoading ? 'Processing Withdrawal...' : 'Withdraw Funds'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
