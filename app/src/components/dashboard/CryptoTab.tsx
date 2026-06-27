import { useState, useEffect } from 'react';
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  RefreshCw, 
  AlertCircle, 
  Copy, 
  ArrowRightLeft,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cryptoApi } from '@/services/api';

interface CryptoTabProps {
  cryptoBalance: number;
}

export const CryptoTab = ({ cryptoBalance: initialCryptoBalance }: CryptoTabProps) => {
  const [activeAction, setActiveAction] = useState<'buy' | 'sell' | 'swap'>('buy');
  const [pricesLoading, setPricesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Assets and price states
  const [assets, setAssets] = useState<any[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({
    btc: 98500000,
    eth: 5200000,
    usdt: 1550
  });
  const [priceChanges, setPriceChanges] = useState<Record<string, number>>({
    btc: 2.4,
    eth: 1.8,
    usdt: 0.0
  });

  // Wallet address state
  const [selectedWalletCoin, setSelectedWalletCoin] = useState('btc');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);

  // Form states
  const [selectedCoin, setSelectedCoin] = useState('btc');
  const [tradeAmount, setTradeAmount] = useState('');
  const [swapToCoin, setSwapToCoin] = useState('usdt');
  const [actionLoading, setActionLoading] = useState(false);

  const cryptos = [
    { id: 'btc', name: 'Bitcoin', symbol: 'BTC', price: prices.btc, change: priceChanges.btc, balance: assets.find(a => a.symbol === 'btc')?.balance || initialCryptoBalance },
    { id: 'eth', name: 'Ethereum', symbol: 'ETH', price: prices.eth, change: priceChanges.eth, balance: assets.find(a => a.symbol === 'eth')?.balance || 0.5 },
    { id: 'usdt', name: 'Tether', symbol: 'USDT', price: prices.usdt, change: priceChanges.usdt, balance: assets.find(a => a.symbol === 'usdt')?.balance || 500 },
  ];

  const fetchCryptoData = async () => {
    try {
      setPricesLoading(true);
      setError(null);
      
      // Fetch prices
      const priceRes = await cryptoApi.getPrices();
      if (priceRes.data && priceRes.data.success) {
        const p = priceRes.data.prices;
        if (p) {
          setPrices({
            btc: p.BTC?.ngn || p.btc?.ngn || p.btc || 98500000,
            eth: p.ETH?.ngn || p.eth?.ngn || p.eth || 5200000,
            usdt: p.USDT?.ngn || p.usdt?.ngn || p.usdt || 1550
          });
          setPriceChanges({
            btc: p.BTC?.change24h || priceRes.data.changes?.btc || 2.4,
            eth: p.ETH?.change24h || priceRes.data.changes?.eth || 1.8,
            usdt: p.USDT?.change24h || priceRes.data.changes?.usdt || 0.0
          });
        }
      }

      // Fetch assets
      const assetRes = await cryptoApi.getAssets();
      if (assetRes.data && assetRes.data.success) {
        setAssets(assetRes.data.assets || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch crypto prices/assets:', err);
      // Fail silently to keep using fallback defaults
    } finally {
      setPricesLoading(false);
    }
  };

  const fetchWalletAddress = async (coin: string) => {
    try {
      setAddressLoading(true);
      setWalletAddress(null);
      const res = await cryptoApi.getWalletAddress(coin);
      if (res.status === 501) {
        setWalletAddress('Coming Soon (Not implemented on backend)');
        return;
      }
      if (res.data && res.data.success) {
        setWalletAddress(res.data.address);
      } else {
        setWalletAddress(res.error || 'Failed to generate address');
      }
    } catch (err) {
      console.error(err);
      setWalletAddress('Coming Soon (Under Maintenance)');
    } finally {
      setAddressLoading(false);
    }
  };

  useEffect(() => {
    fetchCryptoData();
  }, []);

  useEffect(() => {
    fetchWalletAddress(selectedWalletCoin);
  }, [selectedWalletCoin]);

  const handleTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeAmount || parseFloat(tradeAmount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      setSuccess(null);

      let response;
      if (activeAction === 'buy') {
        response = await cryptoApi.buy({
          crypto: selectedCoin,
          amount: parseFloat(tradeAmount),
          paymentMethod: 'wallet'
        });
      } else if (activeAction === 'sell') {
        response = await cryptoApi.sell({
          crypto: selectedCoin,
          amount: parseFloat(tradeAmount),
          destination: 'wallet'
        });
      } else {
        response = await cryptoApi.swap({
          fromCrypto: selectedCoin,
          toCrypto: swapToCoin,
          amount: parseFloat(tradeAmount)
        });
      }

      if (response.status === 501) {
        setError(`Crypto ${activeAction} functionality is coming soon! Keep an eye out for updates.`);
        return;
      }

      if (response.data && response.data.success) {
        setSuccess(`Successfully completed ${activeAction} trade!`);
        setTradeAmount('');
        fetchCryptoData();
      } else {
        setError(response.error || 'Trade transaction failed');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Trade operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const getCryptoIconColor = (symbol: string) => {
    switch (symbol.toLowerCase()) {
      case 'btc': return 'bg-[#F7931A]';
      case 'eth': return 'bg-[#627EEA]';
      case 'usdt': return 'bg-[#26A17B]';
      default: return 'bg-gradient-primary';
    }
  };

  // Compute total crypto balance in Naira
  const totalCryptoNaira = cryptos.reduce((total, coin) => total + (coin.balance * coin.price), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Crypto Portal</h1>
        <button 
          onClick={fetchCryptoData}
          disabled={pricesLoading}
          className="p-2 rounded-xl hover:bg-[#e2e2e2]/60 text-[#666] transition-colors"
          title="Refresh Prices"
        >
          <RefreshCw className={`w-5 h-5 ${pricesLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Balance Card */}
      <div className="bg-[#1a1a1a] rounded-3xl p-8 text-white relative overflow-hidden shadow-md">
        <div className="absolute top-0 right-0 w-60 h-60 bg-[#ea580c]/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <p className="text-white/60 text-sm mb-2">Total Crypto Value (Estimated)</p>
          <h2 className="text-4xl font-extrabold tracking-tight">
            ₦{totalCryptoNaira.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <div className="mt-4 flex gap-4 text-xs text-white/70">
            {cryptos.map(coin => (
              <span key={coin.id} className="bg-white/10 px-2.5 py-1 rounded-lg">
                {coin.balance.toFixed(4)} {coin.symbol}
              </span>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <button 
              onClick={() => { setActiveAction('buy'); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeAction === 'buy' ? 'bg-[#ea580c] text-white shadow-sm' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              Buy
            </button>
            <button 
              onClick={() => { setActiveAction('sell'); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeAction === 'sell' ? 'bg-[#ea580c] text-white shadow-sm' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              Sell
            </button>
            <button 
              onClick={() => { setActiveAction('swap'); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeAction === 'swap' ? 'bg-[#ea580c] text-white shadow-sm' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              Swap
            </button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Your Assets */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm">
            <h3 className="text-lg font-bold text-[#1a1a1a] mb-4">Your Assets</h3>
            <div className="space-y-3">
              {cryptos.map((crypto) => (
                <div key={crypto.id} className="flex items-center justify-between p-3.5 rounded-xl hover:bg-[#f9f9f9] transition-colors border border-transparent hover:border-[#e2e2e2]/40">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full ${getCryptoIconColor(crypto.symbol)} flex items-center justify-center text-white font-extrabold text-sm shadow-sm`}>
                      {crypto.symbol}
                    </div>
                    <div>
                      <p className="font-semibold text-[#1a1a1a] text-sm">{crypto.name}</p>
                      <p className="text-xs text-[#999]">{crypto.balance.toFixed(4)} {crypto.symbol}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-[#1a1a1a]">₦{(crypto.price * crypto.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className={`text-xs font-semibold ${crypto.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {crypto.change >= 0 ? '+' : ''}{crypto.change}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deposit/Receive Addresses */}
          <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#1a1a1a]">Receive Cryptocurrency</h3>
              <p className="text-xs text-[#999]">Generate instant wallet addresses for direct deposits</p>
            </div>
            
            <div className="flex gap-2">
              {cryptos.map((coin) => (
                <button
                  key={coin.id}
                  onClick={() => setSelectedWalletCoin(coin.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    selectedWalletCoin === coin.id
                      ? 'bg-[#ea580c] text-white'
                      : 'bg-[#f5f5f5] text-[#666] hover:bg-[#e2e2e2]'
                  }`}
                >
                  {coin.symbol}
                </button>
              ))}
            </div>

            <div className="bg-[#fcfcfc] border border-[#e2e2e2] rounded-xl p-4 text-center">
              {addressLoading ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <RefreshCw className="w-6 h-6 text-[#ea580c] animate-spin" />
                  <p className="text-xs text-[#666]">Generating deposit address...</p>
                </div>
              ) : walletAddress ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-[#666] uppercase">{selectedWalletCoin} Deposit Address</p>
                  <div className="bg-[#f5f5f5] p-3.5 rounded-xl border border-[#e2e2e2] break-all font-mono text-[10px] text-[#1a1a1a] select-all">
                    {walletAddress}
                  </div>
                  {walletAddress.startsWith('Coming') ? (
                    <p className="text-[10px] text-orange-500 flex items-center justify-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Functionality not enabled on test server.
                    </p>
                  ) : (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(walletAddress);
                        alert('Crypto address copied to clipboard!');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Address
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-red-500">Failed to load deposit details.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Trading Desk */}
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-6 h-fit">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a] capitalize">{activeAction} Cryptocurrency</h3>
            <p className="text-xs text-[#999]">Instantly swap Naira or exchange coins</p>
          </div>

          {error && (
            <div className="bg-orange-50 border border-orange-200 text-orange-700 text-xs p-3.5 rounded-xl flex gap-2">
              <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3.5 rounded-xl flex gap-2">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p>{success}</p>
            </div>
          )}

          <form onSubmit={handleTradeSubmit} className="space-y-4">
            {/* Cryptocurrency Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#1a1a1a]">Select Coin</label>
              <div className="grid grid-cols-3 gap-2">
                {cryptos.map((coin) => (
                  <button
                    key={coin.id}
                    type="button"
                    onClick={() => setSelectedCoin(coin.id)}
                    className={`p-3 border rounded-xl transition-all text-center ${
                      selectedCoin === coin.id
                        ? 'border-[#ea580c] bg-[#ea580c]/5 shadow-sm'
                        : 'border-[#e2e2e2] hover:border-[#ea580c] bg-white'
                    }`}
                  >
                    <p className="font-extrabold text-sm text-[#1a1a1a]">{coin.symbol}</p>
                    <p className="text-[10px] text-[#999] truncate">{coin.name}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* If SWAP, select destination coin */}
            {activeAction === 'swap' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#1a1a1a]">Swap To</label>
                <div className="grid grid-cols-3 gap-2">
                  {cryptos.map((coin) => (
                    <button
                      key={coin.id}
                      type="button"
                      disabled={selectedCoin === coin.id}
                      onClick={() => setSwapToCoin(coin.id)}
                      className={`p-3 border rounded-xl transition-all text-center ${
                        selectedCoin === coin.id ? 'opacity-40 cursor-not-allowed border-[#e2e2e2]' :
                        swapToCoin === coin.id
                          ? 'border-[#ea580c] bg-[#ea580c]/5 shadow-sm'
                          : 'border-[#e2e2e2] hover:border-[#ea580c] bg-white'
                      }`}
                    >
                      <p className="font-extrabold text-sm text-[#1a1a1a]">{coin.symbol}</p>
                      <p className="text-[10px] text-[#999] truncate">{coin.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Trade Amount */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#1a1a1a]">
                {activeAction === 'buy' ? 'Amount (₦ Naira)' : `Quantity (${selectedCoin.toUpperCase()})`}
              </label>
              <div className="relative">
                {activeAction === 'buy' && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999] text-sm font-semibold">₦</span>
                )}
                <Input
                  type="number"
                  step="any"
                  placeholder={activeAction === 'buy' ? 'Min ₦1000' : '0.005'}
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  className={`h-12 rounded-xl border-[#e2e2e2] font-semibold text-sm ${activeAction === 'buy' ? 'pl-8' : 'pl-3'}`}
                  required
                />
              </div>
            </div>

            {/* Estimated Value display */}
            {tradeAmount && !isNaN(parseFloat(tradeAmount)) && parseFloat(tradeAmount) > 0 && (
              <div className="bg-[#f9f9f9] border border-[#e2e2e2] rounded-xl p-3 flex justify-between text-xs">
                <span className="text-[#666]">Estimated Output</span>
                <span className="font-bold text-[#1a1a1a]">
                  {activeAction === 'buy' 
                    ? `${(parseFloat(tradeAmount) / prices[selectedCoin]).toFixed(6)} ${selectedCoin.toUpperCase()}`
                    : activeAction === 'sell'
                      ? `₦${(parseFloat(tradeAmount) * prices[selectedCoin]).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : `${((parseFloat(tradeAmount) * prices[selectedCoin]) / prices[swapToCoin]).toFixed(6)} ${swapToCoin.toUpperCase()}`
                  }
                </span>
              </div>
            )}

            <Button
              type="submit"
              disabled={actionLoading}
              className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98] capitalize"
            >
              {actionLoading ? 'Executing Trade...' : `Confirm ${activeAction} Order`}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
