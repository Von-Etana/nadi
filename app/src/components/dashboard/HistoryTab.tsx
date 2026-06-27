import { useState, useEffect } from 'react';
import { 
  Send, 
  Receipt, 
  Gift, 
  Fuel, 
  TrendingUp, 
  Wallet, 
  RefreshCw, 
  Clock, 
  Search
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { walletApi } from '@/services/api';
import { paymentService } from '@/services/payment';

export const HistoryTab = () => {
  const [filter, setFilter] = useState<'all' | 'sent' | 'received' | 'bills' | 'giftcards' | 'crypto'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await walletApi.getTransactions({ limit: 100 });
      if (res.data && res.data.success) {
        setTransactions(res.data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to load transaction history:', err);
      setError('Failed to fetch transaction logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const getTxIcon = (category: string) => {
    switch (category) {
      case 'bills':
      case 'utility':
        return Receipt;
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

  // Filter & Search logic
  const filteredTransactions = transactions.filter((tx) => {
    // 1. Filter by category/type
    if (filter !== 'all') {
      if (filter === 'sent' && tx.direction !== 'debit') return false;
      if (filter === 'received' && tx.direction !== 'credit') return false;
      if (filter === 'bills' && tx.category !== 'bills' && tx.category !== 'utility') return false;
      if (filter === 'giftcards' && tx.category !== 'giftcard') return false;
      if (filter === 'crypto' && tx.category !== 'crypto') return false;
    }

    // 2. Search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const title = (tx.description || '').toLowerCase();
      const ref = (tx.reference || '').toLowerCase();
      const status = (tx.status || '').toLowerCase();
      return title.includes(query) || ref.includes(query) || status.includes(query);
    }

    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Transaction Ledger</h1>
          <p className="text-xs text-[#666]">View and search your complete account transaction history</p>
        </div>
        <button 
          onClick={fetchTransactions}
          disabled={loading}
          className="p-2 rounded-xl hover:bg-[#e2e2e2]/60 text-[#666] transition-colors"
          title="Refresh History"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#e2e2e2]/60 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
          <Input
            type="text"
            placeholder="Search by description or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 rounded-xl border-[#e2e2e2] bg-[#f5f5f5]/60 focus:bg-white text-sm"
          />
        </div>

        {/* Categories Scroller */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
          {[
            { id: 'all', label: 'All' },
            { id: 'sent', label: 'Outbox (Sent)' },
            { id: 'received', label: 'Inbox (Received)' },
            { id: 'bills', label: 'Bills' },
            { id: 'giftcards', label: 'Gift Cards' },
            { id: 'crypto', label: 'Crypto' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`px-4 py-2 rounded-xl whitespace-nowrap text-xs font-semibold transition-all ${
                filter === f.id
                  ? 'bg-gradient-primary text-white shadow-sm'
                  : 'bg-[#f5f5f5] text-[#666] hover:bg-[#e2e2e2]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Container */}
      <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm">
        {loading ? (
          <div className="space-y-4 py-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-3.5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#f5f5f5] rounded-xl" />
                  <div className="space-y-2">
                    <div className="w-48 h-4 bg-[#f5f5f5] rounded" />
                    <div className="w-24 h-3 bg-[#f5f5f5] rounded" />
                  </div>
                </div>
                <div className="w-20 h-4 bg-[#f5f5f5] rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 text-[#ea580c] flex flex-col items-center gap-2">
            <Clock className="w-12 h-12 text-[#ea580c] animate-bounce" />
            <p className="font-bold text-sm">{error}</p>
            <button onClick={fetchTransactions} className="text-xs text-[#ea580c] underline">Retry</button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12 text-[#999] border border-dashed border-[#e2e2e2] rounded-2xl">
            <Clock className="w-12 h-12 mx-auto mb-2 text-[#999]" />
            <p className="text-sm font-semibold">No transactions match the selected criteria.</p>
            <p className="text-xs mt-0.5">Your transaction history will update live as you perform actions.</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredTransactions.map((tx) => {
              const TxIcon = getTxIcon(tx.category);
              return (
                <div 
                  key={tx.id} 
                  className="flex items-center justify-between p-3.5 rounded-2xl hover:bg-[#f9f9f9] border border-transparent hover:border-[#e2e2e2]/40 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm ${getTxColor(tx)}`}>
                      <TxIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-[#1a1a1a]">{tx.description || 'Transaction'}</p>
                      <p className="text-[10px] text-[#999] mt-0.5">
                        {new Date(tx.created_at).toLocaleString()} • Ref: <span className="font-mono text-white/10 select-all bg-[#e2e2e2]/40 text-black px-1 py-0.5 rounded">{tx.reference || tx.id.slice(0, 10)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <p className={`font-black text-sm ${tx.direction === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.direction === 'credit' ? '+' : '-'}{paymentService.formatAmount(parseFloat(tx.amount))}
                    </p>
                    <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      tx.status === 'completed' || tx.status === 'success'
                        ? 'bg-green-100 text-green-700'
                        : tx.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                    }`}>
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
