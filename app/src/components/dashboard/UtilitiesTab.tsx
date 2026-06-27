import { useState, useEffect } from 'react';
import { 
  Zap, 
  Droplets, 
  Tv, 
  Wifi, 
  Phone, 
  Smartphone, 
  Check, 
  AlertCircle, 
  User, 
  Hash, 
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { utilitiesApi } from '@/services/api';

export const UtilitiesTab = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Providers & Plans
  const [providers, setProviders] = useState<any[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  
  const [dataPlans, setDataPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  // Form Inputs
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validatedCustomer, setValidatedCustomer] = useState<any>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Payment states
  const [isPaying, setIsPaying] = useState(false);
  const [paySuccess, setPaySuccess] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [tokenGenerated, setTokenGenerated] = useState<string | null>(null);

  // Load categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await utilitiesApi.getCategories();
        if (res.data && res.data.success) {
          setCategories(res.data.categories || []);
        } else {
          // Local fallback
          setCategories([
            { id: 'electricity', name: 'Electricity', icon: 'zap' },
            { id: 'water', name: 'Water', icon: 'droplets' },
            { id: 'cable', name: 'Cable TV', icon: 'tv' },
            { id: 'internet', name: 'Internet', icon: 'wifi' },
            { id: 'airtime', name: 'Airtime', icon: 'phone' },
            { id: 'data', name: 'Data Bundle', icon: 'smartphone' }
          ]);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchCategories();
  }, []);

  // Load providers whenever category changes
  useEffect(() => {
    if (!selectedCategory) return;
    
    const fetchProviders = async () => {
      try {
        setProvidersLoading(true);
        setSelectedProvider('');
        setDataPlans([]);
        setSelectedPlan('');
        setValidatedCustomer(null);
        setValidationError(null);
        setReferenceNumber('');
        setAmount('');
        setPhoneNumber('');
        setPaySuccess(null);
        setPayError(null);
        setTokenGenerated(null);

        const res = await utilitiesApi.getProviders(selectedCategory);
        if (res.data && res.data.success) {
          setProviders(res.data.providers || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setProvidersLoading(false);
      }
    };
    fetchProviders();
  }, [selectedCategory]);

  // Load data plans if category is 'data' and provider changes
  useEffect(() => {
    if (selectedCategory === 'data' && selectedProvider) {
      const fetchPlans = async () => {
        try {
          setPlansLoading(true);
          const res = await utilitiesApi.getDataPlans(selectedProvider);
          if (res.data && res.data.success) {
            setDataPlans(res.data.plans || []);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setPlansLoading(false);
        }
      };
      fetchPlans();
    }
  }, [selectedProvider, selectedCategory]);

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'zap':
        return Zap;
      case 'droplet':
      case 'droplets':
        return Droplets;
      case 'tv':
        return Tv;
      case 'wifi':
        return Wifi;
      case 'phone':
        return Phone;
      case 'smartphone':
      default:
        return Smartphone;
    }
  };

  // Validate Meter/Account
  const handleValidateAccount = async () => {
    if (!selectedProvider || !referenceNumber) return;
    try {
      setIsValidating(true);
      setValidationError(null);
      setValidatedCustomer(null);

      const res = await utilitiesApi.validateMeter({
        provider: selectedProvider,
        meterNumber: referenceNumber,
        meterType: 'prepaid' // Default prepaid
      });

      if (res.data && res.data.success) {
        setValidatedCustomer(res.data.customer);
      } else {
        setValidationError(res.error || 'Failed to validate customer account');
      }
    } catch (err: any) {
      setValidationError(err.message || 'Validation failed. Ensure biller provider is active.');
    } finally {
      setIsValidating(false);
    }
  };

  // Submit Bill Payment
  const handlePayBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);
    setPaySuccess(null);
    setTokenGenerated(null);

    try {
      setIsPaying(true);

      if (selectedCategory === 'airtime') {
        if (!selectedProvider || !phoneNumber || !amount) {
          setPayError('Please fill all required fields');
          setIsPaying(false);
          return;
        }

        const res = await utilitiesApi.buyAirtime({
          network: selectedProvider,
          phoneNumber,
          amount: parseFloat(amount)
        });

        if (res.data && res.data.success) {
          setPaySuccess(`Airtime purchase of ₦${parseFloat(amount).toLocaleString()} for ${phoneNumber} was successful.`);
          setPhoneNumber('');
          setAmount('');
        } else {
          setPayError(res.error || 'Airtime purchase failed');
        }
      } 
      else if (selectedCategory === 'data') {
        if (!selectedProvider || !phoneNumber || !selectedPlan) {
          setPayError('Please fill all required fields');
          setIsPaying(false);
          return;
        }

        const res = await utilitiesApi.buyData({
          network: selectedProvider,
          phoneNumber,
          planCode: selectedPlan
        });

        if (res.data && res.data.success) {
          setPaySuccess(`Data bundle purchase for ${phoneNumber} was successful.`);
          setPhoneNumber('');
          setSelectedPlan('');
        } else {
          setPayError(res.error || 'Data bundle purchase failed');
        }
      } 
      else {
        // Utilities (Electricity, Cable, etc.)
        if (!selectedProvider || !referenceNumber || !amount || !validatedCustomer) {
          setPayError('Please validate account and fill in amount');
          setIsPaying(false);
          return;
        }

        const res = await utilitiesApi.payBill({
          category: selectedCategory!,
          provider: selectedProvider,
          customerReference: referenceNumber,
          amount: parseFloat(amount)
        });

        if (res.data && res.data.success) {
          setPaySuccess(`Utility payment of ₦${parseFloat(amount).toLocaleString()} was successful.`);
          if (res.data.transaction?.token) {
            setTokenGenerated(res.data.transaction.token);
          }
          setReferenceNumber('');
          setAmount('');
          setValidatedCustomer(null);
        } else {
          setPayError(res.error || 'Utility payment failed');
        }
      }
    } catch (err: any) {
      console.error(err);
      setPayError(err.message || 'Payment failed. Ensure your wallet has sufficient balance.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Pay Bills & Services</h1>
        <p className="text-[#666]">Select a category to pay electricity, TV, water bills or purchase airtime/data bundle.</p>
      </div>

      {/* Categories Selection */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {categories.map((cat) => {
          const IconComponent = getCategoryIcon(cat.icon);
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`p-4 rounded-2xl text-center border transition-all active:scale-[0.98] ${
                selectedCategory === cat.id
                  ? 'bg-gradient-primary border-transparent text-white shadow-md'
                  : 'bg-white border-[#e2e2e2]/60 hover:shadow-md'
              }`}
            >
              <IconComponent className={`w-8 h-8 mx-auto mb-2 ${selectedCategory === cat.id ? 'text-white' : 'text-[#ea580c]'}`} />
              <p className="text-xs font-bold capitalize">{cat.name}</p>
            </button>
          );
        })}
      </div>

      {/* Form Section */}
      {selectedCategory && (
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-6 animate-in slide-in-from-bottom duration-200">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a] capitalize">Pay {selectedCategory}</h3>
            <p className="text-xs text-[#999]">Fill the fields below to make bill debit payment from wallet.</p>
          </div>

          {paySuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-4 rounded-2xl space-y-2">
              <div className="flex gap-2">
                <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p>{paySuccess}</p>
              </div>
              {tokenGenerated && (
                <div className="mt-2 p-3 bg-white border border-green-200 rounded-xl">
                  <p className="text-xs text-[#666] font-bold">Electricity Token Code:</p>
                  <p className="text-lg font-black text-[#ea580c] tracking-widest mt-1">{tokenGenerated}</p>
                </div>
              )}
            </div>
          )}

          {payError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-2xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p>{payError}</p>
            </div>
          )}

          {providersLoading ? (
            <div className="flex items-center gap-2 py-8 text-center text-xs text-[#666] justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#ea580c]" />
              <span>Loading biller operators...</span>
            </div>
          ) : (
            <form onSubmit={handlePayBill} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {/* Provider Selector */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Biller Provider / Network Operator</label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="w-full h-12 rounded-xl border border-[#e2e2e2] px-3 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
                    required
                  >
                    <option value="">-- Choose Operator --</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Meter/Card/Phone Input depending on Category */}
                {selectedCategory !== 'airtime' && selectedCategory !== 'data' ? (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#1a1a1a] flex justify-between items-center">
                      <span>Meter / Smart Card Number</span>
                      {selectedProvider && referenceNumber && (
                        <button
                          type="button"
                          onClick={handleValidateAccount}
                          disabled={isValidating}
                          className="text-[10px] text-[#ea580c] font-bold hover:underline flex items-center gap-1"
                        >
                          {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Validate Account'}
                        </button>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                        <Input
                          type="text"
                          placeholder="Enter account / meter reference"
                          value={referenceNumber}
                          onChange={(e) => setReferenceNumber(e.target.value)}
                          className="pl-9 h-12 rounded-xl border-[#e2e2e2]"
                          required
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#1a1a1a]">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                      <Input
                        type="tel"
                        placeholder="e.g. +234 810 XXX XXXX"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="pl-9 h-12 rounded-xl border-[#e2e2e2]"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Validation Result */}
              {validatedCustomer && (
                <div className="bg-[#f9f9f9] border border-[#e2e2e2] rounded-2xl p-4 flex gap-3 text-xs text-[#1a1a1a] animate-in fade-in duration-200">
                  <User className="w-5 h-5 text-[#ea580c] flex-shrink-0" />
                  <div>
                    <p className="font-bold">Customer Verified</p>
                    <p className="text-[#666] mt-0.5">Name: <span className="font-semibold text-[#1a1a1a]">{validatedCustomer.name}</span></p>
                    <p className="text-[#666]">Ref: {validatedCustomer.customerReference}</p>
                  </div>
                </div>
              )}

              {validationError && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-3.5 rounded-xl flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>{validationError}</p>
                </div>
              )}

              {/* Data Bundles List Selector */}
              {selectedCategory === 'data' && selectedProvider && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Select Data Bundle Plan</label>
                  {plansLoading ? (
                    <div className="text-xs text-[#666] animate-pulse flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching bundles...</div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                      {dataPlans.map((plan) => (
                        <button
                          key={plan.code}
                          type="button"
                          onClick={() => setSelectedPlan(plan.code)}
                          className={`p-3 border rounded-xl text-left transition-all ${
                            selectedPlan === plan.code
                              ? 'border-[#ea580c] bg-[#ea580c]/5'
                              : 'border-[#e2e2e2] bg-white hover:border-[#ea580c]/50'
                          }`}
                        >
                          <p className="font-bold text-xs text-[#1a1a1a] truncate">{plan.name}</p>
                          <p className="text-[10px] text-[#ea580c] font-semibold mt-1">₦{parseFloat(plan.price).toLocaleString()}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Amount input for standard payments or airtime */}
              {selectedCategory !== 'data' && (
                <div className="space-y-1 max-w-md">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999] text-sm">₦</span>
                    <Input
                      type="number"
                      placeholder="Enter billing amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-8 h-12 rounded-xl border-[#e2e2e2]"
                      required
                    />
                  </div>
                  
                  {/* Quick Amounts */}
                  <div className="flex gap-2 flex-wrap pt-2">
                    {[1000, 2000, 5000, 10000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAmount(amt.toString())}
                        className="px-3 py-1.5 bg-[#f5f5f5] hover:bg-[#ea580c]/15 hover:text-[#ea580c] rounded-lg text-xs font-bold text-[#666] transition-colors"
                      >
                        ₦{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Show warning if paying utility without validating meter first */}
              {selectedCategory !== 'airtime' && selectedCategory !== 'data' && !validatedCustomer && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-[11px] p-3 rounded-xl flex gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                  <p>Please validate your meter/account details using the 'Validate Account' link above before paying to avoid wrong account funding.</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isPaying || (selectedCategory !== 'airtime' && selectedCategory !== 'data' && !validatedCustomer)}
                className="w-full h-14 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
              >
                {isPaying ? 'Processing Bill Settlement...' : 'Authorize Utility Payment'}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
