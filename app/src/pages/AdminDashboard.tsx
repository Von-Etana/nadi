import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Fuel,
  Gift,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  Settings,
  Users,
  Wallet,
  XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { adminApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

type AdminTab = 'dashboard' | 'orders' | 'giftcards' | 'fuel' | 'users' | 'transactions' | 'settings';

type OperationOrder = {
  id: string;
  module: 'giftcards' | 'logistics' | 'fuel';
  type: string;
  status: string;
  amount: number;
  created_at: string;
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  raw: any;
};

const formatCurrency = (value?: number) => `NGN ${Number(value || 0).toLocaleString()}`;

const userName = (user?: OperationOrder['user']) => {
  if (!user) return 'Unknown user';
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return fullName || user.email || user.phone || 'Unknown user';
};

const statusClass = (status?: string) => {
  switch (status) {
    case 'completed':
    case 'approved':
    case 'delivered':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'pending':
    case 'pending_review':
    case 'accepted':
    case 'dispatched':
    case 'in_transit':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'cancelled':
    case 'rejected':
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState<any>({});
  const [orders, setOrders] = useState<OperationOrder[]>([]);
  const [giftCardSales, setGiftCardSales] = useState<any[]>([]);
  const [fuelOrders, setFuelOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [selectedOrder, setSelectedOrder] = useState<OperationOrder | null>(null);
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; order?: any; module?: 'fuel' | 'logistics' }>({ open: false });
  const [nextStatus, setNextStatus] = useState('accepted');
  const [adminNote, setAdminNote] = useState('');
  const [search, setSearch] = useState('');
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Operations', icon: Package },
    { id: 'giftcards', label: 'Gift Cards', icon: Gift },
    { id: 'fuel', label: 'Fuel & Gas', icon: Fuel },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'transactions', label: 'Transactions', icon: Wallet },
    { id: 'settings', label: 'Settings', icon: Settings }
  ] as const;

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [
        statsRes,
        ordersRes,
        salesRes,
        fuelRes,
        usersRes,
        txRes,
        settingsRes
      ] = await Promise.all([
        adminApi.getDashboardStats(),
        adminApi.getOperationOrders(),
        adminApi.getGiftCardSales(),
        adminApi.getFuelOrders(),
        adminApi.getUsers({ limit: 50 }),
        adminApi.getTransactions({ limit: 50 }),
        adminApi.getSettings()
      ]);

      setStats(statsRes.data?.stats || {});
      setOrders(ordersRes.data?.orders || []);
      setGiftCardSales(salesRes.data?.sales || []);
      setFuelOrders(fuelRes.data?.orders || []);
      setUsers(usersRes.data?.users || []);
      setTransactions(txRes.data?.transactions || []);
      setSettings(settingsRes.data?.settings || {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) => [
      order.type,
      order.module,
      order.status,
      userName(order.user),
      order.raw?.order_number,
      order.raw?.card_type
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [orders, search]);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  const handleGiftCardDecision = async (id: string, action: 'approve' | 'reject') => {
    try {
      setActionLoading(true);
      if (action === 'approve') {
        await adminApi.approveGiftCardSale(id);
        toast.success('Gift card sale approved and wallet credited');
      } else {
        await adminApi.rejectGiftCardSale(id, adminNote || 'Rejected by admin');
        toast.success('Gift card sale rejected');
      }
      setAdminNote('');
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} gift card sale`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualStatus = async () => {
    if (!statusDialog.order) return;
    try {
      setActionLoading(true);
      if (statusDialog.module === 'logistics') {
        if (nextStatus === 'accepted' && !statusDialog.order.assigned_to) {
          await adminApi.assignShipment(statusDialog.order.id, {
            assignedTo: user?.email || user?.id || 'admin',
            note: adminNote || undefined
          });
        } else {
          await adminApi.updateShipmentStatus(statusDialog.order.id, {
            status: nextStatus,
            note: adminNote || undefined
          });
        }
        toast.success('Delivery status updated');
      } else {
        await adminApi.updateFuelOrderStatus(statusDialog.order.id, {
          status: nextStatus,
          note: adminNote || undefined
        });
        toast.success('Fuel order status updated');
      }
      setStatusDialog({ open: false });
      setAdminNote('');
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update fuel order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSettingsSave = async () => {
    try {
      setActionLoading(true);
      await adminApi.updateSettings(settings);
      toast.success('Settings saved');
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setActionLoading(false);
    }
  };

  const summaryCards = [
    { label: 'Users', value: stats.totalUsers || users.length, icon: Users },
    { label: 'Transactions', value: stats.totalTransactions || transactions.length, icon: Wallet },
    { label: 'Pending Ops', value: orders.filter((order) => ['pending', 'pending_review', 'accepted', 'dispatched'].includes(order.status)).length, icon: Clock },
    { label: 'Monthly Revenue', value: formatCurrency(stats.monthlyRevenue || 0), icon: CheckCircle }
  ];

  const renderOrdersTable = (rows: OperationOrder[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Module</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((order) => (
          <TableRow key={`${order.module}-${order.id}`}>
            <TableCell className="font-semibold">{order.type}</TableCell>
            <TableCell>{userName(order.user)}</TableCell>
            <TableCell className="font-mono text-xs">{order.raw?.order_number || order.raw?.review?.reference || order.id}</TableCell>
            <TableCell>{formatCurrency(order.amount)}</TableCell>
            <TableCell><Badge className={statusClass(order.status)}>{order.status}</Badge></TableCell>
            <TableCell>
              <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)}>
                View
              </Button>
              {['fuel', 'logistics'].includes(order.module) && (
                <Button
                  size="sm"
                  className="ml-2"
                  onClick={() => {
                    setStatusDialog({ open: true, order: order.raw, module: order.module as 'fuel' | 'logistics' });
                    setNextStatus(order.module === 'logistics' ? 'accepted' : 'accepted');
                  }}
                >
                  Update
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r border-slate-200 bg-white p-5 lg:block">
        <div className="mb-8">
          <p className="text-xs uppercase font-bold text-[#ea580c]">Nadi Digital</p>
          <h1 className="text-xl font-black text-slate-900">Admin Console</h1>
        </div>
        <nav className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-[#ea580c] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="lg:ml-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold capitalize text-slate-900">{activeTab}</h2>
            <p className="text-xs text-slate-500">{user?.email || 'Admin user'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadAdminData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === tab.id ? 'bg-[#ea580c] text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="p-5 space-y-5">
          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
              <RefreshCw className="h-7 w-7 animate-spin text-[#ea580c]" />
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-4">
                    {summaryCards.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Card key={item.label}>
                          <CardContent className="flex items-center justify-between p-5">
                            <div>
                              <p className="text-xs text-slate-500">{item.label}</p>
                              <p className="mt-1 text-2xl font-black text-slate-900">{item.value}</p>
                            </div>
                            <Icon className="h-6 w-6 text-[#ea580c]" />
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  <Card>
                    <CardHeader><CardTitle>Recent Manual Operations</CardTitle></CardHeader>
                    <CardContent>{renderOrdersTable(filteredOrders.slice(0, 8))}</CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'orders' && (
                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Manual Operations Queue</CardTitle>
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders..." className="max-w-sm" />
                  </CardHeader>
                  <CardContent>{renderOrdersTable(filteredOrders)}</CardContent>
                </Card>
              )}

              {activeTab === 'giftcards' && (
                <Card>
                  <CardHeader><CardTitle>Gift Card Sell Reviews</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Card</TableHead>
                          <TableHead>Payout</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {giftCardSales.map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell>{userName(sale.user)}</TableCell>
                            <TableCell>{sale.card_currency} {sale.card_value} {sale.card_type}</TableCell>
                            <TableCell>{formatCurrency(sale.payout_amount)}</TableCell>
                            <TableCell><Badge className={statusClass(sale.status)}>{sale.status}</Badge></TableCell>
                            <TableCell className="flex gap-2">
                              <Button size="sm" disabled={actionLoading || sale.status !== 'pending_review'} onClick={() => handleGiftCardDecision(sale.id, 'approve')}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="destructive" disabled={actionLoading || sale.status !== 'pending_review'} onClick={() => handleGiftCardDecision(sale.id, 'reject')}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'fuel' && (
                <Card>
                  <CardHeader><CardTitle>Fuel & Gas Fulfillment</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reference</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fuelOrders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-mono text-xs">{order.order_number}</TableCell>
                            <TableCell>{userName(order.user)}</TableCell>
                            <TableCell>{order.order_type}</TableCell>
                            <TableCell>{formatCurrency(order.pricing?.total)}</TableCell>
                            <TableCell><Badge className={statusClass(order.status)}>{order.status}</Badge></TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" onClick={() => {
                                setStatusDialog({ open: true, order, module: 'fuel' });
                                setNextStatus(order.status === 'pending' ? 'accepted' : 'dispatched');
                              }}>
                                Update
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'users' && (
                <Card>
                  <CardHeader><CardTitle>Users</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>{users.map((row) => <TableRow key={row.id}><TableCell>{row.first_name} {row.last_name}</TableCell><TableCell>{row.email}</TableCell><TableCell>{row.role || 'user'}</TableCell><TableCell>{row.is_active ? 'Active' : 'Inactive'}</TableCell></TableRow>)}</TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'transactions' && (
                <Card>
                  <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Category</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>{transactions.map((tx) => <TableRow key={tx.id}><TableCell className="font-mono text-xs">{tx.reference}</TableCell><TableCell>{tx.category}</TableCell><TableCell>{tx.type}</TableCell><TableCell>{formatCurrency(tx.amount)}</TableCell><TableCell><Badge className={statusClass(tx.status)}>{tx.status}</Badge></TableCell></TableRow>)}</TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'settings' && (
                <Card>
                  <CardHeader><CardTitle>Operational Settings</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        type="number"
                        value={settings.fuel?.fuel?.pms?.price || ''}
                        onChange={(event) => setSettings((current: any) => ({
                          ...current,
                          fuel: { ...current.fuel, fuel: { ...current.fuel?.fuel, pms: { ...(current.fuel?.fuel?.pms || {}), price: Number(event.target.value) } } }
                        }))}
                        placeholder="PMS price"
                      />
                      <Input
                        type="number"
                        value={settings.fuel?.fuel?.ago?.price || ''}
                        onChange={(event) => setSettings((current: any) => ({
                          ...current,
                          fuel: { ...current.fuel, fuel: { ...current.fuel?.fuel, ago: { ...(current.fuel?.fuel?.ago || {}), price: Number(event.target.value) } } }
                        }))}
                        placeholder="AGO price"
                      />
                      <Input
                        type="number"
                        value={settings.fuel?.deliveryFee || ''}
                        onChange={(event) => setSettings((current: any) => ({
                          ...current,
                          fuel: { ...current.fuel, deliveryFee: Number(event.target.value) }
                        }))}
                        placeholder="Fuel delivery fee"
                      />
                    </div>
                    <Button onClick={handleSettingsSave} disabled={actionLoading}>
                      {actionLoading ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </section>
      </main>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Operation Details</DialogTitle>
            <DialogDescription>{selectedOrder?.type} - {selectedOrder?.status}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-50">
            {JSON.stringify(selectedOrder?.raw || {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialog.open} onOpenChange={(open) => setStatusDialog({ open, order: statusDialog.order, module: statusDialog.module })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update {statusDialog.module === 'logistics' ? 'Delivery' : 'Fuel'} Order</DialogTitle>
            <DialogDescription>Move this order through the fulfillment workflow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={nextStatus} onValueChange={setNextStatus}>
              <SelectTrigger><SelectValue placeholder="Choose status" /></SelectTrigger>
              <SelectContent>
                {statusDialog.module === 'logistics' ? (
                  <>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="picked_up">Picked Up</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <Input value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder="Internal note or proof reference" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleManualStatus} disabled={actionLoading}>{actionLoading ? 'Saving...' : 'Update Status'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
