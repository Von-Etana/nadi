import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Menu, X, User, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const Navigation = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const hasVerifiedUser = isAuthenticated && !!user;
  
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Home', href: '#home' },
    { name: 'Services', href: '#services' },
    { name: 'Features', href: '#features' },
    { name: 'How It Works', href: '#how-it-works' },
    { name: 'FAQ', href: '#faq' },
  ];

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? 'glass shadow-lg py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link
            to="/"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-3 group"
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden transition-transform duration-300 group-hover:scale-110">
              <img src="/logo.jpg" alt="Kerma.cash" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-[#1a1a1a] leading-tight">Kerma</span>
              <span className="text-xs text-[#ea580c] font-medium -mt-1">cash</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(link.href);
                }}
                className="text-sm font-medium text-[#333] hover:text-[#ea580c] transition-colors duration-300 link-underline"
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {hasVerifiedUser ? (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#ea580c]/10 text-[#ea580c] hover:bg-[#ea580c]/20 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#ea580c] to-[#f97316] flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium">{user?.firstName}</span>
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { logout(); navigate('/'); }}
                  className="rounded-full border-[#e2e2e2] hover:border-red-400 hover:text-red-500"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-[#333] hover:text-[#ea580c] transition-colors"
                >
                  Login
                </Link>
                <Link to="/register">
                  <Button className="bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white px-6 py-2 rounded-full font-medium btn-magnetic animate-pulse-glow">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6 text-[#1a1a1a]" />
            ) : (
              <Menu className="w-6 h-6 text-[#1a1a1a]" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-500 ${
            isMobileMenuOpen ? 'max-h-96 mt-4' : 'max-h-0'
          }`}
        >
          <div className="bg-white rounded-2xl shadow-xl p-4 space-y-2">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(link.href);
                }}
                className="block px-4 py-3 rounded-xl text-[#333] hover:bg-[#f5f5f5] hover:text-[#ea580c] transition-colors duration-300 font-medium"
              >
                {link.name}
              </a>
            ))}
            
            {hasVerifiedUser ? (
              <>
                <button
                  onClick={() => {
                    navigate('/dashboard');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#ea580c]/10 text-[#ea580c] font-medium text-left"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => {
                    logout();
                    navigate('/');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 font-medium text-left"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    navigate('/login');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl text-[#333] hover:bg-[#f5f5f5] font-medium text-left"
                >
                  Login
                </button>
                <Button
                  className="w-full bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white py-3 rounded-xl font-medium mt-2"
                  onClick={() => {
                    navigate('/register');
                    setIsMobileMenuOpen(false);
                  }}
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
