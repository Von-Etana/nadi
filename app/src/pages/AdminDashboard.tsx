import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle,
  Coins,
  CreditCard,
  Download,
  Eye,
  Fuel,
  Gift,
  Headphones,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Users,
  Wallet,
  XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi } from '@/services/api';

type AdminTab = 'dashboard' | 'operations' | 'support' | 'giftcards' | 'delivery' | 'fuel' | 'users' | 'transactions' | 'reports' | 'settings';
type ManualModule = 'giftcards' | 'logistics' | 'fuel';
type UserSummary = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
};
type OperationOrder = {
  id: string;
  module: ManualModule;
  type: string;
  status: string;
  amount: number;
  created_at: string;
  user?: UserSummary;
  raw: Record<string, unknown>;
};
type SupportTicket = {
  id: string;
  reference: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  status: string;
  assigned_to?: string | null;
  admin_notes?: string | null;
  replies?: Array<{ authorType?: string; message?: string; createdAt?: string }>;
  reply_count?: number;
  created_at: string;
  updated_at: string;
  user?: UserSummary;
};
type AdminUser = UserSummary & {
  id: string;
  role?: string;
  is_active?: boolean;
  kyc_status?: string;
  account_type?: string;
  created_at?: string;
};
type TransactionRow = {
  id: string;
  reference?: string;
  category?: string;
  type?: string;
  amount?: number;
  status?: string;
  description?: string;
  created_at?: string;
  user?: UserSummary;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
type ReportGranularity = 'daily' | 'weekly' | 'monthly';
type ReportPoint = {
  label: string;
  count?: number;
  volume?: number;
  completed?: number;
  failed?: number;
  registrations?: number;
  active?: number;
  verified?: number;
};
type ReportsOverview = {
  transactions?: {
    summary?: Record<string, number>;
    daily?: ReportPoint[];
    weekly?: ReportPoint[];
    monthly?: ReportPoint[];
    byStatus?: Record<string, number>;
    byCategory?: Record<string, number>;
    byType?: Record<string, number>;
  };
  users?: {
    summary?: Record<string, number>;
    daily?: ReportPoint[];
    weekly?: ReportPoint[];
    monthly?: ReportPoint[];
    byKyc?: Record<string, number>;
    byRole?: Record<string, number>;
    byAccountType?: Record<string, number>;
  };
};

const formatCurrency = (value?: number) => `NGN ${Number(value || 0).toLocaleString()}`;

const formatDate = (value?: string) => {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-NG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const userName = (user?: UserSummary) => {
  if (!user) return 'Unknown user';
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return fullName || user.email || user.phone || 'Unknown user';
};

const statusClass = (status?: string) => {
  switch (status) {
    case 'completed':
    case 'approved':
    case 'delivered':
    case 'resolved':
    case 'closed':
    case 'verified':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'pending':
    case 'pending_review':
    case 'accepted':
    case 'dispatched':
    case 'in_transit':
    case 'open':
    case 'waiting_customer':
    case 'in_progress':
    case 'in_review':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'cancelled':
    case 'rejected':
    case 'failed':
    case 'reversed':
    case 'urgent':
      return 'border-red-200 bg-red-50 text-red-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
};

const priorityClass = (priority?: string) => {
  if (priority === 'urgent' || priority === 'high') return 'border-red-200 bg-red-50 text-red-700';
  if (priority === 'normal') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const rawValue = (row: Record<string, unknown>, key: string) => row[key] as string | number | undefined;

const getFuelNextStatus = (status?: string) => {
  switch (status) {
    case 'pending':
      return 'accepted';
    case 'accepted':
      return 'dispatched';
    case 'dispatched':
      return 'delivered';
    default:
      return 'accepted';
  }
};

const getFuelActionLabel = (status?: string) => {
  switch (status) {
    case 'pending':
      return 'Accept order';
    case 'accepted':
      return 'Dispatch';
    case 'dispatched':
      return 'Mark delivered';
    default:
      return 'Update';
  }
};

const isFuelTerminal = (status?: string) => status === 'cancelled' || status === 'delivered';

const getDeliveryNextStatus = (status?: string) => {
  switch (status) {
    case 'pending':
    case 'order_created':
      return 'accepted';
    case 'accepted':
      return 'picked_up';
    case 'picked_up':
      return 'in_transit';
    case 'in_transit':
      return 'delivered';
    default:
      return 'accepted';
  }
};

const getDeliveryActionLabel = (status?: string) => {
  switch (status) {
    case 'pending':
    case 'order_created':
      return 'Accept & assign';
    case 'accepted':
      return 'Mark picked up';
    case 'picked_up':
      return 'Move in transit';
    case 'in_transit':
      return 'Mark delivered';
    default:
      return 'Update';
  }
};

const isDeliveryTerminal = (status?: string) => status === 'cancelled' || status === 'delivered';

const getFuelItemLabel = (order: Record<string, unknown>) => {
  const fuelDetails = order.fuel_details as { subtype?: string; quantity?: number } | null | undefined;
  const gasDetails = order.gas_details as { subtype?: string; quantity?: number } | null | undefined;
  if (fuelDetails) return `${fuelDetails.quantity || 0}L ${String(fuelDetails.subtype || 'fuel').toUpperCase()}`;
  if (gasDetails) return `${gasDetails.quantity || 0}x ${gasDetails.subtype || 'gas cylinder'}`;
  return String(order.order_type || 'fuel/gas');
};

const getFuelAddress = (order: Record<string, unknown>) => {
  const deliveryAddress = order.delivery_address as { address?: string } | null | undefined;
  return deliveryAddress?.address || 'No delivery address';
};

const getDeliveryAddress = (order: Record<string, unknown>, field: 'pickup' | 'delivery') => {
  const address = order[field] as { address?: string; recipientName?: string; recipientPhone?: string } | null | undefined;
  return address?.address || 'No address';
};

const getDeliveryItemLabel = (order: Record<string, unknown>) => {
  const items = order.items as Array<{ description?: string; weight?: number; category?: string }> | undefined;
  const firstItem = Array.isArray(items) ? items[0] : undefined;
  if (!firstItem) return 'Delivery item';
  return `${firstItem.description || 'Delivery item'}${firstItem.weight ? ` · ${firstItem.weight}kg` : ''}`;
};

const initialDeliveryForm = {
  userId: '',
  pickupAddress: '',
  deliveryAddress: '',
  recipientName: '',
  recipientPhone: '',
  itemDescription: '',
  weight: 1,
  serviceType: 'standard',
  deliveryCategory: 'parcel',
  deliveryMode: 'door_to_door',
  scheduledDate: '',
  assignedTo: '',
  notes: ''
};

const initialFuelForm = {
  userId: '',
  type: 'fuel',
  subtype: 'pms',
  quantity: 1,
  deliveryAddress: '',
  phoneNumber: '',
  priority: 'normal',
  scheduledDate: '',
  customerNotes: '',
  assignedTo: ''
};

const initialGiftCardForm = {
  userId: '',
  cardType: 'amazon',
  cardValue: 50,
  cardCurrency: 'USD',
  rate: 0,
  cardCode: '',
  cardPin: '',
  cardImage: '',
  note: ''
};

const DEFAULT_GIFT_CARDS = [
  { id: 'amazon', name: 'Amazon', currencies: ['USD', 'GBP', 'EUR'] },
  { id: 'apple', name: 'Apple / iTunes', currencies: ['USD', 'GBP'] },
  { id: 'google-play', name: 'Google Play', currencies: ['USD'] },
  { id: 'steam', name: 'Steam', currencies: ['USD'] },
  { id: 'xbox', name: 'Xbox', currencies: ['USD'] },
  { id: 'playstation', name: 'PlayStation', currencies: ['USD'] },
  { id: 'netflix', name: 'Netflix', currencies: ['USD'] },
  { id: 'spotify', name: 'Spotify', currencies: ['USD'] }
];

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<OperationOrder[]>([]);
  const [giftCardSales, setGiftCardSales] = useState<Record<string, unknown>[]>([]);
  const [fuelOrders, setFuelOrders] = useState<Record<string, unknown>[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [reports, setReports] = useState<ReportsOverview>({});
  const [reportGranularity, setReportGranularity] = useState<ReportGranularity>('daily');
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');
  const [operationFilter, setOperationFilter] = useState<'all' | ManualModule>('all');
  const [supportFilter, setSupportFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState('all');
  const [txStatusFilter, setTxStatusFilter] = useState('all');

  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<OperationOrder | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [supportReply, setSupportReply] = useState('');
  const [supportNote, setSupportNote] = useState('');
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; order?: Record<string, unknown>; module?: 'fuel' | 'logistics' }>({ open: false });
  const [nextStatus, setNextStatus] = useState('accepted');
  const [adminNote, setAdminNote] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [createDialog, setCreateDialog] = useState<null | 'delivery' | 'fuel' | 'giftcard'>(null);
  const [deliveryForm, setDeliveryForm] = useState(initialDeliveryForm);
  const [fuelForm, setFuelForm] = useState(initialFuelForm);
  const [giftCardForm, setGiftCardForm] = useState(initialGiftCardForm);

  // User management & wallet adjustment modal
  const [selectedUserForModal, setSelectedUserForModal] = useState<AdminUser | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any>(null);
  const [userModalLoading, setUserModalLoading] = useState(false);
  const [walletAdjForm, setWalletAdjForm] = useState<{ type: 'credit' | 'debit'; amount: string; reason: string }>({
    type: 'credit',
    amount: '',
    reason: ''
  });

  // Transaction detail & resolution modal
  const [selectedTxForModal, setSelectedTxForModal] = useState<TransactionRow | null>(null);
  const [txStatusUpdate, setTxStatusUpdate] = useState<{ status: string; note: string }>({
    status: 'completed',
    note: ''
  });

  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'operations', label: 'Operations', icon: Package },
    { id: 'support', label: 'Support', icon: Headphones },
    { id: 'giftcards', label: 'Gift Cards', icon: Gift },
    { id: 'delivery', label: 'Delivery', icon: Truck },
    { id: 'fuel', label: 'Fuel & Gas', icon: Fuel },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'transactions', label: 'Transactions', icon: Wallet },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
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
        settingsRes,
        supportRes,
        reportsRes
      ] = await Promise.all([
        adminApi.getDashboardStats(),
        adminApi.getOperationOrders(),
        adminApi.getGiftCardSales(),
        adminApi.getFuelOrders(),
        adminApi.getUsers({ limit: 100 }),
        adminApi.getTransactions({ limit: 100 }),
        adminApi.getSettings(),
        adminApi.getSupportTickets({ limit: 100 }),
        adminApi.getReportsOverview({ days: 90 })
      ]);

      setStats(statsRes.data?.stats || {});
      setOrders(ordersRes.data?.orders || []);
      setGiftCardSales(salesRes.data?.sales || []);
      setFuelOrders(fuelRes.data?.orders || []);
      setUsers(usersRes.data?.users || []);
      setTransactions(txRes.data?.transactions || []);
      setSettings(settingsRes.data?.settings || {});
      setSupportTickets(supportRes.data?.tickets || []);
      setReports(reportsRes.data || {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const searchText = search.trim().toLowerCase();

  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (operationFilter !== 'all' && order.module !== operationFilter) return false;
    if (!searchText) return true;
    return [
      order.type,
      order.module,
      order.status,
      userName(order.user),
      rawValue(order.raw, 'order_number'),
      rawValue(order.raw, 'card_type')
    ].some((value) => String(value || '').toLowerCase().includes(searchText));
  }), [orders, operationFilter, searchText]);

  const deliveryOrders = useMemo(() => orders.filter((order) => order.module === 'logistics'), [orders]);

  const filteredTickets = useMemo(() => supportTickets.filter((ticket) => {
    if (supportFilter !== 'all' && ticket.status !== supportFilter) return false;
    if (!searchText) return true;
    return [
      ticket.reference,
      ticket.subject,
      ticket.message,
      ticket.category,
      ticket.priority,
      userName(ticket.user)
    ].some((value) => String(value || '').toLowerCase().includes(searchText));
  }), [supportTickets, searchText, supportFilter]);

  const filteredUsers = useMemo(() => users.filter((row) => {
    if (userFilter === 'active' && !row.is_active) return false;
    if (userFilter === 'inactive' && row.is_active) return false;
    if (userFilter === 'kyc_pending' && row.kyc_status !== 'pending' && row.kyc_status !== 'in_review') return false;
    if (!searchText) return true;
    return [
      row.first_name,
      row.last_name,
      row.email,
      row.phone,
      row.role,
      row.kyc_status
    ].some((value) => String(value || '').toLowerCase().includes(searchText));
  }), [users, searchText, userFilter]);

  const filteredTransactions = useMemo(() => transactions.filter((tx) => {
    if (txCategoryFilter !== 'all' && tx.category !== txCategoryFilter) return false;
    if (txStatusFilter !== 'all' && tx.status !== txStatusFilter) return false;
    if (!searchText) return true;
    return [
      tx.reference,
      tx.category,
      tx.type,
      tx.status,
      tx.description,
      userName(tx.user),
      tx.user?.email,
      tx.user?.phone
    ].some((value) => String(value || '').toLowerCase().includes(searchText));
  }), [transactions, txCategoryFilter, txStatusFilter, searchText]);

  const openSupportCount = supportTickets.filter((ticket) => ['open', 'in_progress', 'waiting_customer'].includes(ticket.status)).length;
  const pendingOpsCount = orders.filter((order) => ['pending', 'pending_review', 'accepted', 'dispatched', 'in_transit', 'open'].includes(order.status)).length;
  const pendingGiftCards = giftCardSales.filter((sale) => sale.status === 'pending_review').length;
  const activeFuelOrders = fuelOrders.filter((order) => ['pending', 'accepted', 'dispatched'].includes(String(order.status))).length;
  const activeDeliveryOrders = deliveryOrders.filter((order) => ['pending', 'accepted', 'picked_up', 'in_transit'].includes(order.status)).length;
  const completedTransactions = transactions.filter((tx) => tx.status === 'completed').length;
  const completionRate = transactions.length ? Math.round((completedTransactions / transactions.length) * 100) : 0;
  const transactionChartData = reports.transactions?.[reportGranularity] || [];
  const userChartData = reports.users?.[reportGranularity] || [];
  const transactionCategoryRows = Object.entries(reports.transactions?.byCategory || {}).map(([name, value]) => ({ name, value }));
  const userKycRows = Object.entries(reports.users?.byKyc || {}).map(([name, value]) => ({ name, value }));

  const summaryCards = [
    { label: 'Customers', value: stats.totalUsers || users.length, detail: `${stats.activeUsers || users.filter((row) => row.is_active).length} active`, icon: Users },
    { label: 'Manual Ops', value: pendingOpsCount, detail: `${activeDeliveryOrders} delivery, ${activeFuelOrders} fuel`, icon: Package },
    { label: 'Support Queue', value: openSupportCount, detail: `${supportTickets.filter((ticket) => ticket.priority === 'urgent').length} urgent`, icon: Headphones },
    { label: 'Monthly Revenue', value: formatCurrency(stats.monthlyRevenue || 0), detail: `${completionRate}% recent completion`, icon: CheckCircle }
  ];

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
        await adminApi.rejectGiftCardSale(id, adminNote || 'Card could not be verified');
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

  const openStatusDialog = (order: Record<string, unknown>, module: 'fuel' | 'logistics') => {
    setStatusDialog({ open: true, order, module });
    setNextStatus(module === 'logistics' ? getDeliveryNextStatus(String(order.status || 'pending')) : getFuelNextStatus(String(order.status || 'pending')));
    setAssignedTo(String(order.assigned_to || order.assigned_driver || ''));
    setAdminNote('');
    setProofUrl('');
  };

  const handleManualStatus = async () => {
    if (!statusDialog.order?.id) return;
    try {
      setActionLoading(true);
      const orderId = String(statusDialog.order.id);
      if (statusDialog.module === 'logistics') {
        if (nextStatus === 'accepted') {
          await adminApi.assignShipment(orderId, {
            assignedTo: assignedTo || user?.email || user?.id || 'admin',
            note: adminNote || undefined
          });
        } else {
          await adminApi.updateShipmentStatus(orderId, {
            status: nextStatus,
            note: adminNote || undefined,
            proofUrl: proofUrl || undefined
          });
        }
        toast.success('Delivery status updated');
      } else {
        await adminApi.updateFuelOrderStatus(orderId, {
          status: nextStatus,
          note: adminNote || undefined,
          assignedTo: assignedTo || undefined,
          proofUrl: proofUrl || undefined
        });
        toast.success('Fuel order status updated');
      }
      setStatusDialog({ open: false });
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTicketUpdate = async (ticket: SupportTicket, updates: { status?: string; priority?: string; assignedTo?: string; adminNotes?: string }) => {
    try {
      setActionLoading(true);
      const res = await adminApi.updateSupportTicket(ticket.id, updates);
      setSelectedTicket(res.data?.ticket || null);
      toast.success('Support ticket updated');
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTicketReply = async () => {
    if (!selectedTicket || !supportReply.trim()) return;
    try {
      setActionLoading(true);
      const res = await adminApi.replySupportTicket(selectedTicket.id, {
        message: supportReply.trim(),
        status: 'waiting_customer',
        assignedTo: selectedTicket.assigned_to || user?.email || user?.id
      });
      setSelectedTicket(res.data?.ticket || null);
      setSupportReply('');
      toast.success('Reply sent to customer');
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUserUpdate = async (row: AdminUser, updates: { isActive?: boolean; kycStatus?: string; role?: string }) => {
    try {
      setActionLoading(true);
      await adminApi.updateUser(row.id, updates);
      toast.success('User updated');
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setActionLoading(false);
    }
  };

  const openUserModal = async (row: AdminUser) => {
    setSelectedUserForModal(row);
    setSelectedUserDetail(null);
    setWalletAdjForm({ type: 'credit', amount: '', reason: '' });
    try {
      setUserModalLoading(true);
      const res = await adminApi.getUser(row.id);
      if (res.data) {
        setSelectedUserDetail(res.data);
      }
    } catch (err) {
      toast.error('Failed to load user details');
    } finally {
      setUserModalLoading(false);
    }
  };

  const handleWalletAdjustment = async () => {
    if (!selectedUserForModal) return;
    const amountNum = Number(walletAdjForm.amount);
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid adjustment amount');
      return;
    }
    if (!walletAdjForm.reason.trim()) {
      toast.error('A reason for this adjustment is required');
      return;
    }

    try {
      setActionLoading(true);
      const res = await adminApi.adjustUserWallet(selectedUserForModal.id, {
        type: walletAdjForm.type,
        amount: amountNum,
        reason: walletAdjForm.reason.trim()
      });

      if (res.data?.success) {
        toast.success(`Wallet successfully ${walletAdjForm.type}ed: ₦${amountNum.toLocaleString()}`);
        setWalletAdjForm({ type: 'credit', amount: '', reason: '' });
        // Refresh details
        const refreshed = await adminApi.getUser(selectedUserForModal.id);
        setSelectedUserDetail(refreshed.data || null);
        await loadAdminData();
      } else {
        toast.error(res.error || 'Wallet adjustment failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Wallet adjustment failed');
    } finally {
      setActionLoading(false);
    }
  };

  const openTxModal = async (tx: TransactionRow) => {
    setSelectedTxForModal(tx);
    setTxStatusUpdate({ status: tx.status || 'completed', note: '' });
    try {
      const res = await adminApi.getTransaction(tx.id);
      if (res.data?.transaction) {
        setSelectedTxForModal(res.data.transaction);
      }
    } catch (err) {
      console.error('Failed to fetch full transaction details:', err);
    }
  };

  const handleTxStatusUpdate = async () => {
    if (!selectedTxForModal) return;
    try {
      setActionLoading(true);
      const res = await adminApi.updateTransactionStatus(selectedTxForModal.id, {
        status: txStatusUpdate.status,
        note: txStatusUpdate.note.trim() || undefined
      });

      if (res.data?.success) {
        toast.success(`Transaction marked as ${txStatusUpdate.status}`);
        setSelectedTxForModal(null);
        await loadAdminData();
      } else {
        toast.error(res.error || 'Failed to update transaction status');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update transaction');
    } finally {
      setActionLoading(false);
    }
  };

  const updateSettingsPath = (section: string, value: unknown) => {
    setSettings((current) => ({ ...current, [section]: value }));
  };

  const handleSettingsSave = async () => {
    try {
      setActionLoading(true);
      await adminApi.updateSettings(settings);
      toast.success('Settings saved');
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings. Super admin access may be required.');
    } finally {
      setActionLoading(false);
    }
  };

  const exportCsv = (filename: string, rows: string[][]) => {
    const content = rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`${filename.replaceAll('_', ' ').toUpperCase()} exported successfully`);
  };

  const handleExportTransactions = () => {
    const header = ['Reference', 'Customer Name', 'Customer Email', 'Category', 'Type', 'Amount (NGN)', 'Status', 'Date', 'Description'];
    const body = filteredTransactions.map((tx) => [
      tx.reference || tx.id,
      userName(tx.user),
      tx.user?.email || '',
      tx.category || '',
      tx.type || '',
      String(tx.amount || 0),
      tx.status || '',
      tx.created_at || '',
      tx.description || ''
    ]);
    exportCsv('nadi_transactions', [header, ...body]);
  };

  const handleExportUsers = () => {
    const header = ['User ID', 'Name', 'Email', 'Phone', 'Role', 'KYC Status', 'Account Status', 'Date Joined'];
    const body = filteredUsers.map((u) => [
      u.id,
      userName(u),
      u.email || '',
      u.phone || '',
      u.role || 'user',
      u.kyc_status || 'pending',
      u.is_active ? 'Active' : 'Suspended',
      u.created_at || ''
    ]);
    exportCsv('nadi_users', [header, ...body]);
  };

  const handleExportOperations = () => {
    const header = ['Order ID', 'Module', 'Customer', 'Status', 'Total (NGN)', 'Date'];
    const body = filteredOrders.map((o) => [
      o.id,
      o.module,
      userName(o.user),
      o.status,
      String(o.amount || 0),
      o.created_at || ''
    ]);
    exportCsv('nadi_operations', [header, ...body]);
  };

  const handleCreateDelivery = async () => {
    try {
      setActionLoading(true);
      await adminApi.createShipment({
        ...deliveryForm,
        userId: deliveryForm.userId === 'none' ? '' : deliveryForm.userId,
        weight: Number(deliveryForm.weight)
      });
      toast.success('Delivery request created for user');
      setDeliveryForm(initialDeliveryForm);
      setCreateDialog(null);
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create delivery request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateFuel = async () => {
    try {
      setActionLoading(true);
      await adminApi.createFuelOrder({
        ...fuelForm,
        userId: fuelForm.userId === 'none' ? '' : fuelForm.userId,
        quantity: Number(fuelForm.quantity)
      });
      toast.success('Fuel/gas request created for user');
      setFuelForm(initialFuelForm);
      setCreateDialog(null);
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create fuel/gas request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateGiftCardSale = async () => {
    try {
      setActionLoading(true);
      await adminApi.createGiftCardSale({
        ...giftCardForm,
        userId: giftCardForm.userId === 'none' ? '' : giftCardForm.userId,
        cardValue: Number(giftCardForm.cardValue),
        rate: Number(giftCardForm.rate) || undefined
      });
      toast.success('Gift card trade submitted for review');
      setGiftCardForm(initialGiftCardForm);
      setCreateDialog(null);
      await loadAdminData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create gift card trade');
    } finally {
      setActionLoading(false);
    }
  };

  const renderOperationsTable = (rows: OperationOrder[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Module</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((order) => (
          <TableRow key={`${order.module}-${order.id}`}>
            <TableCell>
              <div className="font-semibold text-slate-900">{order.type}</div>
              <div className="text-xs text-slate-500">{order.module}</div>
            </TableCell>
            <TableCell>{userName(order.user)}</TableCell>
            <TableCell className="font-mono text-xs">{rawValue(order.raw, 'order_number') || rawValue(order.raw, 'reference') || order.id}</TableCell>
            <TableCell>{formatCurrency(order.amount)}</TableCell>
            <TableCell><Badge className={statusClass(order.status)}>{order.status}</Badge></TableCell>
            <TableCell>{formatDate(order.created_at)}</TableCell>
            <TableCell className="space-x-2 text-right">
              <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)}>View</Button>
              {order.module === 'logistics' && (
                <Button size="sm" onClick={() => openStatusDialog(order.raw, 'logistics')}>Update</Button>
              )}
              {order.module === 'fuel' && (
                <Button size="sm" onClick={() => openStatusDialog(order.raw, 'fuel')}>Update</Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const queuePanel = (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle>Operations Queue</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers or refs" className="pl-9 sm:w-64" />
            </div>
            <Select value={operationFilter} onValueChange={(value) => setOperationFilter(value as 'all' | ManualModule)}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                <SelectItem value="giftcards">Gift Cards</SelectItem>
                <SelectItem value="logistics">Delivery</SelectItem>
                <SelectItem value="fuel">Fuel & Gas</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExportOperations}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>{renderOperationsTable(filteredOrders.slice(0, activeTab === 'dashboard' ? 8 : filteredOrders.length))}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Live Workload</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {[
            { label: 'Gift card reviews', value: pendingGiftCards, total: Math.max(giftCardSales.length, 1) },
            { label: 'Delivery in progress', value: activeDeliveryOrders, total: Math.max(deliveryOrders.length, 1) },
            { label: 'Fuel dispatch', value: activeFuelOrders, total: Math.max(fuelOrders.length, 1) },
            { label: 'Support open', value: openSupportCount, total: Math.max(supportTickets.length, 1) }
          ].map((item) => (
            <div key={item.label}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="text-slate-500">{item.value}</span>
              </div>
              <Progress value={Math.min(100, Math.round((item.value / item.total) * 100))} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed left-0 top-0 hidden h-full w-72 border-r border-slate-200 bg-white p-5 lg:block">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-wide text-[#ea580c]">Nadi Digital</p>
          <h1 className="text-2xl font-black">Admin Command</h1>
          <p className="mt-1 text-xs text-slate-500">Operations, support, users, settings</p>
        </div>
        <nav className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const count = tab.id === 'support' ? openSupportCount : tab.id === 'operations' ? pendingOpsCount : tab.id === 'giftcards' ? pendingGiftCards : undefined;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-[#ea580c] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                <span className="flex items-center gap-3"><Icon className="h-4 w-4" />{tab.label}</span>
                {count !== undefined && count > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === tab.id ? 'bg-white/20' : 'bg-slate-200 text-slate-700'}`}>{count}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="lg:ml-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black capitalize">{activeTab === 'fuel' ? 'Fuel & Gas' : activeTab}</h2>
              <p className="text-sm text-slate-500">{user?.email || 'Admin user'} · {user?.role || 'admin'}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadAdminData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
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

        <section className="space-y-5 p-5">
          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-white">
              <Loader2 className="h-8 w-8 animate-spin text-[#ea580c]" />
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {summaryCards.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Card key={item.label}>
                          <CardContent className="flex items-center justify-between p-5">
                            <div>
                              <p className="text-sm text-slate-500">{item.label}</p>
                              <p className="mt-1 text-2xl font-black">{item.value}</p>
                              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                            </div>
                            <div className="rounded-lg bg-orange-50 p-3 text-[#ea580c]">
                              <Icon className="h-6 w-6" />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  {queuePanel}
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                      <CardHeader><CardTitle>Support Needing Attention</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {supportTickets.slice(0, 5).map((ticket) => (
                          <button key={ticket.id} type="button" onClick={() => setSelectedTicket(ticket)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50">
                            <span>
                              <span className="block font-semibold">{ticket.subject}</span>
                              <span className="text-xs text-slate-500">{ticket.reference} · {userName(ticket.user)}</span>
                            </span>
                            <Badge className={priorityClass(ticket.priority)}>{ticket.priority}</Badge>
                          </button>
                        ))}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>Control Flags</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                          <div>
                            <p className="font-semibold">Registration</p>
                            <p className="text-xs text-slate-500">Allow new customer signups</p>
                          </div>
                          <Switch
                            checked={settings.platform?.registrationEnabled !== false}
                            onCheckedChange={(checked) => updateSettingsPath('platform', { ...(settings.platform || {}), registrationEnabled: checked })}
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                          <div>
                            <p className="font-semibold">Maintenance mode</p>
                            <p className="text-xs text-slate-500">Restrict normal customer actions</p>
                          </div>
                          <Switch
                            checked={settings.platform?.maintenanceMode === true}
                            onCheckedChange={(checked) => updateSettingsPath('platform', { ...(settings.platform || {}), maintenanceMode: checked })}
                          />
                        </div>
                        <Button onClick={handleSettingsSave} disabled={actionLoading} className="w-full">Save Control Flags</Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab === 'operations' && queuePanel}

              {activeTab === 'support' && (
                <Card>
                  <CardHeader className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <CardTitle>Customer Support Console</CardTitle>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ticket, issue, customer" className="sm:w-72" />
                      <Select value={supportFilter} onValueChange={setSupportFilter}>
                        <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All tickets</SelectItem>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In progress</SelectItem>
                          <SelectItem value="waiting_customer">Waiting customer</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>Customer</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Owner</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {filteredTickets.map((ticket) => (
                          <TableRow key={ticket.id}>
                            <TableCell><div className="font-semibold">{ticket.subject}</div><div className="text-xs text-slate-500">{ticket.reference} · {ticket.category}</div></TableCell>
                            <TableCell>{userName(ticket.user)}</TableCell>
                            <TableCell><Badge className={priorityClass(ticket.priority)}>{ticket.priority}</Badge></TableCell>
                            <TableCell><Badge className={statusClass(ticket.status)}>{ticket.status}</Badge></TableCell>
                            <TableCell>{ticket.assigned_to || 'Unassigned'}</TableCell>
                            <TableCell className="text-right"><Button size="sm" onClick={() => { setSelectedTicket(ticket); setSupportNote(ticket.admin_notes || ''); }}>Open</Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'giftcards' && (
                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Gift Card Sell Reviews</CardTitle>
                    <Button onClick={() => setCreateDialog('giftcard')}><Plus className="h-4 w-4" />Assist Trade</Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Card</TableHead><TableHead>Payout</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {giftCardSales.map((sale) => (
                          <TableRow key={String(sale.id)}>
                            <TableCell>{userName(sale.user as UserSummary)}</TableCell>
                            <TableCell>{String(sale.card_currency || '')} {String(sale.card_value || '')} {String(sale.card_type || '')}</TableCell>
                            <TableCell>{formatCurrency(Number(sale.payout_amount || 0))}</TableCell>
                            <TableCell><Badge className={statusClass(String(sale.status))}>{String(sale.status)}</Badge></TableCell>
                            <TableCell className="space-x-2 text-right">
                              <Button size="sm" disabled={actionLoading || sale.status !== 'pending_review'} onClick={() => handleGiftCardDecision(String(sale.id), 'approve')}><CheckCircle className="h-4 w-4" />Approve</Button>
                              <Button size="sm" variant="destructive" disabled={actionLoading || sale.status !== 'pending_review'} onClick={() => handleGiftCardDecision(String(sale.id), 'reject')}><XCircle className="h-4 w-4" />Reject</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'delivery' && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-5">
                    {[
                      { label: 'Pending', value: deliveryOrders.filter((order) => ['pending', 'order_created'].includes(order.status)).length },
                      { label: 'Accepted', value: deliveryOrders.filter((order) => order.status === 'accepted').length },
                      { label: 'Picked up', value: deliveryOrders.filter((order) => order.status === 'picked_up').length },
                      { label: 'In transit', value: deliveryOrders.filter((order) => order.status === 'in_transit').length },
                      { label: 'Delivered', value: deliveryOrders.filter((order) => order.status === 'delivered').length }
                    ].map((item) => (
                      <Card key={item.label}>
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                          <p className="mt-1 text-2xl font-black">{item.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Card>
                    <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <CardTitle>Delivery Dispatch</CardTitle>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button onClick={() => setCreateDialog('delivery')}><Plus className="h-4 w-4" />Create delivery</Button>
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search shipment or customer" className="sm:w-72" />
                        <Button variant="outline" onClick={loadAdminData} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {deliveryOrders
                        .filter((order) => {
                          if (!searchText) return true;
                          return [
                            rawValue(order.raw, 'order_number'),
                            order.status,
                            getDeliveryItemLabel(order.raw),
                            getDeliveryAddress(order.raw, 'pickup'),
                            getDeliveryAddress(order.raw, 'delivery'),
                            userName(order.user)
                          ].some((value) => String(value || '').toLowerCase().includes(searchText));
                        })
                        .map((order) => {
                          const status = String(order.status || 'pending');
                          const terminal = isDeliveryTerminal(status);
                          const delivery = order.raw.delivery as { recipientName?: string; recipientPhone?: string } | undefined;
                          return (
                            <div key={order.id} className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-mono text-xs text-slate-500">{String(rawValue(order.raw, 'order_number') || order.id)}</p>
                                    <Badge className={statusClass(status)}>{status}</Badge>
                                    <Badge className="border-blue-200 bg-blue-50 text-blue-700">{String((order.raw.package as { serviceType?: string } | undefined)?.serviceType || 'standard')}</Badge>
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-black">{getDeliveryItemLabel(order.raw)}</h3>
                                    <p className="text-sm text-slate-500">{userName(order.user)} · Recipient: {delivery?.recipientName || 'Not provided'} {delivery?.recipientPhone ? `(${delivery.recipientPhone})` : ''}</p>
                                  </div>
                                  <div className="grid gap-2 text-sm text-slate-600 lg:grid-cols-2">
                                    <p><strong className="text-slate-800">Pickup:</strong> {getDeliveryAddress(order.raw, 'pickup')}</p>
                                    <p><strong className="text-slate-800">Dropoff:</strong> {getDeliveryAddress(order.raw, 'delivery')}</p>
                                  </div>
                                  <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                                    <span>Total: <strong className="text-slate-800">{formatCurrency(order.amount)}</strong></span>
                                    <span>Created: <strong className="text-slate-800">{formatDate(order.created_at)}</strong></span>
                                    <span>Dispatcher: <strong className="text-slate-800">{String(rawValue(order.raw, 'assigned_to') || 'Unassigned')}</strong></span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 xl:justify-end">
                                  <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)}>View details</Button>
                                  {!terminal && (
                                    <Button size="sm" onClick={() => openStatusDialog(order.raw, 'logistics')}>
                                      {getDeliveryActionLabel(status)}
                                    </Button>
                                  )}
                                  {!terminal && ['pending', 'order_created', 'accepted'].includes(status) && (
                                    <Button size="sm" variant="destructive" onClick={() => {
                                      setStatusDialog({ open: true, order: order.raw, module: 'logistics' });
                                      setNextStatus('cancelled');
                                      setAssignedTo(String(rawValue(order.raw, 'assigned_to') || ''));
                                      setAdminNote('Cancelled by operations');
                                      setProofUrl('');
                                    }}>
                                      Cancel & refund
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'fuel' && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    {[
                      { label: 'Pending', value: fuelOrders.filter((order) => order.status === 'pending').length },
                      { label: 'Accepted', value: fuelOrders.filter((order) => order.status === 'accepted').length },
                      { label: 'Dispatched', value: fuelOrders.filter((order) => order.status === 'dispatched').length },
                      { label: 'Delivered', value: fuelOrders.filter((order) => order.status === 'delivered').length }
                    ].map((item) => (
                      <Card key={item.label}>
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                          <p className="mt-1 text-2xl font-black">{item.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Card>
                    <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <CardTitle>Fuel & Gas Fulfillment</CardTitle>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button onClick={() => setCreateDialog('fuel')}><Plus className="h-4 w-4" />Create fuel/gas</Button>
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order or customer" className="sm:w-72" />
                        <Button variant="outline" onClick={loadAdminData} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {fuelOrders
                        .filter((order) => {
                          if (!searchText) return true;
                          return [
                            order.order_number,
                            order.order_type,
                            order.status,
                            getFuelItemLabel(order),
                            getFuelAddress(order),
                            userName(order.user as UserSummary)
                          ].some((value) => String(value || '').toLowerCase().includes(searchText));
                        })
                        .map((order) => {
                          const status = String(order.status || 'pending');
                          const terminal = isFuelTerminal(status);
                          return (
                            <div key={String(order.id)} className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-mono text-xs text-slate-500">{String(order.order_number || order.id)}</p>
                                    <Badge className={statusClass(status)}>{status}</Badge>
                                    <Badge className={priorityClass(String(order.priority || 'normal'))}>{String(order.priority || 'normal')}</Badge>
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-black">{getFuelItemLabel(order)}</h3>
                                    <p className="text-sm text-slate-500">{userName(order.user as UserSummary)} · {String(order.contact_phone || 'No phone')}</p>
                                  </div>
                                  <p className="text-sm text-slate-600">{getFuelAddress(order)}</p>
                                  <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                                    <span>Total: <strong className="text-slate-800">{formatCurrency(Number((order.pricing as { total?: number } | undefined)?.total || 0))}</strong></span>
                                    <span>Scheduled: <strong className="text-slate-800">{formatDate(String(order.scheduled_date || order.created_at || ''))}</strong></span>
                                    <span>Operator: <strong className="text-slate-800">{String(order.assigned_driver || 'Unassigned')}</strong></span>
                                  </div>
                                  {Boolean(order.customer_notes) && <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">Customer note: {String(order.customer_notes)}</p>}
                                </div>
                                <div className="flex flex-wrap gap-2 xl:justify-end">
                                  <Button size="sm" variant="outline" onClick={() => setSelectedOrder({
                                    id: String(order.id),
                                    module: 'fuel',
                                    type: String(order.order_type || 'Fuel & Gas'),
                                    status,
                                    amount: Number((order.pricing as { total?: number } | undefined)?.total || 0),
                                    created_at: String(order.created_at || new Date().toISOString()),
                                    user: order.user as UserSummary,
                                    raw: order
                                  })}>
                                    View details
                                  </Button>
                                  {!terminal && (
                                    <Button size="sm" onClick={() => openStatusDialog(order, 'fuel')}>
                                      {getFuelActionLabel(status)}
                                    </Button>
                                  )}
                                  {!terminal && (
                                    <Button size="sm" variant="destructive" onClick={() => {
                                      setStatusDialog({ open: true, order, module: 'fuel' });
                                      setNextStatus('cancelled');
                                      setAssignedTo(String(order.assigned_driver || ''));
                                      setAdminNote('Cancelled by operations');
                                      setProofUrl('');
                                    }}>
                                      Cancel & refund
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'users' && (
                <Card>
                  <CardHeader className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <CardTitle>Customer Management & Wallets</CardTitle>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers by name, email, phone..." className="sm:w-72" />
                      <Select value={userFilter} onValueChange={setUserFilter}>
                        <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All users</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="kyc_pending">KYC pending</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" onClick={loadAdminData} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
                      <Button variant="outline" onClick={handleExportUsers}><Download className="h-4 w-4" />Export CSV</Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>KYC Status</TableHead>
                          <TableHead>Account Status</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="font-semibold text-slate-900">{userName(row)}</div>
                              <div className="text-xs text-slate-500 font-mono">ID: {row.id.substring(0, 8)}...</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{row.email}</div>
                              <div className="text-xs text-slate-500">{row.phone || 'No phone'}</div>
                            </TableCell>
                            <TableCell><Badge className={statusClass(row.role)}>{row.role || 'user'}</Badge></TableCell>
                            <TableCell>
                              <Select value={row.kyc_status || 'pending'} onValueChange={(kycStatus) => handleUserUpdate(row, { kycStatus })}>
                                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="in_review">In review</SelectItem>
                                  <SelectItem value="verified">Verified</SelectItem>
                                  <SelectItem value="rejected">Rejected</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Badge className={row.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}>
                                {row.is_active ? 'Active' : 'Suspended'}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(row.created_at)}</TableCell>
                            <TableCell className="space-x-2 text-right">
                              <Button size="sm" onClick={() => openUserModal(row)}>
                                <Eye className="h-4 w-4" />
                                Manage
                              </Button>
                              <Button size="sm" variant={row.is_active ? 'destructive' : 'outline'} disabled={actionLoading} onClick={() => handleUserUpdate(row, { isActive: !row.is_active })}>
                                {row.is_active ? 'Suspend' : 'Activate'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'transactions' && (
                <Card>
                  <CardHeader className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <CardTitle>Transactions & Settlements</CardTitle>
                      <p className="text-xs text-slate-500 mt-1">Audit customer fundings, debits, orders, and settlements</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ref or description..." className="sm:w-60" />
                      <Select value={txCategoryFilter} onValueChange={setTxCategoryFilter}>
                        <SelectTrigger className="sm:w-36"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All categories</SelectItem>
                          <SelectItem value="wallet">Wallet</SelectItem>
                          <SelectItem value="crypto">Crypto</SelectItem>
                          <SelectItem value="fuel">Fuel & Gas</SelectItem>
                          <SelectItem value="logistics">Logistics</SelectItem>
                          <SelectItem value="giftcard">Gift Cards</SelectItem>
                          <SelectItem value="utility">Utilities</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={txStatusFilter} onValueChange={setTxStatusFilter}>
                        <SelectTrigger className="sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="reversed">Reversed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" onClick={loadAdminData} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
                      <Button variant="outline" onClick={handleExportTransactions}><Download className="h-4 w-4" />Export CSV</Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reference</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransactions.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="font-mono text-xs font-semibold">{tx.reference || tx.id}</TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{userName(tx.user)}</div>
                              <div className="text-xs text-slate-500">{tx.user?.email}</div>
                            </TableCell>
                            <TableCell><Badge variant="outline" className="capitalize">{tx.category || 'General'}</Badge></TableCell>
                            <TableCell className="capitalize text-xs text-slate-600">{tx.type?.replaceAll('_', ' ')}</TableCell>
                            <TableCell className="font-semibold">{formatCurrency(tx.amount)}</TableCell>
                            <TableCell><Badge className={statusClass(tx.status)}>{tx.status}</Badge></TableCell>
                            <TableCell className="text-xs text-slate-500">{formatDate(tx.created_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => openTxModal(tx)}>
                                <SlidersHorizontal className="h-4 w-4" />
                                Inspect
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'reports' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-xl font-black">Reports & Live Charts</h3>
                      <p className="text-sm text-slate-500">Transaction volume, user growth, status mix, and module breakdowns.</p>
                    </div>
                    <Select value={reportGranularity} onValueChange={(value) => setReportGranularity(value as ReportGranularity)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    {[
                      { label: 'Transactions', value: reports.transactions?.summary?.total || 0 },
                      { label: 'Completed volume', value: formatCurrency(reports.transactions?.summary?.completedVolume || 0) },
                      { label: 'New users', value: reports.users?.summary?.newUsers || 0 },
                      { label: 'Verified users', value: reports.users?.summary?.verified || 0 }
                    ].map((item) => (
                      <Card key={item.label}>
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                          <p className="mt-1 text-2xl font-black">{item.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                      <CardHeader><CardTitle>Transaction Volume</CardTitle></CardHeader>
                      <CardContent className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={transactionChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(value) => typeof value === 'number' ? value.toLocaleString() : value} />
                            <Legend />
                            <Area type="monotone" dataKey="volume" name="Volume" stroke="#ea580c" fill="#fed7aa" />
                            <Area type="monotone" dataKey="count" name="Count" stroke="#0f172a" fill="#cbd5e1" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader><CardTitle>User Growth</CardTitle></CardHeader>
                      <CardContent className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={userChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="registrations" name="Registrations" fill="#ea580c" />
                            <Bar dataKey="verified" name="Verified" fill="#16a34a" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                      <CardHeader><CardTitle>Transactions By Category</CardTitle></CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Count</TableHead></TableRow></TableHeader>
                          <TableBody>{transactionCategoryRows.map((row) => <TableRow key={row.name}><TableCell>{row.name}</TableCell><TableCell>{row.value}</TableCell></TableRow>)}</TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>Users By KYC</CardTitle></CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader><TableRow><TableHead>KYC Status</TableHead><TableHead>Count</TableHead></TableRow></TableHeader>
                          <TableBody>{userKycRows.map((row) => <TableRow key={row.name}><TableCell>{row.name}</TableCell><TableCell>{row.value}</TableCell></TableRow>)}</TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-xl font-black">Live Pricing & Platform Configuration</h3>
                      <p className="text-sm text-slate-500">Edit prices, exchange rates, and system flags. Changes synchronize across the entire customer platform in real-time.</p>
                    </div>
                    <Button onClick={handleSettingsSave} disabled={actionLoading} className="bg-[#ea580c] hover:bg-[#c2410c] text-white">
                      {actionLoading ? 'Saving...' : 'Save All Settings & Prices'}
                    </Button>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    {/* Fuel Pricing */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Fuel className="h-5 w-5 text-[#ea580c]" />
                          Fuel Pricing (NGN / Litre)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <Label>Petrol (PMS) Price</Label>
                          <Input
                            type="number"
                            value={settings.fuel?.fuel?.pms?.price ?? 617}
                            onChange={(event) => updateSettingsPath('fuel', {
                              ...(settings.fuel || {}),
                              fuel: {
                                ...(settings.fuel?.fuel || {}),
                                pms: { ...(settings.fuel?.fuel?.pms || {}), price: Number(event.target.value), name: 'Premium Motor Spirit (Petrol)' }
                              }
                            })}
                          />
                        </div>
                        <div>
                          <Label>Diesel (AGO) Price</Label>
                          <Input
                            type="number"
                            value={settings.fuel?.fuel?.ago?.price ?? 1100}
                            onChange={(event) => updateSettingsPath('fuel', {
                              ...(settings.fuel || {}),
                              fuel: {
                                ...(settings.fuel?.fuel || {}),
                                ago: { ...(settings.fuel?.fuel?.ago || {}), price: Number(event.target.value), name: 'Automotive Gas Oil (Diesel)' }
                              }
                            })}
                          />
                        </div>
                        <div>
                          <Label>Fuel Delivery Fee</Label>
                          <Input
                            type="number"
                            value={settings.fuel?.deliveryFee ?? 1500}
                            onChange={(event) => updateSettingsPath('fuel', {
                              ...(settings.fuel || {}),
                              deliveryFee: Number(event.target.value)
                            })}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Gas Cylinder Pricing */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-[#ea580c]" />
                          Cooking Gas (LPG) Refill Pricing (NGN)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                        {['3kg', '6kg', '12.5kg', '25kg', '50kg'].map((size) => (
                          <div key={size}>
                            <Label>{size} Refill</Label>
                            <Input
                              type="number"
                              value={settings.fuel?.gas?.[size]?.price ?? (size === '3kg' ? 3500 : size === '6kg' ? 6500 : size === '12.5kg' ? 12500 : size === '25kg' ? 24000 : 47000)}
                              onChange={(event) => updateSettingsPath('fuel', {
                                ...(settings.fuel || {}),
                                gas: {
                                  ...(settings.fuel?.gas || {}),
                                  [size]: { price: Number(event.target.value), name: `${size} Cylinder` }
                                }
                              })}
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Gift Card Exchange Rates */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Gift className="h-5 w-5 text-[#ea580c]" />
                        Gift Card Exchange Payout Rates (NGN per Currency Unit)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {DEFAULT_GIFT_CARDS.map((card) => {
                          const currentCardRates = settings.giftcards?.rates?.[card.id] || {};
                          return (
                            <div key={card.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                              <div className="font-bold text-sm text-slate-800 flex items-center justify-between">
                                <span>{card.name}</span>
                                <Badge variant="outline" className="text-[10px] uppercase">{card.currencies.join('/')}</Badge>
                              </div>
                              <div className="space-y-2">
                                {card.currencies.map((curr) => {
                                  const fallbackVal = curr === 'GBP' ? 950 : curr === 'EUR' ? 890 : 850;
                                  const rateVal = currentCardRates[curr] ?? fallbackVal;
                                  return (
                                    <div key={curr} className="flex items-center justify-between gap-2">
                                      <Label className="text-xs font-semibold text-slate-600">{curr} Rate:</Label>
                                      <div className="relative w-28">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">₦</span>
                                        <Input
                                          type="number"
                                          value={rateVal}
                                          className="h-8 pl-6 text-xs"
                                          onChange={(event) => {
                                            const updatedVal = Number(event.target.value);
                                            const existingRates = settings.giftcards?.rates || {};
                                            const existingBrandRates = existingRates[card.id] || {};
                                            updateSettingsPath('giftcards', {
                                              ...(settings.giftcards || {}),
                                              rates: {
                                                ...existingRates,
                                                [card.id]: {
                                                  ...existingBrandRates,
                                                  [curr]: updatedVal
                                                }
                                              }
                                            });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Crypto Margins & Admin Wallets */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5 text-[#ea580c]" />
                        Crypto Dynamic Margins & Deposit Addresses
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label>Buy Margin % (Added to market price)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={settings.crypto?.buyMarginPercent ?? 1.5}
                            onChange={(event) => updateSettingsPath('crypto', {
                              ...(settings.crypto || {}),
                              buyMarginPercent: Number(event.target.value)
                            })}
                          />
                          <span className="text-[11px] text-slate-500">e.g. 1.5% profit on customer purchases</span>
                        </div>
                        <div>
                          <Label>Sell Margin % (Subtracted from market price)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={settings.crypto?.sellMarginPercent ?? -1.5}
                            onChange={(event) => updateSettingsPath('crypto', {
                              ...(settings.crypto || {}),
                              sellMarginPercent: Number(event.target.value)
                            })}
                          />
                          <span className="text-[11px] text-slate-500">e.g. -1.5% fee on customer sales</span>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Company Cold/Hot Deposit Addresses (Fallback / Manual)</Label>
                        <div className="grid gap-3">
                          <div>
                            <Label className="text-xs">Bitcoin (BTC) Deposit Address</Label>
                            <Input
                              className="font-mono text-xs"
                              value={settings.crypto?.depositAddresses?.btc ?? 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'}
                              onChange={(event) => updateSettingsPath('crypto', {
                                ...(settings.crypto || {}),
                                depositAddresses: {
                                  ...(settings.crypto?.depositAddresses || {}),
                                  btc: event.target.value
                                }
                              })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Ethereum (ETH / ERC-20) Deposit Address</Label>
                            <Input
                              className="font-mono text-xs"
                              value={settings.crypto?.depositAddresses?.eth ?? '0x71C8008d5bAe6fE5EbC3D0BE5465C0C2D8190779'}
                              onChange={(event) => updateSettingsPath('crypto', {
                                ...(settings.crypto || {}),
                                depositAddresses: {
                                  ...(settings.crypto?.depositAddresses || {}),
                                  eth: event.target.value
                                }
                              })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Tether (USDT TRC-20) Deposit Address</Label>
                            <Input
                              className="font-mono text-xs"
                              value={settings.crypto?.depositAddresses?.usdt ?? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'}
                              onChange={(event) => updateSettingsPath('crypto', {
                                ...(settings.crypto || {}),
                                depositAddresses: {
                                  ...(settings.crypto?.depositAddresses || {}),
                                  usdt: event.target.value
                                }
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Platform Controls */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-[#ea580c]" />
                        Platform Controls & Guardrails
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2">
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                        <div>
                          <p className="font-semibold text-sm">Customer Registration</p>
                          <p className="text-xs text-slate-500">Allow new users to sign up on the platform</p>
                        </div>
                        <Switch
                          checked={settings.platform?.registrationEnabled !== false}
                          onCheckedChange={(checked) => updateSettingsPath('platform', { ...(settings.platform || {}), registrationEnabled: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                        <div>
                          <p className="font-semibold text-sm">Maintenance Mode</p>
                          <p className="text-xs text-slate-500">Restrict customer platform during provider maintenance</p>
                        </div>
                        <Switch
                          checked={settings.platform?.maintenanceMode === true}
                          onCheckedChange={(checked) => updateSettingsPath('platform', { ...(settings.platform || {}), maintenanceMode: checked })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* User Details & Wallet Control Modal */}
      <Dialog open={!!selectedUserForModal} onOpenChange={(open) => !open && setSelectedUserForModal(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Customer Profile & Wallet Control</span>
              {selectedUserForModal && (
                <Badge className={statusClass(selectedUserForModal.kyc_status)}>
                  KYC: {selectedUserForModal.kyc_status?.toUpperCase() || 'PENDING'}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedUserForModal ? `${userName(selectedUserForModal)} · ${selectedUserForModal.email}` : ''}
            </DialogDescription>
          </DialogHeader>

          {userModalLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#ea580c]" /></div>
          ) : selectedUserForModal && (
            <div className="space-y-6">
              {/* User Overview Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500 font-semibold">Wallet Balance</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">
                    {formatCurrency(Number(selectedUserDetail?.wallet?.balance || 0))}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Account: {selectedUserDetail?.wallet?.account_number || 'Virtual pending'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500 font-semibold">Phone & Account Type</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{selectedUserForModal.phone || 'No phone'}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Role: {selectedUserForModal.role || 'user'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500 font-semibold">Status</p>
                  <p className={`text-sm font-bold mt-1 ${selectedUserForModal.is_active ? 'text-emerald-600' : 'text-red-600'}`}>
                    {selectedUserForModal.is_active ? 'Active Customer' : 'Suspended Account'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Joined: {formatDate(selectedUserForModal.created_at)}</p>
                </div>
              </div>

              {/* Manual Wallet Adjustment Console */}
              <Card className="border-orange-200 bg-orange-50/20">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-[#ea580c]" />
                    Manual Wallet Balance Adjustment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Adjustment Type</Label>
                      <Select
                        value={walletAdjForm.type}
                        onValueChange={(type: 'credit' | 'debit') => setWalletAdjForm(prev => ({ ...prev, type }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="credit">Credit Balance (+)</SelectItem>
                          <SelectItem value="debit">Debit Balance (-)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Amount (NGN)</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 5000"
                        value={walletAdjForm.amount}
                        onChange={(e) => setWalletAdjForm(prev => ({ ...prev, amount: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Reason / Note</Label>
                      <Input
                        placeholder="Reason for adjustment"
                        value={walletAdjForm.reason}
                        onChange={(e) => setWalletAdjForm(prev => ({ ...prev, reason: e.target.value }))}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={actionLoading || !walletAdjForm.amount || !walletAdjForm.reason}
                    onClick={handleWalletAdjustment}
                    className="bg-[#ea580c] hover:bg-[#c2410c] text-white"
                  >
                    {actionLoading ? 'Processing...' : `Apply ${walletAdjForm.type.toUpperCase()} Adjustment`}
                  </Button>
                </CardContent>
              </Card>

              {/* Quick KYC Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-white">
                <div>
                  <p className="font-bold text-sm">KYC Verification Controls</p>
                  <p className="text-xs text-slate-500">Update verification status and alert customer</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-700 hover:bg-emerald-50"
                    disabled={actionLoading || selectedUserForModal.kyc_status === 'verified'}
                    onClick={() => handleUserUpdate(selectedUserForModal, { kycStatus: 'verified' })}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Verify KYC
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-700 hover:bg-red-50"
                    disabled={actionLoading || selectedUserForModal.kyc_status === 'rejected'}
                    onClick={() => handleUserUpdate(selectedUserForModal, { kycStatus: 'rejected' })}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject KYC
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedUserForModal.is_active ? 'destructive' : 'outline'}
                    disabled={actionLoading}
                    onClick={() => handleUserUpdate(selectedUserForModal, { isActive: !selectedUserForModal.is_active })}
                  >
                    {selectedUserForModal.is_active ? 'Suspend Account' : 'Activate Account'}
                  </Button>
                </div>
              </div>

              {/* Recent Activity for this User */}
              <div>
                <h4 className="font-bold text-sm text-slate-900 mb-2">Recent Customer Transactions</h4>
                {selectedUserDetail?.recentTransactions?.length ? (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reference</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedUserDetail.recentTransactions.map((tx: any) => (
                          <TableRow key={tx.id}>
                            <TableCell className="font-mono text-xs">{tx.reference || tx.id}</TableCell>
                            <TableCell className="capitalize text-xs">{tx.type?.replaceAll('_', ' ')}</TableCell>
                            <TableCell className="font-semibold text-xs">{formatCurrency(tx.amount)}</TableCell>
                            <TableCell><Badge className={statusClass(tx.status)}>{tx.status}</Badge></TableCell>
                            <TableCell className="text-xs text-slate-500">{formatDate(tx.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 py-3 text-center border border-dashed rounded-lg">No recent transactions recorded for this customer.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transaction Detail & Resolution Modal */}
      <Dialog open={!!selectedTxForModal} onOpenChange={(open) => !open && setSelectedTxForModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Transaction Settlement Inspector</span>
              {selectedTxForModal && <Badge className={statusClass(selectedTxForModal.status)}>{selectedTxForModal.status}</Badge>}
            </DialogTitle>
            <DialogDescription>
              Reference: <span className="font-mono">{selectedTxForModal?.reference || selectedTxForModal?.id}</span>
            </DialogDescription>
          </DialogHeader>

          {selectedTxForModal && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Customer</p>
                  <p className="font-semibold">{userName(selectedTxForModal.user)}</p>
                  <p className="text-xs text-slate-500">{selectedTxForModal.user?.email}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Amount & Category</p>
                  <p className="font-black text-lg text-slate-900">{formatCurrency(selectedTxForModal.amount)}</p>
                  <p className="text-xs text-slate-500 capitalize">{selectedTxForModal.category || 'General'} · {selectedTxForModal.type}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Created At</p>
                  <p className="font-medium text-xs">{formatDate(selectedTxForModal.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Description</p>
                  <p className="text-xs text-slate-700">{selectedTxForModal.description || 'No description'}</p>
                </div>
              </div>

              {/* Status Update / Resolution Form */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <Label className="font-bold text-sm">Resolution & Status Override</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Update Status To</Label>
                    <Select
                      value={txStatusUpdate.status}
                      onValueChange={(status) => setTxStatusUpdate(prev => ({ ...prev, status }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="reversed">Reversed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Audit Note / Reason</Label>
                    <Input
                      placeholder="Reason for manual resolution"
                      value={txStatusUpdate.note}
                      onChange={(e) => setTxStatusUpdate(prev => ({ ...prev, note: e.target.value }))}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleTxStatusUpdate}
                  disabled={actionLoading}
                  className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white"
                >
                  {actionLoading ? 'Updating...' : `Update Transaction Status to ${txStatusUpdate.status.toUpperCase()}`}
                </Button>
              </div>

              {/* Raw Details / Metadata */}
              {(selectedTxForModal.details || selectedTxForModal.metadata) && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-600">Technical Details & Metadata</p>
                  <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-50">
                    {JSON.stringify(selectedTxForModal.details || selectedTxForModal.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!createDialog} onOpenChange={(open) => !open && setCreateDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {createDialog === 'delivery' && 'Create Delivery Request'}
              {createDialog === 'fuel' && 'Create Fuel/Gas Request'}
              {createDialog === 'giftcard' && 'Assist Gift Card Trade'}
            </DialogTitle>
            <DialogDescription>Create an operational request for a selected customer without silently debiting their wallet.</DialogDescription>
          </DialogHeader>

          {createDialog === 'delivery' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2"><Label>User</Label><Select value={deliveryForm.userId || 'none'} onValueChange={(userId) => setDeliveryForm((current) => ({ ...current, userId }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Select customer</SelectItem>{users.map((row) => <SelectItem key={row.id} value={row.id}>{userName(row)} · {row.email}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Pickup address</Label><Input value={deliveryForm.pickupAddress} onChange={(event) => setDeliveryForm((current) => ({ ...current, pickupAddress: event.target.value }))} /></div>
              <div><Label>Delivery address</Label><Input value={deliveryForm.deliveryAddress} onChange={(event) => setDeliveryForm((current) => ({ ...current, deliveryAddress: event.target.value }))} /></div>
              <div><Label>Recipient name</Label><Input value={deliveryForm.recipientName} onChange={(event) => setDeliveryForm((current) => ({ ...current, recipientName: event.target.value }))} /></div>
              <div><Label>Recipient phone</Label><Input value={deliveryForm.recipientPhone} onChange={(event) => setDeliveryForm((current) => ({ ...current, recipientPhone: event.target.value }))} /></div>
              <div><Label>Item</Label><Input value={deliveryForm.itemDescription} onChange={(event) => setDeliveryForm((current) => ({ ...current, itemDescription: event.target.value }))} /></div>
              <div><Label>Weight kg</Label><Input type="number" value={deliveryForm.weight} onChange={(event) => setDeliveryForm((current) => ({ ...current, weight: Number(event.target.value) }))} /></div>
              <div><Label>Service</Label><Select value={deliveryForm.serviceType} onValueChange={(serviceType) => setDeliveryForm((current) => ({ ...current, serviceType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="express">Express</SelectItem><SelectItem value="sameDay">Same day</SelectItem></SelectContent></Select></div>
              <div><Label>Mode</Label><Select value={deliveryForm.deliveryMode} onValueChange={(deliveryMode) => setDeliveryForm((current) => ({ ...current, deliveryMode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="door_to_door">Door to door</SelectItem><SelectItem value="interstate">Interstate</SelectItem></SelectContent></Select></div>
              <div><Label>Assign operator</Label><Input value={deliveryForm.assignedTo} onChange={(event) => setDeliveryForm((current) => ({ ...current, assignedTo: event.target.value }))} placeholder="Optional" /></div>
              <div><Label>Scheduled date</Label><Input type="datetime-local" value={deliveryForm.scheduledDate} onChange={(event) => setDeliveryForm((current) => ({ ...current, scheduledDate: event.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Notes</Label><Textarea value={deliveryForm.notes} onChange={(event) => setDeliveryForm((current) => ({ ...current, notes: event.target.value }))} /></div>
            </div>
          )}

          {createDialog === 'fuel' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2"><Label>User</Label><Select value={fuelForm.userId || 'none'} onValueChange={(userId) => setFuelForm((current) => ({ ...current, userId }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Select customer</SelectItem>{users.map((row) => <SelectItem key={row.id} value={row.id}>{userName(row)} · {row.email}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Type</Label><Select value={fuelForm.type} onValueChange={(type) => setFuelForm((current) => ({ ...current, type, subtype: type === 'fuel' ? 'pms' : '12.5kg' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fuel">Fuel</SelectItem><SelectItem value="gas">Gas</SelectItem></SelectContent></Select></div>
              <div><Label>Subtype</Label><Select value={fuelForm.subtype} onValueChange={(subtype) => setFuelForm((current) => ({ ...current, subtype }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{fuelForm.type === 'fuel' ? (<><SelectItem value="pms">PMS</SelectItem><SelectItem value="ago">Diesel</SelectItem></>) : (<><SelectItem value="3kg">3kg</SelectItem><SelectItem value="6kg">6kg</SelectItem><SelectItem value="12.5kg">12.5kg</SelectItem><SelectItem value="25kg">25kg</SelectItem><SelectItem value="50kg">50kg</SelectItem></>)}</SelectContent></Select></div>
              <div><Label>Quantity</Label><Input type="number" value={fuelForm.quantity} onChange={(event) => setFuelForm((current) => ({ ...current, quantity: Number(event.target.value) }))} /></div>
              <div><Label>Phone</Label><Input value={fuelForm.phoneNumber} onChange={(event) => setFuelForm((current) => ({ ...current, phoneNumber: event.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Delivery address</Label><Input value={fuelForm.deliveryAddress} onChange={(event) => setFuelForm((current) => ({ ...current, deliveryAddress: event.target.value }))} /></div>
              <div><Label>Assign operator</Label><Input value={fuelForm.assignedTo} onChange={(event) => setFuelForm((current) => ({ ...current, assignedTo: event.target.value }))} placeholder="Optional" /></div>
              <div><Label>Scheduled date</Label><Input type="datetime-local" value={fuelForm.scheduledDate} onChange={(event) => setFuelForm((current) => ({ ...current, scheduledDate: event.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Customer notes</Label><Textarea value={fuelForm.customerNotes} onChange={(event) => setFuelForm((current) => ({ ...current, customerNotes: event.target.value }))} /></div>
            </div>
          )}

          {createDialog === 'giftcard' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2"><Label>User</Label><Select value={giftCardForm.userId || 'none'} onValueChange={(userId) => setGiftCardForm((current) => ({ ...current, userId }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Select customer</SelectItem>{users.map((row) => <SelectItem key={row.id} value={row.id}>{userName(row)} · {row.email}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Card type</Label><Input value={giftCardForm.cardType} onChange={(event) => setGiftCardForm((current) => ({ ...current, cardType: event.target.value }))} /></div>
              <div><Label>Currency</Label><Input value={giftCardForm.cardCurrency} onChange={(event) => setGiftCardForm((current) => ({ ...current, cardCurrency: event.target.value.toUpperCase() }))} /></div>
              <div><Label>Value</Label><Input type="number" value={giftCardForm.cardValue} onChange={(event) => setGiftCardForm((current) => ({ ...current, cardValue: Number(event.target.value) }))} /></div>
              <div><Label>Rate</Label><Input type="number" value={giftCardForm.rate} onChange={(event) => setGiftCardForm((current) => ({ ...current, rate: Number(event.target.value) }))} placeholder="Use configured rate if blank" /></div>
              <div><Label>Card code</Label><Input value={giftCardForm.cardCode} onChange={(event) => setGiftCardForm((current) => ({ ...current, cardCode: event.target.value }))} /></div>
              <div><Label>Card PIN</Label><Input value={giftCardForm.cardPin} onChange={(event) => setGiftCardForm((current) => ({ ...current, cardPin: event.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Image URL</Label><Input value={giftCardForm.cardImage} onChange={(event) => setGiftCardForm((current) => ({ ...current, cardImage: event.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Review note</Label><Textarea value={giftCardForm.note} onChange={(event) => setGiftCardForm((current) => ({ ...current, note: event.target.value }))} /></div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(null)}>Cancel</Button>
            {createDialog === 'delivery' && <Button onClick={handleCreateDelivery} disabled={actionLoading}>{actionLoading ? 'Creating...' : 'Create Delivery'}</Button>}
            {createDialog === 'fuel' && <Button onClick={handleCreateFuel} disabled={actionLoading}>{actionLoading ? 'Creating...' : 'Create Fuel/Gas'}</Button>}
            {createDialog === 'giftcard' && <Button onClick={handleCreateGiftCardSale} disabled={actionLoading}>{actionLoading ? 'Submitting...' : 'Submit Trade'}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Operation Details</DialogTitle>
            <DialogDescription>{selectedOrder?.type} · {selectedOrder?.status}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[420px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-50">{JSON.stringify(selectedOrder?.raw || {}, null, 2)}</pre>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialog.open} onOpenChange={(open) => setStatusDialog({ open, order: statusDialog.order, module: statusDialog.module })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update {statusDialog.module === 'logistics' ? 'Delivery' : 'Fuel'} Order</DialogTitle>
            <DialogDescription>Assign ownership, move status, and attach notes or proof.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Status</Label><Select value={nextStatus} onValueChange={setNextStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statusDialog.module === 'logistics' ? (<><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="picked_up">Picked Up</SelectItem><SelectItem value="in_transit">In Transit</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></>) : (<><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="dispatched">Dispatched</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></>)}</SelectContent></Select></div>
            <div><Label>Assigned operator</Label><Input value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} placeholder="Driver, dispatcher, or operator email" /></div>
            <div><Label>Proof URL</Label><Input value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="Optional delivery proof link" /></div>
            <div><Label>Note</Label><Textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder="Customer-visible update or internal proof note" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStatusDialog({ open: false })}>Cancel</Button><Button onClick={handleManualStatus} disabled={actionLoading}>{actionLoading ? 'Saving...' : 'Update Status'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedTicket?.subject}</DialogTitle>
            <DialogDescription>{selectedTicket?.reference} · {selectedTicket ? userName(selectedTicket.user) : ''}</DialogDescription>
          </DialogHeader>
          {selectedTicket && (
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm text-slate-500">{selectedTicket.message}</p>
                </div>
                <div className="max-h-56 space-y-2 overflow-auto">
                  {(selectedTicket.replies || []).map((reply, index) => (
                    <div key={`${reply.createdAt}-${index}`} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{reply.authorType || 'customer'}</span><span>{formatDate(reply.createdAt)}</span></div>
                      <p className="text-sm">{reply.message}</p>
                    </div>
                  ))}
                </div>
                <Textarea value={supportReply} onChange={(event) => setSupportReply(event.target.value)} placeholder="Reply to customer" />
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Badge className={priorityClass(selectedTicket.priority)}>{selectedTicket.priority}</Badge>
                  <Badge className={statusClass(selectedTicket.status)}>{selectedTicket.status}</Badge>
                </div>
                <div><Label>Status</Label><Select value={selectedTicket.status} onValueChange={(status) => handleTicketUpdate(selectedTicket, { status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="waiting_customer">Waiting customer</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></div>
                <div><Label>Priority</Label><Select value={selectedTicket.priority} onValueChange={(priority) => handleTicketUpdate(selectedTicket, { priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
                <div><Label>Admin notes</Label><Textarea value={supportNote} onChange={(event) => setSupportNote(event.target.value)} placeholder="Internal support notes" /></div>
                <Button variant="outline" onClick={() => handleTicketUpdate(selectedTicket, { assignedTo: user?.email || user?.id, adminNotes: supportNote })} disabled={actionLoading} className="w-full"><ShieldCheck className="h-4 w-4" />Assign to me</Button>
                <Button onClick={handleTicketReply} disabled={actionLoading || !supportReply.trim()} className="w-full"><Headphones className="h-4 w-4" />Send Reply</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
