import { useState, useEffect } from 'react';
import { 
  Fuel, 
  Flame, 
  RefreshCw, 
  AlertCircle, 
  Check, 
  Truck, 
  MapPin, 
  Phone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fuelApi } from '@/services/api';

export const FuelTab = () => {
  const [orderType, setOrderType] = useState<'fuel' | 'gas'>('fuel');
  
  // Pricing states
  const [prices, setPrices] = useState({
    pms: 680, // petrol per litre
    ago: 950, // diesel per litre
    lpg: 1200 // cooking gas per kg
  });
  const [pricesLoading, setPricesLoading] = useState(false);

  // Form states
  const [fuelType, setFuelType] = useState<'pms' | 'ago'>('pms');
  const [cylinderSize, setCylinderSize] = useState('12.5kg');
  const [quantity, setQuantity] = useState('10'); // Litres or number of cylinders
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notes, setNotes] = useState('');
  
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Active orders state
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const fetchFuelData = async () => {
    try {
      setPricesLoading(true);
      const res = await fuelApi.getPrices();
      if (res.data && res.data.success) {
        setPrices(res.data.prices || { pms: 680, ago: 950, lpg: 1200 });
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
      if (res.data && res.data.success) {
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

  // Recalculate price dynamically
  const calculateTotal = () => {
    const qty = parseFloat(quantity) || 0;
    let subtotal = 0;
    const deliveryFee = 2500;

    if (orderType === 'fuel') {
      const pricePerLitre = fuelType === 'pms' ? prices.pms : prices.ago;
      subtotal = qty * pricePerLitre;
    } else {
      // Cylinder sizes maps to approximate weight in KG
      const weightMap: Record<string, number> = {
        '3kg': 3,
        '6kg': 6,
        '12.5kg': 12.5,
        '25kg': 25,
        '50kg': 50
      };
      const weight = weightMap[cylinderSize] || 12.5;
      subtotal = qty * (weight * prices.lpg);
    }

    return {
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee
    };
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || parseFloat(quantity) <= 0) {
      setError('Please enter a valid quantity');
      return;
    }
    if (!deliveryAddress) {
      setError('Please provide a delivery address');
      return;
    }
    if (!phoneNumber) {
      setError('Please provide a contact phone number');
      return;
    }

    try {
      setSubmitLoading(true);
      setError(null);
      setSuccess(null);

      const qty = parseFloat(quantity);
      const orderData = {
        type: orderType,
        fuelType: orderType === 'fuel' ? fuelType : undefined,
        cylinderSize: orderType === 'gas' ? cylinderSize : undefined,
        quantity: qty,
        deliveryAddress,
        phoneNumber,
        notes: notes || undefined
      };

      const res = await fuelApi.createOrder(orderData);
      if (res.data && res.data.success) {
        setSuccess('Fuel delivery order placed successfully!');
        setQuantity('10');
        setDeliveryAddress('');
        setPhoneNumber('');
        setNotes('');
        fetchOrders();
      } else {
        setError(res.error || 'Failed to place delivery order. Check balance.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Order failed');
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
        >
          <RefreshCw className={`w-5 h-5 ${pricesLoading || ordersLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Emergency Banner */}
      <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-3xl p-6 text-white relative overflow-hidden shadow-md">
        <div className="absolute top-0 right-0 w-44 h-44 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Fuel className="w-7 h-7 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold">Emergency Fuel Dispatch</h3>
            <p className="text-white/80 text-xs">Stranded or out of gas? We deliver petrol, diesel, and LPG cylinders straight to your doorstep or roadside within 15-30 minutes.</p>
          </div>
        </div>
      </div>

      {/* Order Type Tabs */}
      <div className="flex gap-4">
        <button
          onClick={() => { setOrderType('fuel'); setError(null); }}
          className={`flex-1 p-4 rounded-2xl text-center border transition-all ${
            orderType === 'fuel'
              ? 'bg-gradient-primary border-transparent text-white shadow-sm scale-[1.01]'
              : 'bg-white border-[#e2e2e2]/60 text-[#666] hover:shadow-sm'
          }`}
        >
          <Fuel className={`w-8 h-8 mx-auto mb-2 ${orderType === 'fuel' ? 'text-white' : 'text-[#ea580c]'}`} />
          <p className="font-bold text-sm">Fuel (Petrol/Diesel)</p>
        </button>
        <button
          onClick={() => { setOrderType('gas'); setError(null); }}
          className={`flex-1 p-4 rounded-2xl text-center border transition-all ${
            orderType === 'gas'
              ? 'bg-gradient-primary border-transparent text-white shadow-sm scale-[1.01]'
              : 'bg-white border-[#e2e2e2]/60 text-[#666] hover:shadow-sm'
          }`}
        >
          <Flame className={`w-8 h-8 mx-auto mb-2 ${orderType === 'gas' ? 'text-white' : 'text-[#ea580c]'}`} />
          <p className="font-bold text-sm">Cooking Gas (LPG)</p>
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Place Order Form */}
        <div className="bg-white rounded-3xl p-6 border border-[#e2e2e2]/60 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a]">Order Details</h3>
            <p className="text-xs text-[#999]">Fill in the dispatch address and specifications</p>
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
                {/* Fuel Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Fuel Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFuelType('pms')}
                      className={`p-4 border-2 rounded-xl text-left transition-all ${
                        fuelType === 'pms'
                          ? 'border-[#ea580c] bg-[#ea580c]/5'
                          : 'border-[#e2e2e2] hover:border-[#ea580c]'
                      }`}
                    >
                      <p className="font-bold text-sm text-[#1a1a1a]">Petrol (PMS)</p>
                      <p className="text-xs text-[#ea580c] font-semibold">₦{prices.pms}/litre</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFuelType('ago')}
                      className={`p-4 border-2 rounded-xl text-left transition-all ${
                        fuelType === 'ago'
                          ? 'border-[#ea580c] bg-[#ea580c]/5'
                          : 'border-[#e2e2e2] hover:border-[#ea580c]'
                      }`}
                    >
                      <p className="font-bold text-sm text-[#1a1a1a]">Diesel (AGO)</p>
                      <p className="text-xs text-[#ea580c] font-semibold">₦{prices.ago}/litre</p>
                    </button>
                  </div>
                </div>

                {/* Quantity in Litres */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Quantity (Litres)</label>
                  <Input
                    type="number"
                    min="5"
                    placeholder="Enter quantity (min 5 litres)"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </>
            ) : (
              <>
                {/* Gas Cylinder Size */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Cylinder Size</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['3kg', '6kg', '12.5kg', '25kg', '50kg'].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setCylinderSize(size)}
                        className={`py-3 px-1 border-2 rounded-xl text-center text-xs font-bold transition-all ${
                          cylinderSize === size
                            ? 'border-[#ea580c] bg-[#ea580c]/5'
                            : 'border-[#e2e2e2] hover:border-[#ea580c] bg-white'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#999] mt-1">Refill Rate: ₦{prices.lpg}/kg</p>
                </div>

                {/* Cylinder quantity */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1a1a1a]">Number of Cylinders</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Enter quantity of cylinders"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="h-12 rounded-xl border-[#e2e2e2]"
                    required
                  />
                </div>
              </>
            )}

            {/* Delivery address */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#1a1a1a] flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#ea580c]" />
                Delivery Address
              </label>
              <Input
                type="text"
                placeholder="Enter current location / apartment address"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="h-12 rounded-xl border-[#e2e2e2]"
                required
              />
            </div>

            {/* Phone Number */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#1a1a1a] flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-[#ea580c]" />
                Phone Number
              </label>
              <Input
                type="tel"
                placeholder="Active callback phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="h-12 rounded-xl border-[#e2e2e2]"
                required
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#1a1a1a]">Notes / Landmarks (Optional)</label>
              <Input
                type="text"
                placeholder="e.g. Near the supermarket, blue gate"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-12 rounded-xl border-[#e2e2e2]"
              />
            </div>

            {/* Cost Breakdown */}
            <div className="bg-[#fcfcfc] border border-[#e2e2e2] rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-[#666]">
                <span>Product Subtotal</span>
                <span className="font-semibold text-[#1a1a1a]">₦{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[#666]">
                <span>Logistics Delivery Fee</span>
                <span className="font-semibold text-[#1a1a1a]">₦{deliveryFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#e2e2e2]">
                <span className="font-bold text-sm">Grand Total</span>
                <span className="font-extrabold text-sm text-[#ea580c]">₦{total.toLocaleString()}</span>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitLoading}
              className="w-full h-12 rounded-xl bg-gradient-primary text-white font-bold transition-all active:scale-[0.98]"
            >
              {submitLoading ? 'Submitting Order...' : 'Confirm Delivery Order'}
            </Button>
          </form>
        </div>

        {/* Right: Active Dispatch Orders */}
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
              <p className="text-[10px] mt-0.5">Your dispatch logs will display here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="p-4 border border-[#e2e2e2] rounded-2xl hover:shadow-sm transition-all space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        {order.type === 'fuel' ? (
                          <Fuel className="w-5 h-5 text-orange-600" />
                        ) : (
                          <Flame className="w-5 h-5 text-orange-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-[#1a1a1a] capitalize">
                          {order.type === 'fuel' ? `${order.quantity}L ${order.fuelType?.toUpperCase()}` : `${order.quantity} x ${order.cylinderSize} Gas`}
                        </p>
                        <p className="text-[10px] text-[#999]">Order #{order.id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full uppercase">
                      {order.status}
                    </span>
                  </div>

                  <div className="text-xs space-y-1 text-[#666] pt-1.5 border-t border-[#f5f5f5]">
                    <div className="flex justify-between">
                      <span>Destination</span>
                      <span className="font-medium text-[#1a1a1a] truncate max-w-[180px]">{order.deliveryAddress}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Placed On</span>
                      <span className="font-medium text-[#1a1a1a]">{new Date(order.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Value</span>
                      <span className="font-bold text-[#ea580c]">₦{parseFloat(order.total_amount || 0).toLocaleString()}</span>
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
