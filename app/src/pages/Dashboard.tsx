import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wallet, 
  Package, 
  Receipt, 
  Gift, 
  TrendingUp, 
  Fuel, 
  History, 
  Settings, 
  Home, 
  LogOut, 
  Bell, 
  Search, 
  User 
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

// Import modular split components
import { OverviewTab } from '@/components/dashboard/OverviewTab';
import { WalletTab } from '@/components/dashboard/WalletTab';
import { DeliveryTab } from '@/components/dashboard/DeliveryTab';
import { UtilitiesTab } from '@/components/dashboard/UtilitiesTab';
import { GiftCardsTab } from '@/components/dashboard/GiftCardsTab';
import { CryptoTab } from '@/components/dashboard/CryptoTab';
import { FuelTab } from '@/components/dashboard/FuelTab';
import { HistoryTab } from '@/components/dashboard/HistoryTab';
import { SettingsTab } from '@/components/dashboard/SettingsTab';

type TabType = 'overview' | 'wallet' | 'delivery' | 'utilities' | 'giftcards' | 'crypto' | 'fuel' | 'history' | 'settings';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showBalance, setShowBalance] = useState(true);
  const [notifications] = useState(3);

  const sidebarItems = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'wallet', label: 'My Wallet', icon: Wallet },
    { id: 'delivery', label: 'Delivery', icon: Package },
    { id: 'utilities', label: 'Pay Bills', icon: Receipt },
    { id: 'giftcards', label: 'Gift Cards', icon: Gift },
    { id: 'crypto', label: 'Crypto', icon: TrendingUp },
    { id: 'fuel', label: 'Fuel & Gas', icon: Fuel },
    { id: 'history', label: 'History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // Pass defaults as initial states; real wallet and crypto balances are resolved dynamically in components
  const defaultBalance = 0.00;
  const defaultCryptoBalance = 0.00;

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#e2e2e2] fixed h-full z-20 hidden lg:block">
        {/* Logo */}
        <div className="p-6 border-b border-[#e2e2e2]">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3"
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden shadow-sm">
              <img src="/logo.jpg" alt="Kerma.cash" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-lg font-bold text-[#1a1a1a] leading-tight">Kerma</span>
              <span className="text-xs text-[#ea580c] font-semibold -mt-0.5">cash</span>
            </div>
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as TabType)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                activeTab === item.id
                  ? 'bg-gradient-primary text-white shadow-sm'
                  : 'text-[#666] hover:bg-[#f5f5f5] hover:text-[#1a1a1a]'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#e2e2e2]">
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#666] hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-semibold text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e2e2e2] z-50 px-2 py-2 shadow-lg">
        <div className="flex justify-around">
          {sidebarItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as TabType)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
                activeTab === item.id ? 'text-[#ea580c]' : 'text-[#999]'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 lg:ml-64 pb-20 lg:pb-0">
        {/* Header */}
        <header className="bg-white border-b border-[#e2e2e2] px-6 py-4 sticky top-0 z-10 shadow-xs">
          <div className="flex items-center justify-between">
            {/* Search */}
            <div className="hidden sm:flex items-center flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999]" />
                <Input
                  type="text"
                  placeholder="Search services, transactions..."
                  className="pl-12 h-12 rounded-xl border-[#e2e2e2] bg-[#f5f5f5]/80 focus:bg-white transition-colors"
                />
              </div>
            </div>

            {/* Right Side Info */}
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="relative p-2 rounded-xl hover:bg-[#f5f5f5] transition-colors"
                aria-label="Open notification settings"
                title="Open notification settings"
              >
                <Bell className="w-6 h-6 text-[#666]" />
                {notifications > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                    {notifications}
                  </span>
                )}
              </button>

              {/* User Identity Profile */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-bold text-[#1a1a1a]">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-[#999]">{user?.email}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white shadow-xs">
                  <User className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Tabs Switcher */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <OverviewTab 
              showBalance={showBalance}
              setShowBalance={setShowBalance}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === 'wallet' && (
            <WalletTab 
              balance={defaultBalance} 
              showBalance={showBalance}
              setShowBalance={setShowBalance}
            />
          )}
          {activeTab === 'delivery' && <DeliveryTab />}
          {activeTab === 'utilities' && <UtilitiesTab />}
          {activeTab === 'giftcards' && <GiftCardsTab />}
          {activeTab === 'crypto' && (
            <CryptoTab cryptoBalance={defaultCryptoBalance} />
          )}
          {activeTab === 'fuel' && <FuelTab />}
          {activeTab === 'history' && <HistoryTab />}
          {activeTab === 'settings' && <SettingsTab user={user} />}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
