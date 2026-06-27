import { useEffect, useRef } from 'react';
import { 
  Zap, 
  TrendingDown, 
  Globe, 
  Headphones, 
  Shield, 
  Bell 
} from 'lucide-react';

const Benefits = () => {
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

  const benefits = [
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Transfers complete in seconds, not days. Send money instantly to anyone, anywhere.',
      color: 'from-yellow-400 to-orange-500',
    },
    {
      icon: TrendingDown,
      title: 'Low Fees',
      description: 'Up to 80% cheaper than traditional banks. Transparent pricing with no hidden charges.',
      color: 'from-green-400 to-emerald-500',
    },
    {
      icon: Globe,
      title: 'Global Reach',
      description: 'Send to 150+ countries worldwide. Support for 50+ currencies at real-time rates.',
      color: 'from-blue-400 to-cyan-500',
    },
    {
      icon: Headphones,
      title: '24/7 Support',
      description: 'Round-the-clock customer assistance. Our team is always here to help you.',
      color: 'from-purple-400 to-pink-500',
    },
    {
      icon: Shield,
      title: 'Bank-Grade Security',
      description: '256-bit encryption and advanced fraud protection. Your money is always safe.',
      color: 'from-red-400 to-rose-500',
    },
    {
      icon: Bell,
      title: 'Instant Notifications',
      description: 'Real-time transaction updates. Stay informed about every activity on your account.',
      color: 'from-indigo-400 to-violet-500',
    },
  ];

  return (
    <section ref={sectionRef} className="relative w-full py-20 lg:py-32 bg-[#1a1a1a] overflow-hidden">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="gradient-orb w-[600px] h-[600px] bg-[#4f46e5] -top-40 -left-40 animate-blob" />
        <div className="gradient-orb w-[500px] h-[500px] bg-[#7c3aed] top-1/2 -right-40 animate-blob" style={{ animationDelay: '-4s' }} />
        <div className="gradient-orb w-[400px] h-[400px] bg-[#ec4899] bottom-0 left-1/3 animate-blob" style={{ animationDelay: '-2s' }} />
      </div>

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-12 xl:px-20">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium mb-4 reveal">
            Benefits
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 reveal stagger-1">
            Why Choose{' '}
            <span className="text-gradient">QuickPay?</span>
          </h2>
          <p className="text-lg text-gray-400 reveal stagger-2">
            Experience the future of money transfers with our cutting-edge platform designed for the modern world.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="group relative bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-500 reveal-scale"
              style={{ transitionDelay: `${index * 0.1}s` }}
            >
              {/* Icon */}
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${benefit.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <benefit.icon className="w-7 h-7 text-white" />
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold text-white mb-3 group-hover:text-[#4f46e5] transition-colors">
                {benefit.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">
                {benefit.description}
              </p>

              {/* Hover Glow */}
              <div className={`absolute -z-10 inset-0 rounded-3xl bg-gradient-to-r ${benefit.color} opacity-0 group-hover:opacity-10 blur-xl transition-opacity duration-500`} />
            </div>
          ))}
        </div>

        {/* Trust Badges */}
        <div className="mt-16 flex flex-wrap justify-center gap-8 reveal">
          {[
            'SOC 2 Certified',
            'PCI DSS Compliant',
            'GDPR Ready',
            'ISO 27001',
          ].map((badge, index) => (
            <div key={index} className="flex items-center gap-2 text-gray-400">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-sm font-medium">{badge}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
