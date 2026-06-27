import { useEffect, useRef } from 'react';
import { 
  Truck, 
  TrendingUp, 
  Receipt, 
  Gift, 
  Fuel,
  ArrowRight,
  Package,
  Bike,
  Bitcoin,
  CreditCard,
  Zap,
  Flame,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const Services = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    const elements = sectionRef.current?.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const services = [
    {
      id: 'logistics',
      title: 'Logistics & Delivery',
      subtitle: 'Run errands, pickup & drop off',
      description: 'From running errands to picking up and dropping off deliveries, our logistics service has you covered. Fast, reliable, and trackable across all 36 states in Nigeria.',
      icon: Truck,
      image: '/logistics-delivery.jpg',
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-50',
      features: [
        { icon: Package, text: 'Package Delivery' },
        { icon: Bike, text: 'Express Courier' },
        { icon: Zap, text: 'Same Day Delivery' },
      ],
      stats: { value: '15min', label: 'Avg. Delivery' },
    },
    {
      id: 'crypto',
      title: 'Crypto Exchange',
      subtitle: 'Trade, buy & sell digital assets',
      description: 'Trade Bitcoin, Ethereum, and 50+ cryptocurrencies with real-time rates. Buy, sell, and manage your digital assets securely with Naira integration.',
      icon: TrendingUp,
      image: '/crypto-trading.jpg',
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-50',
      features: [
        { icon: Bitcoin, text: '50+ Cryptocurrencies' },
        { icon: TrendingUp, text: 'Real-time Trading' },
        { icon: Shield, text: 'Secure Wallet' },
      ],
      stats: { value: '0.1%', label: 'Trading Fee' },
    },
    {
      id: 'utilities',
      title: 'Utility Payments',
      subtitle: 'Pay bills with cash or crypto',
      description: 'Pay your electricity (PHCN, IKEDC, EKEDC), water, DSTV, GOTV, internet, and airtime bills using your wallet balance or cryptocurrency.',
      icon: Receipt,
      image: '/utility-bills.jpg',
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-50',
      features: [
        { icon: CreditCard, text: 'Multiple Utilities' },
        { icon: Bitcoin, text: 'Crypto Payments' },
        { icon: Zap, text: 'Instant Processing' },
      ],
      stats: { value: '0%', label: 'Payment Fee' },
    },
    {
      id: 'giftcards',
      title: 'Gift Card Trading',
      subtitle: 'Buy & sell gift cards instantly',
      description: 'Trade gift cards from Amazon, Apple, Google Play, Steam, Netflix and more. Get the best Naira rates with instant payouts to your Nigerian bank account.',
      icon: Gift,
      image: '/gift-cards.jpg',
      color: 'from-orange-500 to-amber-500',
      bgColor: 'bg-orange-50',
      features: [
        { icon: Gift, text: '100+ Gift Cards' },
        { icon: TrendingUp, text: 'Best Rates' },
        { icon: Zap, text: 'Instant Payout' },
      ],
      stats: { value: '90%', label: 'Max Rate' },
    },
    {
      id: 'fuel',
      title: 'Fuel & Gas Delivery',
      subtitle: 'Emergency fuel when you need it',
      description: 'Stranded at night? Order fuel (PMS, Diesel) or cooking gas (LPG) and get it delivered to your location anywhere in Nigeria. Available 24/7 for emergencies.',
      icon: Fuel,
      image: '/fuel-delivery.jpg',
      color: 'from-red-500 to-rose-500',
      bgColor: 'bg-red-50',
      features: [
        { icon: Fuel, text: 'Fuel Delivery' },
        { icon: Flame, text: 'Cooking Gas' },
        { icon: Zap, text: '24/7 Emergency' },
      ],
      stats: { value: '15min', label: 'Emergency Response' },
    },
  ];

  return (
    <section id="services" ref={sectionRef} className="relative w-full py-20 lg:py-32 bg-white overflow-hidden">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #1a1a1a 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }}
      />

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-12 xl:px-20">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-2 rounded-full bg-[#4f46e5]/10 text-[#4f46e5] text-sm font-medium mb-4 reveal">
            Our Services
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-4 reveal stagger-1">
            All Your Financial Needs in{' '}
            <span className="text-gradient">One Place</span>
          </h2>
          <p className="text-lg text-[#666] reveal stagger-2">
            From money transfers to crypto trading, utility payments to emergency fuel delivery - Nadi Digital Service does it all.
          </p>
        </div>

        {/* Services Grid */}
        <div className="space-y-16 lg:space-y-24">
          {services.map((service, index) => (
            <div
              key={service.id}
              className={`grid lg:grid-cols-2 gap-8 lg:gap-16 items-center ${
                index % 2 === 1 ? 'lg:flex-row-reverse' : ''
              }`}
            >
              {/* Content */}
              <div className={`space-y-6 ${index % 2 === 1 ? 'lg:order-2' : ''}`}>
                <div className="reveal">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${service.bgColor} mb-4`}>
                    <service.icon className={`w-5 h-5 bg-gradient-to-r ${service.color} text-white rounded-md p-0.5`} />
                    <span className="text-sm font-medium text-[#1a1a1a]">{service.subtitle}</span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] mb-3">
                    {service.title}
                  </h3>
                  <p className="text-[#666] text-lg">
                    {service.description}
                  </p>
                </div>

                {/* Features */}
                <div className="grid grid-cols-3 gap-4 reveal stagger-1">
                  {service.features.map((feature, fIndex) => (
                    <div key={fIndex} className="text-center p-4 rounded-xl bg-[#f5f5f5] hover:bg-[#4f46e5]/5 transition-colors">
                      <feature.icon className="w-6 h-6 text-[#4f46e5] mx-auto mb-2" />
                      <p className="text-xs font-medium text-[#1a1a1a]">{feature.text}</p>
                    </div>
                  ))}
                </div>

                {/* Stats & CTA */}
                <div className="flex items-center gap-6 reveal stagger-2">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gradient">{service.stats.value}</p>
                    <p className="text-sm text-[#999]">{service.stats.label}</p>
                  </div>
                  <Button className="bg-gradient-primary text-white px-6 py-3 rounded-full font-medium btn-magnetic group">
                    Learn More
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
              </div>

              {/* Image */}
              <div className={`relative ${index % 2 === 1 ? 'lg:order-1' : ''} reveal-scale`}>
                <div className="relative rounded-3xl overflow-hidden shadow-2xl group">
                  <img
                    src={service.image}
                    alt={service.title}
                    className="w-full h-auto transition-transform duration-500 group-hover:scale-105"
                  />
                  {/* Overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-t ${service.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                </div>

                {/* Decorative Elements */}
                <div className={`absolute -z-10 w-full h-full rounded-3xl bg-gradient-to-r ${service.color} opacity-20 blur-2xl -bottom-4 -right-4`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
