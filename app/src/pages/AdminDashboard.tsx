import { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Gift, 
  Truck, 
  Fuel, 
  Zap, 
  TrendingUp,
  Bell,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  DollarSign,
  CreditCard,
  Bitcoin,
  Package,
  Settings,
  LogOut,
  Menu,
  X,
  Download,
  Eye,
  Edit
} from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Order {
  id: string;
  type: string;
  user: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  date: string;
  details: any;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  status: 'active' | 'suspended' | 'banned';
  joined: string;
  kycStatus: 'pending' | 'verified' | 'rejected';
}

interface Transaction {
  id: string;
  user: string;
  type: string;
  amount: number;
  status: 'success' | 'pending' | 'failed';
  date: string;
  reference: string;
}

interface Stats {
  totalUsers: number;
  totalRevenue: number;
  totalTransactions: number;
  pendingOrders: number;
  todayRevenue: number;
  activeUsers: number;
}

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Mock data - replace with API calls
  const [stats] = useState<Stats>({
    totalUsers: 1247,
    totalRevenue: 45892050,
    totalTransactions: 8934,
    pendingOrders: 23,
    todayRevenue: 1250000,
    activeUsers: 89
  });

  const [orders, setOrders] = useState<Order[]>([
    {
      id: 'ORD-001',
      type: 'Gift Card',
      user: 'john.doe@email.com',
      amount: 50000,
      status: 'pending',
      date: '2024-03-07 14:30',
      details: { cardType: 'Amazon', cardValue: 100 }
    },
    {
      id: 'ORD-002',
      type: 'Crypto Buy',
      user: 'jane.smith@email.com',
      amount: 150000,
      status: 'processing',
      date: '2024-03-07 13:45',
      details: { crypto: 'BTC', amount: 0.0025 }
    },
    {
      id: 'ORD-003',
      type: 'Utility Payment',
      user: 'mike.jones@email.com',
      amount: 15000,
      status: 'completed',
      date: '2024-03-07 12:20',
      details: { type: 'PHCN', meterNumber: '123456789' }
    },
    {
      id: 'ORD-004',
      type: 'Delivery',
      user: 'sarah.wilson@email.com',
      amount: 8500,
      status: 'pending',
      date: '2024-03-07 11:15',
      details: { pickup: 'Lekki', dropoff: 'Ikeja', item: 'Documents' }
    },
    {
      id: 'ORD-005',
      type: 'Fuel Delivery',
      user: 'david.brown@email.com',
      amount: 25000,
      status: 'completed',
      date: '2024-03-07 10:00',
      details: { fuelType: 'Petrol', liters: 20, location: 'Victoria Island' }
    },
  ]);

  const [users, setUsers] = useState<User[]>([
    {
      id: 'USR-001',
      name: 'John Doe',
      email: 'john.doe@email.com',
      phone: '+2348012345678',
      balance: 125000,
      status: 'active',
      joined: '2024-01-15',
      kycStatus: 'verified'
    },
    {
      id: 'USR-002',
      name: 'Jane Smith',
      email: 'jane.smith@email.com',
      phone: '+2348098765432',
      balance: 75000,
      status: 'active',
      joined: '2024-02-01',
      kycStatus: 'pending'
    },
    {
      id: 'USR-003',
      name: 'Mike Jones',
      email: 'mike.jones@email.com',
      phone: '+2348056789012',
      balance: 0,
      status: 'suspended',
      joined: '2024-01-20',
      kycStatus: 'rejected'
    },
  ]);

  const [transactions] = useState<Transaction[]>([
    {
      id: 'TRX-001',
      user: 'john.doe@email.com',
      type: 'Wallet Funding',
      amount: 50000,
      status: 'success',
      date: '2024-03-07 14:30',
      reference: 'PAY-123456'
    },
    {
      id: 'TRX-002',
      user: 'jane.smith@email.com',
      type: 'Crypto Purchase',
      amount: 150000,
      status: 'success',
      date: '2024-03-07 13:45',
      reference: 'CRY-789012'
    },
    {
      id: 'TRX-003',
      user: 'mike.jones@email.com',
      type: 'Utility Payment',
      amount: 15000,
      status: 'pending',
      date: '2024-03-07 12:20',
      reference: 'UTL-345678'
    },
  ]);

  const handleOrderAction = (orderId: string, action: 'approve' | 'reject' | 'process') => {
    setOrders(orders.map(order => {
      if (order.id === orderId) {
        return {
          ...order,
          status: action === 'approve' ? 'completed' : action === 'reject' ? 'cancelled' : 'processing'
        };
      }
      return order;
    }));
    toast.success(`Order ${action}ed successfully`);
    setOrderDialogOpen(false);
  };

  const handleUserAction = (userId: string, action: 'suspend' | 'activate' | 'ban') => {
    setUsers(users.map(user => {
      if (user.id === userId) {
        return {
          ...user,
          status: action === 'suspend' ? 'suspended' : action === 'ban' ? 'banned' : 'active'
        };
      }
      return user;
    }));
    toast.success(`User ${action}d successfully`);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      success: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      active: 'bg-green-100 text-green-800',
      suspended: 'bg-yellow-100 text-yellow-800',
      banned: 'bg-red-100 text-red-800',
      verified: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'transactions', label: 'Transactions', icon: CreditCard },
    { id: 'giftcards', label: 'Gift Cards', icon: Gift },
    { id: 'crypto', label: 'Crypto', icon: Bitcoin },
    { id: 'logistics', label: 'Logistics', icon: Truck },
    { id: 'fuel', label: 'Fuel & Gas', icon: Fuel },
    { id: 'utilities', label: 'Utilities', icon: Zap },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Users</p>
                <p className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Transactions</p>
                <p className="text-2xl font-bold">{stats.totalTransactions.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Orders</p>
                <p className="text-2xl font-bold">{stats.pendingOrders}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Today's Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.todayRevenue)}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <ArrowUpRight className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Users</p>
                <p className="text-2xl font-bold">{stats.activeUsers}</p>
              </div>
              <div className="p-3 bg-cyan-100 rounded-lg">
                <LayoutDashboard className="w-6 h-6 text-cyan-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setActiveTab('orders')}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.slice(0, 5).map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.id}</TableCell>
                    <TableCell>{order.type}</TableCell>
                    <TableCell>{formatCurrency(order.amount)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.slice(0, 5).map((trx) => (
                  <TableRow key={trx.id}>
                    <TableCell className="font-medium">{trx.reference}</TableCell>
                    <TableCell>{trx.type}</TableCell>
                    <TableCell>{formatCurrency(trx.amount)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(trx.status)}>
                        {trx.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderOrders = () => (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle>All Orders</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders
              .filter(order => 
                (statusFilter === 'all' || order.status === statusFilter) &&
                (order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                 order.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
                 order.type.toLowerCase().includes(searchQuery.toLowerCase()))
              )
              .map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.id}</TableCell>
                <TableCell>{order.type}</TableCell>
                <TableCell>{order.user}</TableCell>
                <TableCell>{formatCurrency(order.amount)}</TableCell>
                <TableCell>
                  <Badge className={getStatusBadge(order.status)}>
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell>{order.date}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedOrder(order);
                        setOrderDialogOpen(true);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {order.status === 'pending' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-green-600"
                          onClick={() => handleOrderAction(order.id, 'approve')}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600"
                          onClick={() => handleOrderAction(order.id, 'reject')}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderUsers = () => (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle>User Management</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search users..."
                className="pl-10 w-64"
              />
            </div>
            <Button variant="outline" size="icon">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>KYC Status</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.id}</TableCell>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{formatCurrency(user.balance)}</TableCell>
                <TableCell>
                  <Badge className={getStatusBadge(user.kycStatus)}>
                    {user.kycStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={getStatusBadge(user.status)}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Edit className="w-4 h-4" />
                    </Button>
                    {user.status === 'active' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-yellow-600"
                        onClick={() => handleUserAction(user.id, 'suspend')}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-green-600"
                        onClick={() => handleUserAction(user.id, 'activate')}
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderTransactions = () => (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle>Transaction History</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search transactions..."
                className="pl-10 w-64"
              />
            </div>
            <Button variant="outline" size="icon">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((trx) => (
              <TableRow key={trx.id}>
                <TableCell className="font-medium">{trx.id}</TableCell>
                <TableCell>{trx.reference}</TableCell>
                <TableCell>{trx.user}</TableCell>
                <TableCell>{trx.type}</TableCell>
                <TableCell>{formatCurrency(trx.amount)}</TableCell>
                <TableCell>
                  <Badge className={getStatusBadge(trx.status)}>
                    {trx.status}
                  </Badge>
                </TableCell>
                <TableCell>{trx.date}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-white shadow-lg transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:w-64`}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">N</span>
              </div>
              <div>
                <h1 className="font-bold text-lg">Nadi Digital</h1>
                <p className="text-xs text-gray-500">Admin Panel</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === item.id
                      ? 'bg-orange-50 text-orange-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t">
            <button className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Header */}
        <header className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <h2 className="text-xl font-semibold capitalize">{activeTab}</h2>
            </div>
            <div className="flex items-center gap-4">
              <button className="relative p-2 hover:bg-gray-100 rounded-lg">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-orange-600 font-semibold">A</span>
                </div>
                <div className="hidden md:block">
                  <p className="font-medium">Admin User</p>
                  <p className="text-sm text-gray-500">Super Admin</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'orders' && renderOrders()}
          {activeTab === 'users' && renderUsers()}
          {activeTab === 'transactions' && renderTransactions()}
          {['giftcards', 'crypto', 'logistics', 'fuel', 'utilities'].includes(activeTab) && (
            <Card>
              <CardHeader>
                <CardTitle className="capitalize">{activeTab} Management</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500">This section is under development. Use the Orders tab to manage {activeTab} orders.</p>
              </CardContent>
            </Card>
          )}
          {activeTab === 'settings' && (
            <Card>
              <CardHeader>
                <CardTitle>Admin Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500">Settings configuration coming soon.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Order Details Dialog */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Order ID: {selectedOrder?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Type</p>
                  <p className="font-medium">{selectedOrder.type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Amount</p>
                  <p className="font-medium">{formatCurrency(selectedOrder.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">User</p>
                  <p className="font-medium">{selectedOrder.user}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium">{selectedOrder.date}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <Badge className={getStatusBadge(selectedOrder.status)}>
                    {selectedOrder.status}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-2">Order Details</p>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <pre className="text-sm overflow-x-auto">
                    {JSON.stringify(selectedOrder.details, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {selectedOrder?.status === 'pending' && (
              <>
                <Button
                  variant="outline"
                  className="text-red-600"
                  onClick={() => handleOrderAction(selectedOrder.id, 'reject')}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600"
                  onClick={() => handleOrderAction(selectedOrder.id, 'process')}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Process
                </Button>
                <Button
                  className="bg-green-500 hover:bg-green-600"
                  onClick={() => handleOrderAction(selectedOrder.id, 'approve')}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
