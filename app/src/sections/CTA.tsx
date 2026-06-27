import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CTA = () => {
  const navigate = useNavigate();
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

  return (
    <section id="cta" ref={sectionRef} className="relative w-full py-20 lg:py-32 overflow-hidden">
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#4f46e5] via-[#7c3aed] to-[#4f46e5] animate-gradient" />
      
      {/* Floating Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-20 h-20 rounded-full bg-white/10 animate-float" />
        <div className="absolute top-1/4 right-20 w-16 h-16 rounded-lg bg-white/10 rotate-45 animate-float-slow" />
        <div className="absolute bottom-20 left-1/4 w-12 h-12 rounded-full bg-white/10 animate-float" style={{ animationDelay: '-2s' }} />
        <div className="absolute bottom-1/3 right-1/3 w-24 h-24 rounded-lg bg-white/10 rotate-12 animate-float-slow" style={{ animationDelay: '-4s' }} />
        <div className="absolute top-1/2 left-1/2 w-8 h-8 rounded-full bg-white/10 animate-float" style={{ animationDelay: '-1s' }} />
      </div>

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-12 xl:px-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Headline */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-6 reveal">
            Ready to Get Started?
          </h2>
          
          {/* Subheadline */}
          <p className="text-lg lg:text-xl text-white/80 mb-10 max-w-2xl mx-auto reveal stagger-1">
            Join thousands of Nigerians who trust Nadi Digital Service for their money transfers, bill payments, and everyday financial needs.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap justify-center gap-4 mb-12 reveal stagger-2">
            <Button 
              onClick={() => navigate('/register')}
              className="bg-white text-[#4f46e5] px-8 py-6 rounded-full font-semibold text-lg btn-magnetic group hover:bg-white/90"
            >
              Create Free Account
              <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/login')}
              className="border-2 border-white/30 text-white px-8 py-6 rounded-full font-semibold text-lg hover:bg-white/10 hover:border-white/50 transition-colors"
            >
              <Mail className="w-5 h-5 mr-2" />
              Contact Sales
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-8 text-white/60 reveal stagger-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">Free to join</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">No hidden fees</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">Cancel anytime</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
