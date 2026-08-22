import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { driverApi } from '@/services/api';
import {
  Truck,
  Phone,
  Navigation,
  CheckCircle,
  Package,
  Fuel,
  RefreshCw,
  LogOut,
  MapPin,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface DriverTask {
  id: string;
  orderNumber: string;
  module: 'logistics' | 'fuel';
  title: string;
  status: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  what3words?: string;
  amount: number;
  notes?: string;
  createdAt: string;
  proofOfDelivery?: any;
}

export const DriverPortal: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Delivery POD Modal State
  const [podTask, setPodTask] = useState<DriverTask | null>(null);
  const [podUrl, setPodUrl] = useState('');
  const [podNote, setPodNote] = useState('');

  const loadTasks = async () => {
    try {
      setLoading(true);
      const res = await driverApi.getTasks();
      if (res.data?.success) {
        setTasks(res.data.tasks || []);
      } else {
        toast.error(res.error || 'Failed to load driver tasks');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error fetching tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleUpdateStatus = async (task: DriverTask, nextStatus: string, podData?: { proofUrl?: string; note?: string }) => {
    try {
      setActionLoading(true);
      const res = await driverApi.updateTask(task.id, {
        status: nextStatus,
        module: task.module,
        proofUrl: podData?.proofUrl,
        note: podData?.note
      });

      if (res.data?.success) {
        toast.success(`Task updated: ${nextStatus.replace('_', ' ').toUpperCase()}`);
        setPodTask(null);
        setPodUrl('');
        setPodNote('');
        await loadTasks();
      } else {
        toast.error(res.error || 'Failed to update task status');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const activeTasks = tasks.filter((t) => !['delivered', 'completed', 'cancelled', 'failed'].includes(t.status));
  const completedTasks = tasks.filter((t) => ['delivered', 'completed', 'cancelled', 'failed'].includes(t.status));

  const displayedTasks = (activeTab === 'active' ? activeTasks : completedTasks).filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.orderNumber.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      t.deliveryAddress.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Delivered</Badge>;
      case 'in_transit':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">In Transit</Badge>;
      case 'picked_up':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Picked Up</Badge>;
      case 'accepted':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300">Accepted</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-800 border-slate-300 capitalize">{status.replace('_', ' ')}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Driver Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">Driver & Courier Dispatch</h1>
              <p className="text-xs text-slate-500">
                {user?.firstName ? `${user.firstName} ${user.lastName || ''}` : user?.email} · Nadi Operations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={loadTasks} disabled={loading} className="text-slate-600">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { logout(); navigate('/login'); }} className="text-red-600">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-3">
          <div
            onClick={() => setActiveTab('active')}
            className={`cursor-pointer p-4 rounded-2xl border transition-all ${
              activeTab === 'active'
                ? 'bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-500/20'
                : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className={`text-xs font-semibold ${activeTab === 'active' ? 'text-orange-100' : 'text-slate-500'}`}>
              Active Runs
            </p>
            <h3 className="text-2xl font-black">{activeTasks.length}</h3>
          </div>
          <div
            onClick={() => setActiveTab('completed')}
            className={`cursor-pointer p-4 rounded-2xl border transition-all ${
              activeTab === 'completed'
                ? 'bg-slate-900 text-white border-slate-950 shadow-md'
                : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className={`text-xs font-semibold ${activeTab === 'completed' ? 'text-slate-400' : 'text-slate-500'}`}>
              Completed
            </p>
            <h3 className="text-2xl font-black">{completedTasks.length}</h3>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, address..."
            className="rounded-xl pl-4 bg-white border-slate-200 shadow-sm"
          />
        </div>

        {/* Task Cards List */}
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-600" />
            <p className="text-xs text-slate-500">Loading your assigned runs...</p>
          </div>
        ) : displayedTasks.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-2 border-slate-200 text-center p-8 bg-white/60">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Package className="h-6 w-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">No {activeTab} delivery runs found</h4>
            <p className="text-xs text-slate-500 mt-1">
              {activeTab === 'active'
                ? 'You have fulfilled all assigned runs. Great job!'
                : 'No historical deliveries recorded yet.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {displayedTasks.map((task) => (
              <Card key={task.id} className="rounded-2xl shadow-sm border border-slate-200 overflow-hidden bg-white">
                <CardHeader className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-row items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {task.module === 'fuel' ? (
                        <Fuel className="h-4 w-4 text-orange-600" />
                      ) : (
                        <Package className="h-4 w-4 text-blue-600" />
                      )}
                      <span className="font-mono text-xs font-bold text-slate-900">{task.orderNumber}</span>
                    </div>
                    <CardDescription className="text-xs text-slate-600 font-medium">{task.title}</CardDescription>
                  </div>
                  <div>{getStatusBadge(task.status)}</div>
                </CardHeader>

                <CardContent className="p-4 space-y-3 text-xs">
                  {/* Customer Contact */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <p className="font-bold text-slate-900">{task.customerName}</p>
                      <p className="text-slate-500 text-[11px]">{task.customerPhone || 'No direct phone'}</p>
                    </div>
                    {task.customerPhone && (
                      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
                        <a href={`tel:${task.customerPhone}`}>
                          <Phone className="h-3.5 w-3.5 mr-1" />
                          Call
                        </a>
                      </Button>
                    )}
                  </div>

                  {/* Route & Address */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-slate-400 mt-1" />
                      <div>
                        <span className="text-slate-400 font-medium">Pickup: </span>
                        <span className="text-slate-700">{task.pickupAddress}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="text-slate-900 font-semibold">Deliver to: </span>
                        <span className="text-slate-800 font-medium">{task.deliveryAddress}</span>
                        {task.what3words && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-red-600 font-mono">
                            <span>///{task.what3words.replace('///', '')}</span>
                            <a
                              href={`https://what3words.com/${task.what3words.replace('///', '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline hover:text-red-700 inline-flex items-center"
                            >
                              <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Navigation Shortcut */}
                  <div className="pt-1">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 text-xs"
                    >
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          task.what3words ? `///${task.what3words}` : task.deliveryAddress
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Navigation className="h-3.5 w-3.5 text-blue-600" />
                        Open in Google Maps Navigation
                      </a>
                    </Button>
                  </div>

                  {/* Action Workflow Buttons */}
                  {activeTab === 'active' && (
                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-2 sm:flex-row">
                      {['pending', 'assigned', 'processing'].includes(task.status) && (
                        <Button
                          disabled={actionLoading}
                          onClick={() => handleUpdateStatus(task, 'accepted')}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold"
                        >
                          Accept Run
                        </Button>
                      )}

                      {task.status === 'accepted' && (
                        <Button
                          disabled={actionLoading}
                          onClick={() => handleUpdateStatus(task, 'picked_up')}
                          className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold"
                        >
                          Confirm Pick Up
                        </Button>
                      )}

                      {task.status === 'picked_up' && (
                        <Button
                          disabled={actionLoading}
                          onClick={() => handleUpdateStatus(task, 'in_transit')}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold"
                        >
                          Depart (In Transit)
                        </Button>
                      )}

                      {task.status === 'in_transit' && (
                        <Button
                          disabled={actionLoading}
                          onClick={() => setPodTask(task)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold"
                        >
                          <CheckCircle className="h-4 w-4 mr-1.5" />
                          Mark Delivered (Submit Proof)
                        </Button>
                      )}
                    </div>
                  )}

                  {/* POD Preview if completed */}
                  {task.proofOfDelivery && (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px] space-y-1">
                      <p className="font-semibold flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Proof of Delivery Recorded
                      </p>
                      {task.proofOfDelivery.note && <p>Note: {task.proofOfDelivery.note}</p>}
                      {task.proofOfDelivery.url && (
                        <a
                          href={task.proofOfDelivery.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline text-emerald-900"
                        >
                          View Delivery Photo / Receipt
                        </a>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Proof of Delivery (POD) Dialog */}
      <Dialog open={!!podTask} onOpenChange={(open) => !open && setPodTask(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Proof of Delivery (POD)</DialogTitle>
            <DialogDescription>
              Record recipient confirmation or attach photo proof before completing order #{podTask?.orderNumber}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-medium">Delivery Photo / Document URL</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  value={podUrl}
                  onChange={(e) => setPodUrl(e.target.value)}
                  placeholder="https://..."
                  className="rounded-xl text-xs"
                />
              </div>
              <span className="text-[10px] text-slate-400">Photo of signed package / fuel meter reading</span>
            </div>

            <div>
              <Label className="text-xs font-medium">Delivery Note / Recipient Name</Label>
              <Input
                value={podNote}
                onChange={(e) => setPodNote(e.target.value)}
                placeholder="e.g. Received by security guard John"
                className="rounded-xl text-xs mt-1"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setPodTask(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              disabled={actionLoading}
              onClick={() => {
                if (podTask) {
                  handleUpdateStatus(podTask, 'delivered', { proofUrl: podUrl, note: podNote });
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Confirm Delivery & Close Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DriverPortal;
