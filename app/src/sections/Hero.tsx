import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Users, Globe, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Hero = () => {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!imageRef.current) return;
      const rect = imageRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const rotateX = (e.clientY - centerY) / 50;
      const rotateY = (centerX - e.clientX) / 50;
      imageRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
    };

    const handleMouseLeave = () => {
      if (!imageRef.current) return;
      imageRef.current.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
    };

    const heroElement = heroRef.current;
    if (heroElement) {
      heroElement.addEventListener('mousemove', handleMouseMove);
      heroElement.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      if (heroElement) {
        heroElement.removeEventListener('mousemove', handleMouseMove);
        heroElement.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, []);

  const stats = [
    { icon: Users, value: '500K+', label: 'Active Users' },
    { icon: Globe, value: '36', label: 'States in Nigeria' },
    { icon: Shield, value: '99.9%', label: 'Uptime' },
    { icon: Zap, value: '24/7', label: 'Support' },
  ];

  return (
    <section
      id="home"
      ref={heroRef}
      className="relative min-h-screen w-full overflow-hidden bg-white pt-20"
    >
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="gradient-orb w-[600px] h-[600px] bg-[#4f46e5] -top-40 -left-40 animate-blob" />
        <div className="gradient-orb w-[500px] h-[500px] bg-[#7c3aed] top-1/2 -right-40 animate-blob" style={{ animationDelay: '-4s' }} />
        <div className="gradient-orb w-[400px] h-[400px] bg-[#ec4899] bottom-0 left-1/3 animate-blob" style={{ animationDelay: '-2s' }} />
      </div>

      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-12 xl:px-20 py-12 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center min-h-[calc(100vh-160px)]">
          {/* Left Content */}
          <div className="space-y-8">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#ea580c]/10 text-[#ea580c] text-sm font-medium animate-slide-up">
              <span className="w-2 h-2 rounded-full bg-[#ea580c] animate-pulse" />
              Welcome to Kerma.cash
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-[#1a1a1a] leading-tight">
              <span className="block animate-slide-up" style={{ animationDelay: '0.1s' }}>
                The Digital Wallet
              </span>
              <span className="block animate-slide-up text-gradient" style={{ animationDelay: '0.2s' }}>
                That Gets
              </span>
              <span className="block animate-slide-up" style={{ animationDelay: '0.3s' }}>
                Things Done.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-[#666] max-w-xl animate-slide-up" style={{ animationDelay: '0.4s' }}>
              Pay with Crypto, Fiat, or Gift Cards, order deliveries, hire personal shoppers, delegate errands, and track your orders in real time.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 animate-slide-up" style={{ animationDelay: '0.5s' }}>
              <Button 
                className="bg-gradient-primary text-white px-8 py-6 rounded-full font-semibold text-lg btn-magnetic group"
                onClick={() => navigate('/register')}
              >
                Get Started
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                variant="outline"
                className="px-8 py-6 rounded-full font-semibold text-lg border-2 border-[#e2e2e2] hover:border-[#ea580c] hover:text-[#ea580c] transition-colors"
                onClick={() => navigate('/login')}
              >
                Login
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-8 animate-slide-up" style={{ animationDelay: '0.6s' }}>
              {stats.map((stat, index) => (
                <div key={index} className="text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                    <stat.icon className="w-4 h-4 text-[#ea580c]" />
                    <span className="text-2xl font-bold text-[#1a1a1a]">{stat.value}</span>
                  </div>
                  <p className="text-sm text-[#999]">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Content - Dashboard Image */}
          <div className="relative lg:pl-8">
            <div
              ref={imageRef}
              className="relative transition-transform duration-300 ease-out"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Main Dashboard Image */}
              <div className="relative rounded-3xl overflow-hidden shadow-2xl animate-slide-in-right">
                <img
                  src="/hero-dashboard.jpg"
                  alt="Kerma Dashboard"
                  className="w-full h-auto"
                />
                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#ea580c]/10 to-transparent" />
              </div>

              {/* Floating Payment Success Card */}
              <div className="absolute -bottom-8 -left-8 w-48 sm:w-64 animate-float-slow animate-slide-in-right" style={{ animationDelay: '0.8s' }}>
                <img
                  src="/payment-success.png"
                  alt="Payment Success"
                  className="w-full h-auto rounded-2xl shadow-xl"
                />
              </div>

              {/* Floating Badge */}
              <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-xl p-4 animate-float" style={{ animationDelay: '0.3s' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a1a]">CBN Licensed</p>
                    <p className="text-xs text-[#999]">Secure & Regulated</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Gradient Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none" />
    </section>
  );
};

export default Hero;
