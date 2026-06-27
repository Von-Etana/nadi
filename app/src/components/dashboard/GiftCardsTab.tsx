import { useState, useEffect } from 'react';
import { 
  Gift, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Check, 
  AlertCircle,
  Upload,
  CreditCard,
  History
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { giftCardsApi } from '@/services/api';

export const GiftCardsTab = () => {
  const [activeSubTab, setActiveSubTab] = useState<'buy' | 'sell' | 'redeem' | 'history'>('buy');
  const [availableCards, setAvailableCards] = useState<any[]>([]);
  const [rates, setRates] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buy state
  const [buyCardType, setBuyCardType] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [buyCurrency, setBuyCurrency] = useState('USD');
  const [buyLoading, setBuyLoading] = useState(false);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  // Sell state
  const [sellCardType, setSellCardType] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [sellCurrency, setSellCurrency] = useState('USD');
  const [sellCode, setSellCode] = useState('');
  const [sellPin, setSellPin] = useState('');
  const [sellImage, setSellImage] = useState<string | null>(null);
  const [sellLoading, setSellLoading] = useState(false);
  const [sellSuccess, setSellSuccess] = useState<string | null>(null);
  const [sellError, setSellError] = useState<string | null>(null);

  // Redeem state
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  // Card Transactions
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    const fetchGiftCardInfo = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [availRes, ratesRes] = await Promise.all([
          giftCardsApi.getAvailableCards(),
          giftCardsApi.getRates()
        ]);

        if (availRes.data && availRes.data.success) {
          setAvailableCards(availRes.data.cards || []);
          if (availRes.data.cards && availRes.data.cards.length > 0) {
            setBuyCardType(availRes.data.cards[0].id);
            setSellCardType(availRes.data.cards[0].id);
          }
        }
        
        if (ratesRes.data && ratesRes.data.success) {
          setRates(ratesRes.data.rates || {});
        }
      } catch (err: any) {
        console.error('Error fetching gift cards:', err);
        setError('Failed to load gift cards data.');
      } finally {
        setLoading(false);
      }
    };

    fetchGiftCardInfo();
  }, []);

  const loadTransactions = async () => {
    try {
      setTxLoading(true);
      const res = await giftCardsApi.getTransactions();
      if (res.data && res.data.success) {
        setTransactions(res.data.transactions || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTxLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'history') {
      loadTransactions();
    }
  }, [activeSubTab]);

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyCardType || !buyAmount || !buyCurrency) {
      setBuyError('Please fill in all fields');
      return;
    }
    try {
      setBuyLoading(true);
      setBuyError(null);
      setBuySuccess(null);
      const res = await giftCardsApi.buyCard({
        cardType: buyCardType,
        amount: parseFloat(buyAmount),
        currency: buyCurrency
      });
      if (res.data && res.data.success) {
        setBuySuccess(res.data.message || 'Gift card purchase request submitted successfully!');
        setBuyAmount('');
      } else {
        setBuyError(res.error || 'Failed to purchase gift card');
      }
    } catch (err: any) {
      setBuyError(err.message || 'Failed to purchase gift card');
    } finally {
      setBuyLoading(false);
    }
  };

  const handleSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellCardType || !sellAmount || !sellCurrency || !sellCode) {
      setSellError('Please fill in all required fields');
      return;
    }
    try {
      setSellLoading(true);
      setSellError(null);
      setSellSuccess(null);
      const res = await giftCardsApi.sellCard({
        cardType: sellCardType,
        amount: parseFloat(sellAmount),
        currency: sellCurrency,
        cardCode: sellCode,
        cardPin: sellPin || undefined,
        cardImage: sellImage || undefined
      });
      if (res.data && res.data.success) {
        setSellSuccess(res.data.message || 'Gift card sale request submitted successfully!');
        setSellAmount('');
        setSellCode('');
        setSellPin('');
        setSellImage(null);
      } else {
        setSellError(res.error || 'Failed to submit gift card for sale');
      }
    } catch (err: any) {
      setSellError(err.message || 'Failed to submit gift card for sale');
    } finally {
      setSellLoading(false);
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemCode) {
      setRedeemError('Redemption code is required');
      return;
    }
    try {
      setRedeemLoading(true);
      setRedeemError(null);
      setRedeemSuccess(null);
      const res = await giftCardsApi.redeemCard({ code: redeemCode });
      if (res.data && res.data.success) {
        setRedeemSuccess(res.data.message || 'Gift card redeemed successfully!');
        setRedeemCode('');
      } else {
        setRedeemError(res.error || 'Failed to redeem gift card');
      }
    } catch (err: any) {
      setRedeemError(err.message || 'Failed to redeem gift card');
    } finally {
      setRedeemLoading(false);
    }
  };

  const getCardDesign = (cardId: string) => {
    switch (cardId) {
      case 'amazon':
        return { color: 'bg-gradient-to-br from-[#111] to-[#333]', logo: '🛒', theme: 'text-[#FF9900]' };
      case 'itunes':
      case 'apple':
        return { color: 'bg-gradient-to-br from-[#6b21a8] to-[#db2777]', logo: '🍎', theme: 'text-white' };
      case 'google-play':
      case 'google':
        return { color: 'bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6]', logo: '▶️', theme: 'text-[#4285F4]' };
      case 'steam':
        return { color: 'bg-gradient-to-br from-[#0f172a] to-[#1e293b]', logo: '🎮', theme: 'text-[#1b2838]' };
      case 'xbox':
        return { color: 'bg-gradient-to-br from-[#14532d] to-[#16a34a]', logo: '💚', theme: 'text-white' };
      case 'playstation':
        return { color: 'bg-gradient-to-br from-[#1e40af] to-[#1d4ed8]', logo: '💙', theme: 'text-white' };
      case 'netflix':
        return { color: 'bg-gradient-to-br from-[#991b1b] to-[#dc2626]', logo: '📺', theme: 'text-[#E50914]' };
      case 'spotify':
        return { color: 'bg-gradient-to-br from-[#064e3b] to-[#10b981]', logo: '🎵', theme: 'text-[#1DB954]' };
      default:
        return { color: 'bg-gradient-to-br from-[#ea580c] to-[#f97316]', logo: '🎁', theme: 'text-white' };
    }
  };

  const getRateFor = (cardId: string, currency: string) => {
    if (rates[cardId] && rates[cardId][currency]) {
      return rates[cardId][currency];
    }
    // Fallbacks
    const fallbackRates: any = {
      amazon: { USD: 850, GBP: 950, EUR: 890 },
      apple: { USD: 880, GBP: 980 },
      itunes: { USD: 880, GBP: 980 },
      'google-play': { USD: 820 },
      steam: { USD: 800 },
      netflix: { USD: 900 },
      spotify: { USD: 870 },
    };
    return fallbackRates[cardId]?.[currency] || 750;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSellImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-12 h-12 border-4 border-[#ea580c] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#666]">Fetching active gift card listings and exchange rates...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Gift Cards</h1>
        <p className="text-sm text-[#666]">Buy, sell or redeem global gift cards at the best rates</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-[#e2e2e2]/40 p-1 rounded-xl max-w-lg border border-[#e2e2e2]/40">
        {(['buy', 'sell', 'redeem', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-all duration-200 ${
              activeSubTab === tab
                ? 'bg-gradient-primary text-white shadow-sm'
                : 'text-[#666] hover:bg-[#f5f5f5] hover:text-[#1a1a1a]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-2xl flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Buy Gift Cards */}
      {activeSubTab === 'buy' && (
        <div className="space-y-6">
          {buySuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-4 rounded-2xl flex gap-3">
              <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p>{buySuccess}</p>
            </div>
          )}

          {buyError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-2xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p>{buyError}</p>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6">
            {/* Left Col: Catalog */}
            <div className="md:col-span-2 grid sm:grid-cols-2 gap-4">
              {availableCards.map((card) => {
                const design = getCardDesign(card.id);
                const firstCurrency = card.currencies?.[0] || 'USD';
                const currentRate = getRateFor(card.id, firstCurrency);
                return (
                  <div 
                    key={card.id} 
                    onClick={() => {
                      setBuyCardType(card.id);
                      setBuyCurrency(firstCurrency);
                    }}
                    className={`rounded-2xl p-5 border cursor-pointer hover:shadow-md active:scale-[0.98] transition-all flex flex-col justify-between h-44 ${
                      buyCardType === card.id 
                        ? 'border-[#ea580c] bg-orange-50/20 shadow-sm' 
                        : 'border-[#e2e2e2]/60 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${design.color} text-white`}>
                        {design.logo}
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#f5f5f5] border border-[#e2e2e2]/40 text-[#666]">
                        {card.currencies.join(', ')}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-bold text-[#1a1a1a]">{card.name}</h3>
                      <div className="flex justify-between items-baseline mt-1">
                        <span className="text-xs text-[#999]">Rate: ₦{currentRate.toLocaleString()}/$</span>
                        <span className="text-[10px] text-[#666] font-semibold">Min: ${card.minValue} • Max: ${card.maxValue}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Col: Checkout */}
            <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm self-start space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#1a1a1a]">Purchase Card</h3>
                <p className="text-xs text-[#999]">Enter values to purchase gift voucher</p>
              </div>

              {buyCardType && (
                <div className={`rounded-xl p-4 text-white flex items-center gap-4 ${getCardDesign(buyCardType).color}`}>
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-lg">
                    {getCardDesign(buyCardType).logo}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">
                      {availableCards.find(c => c.id === buyCardType)?.name || buyCardType} Gift Voucher
                    </h4>
                    <p className="text-[10px] text-white/70">
                      Rate: ₦{getRateFor(buyCardType, buyCurrency).toLocaleString()}/{buyCurrency}
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleBuy} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#1a1a1a]">Currency</label>
                    <select
                      value={buyCurrency}
                      onChange={(e) => setBuyCurrency(e.target.value)}
                      className="w-full h-12 rounded-xl border border-[#e2e2e2] px-3 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
                    >
                      {availableCards
                        .find((c) => c.id === buyCardType)
                        ?.currencies.map((curr: string) => (
                          <option key={curr} value={curr}>{curr}</option>
                        )) || <option value="USD">USD</option>}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#1a1a1a]">Amount (Val)</label>
                    <Input
                      type="number"
                      placeholder="$ Value"
                      value={buyAmount}
                      onChange={(e) => setBuyAmount(e.target.value)}
                      className="h-12 rounded-xl border-[#e2e2e2]"
                      required
                    />
                  </div>
                </div>

                <div className="bg-[#fcfcfc] border border-[#e2e2e2]/60 rounded-xl p-4 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#666]">Base Amount</span>
                    <span className="font-bold">
                      {buyAmount ? `${buyCurrency} ${parseFloat(buyAmount).toLocaleString()}` : '$0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2 border-t border-[#e2e2e2]">
                    <span className="font-semibold text-[#1a1a1a]">Total Cost (NGN)</span>
                    <span className="font-black text-[#ea580c] text-sm">
                      ₦
                      {buyAmount
                        ? (
                            parseFloat(buyAmount) * getRateFor(buyCardType, buyCurrency)
                          ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Coming Soon Notice */}
                <div className="bg-orange-50 border border-orange-200 text-orange-800 text-[10px] p-3 rounded-lg flex gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0" />
                  <p>Gift card purchasing is currently mocked. Submitting will test the connection but won't deliver live codes.</p>
                </div>

                <Button
                  type="submit"
                  disabled={buyLoading || !buyAmount}
                  className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
                >
                  {buyLoading ? 'Processing Request...' : 'Buy Gift Card'}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Sell Gift Cards */}
      {activeSubTab === 'sell' && (
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a]">Sell Gift Card</h3>
            <p className="text-xs text-[#999]">Submit card codes to trade for Naira instantly</p>
          </div>

          {sellSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-4 rounded-2xl flex gap-3">
              <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p>{sellSuccess}</p>
            </div>
          )}

          {sellError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-2xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p>{sellError}</p>
            </div>
          )}

          <form onSubmit={handleSell} className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Choose Card Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSellCardType(card.id)}
                      className={`p-3 border rounded-xl flex flex-col items-center justify-center text-center transition-all ${
                        sellCardType === card.id
                          ? 'border-[#ea580c] bg-orange-50/20'
                          : 'border-[#e2e2e2] bg-[#fcfcfc] hover:bg-[#f5f5f5]'
                      }`}
                    >
                      <span className="text-lg mb-1">{getCardDesign(card.id).logo}</span>
                      <span className="text-xs font-semibold text-[#1a1a1a] truncate max-w-full">{card.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Currency</label>
                  <select
                    value={sellCurrency}
                    onChange={(e) => setSellCurrency(e.target.value)}
                    className="w-full h-12 rounded-xl border border-[#e2e2e2] px-3 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
                  >
                    {availableCards
                      .find((c) => c.id === sellCardType)
                      ?.currencies.map((curr: string) => (
                        <option key={curr} value={curr}>{curr}</option>
                      )) || <option value="USD">USD</option>}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Card Value ($)</label>
                  <Input
                    type="number"
                    placeholder="e.g., 100"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                    className="h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>

              <div className="bg-[#fcfcfc] border border-[#e2e2e2]/60 rounded-xl p-4 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#666]">Exchange Rate</span>
                  <span className="font-bold text-[#1a1a1a]">
                    ₦{getRateFor(sellCardType, sellCurrency).toLocaleString()}/$
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-[#e2e2e2]">
                  <span className="font-semibold text-[#1a1a1a]">You Receive (Estimated)</span>
                  <span className="font-black text-[#ea580c] text-sm">
                    ₦
                    {sellAmount
                      ? (
                          parseFloat(sellAmount) * getRateFor(sellCardType, sellCurrency)
                        ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '0.00'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Card Code / Serial Number</label>
                <Input
                  type="text"
                  placeholder="Enter gift card code"
                  value={sellCode}
                  onChange={(e) => setSellCode(e.target.value)}
                  className="h-12 rounded-xl border-[#e2e2e2] font-mono uppercase tracking-wider"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Card PIN (Optional)</label>
                <Input
                  type="text"
                  placeholder="Enter PIN if applicable"
                  value={sellPin}
                  onChange={(e) => setSellPin(e.target.value)}
                  className="h-12 rounded-xl border-[#e2e2e2] font-mono uppercase tracking-wider"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Card Image (Optional)</label>
                <div className="border border-dashed border-[#e2e2e2] rounded-2xl p-4 text-center bg-[#fcfcfc] relative hover:bg-[#f5f5f5]/50 transition-all cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  {sellImage ? (
                    <div className="flex items-center gap-3 justify-center text-xs text-[#ea580c] font-semibold">
                      <CreditCard className="w-5 h-5 text-[#ea580c]" />
                      <span>Card Image Uploaded</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-5 h-5 text-[#999] mx-auto" />
                      <p className="text-[11px] text-[#666] font-medium">Click to upload image of card back</p>
                      <p className="text-[9px] text-[#999]">PNG, JPG up to 5MB</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Coming Soon Notice */}
              <div className="bg-orange-50 border border-orange-200 text-orange-800 text-[10px] p-3 rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <p>Selling requires admin review. The request will register on the backend, but payouts are processed during development testing.</p>
              </div>

              <Button
                type="submit"
                disabled={sellLoading || !sellAmount || !sellCode}
                className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
              >
                {sellLoading ? 'Submitting Card...' : 'Submit Sale Request'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Redeem Gift Card */}
      {activeSubTab === 'redeem' && (
        <div className="bg-white rounded-3xl p-8 border border-[#e2e2e2]/60 shadow-sm max-w-lg mx-auto text-center space-y-6">
          <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto">
            <Gift className="w-8 h-8 text-[#ea580c]" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[#1a1a1a]">Redeem Nadi Gift Voucher</h3>
            <p className="text-xs text-[#666] max-w-xs mx-auto">Enter an authorized Nadi code to fund your balance instantly</p>
          </div>

          {redeemSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3.5 rounded-xl flex gap-2">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p>{redeemSuccess}</p>
            </div>
          )}

          {redeemError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl flex gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p>{redeemError}</p>
            </div>
          )}

          <form onSubmit={handleRedeem} className="space-y-4">
            <Input
              type="text"
              placeholder="e.g., NADI-XXXX-XXXX"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              className="h-14 rounded-xl border-[#e2e2e2] text-center text-lg font-mono uppercase tracking-widest"
              required
            />
            <Button
              type="submit"
              disabled={redeemLoading || !redeemCode}
              className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
            >
              {redeemLoading ? 'Verifying Code...' : 'Redeem Voucher'}
            </Button>
          </form>
        </div>
      )}

      {/* History SubTab */}
      {activeSubTab === 'history' && (
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a]">Gift Card Orders</h3>
            <p className="text-xs text-[#999]">Review your card orders, sell payouts, and validation states</p>
          </div>

          {txLoading ? (
            <div className="py-8 text-center text-xs text-[#666]">Loading orders...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <History className="w-10 h-10 text-[#c2410c]/30 mx-auto" />
              <p className="text-sm text-[#666]">No gift card activity logged yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex justify-between items-center p-4 border border-[#e2e2e2]/40 rounded-2xl hover:bg-[#fcfcfc] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center font-bold text-orange-600">
                      {tx.type === 'buy' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-[#1a1a1a] capitalize">
                        {tx.type} {tx.card_type} Card
                      </p>
                      <p className="text-[10px] text-[#999]">
                        Code: <span className="font-mono">{tx.card_code.substring(0, 8)}...</span> • {new Date(tx.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-[#1a1a1a]">
                      ₦{(parseFloat(tx.amount) * parseFloat(tx.rate || 1)).toLocaleString()}
                    </p>
                    <span className="text-[10px] uppercase font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
