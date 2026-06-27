import { useEffect, useRef } from 'react';
import { UserPlus, Shield, Wallet, Send, Check } from 'lucide-react';

const HowItWorks = () => {
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

    const elements = sectionRef.current?.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const steps = [
    {
      number: '01',
      icon: UserPlus,
      title: 'Create Account',
      description: 'Sign up in seconds with your email or phone number. No complicated paperwork required.',
      color: 'bg-blue-500',
    },
    {
      number: '02',
      icon: Shield,
      title: 'Verify Identity',
      description: 'Quick and secure verification process to keep your account safe and compliant.',
      color: 'bg-green-500',
    },
    {
      number: '03',
      icon: Wallet,
      title: 'Add Funds',
      description: 'Top up your wallet via bank transfer, credit card, or cryptocurrency deposit.',
      color: 'bg-purple-500',
    },
    {
      number: '04',
      icon: Send,
      title: 'Send Money',
      description: 'Transfer to anyone, anywhere, instantly. Pay bills, trade crypto, or order services.',
      color: 'bg-orange-500',
    },
  ];

  return (
    <section id="how-it-works" ref={sectionRef} className="relative w-full py-20 lg:py-32 bg-white overflow-hidden">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-12 xl:px-20">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-2 rounded-full bg-[#4f46e5]/10 text-[#4f46e5] text-sm font-medium mb-4 reveal">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-4 reveal stagger-1">
            Get Started in{' '}
            <span className="text-gradient">Minutes</span>
          </h2>
          <p className="text-lg text-[#666] reveal stagger-2">
            Four simple steps to start sending money globally and accessing all our services.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting Line (Desktop) */}
          <div className="hidden lg:block absolute top-24 left-0 right-0 h-0.5 bg-[#e2e2e2]">
            <div className="absolute inset-0 bg-gradient-to-r from-[#4f46e5] via-[#7c3aed] to-[#4f46e5] opacity-50" />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            {steps.map((step, index) => (
              <div
                key={index}
                className="relative reveal"
                style={{ transitionDelay: `${index * 0.15}s` }}
              >
                {/* Step Card */}
                <div className="relative bg-white rounded-3xl p-6 lg:p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-[#e2e2e2] group">
                  {/* Number Badge */}
                  <div className={`absolute -top-4 left-6 w-10 h-10 rounded-full ${step.color} flex items-center justify-center text-white font-bold text-sm shadow-lg group-hover:scale-110 transition-transform`}>
                    {step.number}
                  </div>

                  {/* Icon */}
                  <div className="w-16 h-16 rounded-2xl bg-[#f5f5f5] flex items-center justify-center mb-6 mt-4 group-hover:bg-[#4f46e5]/10 transition-colors">
                    <step.icon className="w-8 h-8 text-[#4f46e5]" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-bold text-[#1a1a1a] mb-3">
                    {step.title}
                  </h3>
                  <p className="text-[#666] text-sm leading-relaxed">
                    {step.description}
                  </p>

                  {/* Checkmark */}
                  <div className="mt-6 flex items-center gap-2 text-green-500">
                    <Check className="w-5 h-5" />
                    <span className="text-sm font-medium">Quick & Easy</span>
                  </div>
                </div>

                {/* Arrow (Desktop, except last) */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-24 -right-3 z-10">
                    <div className="w-6 h-6 rounded-full bg-[#4f46e5] flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="mt-20 grid grid-cols-2 lg:grid-cols-4 gap-6 reveal">
          {[
            { value: '2', label: 'Minutes to Sign Up' },
            { value: '0', label: 'Hidden Fees' },
            { value: '150+', label: 'Countries Supported' },
            { value: '24/7', label: 'Customer Support' },
          ].map((stat, index) => (
            <div key={index} className="text-center p-6 rounded-2xl bg-[#f5f5f5]">
              <p className="text-3xl lg:text-4xl font-bold text-gradient mb-1">{stat.value}</p>
              <p className="text-sm text-[#666]">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
