import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Flame,
  Fuel,
  MapPin,
  Phone,
  RefreshCw,
  Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fuelApi } from '@/services/api';

type FuelPrices = {
  pms: number;
  ago: number;
  gas: Record<string, number>;
  deliveryFee: number;
};

const DEFAULT_PRICES: FuelPrices = {
  pms: 617,
  ago: 1100,
  gas: {
    '3kg': 3500,
    '6kg': 6500,
    '12.5kg': 12500,
    '25kg': 24000,
    '50kg': 47000
  },
  deliveryFee: 1500
};

const formatCurrency = (value: number) => `NGN ${value.toLocaleString()}`;

export const FuelTab = () => {
  const [orderType, setOrderType] = useState<'fuel' | 'gas'>('fuel');
  const [prices, setPrices] = useState<FuelPrices>(DEFAULT_PRICES);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [fuelType, setFuelType] = useState<'pms' | 'ago'>('pms');
  const [cylinderSize, setCylinderSize] = useState('12.5kg');
  const [quantity, setQuantity] = useState('10');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const fetchFuelData = async () => {
    try {
      setPricesLoading(true);
      const res = await fuelApi.getPrices();
      if (res.data?.success) {
        const apiPrices = res.data.prices || {};
        setPrices({
          pms: apiPrices.fuel?.pms?.price || DEFAULT_PRICES.pms,
          ago: apiPrices.fuel?.ago?.price || DEFAULT_PRICES.ago,
          gas: {
            '3kg': apiPrices.gas?.['3kg']?.price || DEFAULT_PRICES.gas['3kg'],
            '6kg': apiPrices.gas?.['6kg']?.price || DEFAULT_PRICES.gas['6kg'],
            '12.5kg': apiPrices.gas?.['12.5kg']?.price || DEFAULT_PRICES.gas['12.5kg'],
            '25kg': apiPrices.gas?.['25kg']?.price || DEFAULT_PRICES.gas['25kg'],
            '50kg': apiPrices.gas?.['50kg']?.price || DEFAULT_PRICES.gas['50kg']
          },
          deliveryFee: apiPrices.deliveryFee || DEFAULT_PRICES.deliveryFee
        });
      }
    } catch (err) {
      console.error('Failed to get fuel prices:', err);
    } finally {
      setPricesLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      setOrdersLoading(true);
      const res = await fuelApi.getOrders();
      if (res.data?.success) {
        setOrders(res.data.orders || []);
      }
    } catch (err) {
      console.error('Failed to fetch fuel orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    fetchFuelData();
    fetchOrders();
  }, []);

  const calculateTotal = () => {
    const qty = parseFloat(quantity) || 0;
    const subtotal = orderType === 'fuel'
      ? qty * (fuelType === 'pms' ? prices.pms : prices.ago)
      : qty * (prices.gas[cylinderSize] || prices.gas['12.5kg']);

    return {
      subtotal,
      deliveryFee: prices.deliveryFee,
      total: subtotal + prices.deliveryFee
    };
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      setError('Please enter a valid quantity');
      return;
    }
    if (!deliveryAddress.trim()) {
      setError('Please provide a delivery address');
      return;
    }
    if (!phoneNumber.trim()) {
      setError('Please provide a contact phone number');
      return;
    }

    try {
      setSubmitLoading(true);
      setError(null);
      setSuccess(null);

      const res = await fuelApi.createOrder({
        type: orderType,
        subtype: orderType === 'fuel' ? fuelType : cylinderSize,
        quantity: qty,
        deliveryAddress: deliveryAddress.trim(),
        phoneNumber: phoneNumber.trim(),
        priority: 'normal',
        customerNotes: notes.trim() || undefined
      });

      if (res.data?.success) {
        setSuccess(`Order placed successfully. Reference: ${res.data.order?.order_number || res.data.order?.id || 'pending'}`);
        setQuantity(orderType === 'fuel' ? '10' : '1');
        setDeliveryAddress('');
        setPhoneNumber('');
        setNotes('');
        fetchOrders();
      } else {
        setError(res.error || 'Failed to place delivery order. Check your wallet balance.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setSubmitLoading(false);
    }
  };

  const { subtotal, deliveryFee, total } = calculateTotal();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Fuel & Cooking Gas</h1>
        <button
          onClick={() => { fetchFuelData(); fetchOrders(); }}
          disabled={pricesLoading || ordersLoading}
          className="p-2 rounded-xl hover:bg-[#e2e2e2]/60 text-[#666] transition-colors"
          title="Refresh Dashboard"
          type="button"
        >
          <RefreshCw className={`w-5 h-5 ${pricesLoading || ordersLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-3xl p-6 text-white relative overflow-hidden shadow-md">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Fuel className="w-7 h-7 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold">Emergency Fuel Dispatch</h3>
            <p className="text-white/80 text-xs">Order petrol, diesel, or LPG and track fulfillment from request to delivery.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => { setOrderType('fuel'); setQuantity('10'); setError(null); }}
          className={`flex-1 p-4 rounded-2xl text-center border transition-all ${orderType === 'fuel' ? 'bg-gradient-primary border-transparent text-white shadow-sm scale-[1.01]' : 'bg-white border-[#e2e2e2]/60 text-[#666] hover:shadow-sm'}`}
        >
          <Fuel className={`w-8 h-8 mx-auto mb-2 ${orderType === 'fuel' ? 'text-white' : 'text-[#ea580c]'}`} />
          <p className="font-bold text-sm">Fuel (Petrol/Diesel)</p>
        </button>
        <button
          type="button"
          onClick={() => { setOrderType('gas'); setQuantity('1'); setError(null); }}
          className={`flex-1 p-4 rounded-2xl text-center border transition-all ${orderType === 'gas' ? 'bg-gradient-primary border-transparent text-white shadow-sm scale-[1.01]' : 'bg-white border-[#e2e2e2]/60 text-[#666] hover:shadow-sm'}`}
        >
          <Flame className={`w-8 h-8 mx-auto mb-2 ${orderType === 'gas' ? 'text-white' : 'text-[#ea580c]'}`} />
          <p className="font-bold text-sm">Cooking Gas (LPG)</p>
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a]">Order Details</h3>
            <p className="text-xs text-[#999]">Fill in dispatch details and confirm wallet payment</p>
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

          <form onSubmit={handlePlaceOrder} className="space-y-4">
            {orderType === 'fuel' ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Fuel Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'pms', label: 'Petrol (PMS)', price: prices.pms },
                      { id: 'ago', label: 'Diesel (AGO)', price: prices.ago }
                    ].map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setFuelType(item.id as 'pms' | 'ago')}
                        className={`p-4 border-2 rounded-xl text-left transition-all ${fuelType === item.id ? 'border-[#ea580c] bg-[#ea580c]/5' : 'border-[#e2e2e2] hover:border-[#ea580c]'}`}
                      >
                        <p className="font-bold text-sm text-[#1a1a1a]">{item.label}</p>
                        <p className="text-xs text-[#ea580c] font-semibold">{formatCurrency(item.price)}/litre</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Quantity (Litres)</label>
                  <Input type="number" min="5" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-12 rounded-xl border-[#e2e2e2]" required />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Cylinder Size</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.keys(prices.gas).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setCylinderSize(size)}
                        className={`py-3 px-1 border-2 rounded-xl text-center text-xs font-bold transition-all ${cylinderSize === size ? 'border-[#ea580c] bg-[#ea580c]/5' : 'border-[#e2e2e2] hover:border-[#ea580c] bg-white'}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#999] mt-1">Selected refill: {formatCurrency(prices.gas[cylinderSize] || 0)}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Number of Cylinders</label>
                  <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-12 rounded-xl border-[#e2e2e2]" required />
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#1a1a1a] flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#ea580c]" />
                Delivery Address
              </label>
              <Input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className="h-12 rounded-xl border-[#e2e2e2]" required />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#1a1a1a] flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-[#ea580c]" />
                Phone Number
              </label>
              <Input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="h-12 rounded-xl border-[#e2e2e2]" required />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#1a1a1a]">Notes / Landmarks (Optional)</label>
              <Input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-12 rounded-xl border-[#e2e2e2]" />
            </div>

            <div className="bg-[#fcfcfc] border border-[#e2e2e2] rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-[#666]">
                <span>Product Subtotal</span>
                <span className="font-semibold text-[#1a1a1a]">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[#666]">
                <span>Delivery Fee</span>
                <span className="font-semibold text-[#1a1a1a]">{formatCurrency(deliveryFee)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#e2e2e2]">
                <span className="font-bold text-sm">Grand Total</span>
                <span className="font-extrabold text-sm text-[#ea580c]">{formatCurrency(total)}</span>
              </div>
            </div>

            <Button type="submit" disabled={submitLoading} className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]">
              {submitLoading ? 'Submitting Order...' : 'Confirm Delivery Order'}
            </Button>
          </form>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-4 h-fit">
          <h3 className="text-lg font-bold text-[#1a1a1a]">Active Orders</h3>
          {ordersLoading ? (
            <div className="space-y-3 py-4 text-center">
              <RefreshCw className="w-6 h-6 text-[#ea580c] animate-spin mx-auto" />
              <p className="text-xs text-[#666]">Loading dispatch tracking logs...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-[#999] border border-dashed border-[#e2e2e2] rounded-2xl">
              <Truck className="w-10 h-10 mx-auto mb-2 text-[#999]" />
              <p className="text-xs font-semibold">No active fuel or gas orders found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="p-4 border border-[#e2e2e2] rounded-2xl hover:shadow-sm transition-all space-y-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        {order.order_type === 'fuel' ? <Fuel className="w-5 h-5 text-orange-600" /> : <Flame className="w-5 h-5 text-orange-600" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[#1a1a1a] capitalize truncate">
                          {order.order_type === 'fuel'
                            ? `${order.fuel_details?.quantity || ''}L ${order.fuel_details?.subtype?.toUpperCase() || 'Fuel'}`
                            : `${order.gas_details?.quantity || ''} x ${order.gas_details?.subtype || 'Gas'}`}
                        </p>
                        <p className="text-[10px] text-[#999]">Order #{order.order_number || order.id}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full uppercase">
                      {order.status}
                    </span>
                  </div>

                  <div className="text-xs space-y-1 text-[#666] pt-1.5 border-t border-[#f5f5f5]">
                    <div className="flex justify-between gap-3">
                      <span>Destination</span>
                      <span className="font-medium text-[#1a1a1a] truncate max-w-[180px]">{order.delivery_address?.address || 'Address unavailable'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Placed On</span>
                      <span className="font-medium text-[#1a1a1a]">{new Date(order.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Value</span>
                      <span className="font-bold text-[#ea580c]">{formatCurrency(Number(order.pricing?.total || 0))}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
