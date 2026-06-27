import { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  MapPin, 
  User, 
  Phone, 
  FileText, 
  Scale, 
  Truck, 
  CheckCircle, 
  AlertCircle, 
  X,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logisticsApi, cryptoApi } from '@/services/api';

export const TrackingTab = () => {
  const [activeSubTab, setActiveSubTab] = useState<'track' | 'ship' | 'history'>('track');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackedPackage, setTrackedPackage] = useState<any>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // New Shipment Form
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [weight, setWeight] = useState('1.0');
  const [serviceType, setServiceType] = useState<'standard' | 'express' | 'sameDay'>('standard');
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [shipLoading, setShipLoading] = useState(false);
  const [shipSuccess, setShipSuccess] = useState<string | null>(null);
  const [shipError, setShipError] = useState<string | null>(null);

  // Expanded fields
  const [deliveryCategory, setDeliveryCategory] = useState<'parcel' | 'document' | 'business'>('parcel');
  const [deliveryMode, setDeliveryMode] = useState<'door_to_door' | 'interstate'>('door_to_door');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'crypto'>('wallet');
  const [cryptoCoin, setCryptoCoin] = useState<'btc' | 'eth' | 'usdt'>('usdt');
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({ btc: 98500000, eth: 5200000, usdt: 1550 });

  // User Shipments History
  const [shipments, setShipments] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch past shipments
  const fetchShipments = async () => {
    try {
      setHistoryLoading(true);
      const res = await logisticsApi.getShipments();
      if (res.data && res.data.success) {
        setShipments(res.data.shipments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'history') {
      fetchShipments();
    }
  }, [activeSubTab]);

  // Track shipment
  const handleTrack = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!trackingNumber) return;

    try {
      setTrackingLoading(true);
      setTrackingError(null);
      setTrackedPackage(null);

      const res = await logisticsApi.trackShipment(trackingNumber);
      if (res.data && res.data.success) {
        setTrackedPackage(res.data.shipment);
      } else {
        setTrackingError(res.error || 'No package found with that tracking number.');
      }
    } catch (err: any) {
      setTrackingError(err.message || 'Tracking failed.');
    } finally {
      setTrackingLoading(false);
    }
  };

  // Fetch crypto rates on mount for display
  useEffect(() => {
    const fetchCryptoPrices = async () => {
      try {
        const priceRes = await cryptoApi.getPrices();
        if (priceRes.data && priceRes.data.success) {
          const p = priceRes.data.prices;
          if (p) {
            setCryptoPrices({
              btc: p.BTC?.ngn || p.btc?.ngn || p.btc || 98500000,
              eth: p.ETH?.ngn || p.eth?.ngn || p.eth || 5200000,
              usdt: p.USDT?.ngn || p.usdt?.ngn || p.usdt || 1550,
            });
          }
        }
      } catch (err) {
        console.error('Failed to load crypto rates for logistics payment:', err);
      }
    };
    fetchCryptoPrices();
  }, []);

  // Calculate rate as form inputs change
  useEffect(() => {
    if (pickupAddress && deliveryAddress && weight && parseFloat(weight) > 0) {
      const delayDebounce = setTimeout(async () => {
        try {
          setRateLoading(true);
          const res = await logisticsApi.calculateRate({
            pickupLocation: pickupAddress,
            deliveryLocation: deliveryAddress,
            weight: parseFloat(weight)
          });
          if (res.data && res.data.success) {
            const baseRate = res.data.rate;
            const modifiedRate = { ...baseRate };
            Object.keys(modifiedRate).forEach(key => {
              if (key !== 'currency') {
                let val = parseFloat(modifiedRate[key]);
                if (deliveryMode === 'interstate') val += 3000;
                if (deliveryCategory === 'document') val = Math.max(1000, val - 500);
                modifiedRate[key] = val;
              }
            });
            setCalculatedRate(modifiedRate);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setRateLoading(false);
        }
      }, 800);
      return () => clearTimeout(delayDebounce);
    } else {
      setCalculatedRate(null);
    }
  }, [pickupAddress, deliveryAddress, weight, deliveryCategory, deliveryMode]);

  // Create Shipment
  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickupAddress || !deliveryAddress || !recipientName || !recipientPhone || !itemDescription) {
      setShipError('Please fill in all details');
      return;
    }

    try {
      setShipLoading(true);
      setShipError(null);
      setShipSuccess(null);

      const fullPayload = {
        pickupAddress,
        deliveryAddress,
        recipientName,
        recipientPhone,
        itemDescription,
        itemValue: 0,
        weight: parseFloat(weight),
        serviceType,
        paymentMethod,
        cryptoCoin,
        deliveryCategory,
        deliveryMode,
        scheduledDate: isScheduled ? scheduledDate : null
      };

      const response = await logisticsApi.createShipment(fullPayload);

      if (response.data && response.data.success) {
        const orderNum = response.data.order.order_number;
        setShipSuccess(`Shipment created successfully! Tracking Number: ${orderNum}`);
        setPickupAddress('');
        setDeliveryAddress('');
        setRecipientName('');
        setRecipientPhone('');
        setItemDescription('');
        setWeight('1.0');
        setCalculatedRate(null);
        setDeliveryCategory('parcel');
        setDeliveryMode('door_to_door');
        setIsScheduled(false);
        setScheduledDate('');
        setPaymentMethod('wallet');
        setCryptoCoin('usdt');
      } else {
        setShipError(response.error || 'Failed to create shipment order. Ensure you have enough balance.');
      }
    } catch (err: any) {
      console.error(err);
      setShipError(err.message || 'Logistics shipping failed');
    } finally {
      setShipLoading(false);
    }
  };

  // Cancel Shipment
  const handleCancelShipment = async (shipmentId: string) => {
    if (!confirm('Are you sure you want to cancel this shipment? Funds will be refunded to your wallet.')) return;
    try {
      const res = await logisticsApi.cancelShipment(shipmentId);
      if (res.data && res.data.success) {
        alert('Shipment cancelled and wallet refunded!');
        fetchShipments();
      } else {
        alert(res.error || 'Failed to cancel shipment');
      }
    } catch (err: any) {
      alert(err.message || 'Cancellation failed');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'delivered':
        return 'bg-green-100 text-green-700';
      case 'in_transit':
      case 'picked_up':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-orange-100 text-orange-700';
    }
  };

  const getStatusProgress = (status: string) => {
    switch (status) {
      case 'delivered':
        return 100;
      case 'in_transit':
        return 65;
      case 'picked_up':
        return 35;
      case 'order_created':
      case 'pending':
        return 15;
      case 'cancelled':
        return 0;
      default:
        return 10;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Logistics & Tracking</h1>
        
        {/* Navigation Tabs */}
        <div className="flex bg-white p-1 rounded-xl border border-[#e2e2e2]/60">
          <button
            onClick={() => setActiveSubTab('track')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeSubTab === 'track' ? 'bg-gradient-primary text-white shadow-sm' : 'text-[#666] hover:bg-[#f5f5f5]'
            }`}
          >
            Track Package
          </button>
          <button
            onClick={() => setActiveSubTab('ship')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeSubTab === 'ship' ? 'bg-gradient-primary text-white shadow-sm' : 'text-[#666] hover:bg-[#f5f5f5]'
            }`}
          >
            Request Shipping
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeSubTab === 'history' ? 'bg-gradient-primary text-white shadow-sm' : 'text-[#666] hover:bg-[#f5f5f5]'
            }`}
          >
            My Shipments
          </button>
        </div>
      </div>

      {/* TRACK TAB */}
      {activeSubTab === 'track' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-4">
            <div>
              <label className="text-sm font-bold text-[#1a1a1a]">Enter Tracking Number</label>
              <p className="text-xs text-[#999]">Search shipment by Nadi logistics order reference code</p>
            </div>
            <form onSubmit={handleTrack} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                <Input
                  type="text"
                  placeholder="e.g., NADI-LOG-170889242-XXXX"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="pl-12 h-14 rounded-xl border-[#e2e2e2]"
                  required
                />
              </div>
              <Button 
                type="submit"
                disabled={trackingLoading}
                className="h-14 px-8 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
              >
                {trackingLoading ? 'Searching...' : 'Track'}
              </Button>
            </form>
          </div>

          {trackingError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-2xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p>{trackingError}</p>
            </div>
          )}

          {trackedPackage && (
            <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-6 animate-in slide-in-from-bottom duration-300">
              <div className="flex items-center justify-between border-b border-[#e2e2e2] pb-4 flex-wrap gap-2">
                <div>
                  <p className="text-xs text-[#999] font-medium">Logistics Order Number</p>
                  <p className="text-lg font-black text-[#1a1a1a] tracking-wide">{trackedPackage.order_number}</p>
                </div>
                <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(trackedPackage.status)}`}>
                  {trackedPackage.status?.replace('_', ' ')}
                </span>
              </div>

              {/* Progress Line */}
              <div>
                <div className="flex justify-between text-xs text-[#666] mb-2 font-semibold">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Origin: {trackedPackage.pickup?.address}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-[#ea580c]" /> Dest: {trackedPackage.delivery?.address}</span>
                </div>
                <div className="h-3 bg-[#f5f5f5] rounded-full overflow-hidden border border-[#e2e2e2]/30">
                  <div 
                    className="h-full bg-gradient-primary rounded-full transition-all duration-1000"
                    style={{ width: `${getStatusProgress(trackedPackage.status)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs text-[#999] mt-2 font-medium">
                  <p>Weight: {trackedPackage.package?.weight || trackedPackage.items?.[0]?.weight || 1.0}kg</p>
                  <p>Service: <span className="font-bold text-[#ea580c] uppercase">{trackedPackage.package?.serviceType || 'standard'}</span></p>
                </div>
              </div>

              {/* Delivery Details */}
              <div className="grid md:grid-cols-2 gap-4 bg-[#fbfbfb] p-4 rounded-2xl border border-[#e2e2e2]/40 text-sm">
                <div className="space-y-2">
                  <p className="font-bold text-[#1a1a1a] border-b border-[#e2e2e2]/50 pb-1">Delivery Recipient</p>
                  <p className="flex items-center gap-2"><User className="w-4 h-4 text-[#999]" /> {trackedPackage.delivery?.recipientName}</p>
                  <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#999]" /> {trackedPackage.delivery?.recipientPhone}</p>
                </div>
                <div className="space-y-2">
                  <p className="font-bold text-[#1a1a1a] border-b border-[#e2e2e2]/50 pb-1">Billing Summary</p>
                  <p className="flex items-center justify-between">
                    <span className="text-[#666]">Delivery Cost:</span> 
                    <span className="font-bold text-[#ea580c]">₦{parseFloat(trackedPackage.pricing?.total || 0).toLocaleString()}</span>
                  </p>
                  <p className="flex items-center justify-between text-xs text-[#999]">
                    <span>Status:</span>
                    <span className="uppercase text-green-600 font-bold">Paid</span>
                  </p>
                </div>
              </div>

              {/* Logs */}
              <div className="space-y-4">
                <h4 className="font-bold text-[#1a1a1a] text-sm">Status Update Logs</h4>
                <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#e2e2e2]">
                  {(trackedPackage.tracking?.logs || []).map((log: any, idx: number) => (
                    <div key={idx} className="flex gap-4 items-start relative pl-8">
                      <div className="absolute left-[3px] top-[6px] w-[16px] h-[16px] rounded-full bg-white border-2 border-[#ea580c] flex items-center justify-center">
                        <div className="w-[6px] h-[6px] rounded-full bg-[#ea580c]" />
                      </div>
                      <div className="flex-1 pb-3 border-b border-[#f5f5f5] last:border-0">
                        <p className="font-bold text-sm text-[#1a1a1a] uppercase">{log.status?.replace('_', ' ')}</p>
                        <p className="text-xs text-[#666] mt-0.5">{log.message}</p>
                        <p className="text-[10px] text-[#999] mt-1">{new Date(log.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SHIP TAB */}
      {activeSubTab === 'ship' && (
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a]">Request New Delivery</h3>
            <p className="text-xs text-[#999]">Instantly schedule a pickup and pay using your Naira wallet balance</p>
          </div>

          {shipSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-4 rounded-2xl flex gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p>{shipSuccess}</p>
            </div>
          )}

          {shipError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-2xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p>{shipError}</p>
            </div>
          )}

          <form onSubmit={handleCreateShipment} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Pickup Address */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a] flex justify-between">
                  <span>Pickup Address / location</span>
                  <span className="text-[10px] text-[#ea580c] font-normal">Supports what3words (e.g. word.word.word)</span>
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                  <Input
                    type="text"
                    placeholder="Enter pickup address or ///three.words.location"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    className="pl-9 h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a] flex justify-between">
                  <span>Delivery Destination</span>
                  <span className="text-[10px] text-[#ea580c] font-normal">Supports what3words (e.g. word.word.word)</span>
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                  <Input
                    type="text"
                    placeholder="Enter delivery address or ///three.words.location"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="pl-9 h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Recipient Details */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Recipient Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                  <Input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="pl-9 h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Recipient Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                  <Input
                    type="tel"
                    placeholder="e.g. +234 810 XXX XXXX"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="pl-9 h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Package Details */}
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-semibold text-[#1a1a1a]">Item Description</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                  <Input
                    type="text"
                    placeholder="e.g. Documents, Shoes, Laptop..."
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    className="pl-9 h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Est. Weight (kg)</label>
                <div className="relative">
                  <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Weight in kg"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="pl-9 h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Delivery Category */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Delivery Category</label>
                <select
                  value={deliveryCategory}
                  onChange={(e) => setDeliveryCategory(e.target.value as any)}
                  className="w-full h-12 rounded-xl border border-[#e2e2e2] px-3 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
                >
                  <option value="parcel">📦 Parcel Pickup & Delivery</option>
                  <option value="document">📄 Document Delivery</option>
                  <option value="business">💼 Business Deliveries</option>
                </select>
              </div>

              {/* Delivery Mode */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1a1a1a]">Delivery Mode</label>
                <select
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value as any)}
                  className="w-full h-12 rounded-xl border border-[#e2e2e2] px-3 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
                >
                  <option value="door_to_door">🚪 Door-to-Door Delivery</option>
                  <option value="interstate">🛣️ Interstate Delivery (+₦3,000)</option>
                </select>
              </div>
            </div>

            {/* Service Type */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#1a1a1a]">Shipping Speed Category</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'standard', title: 'Standard Delivery', desc: '1-3 business days' },
                  { id: 'express', title: 'Express Shipment', desc: 'Same/Next day delivery' },
                  { id: 'sameDay', title: 'Same Day Delivery', desc: 'Direct hot dispatch (3-6 hours)' }
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setServiceType(type.id as any)}
                    className={`p-3 border rounded-xl text-left transition-all ${
                      serviceType === type.id
                        ? 'border-[#ea580c] bg-[#ea580c]/5'
                        : 'border-[#e2e2e2] bg-white hover:border-[#ea580c]/50'
                    }`}
                  >
                    <p className="font-bold text-xs text-[#1a1a1a]">{type.title}</p>
                    <p className="text-[10px] text-[#666]">{type.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Scheduled Deliveries */}
            <div className="bg-[#fcfcfc] border border-[#e2e2e2]/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-[#1a1a1a]">Schedule Delivery</span>
                  <span className="text-[10px] text-[#666]">Deliver at a specific date and time</span>
                </div>
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="w-4 h-4 accent-[#ea580c] cursor-pointer"
                />
              </div>
              {isScheduled && (
                <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-[10px] font-semibold text-[#666]">Delivery Date & Time</label>
                  <Input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="h-10 rounded-lg border-[#e2e2e2] text-xs font-semibold"
                    required
                  />
                </div>
              )}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#1a1a1a]">Select Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`p-3 border rounded-xl text-center transition-all ${
                    paymentMethod === 'wallet'
                      ? 'border-[#ea580c] bg-[#ea580c]/5 shadow-sm'
                      : 'border-[#e2e2e2] bg-white hover:border-[#ea580c]/50'
                  }`}
                >
                  <p className="font-bold text-xs text-[#1a1a1a]">💳 Naira Wallet</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('crypto')}
                  className={`p-3 border rounded-xl text-center transition-all ${
                    paymentMethod === 'crypto'
                      ? 'border-[#ea580c] bg-[#ea580c]/5 shadow-sm'
                      : 'border-[#e2e2e2] bg-white hover:border-[#ea580c]/50'
                  }`}
                >
                  <p className="font-bold text-xs text-[#1a1a1a]">🪙 Crypto Wallet</p>
                </button>
              </div>

              {paymentMethod === 'crypto' && (
                <div className="space-y-2 p-3.5 bg-[#f5f5f5] rounded-xl border border-[#e2e2e2]/60 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-[10px] font-semibold text-[#666]">Choose Cryptocurrency</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['usdt', 'btc', 'eth'].map((coin) => (
                      <button
                        key={coin}
                        type="button"
                        onClick={() => setCryptoCoin(coin as any)}
                        className={`py-2 border rounded-lg text-center transition-all text-xs font-extrabold uppercase ${
                          cryptoCoin === coin
                            ? 'border-[#ea580c] bg-white text-[#ea580c] shadow-sm'
                            : 'border-[#e2e2e2] bg-[#fcfcfc] text-[#666] hover:bg-white'
                        }`}
                      >
                        {coin}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rate Calculation Preview */}
            {(rateLoading || calculatedRate) && (
              <div className="bg-[#f9f9f9] border border-[#e2e2e2] rounded-2xl p-4 space-y-2 animate-in fade-in duration-200">
                <p className="text-xs font-bold text-[#1a1a1a] flex items-center gap-1.5"><Truck className="w-4 h-4 text-[#ea580c]" /> Shipping Cost Preview</p>
                {rateLoading ? (
                  <p className="text-xs text-[#666] animate-pulse">Calculating delivery distance and rates...</p>
                ) : (
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-[#e2e2e2]/40 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-[#666] font-semibold">Total Cost:</span>
                      <span className="font-black text-[#1a1a1a] text-sm">
                        ₦{parseFloat(calculatedRate[serviceType] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {paymentMethod === 'crypto' && (
                      <div className="flex justify-between items-center text-[#ea580c] pt-1.5 border-t border-dashed border-[#e2e2e2]">
                        <span className="font-bold">Estimated Crypto Payout:</span>
                        <span className="font-black text-sm">
                          {(parseFloat(calculatedRate[serviceType] || 0) / cryptoPrices[cryptoCoin]).toFixed(6)} {cryptoCoin.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={shipLoading || rateLoading}
              className="w-full h-14 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
            >
              {shipLoading ? 'Requesting Shipping & Debiting Wallet...' : 'Confirm Shipment & Pay'}
            </Button>
          </form>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeSubTab === 'history' && (
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-[#1a1a1a]">My Shipments Log</h3>
              <p className="text-xs text-[#999]">History of logistics requests created by you</p>
            </div>
            <button 
              onClick={fetchShipments}
              className="p-1.5 rounded-lg hover:bg-[#f5f5f5] text-[#666] transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {historyLoading ? (
            <div className="space-y-3 py-6 text-center animate-pulse">
              <p className="text-xs text-[#666]">Loading shipments...</p>
            </div>
          ) : shipments.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Package className="w-12 h-12 text-[#ccc] mx-auto" />
              <p className="text-sm font-semibold text-[#1a1a1a]">No shipments found</p>
              <p className="text-xs text-[#666] max-w-xs mx-auto">Create a shipping request above to get started.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {shipments.map((shipment) => (
                <div key={shipment.id} className="border border-[#e2e2e2]/55 rounded-2xl p-4 hover:shadow-sm transition-all bg-[#fcfcfc] space-y-3">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <p className="text-[10px] text-[#999] font-bold">REF CODE</p>
                      <p className="text-sm font-extrabold text-[#1a1a1a]">{shipment.order_number}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(shipment.status)}`}>
                        {shipment.status?.replace('_', ' ')}
                      </span>
                      {(shipment.status === 'pending' || shipment.status === 'order_created') && (
                        <button
                          onClick={() => handleCancelShipment(shipment.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Cancel Shipment"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-[#e2e2e2]/40 py-2">
                    <div>
                      <span className="text-[#999] font-medium block">Pickup:</span>
                      <span className="font-semibold text-[#1a1a1a] truncate block">{shipment.pickup?.address}</span>
                    </div>
                    <div>
                      <span className="text-[#999] font-medium block">Destination:</span>
                      <span className="font-semibold text-[#1a1a1a] truncate block">{shipment.delivery?.address}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#666] font-medium">Item: {shipment.items?.[0]?.description || 'Delivery Item'}</span>
                    <span className="font-bold text-[#ea580c]">₦{parseFloat(shipment.pricing?.total || 0).toLocaleString()}</span>
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
