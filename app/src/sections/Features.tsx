import { useEffect, useRef } from 'react';
import { 
  Coins,
  Truck,
  User,
  Calendar,
  MapPin,
  Shield,
  Zap,
  Building2,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const Features = () => {
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

    const elements = sectionRef.current?.querySelectorAll('.reveal, .reveal-scale');
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const features = [
    {
      icon: Coins,
      title: 'Pay with Crypto, Fiat, or Gift Cards',
      description: 'Transact using any currency or asset class. Fund, convert, and spend cryptocurrency or gift card balances instantly.',
      color: 'from-orange-500 to-amber-500',
    },
    {
      icon: Truck,
      title: 'Order Deliveries Instantly',
      description: 'Book immediate local dispatch or scheduled same-day shipments with multiple delivery speeds.',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: User,
      title: 'Hire a Personal Shopper',
      description: 'Get things bought and delivered directly to your doorstep by professional shopping assistants.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: Calendar,
      title: 'Delegate Everyday Errands',
      description: 'Delegate payments, document deliveries, pickups, and tasks to focus on what matters most.',
      color: 'from-green-500 to-emerald-500',
    },
    {
      icon: MapPin,
      title: 'Track Orders in Real Time',
      description: 'Follow the live status of your deliveries and tasks with precision tracking codes.',
      color: 'from-red-500 to-rose-500',
    },
    {
      icon: Shield,
      title: 'Secure Digital Wallet',
      description: 'Safeguard your assets with bank-grade security, biometric integrations, and multi-signature authorization.',
      color: 'from-indigo-500 to-violet-500',
    },
    {
      icon: Zap,
      title: 'Fast and Reliable Service',
      description: 'Experience instant transaction settlements, automated rate conversions, and speedy logistical dispatches.',
      color: 'from-yellow-500 to-amber-600',
    },
    {
      icon: Building2,
      title: 'Business-Friendly Solutions',
      description: 'Streamline corporate deliveries, invoice clients, accept multi-asset payments, and scale operations.',
      color: 'from-teal-500 to-emerald-600',
    },
  ];

  return (
    <section id="features" ref={sectionRef} className="relative w-full py-20 lg:py-32 bg-[#f5f5f5] overflow-hidden">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="gradient-orb w-[500px] h-[500px] bg-[#ea580c]/10 -top-40 -right-40 animate-blob" />
        <div className="gradient-orb w-[400px] h-[400px] bg-[#7c3aed]/10 bottom-0 left-0 animate-blob" style={{ animationDelay: '-4s' }} />
      </div>

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-12 xl:px-20">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-2 rounded-full bg-white text-[#ea580c] text-sm font-medium mb-4 reveal">
            Benefits
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-4 reveal stagger-1">
            Why <span className="text-gradient">Kerma Cash?</span>
          </h2>
          <p className="text-lg text-[#666] reveal stagger-2">
            The multi-asset ecosystem designed to make payments and deliveries completely frictionless.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative bg-white rounded-3xl p-8 shadow-sm hover:shadow-xl transition-all duration-500 card-3d reveal-scale"
              style={{ transitionDelay: `${index * 0.05}s` }}
            >
              {/* Icon */}
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className="w-7 h-7 text-white" />
              </div>

              {/* Content */}
              <h3 className="text-lg font-bold text-[#1a1a1a] mb-3 group-hover:text-[#ea580c] transition-colors">
                {feature.title}
              </h3>
              <p className="text-sm text-[#666] leading-relaxed">
                {feature.description}
              </p>

              {/* Hover Arrow */}
              <div className="mt-6 flex items-center text-[#ea580c] font-medium opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all duration-300">
                <span className="text-sm">Learn more</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </div>

              {/* Decorative Gradient */}
              <div className={`absolute -z-10 inset-0 rounded-3xl bg-gradient-to-r ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 reveal">
          <p className="text-[#666] mb-4">Ready to experience these features?</p>
          <Button className="bg-gradient-primary text-white px-8 py-6 rounded-full font-semibold text-lg btn-magnetic">
            Get Started Now
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Features;
