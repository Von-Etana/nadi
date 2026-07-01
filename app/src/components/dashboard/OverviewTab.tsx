import { useState, useEffect } from 'react';
import { 
  Send, 
  Receipt, 
  Gift, 
  Fuel,
  Wallet,
  TrendingUp,
  ArrowDownLeft,
  Eye,
  EyeOff,
  Zap as ZapIcon,
  Clock,
  Plus
} from 'lucide-react';
import { walletApi } from '@/services/api';
import { paymentService } from '@/services/payment';

type TabType = 'overview' | 'wallet' | 'delivery' | 'utilities' | 'giftcards' | 'crypto' | 'fuel' | 'history' | 'settings';

interface OverviewTabProps {
  showBalance: boolean;
  setShowBalance: (show: boolean) => void;
  setActiveTab: (tab: TabType) => void;
}

export const OverviewTab = ({ 
  showBalance, 
  setShowBalance,
  setActiveTab 
}: OverviewTabProps) => {
  const [loading, setLoading] = useState(true);
  const [balanceData, setBalanceData] = useState<{ naira: number; ledger: number; crypto: any[] }>({
    naira: 0,
    ledger: 0,
    crypto: []
  });
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch Balance
        const balRes = await walletApi.getBalance();
        if (balRes.data && balRes.data.success) {
          setBalanceData({
            naira: balRes.data.balance.naira.balance || 0,
            ledger: balRes.data.balance.naira.ledgerBalance || 0,
            crypto: balRes.data.balance.crypto || []
          });
        }

        // Fetch Recent Transactions
        const txRes = await walletApi.getTransactions({ limit: 4 });
        if (txRes.data && txRes.data.success) {
          setRecentTransactions(txRes.data.transactions || []);
        }
      } catch (err) {
        console.error('Failed to load dashboard overview data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getTxIcon = (category: string) => {
    switch (category) {
      case 'bills':
      case 'utility':
        return ZapIcon;
      case 'giftcard':
        return Gift;
      case 'fuel':
        return Fuel;
      case 'crypto':
        return TrendingUp;
      case 'transfer':
        return Send;
      default:
        return Wallet;
    }
  };

  const getTxColor = (tx: any) => {
    return tx.direction === 'credit' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500';
  };

  const quickActions = [
    { id: 'send', label: 'Send Money', icon: Send, color: 'bg-blue-500 hover:bg-blue-600', tab: 'wallet' },
    { id: 'bills', label: 'Pay Bills', icon: Receipt, color: 'bg-green-500 hover:bg-green-600', tab: 'utilities' },
    { id: 'gift', label: 'Gift Cards', icon: Gift, color: 'bg-purple-500 hover:bg-purple-600', tab: 'giftcards' },
    { id: 'fuel', label: 'Order Fuel', icon: Fuel, color: 'bg-orange-500 hover:bg-orange-600', tab: 'fuel' },
  ];

  // Calculate BTC equivalent or display standard placeholder values from the API
  const getBtcBalance = () => {
    const btc = balanceData.crypto.find(c => c.symbol?.toLowerCase() === 'btc');
    return btc ? parseFloat(btc.balance) : 0.0;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Good afternoon! 👋</h1>
        <p className="text-[#666]">Here is what is happening with your account today.</p>
      </div>

      {/* Balance Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Naira Balance */}
        <div className="bg-gradient-primary rounded-3xl p-6 text-white relative overflow-hidden shadow-md">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <p className="text-white/80 text-sm mb-1">Naira Balance</p>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold">
                {loading ? (
                  <span className="inline-block w-36 h-8 bg-white/20 animate-pulse rounded" />
                ) : (
                  showBalance ? paymentService.formatAmount(balanceData.naira) : '₦*****'
                )}
              </h2>
              <button 
                onClick={() => setShowBalance(!showBalance)}
                className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                aria-label="Toggle balance visibility"
              >
                {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {balanceData.ledger !== balanceData.naira && (
              <p className="text-white/70 text-xs mt-1">
                Ledger: {paymentService.formatAmount(balanceData.ledger)}
              </p>
            )}
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setActiveTab('wallet')}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#ea580c] rounded-xl text-sm font-semibold hover:bg-white/90 active:scale-[0.98] transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Money
              </button>
              <button 
                onClick={() => setActiveTab('wallet')}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/20 text-white rounded-xl text-sm font-semibold hover:bg-white/30 active:scale-[0.98] transition-all"
              >
                <Send className="w-4 h-4" />
                Transfer
              </button>
            </div>
          </div>
        </div>

        {/* Crypto Balance */}
        <div className="bg-[#1a1a1a] rounded-3xl p-6 text-white relative overflow-hidden shadow-md">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#ea580c]/20 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <p className="text-white/60 text-sm mb-1">Crypto Balance</p>
            <h2 className="text-3xl font-bold">
              {loading ? (
                <span className="inline-block w-28 h-8 bg-white/15 animate-pulse rounded" />
              ) : (
                `${getBtcBalance().toFixed(4)} BTC`
              )}
            </h2>
            <p className="text-white/60 text-sm mt-1">
              ≈ ₦{((getBtcBalance() * 98500000) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setActiveTab('crypto')}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#ea580c] text-white rounded-xl text-sm font-semibold hover:bg-[#c2410c] active:scale-[0.98] transition-all"
              >
                <TrendingUp className="w-4 h-4" />
                Trade
              </button>
              <button 
                onClick={() => setActiveTab('crypto')}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-white rounded-xl text-sm font-semibold hover:bg-white/20 active:scale-[0.98] transition-all"
              >
                <ArrowDownLeft className="w-4 h-4" />
                Receive
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-[#1a1a1a] mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={() => setActiveTab(action.tab as TabType)}
              className="bg-white rounded-2xl p-4 text-center border border-[#e2e2e2]/60 hover:shadow-md active:scale-[0.98] transition-all"
            >
              <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm transition-colors`}>
                <action.icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-sm font-medium text-[#1a1a1a]">{action.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#1a1a1a]">Recent Transactions</h3>
          <button 
            onClick={() => setActiveTab('history')}
            className="text-[#ea580c] text-sm font-semibold hover:underline"
          >
            View All
          </button>
        </div>
        
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#f5f5f5] rounded-xl" />
                  <div className="space-y-2">
                    <div className="w-32 h-4 bg-[#f5f5f5] rounded" />
                    <div className="w-20 h-3 bg-[#f5f5f5] rounded" />
                  </div>
                </div>
                <div className="w-16 h-4 bg-[#f5f5f5] rounded" />
              </div>
            ))}
          </div>
        ) : recentTransactions.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-10 h-10 text-[#999] mx-auto mb-2" />
            <p className="text-sm text-[#666]">No recent transactions found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTransactions.map((tx) => {
              const TxIcon = getTxIcon(tx.category);
              return (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-[#f9f9f9] transition-colors border border-transparent hover:border-[#e2e2e2]/40">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getTxColor(tx)}`}>
                      <TxIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#1a1a1a] text-sm">{tx.description || 'Transaction'}</p>
                      <p className="text-xs text-[#999]">{new Date(tx.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${tx.direction === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.direction === 'credit' ? '+' : '-'}{paymentService.formatAmount(parseFloat(tx.amount))}
                    </p>
                    <span className="text-[10px] bg-[#f5f5f5] px-2 py-0.5 rounded-full text-[#666] font-medium uppercase border border-[#e2e2e2]/40">
                      {tx.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
