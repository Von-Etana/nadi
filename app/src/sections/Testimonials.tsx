import { useEffect, useRef, useState } from 'react';
import { Quote, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Testimonials = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const testimonials = [
    {
      name: 'Sarah Johnson',
      role: 'Business Owner, Lagos',
      avatar: '/avatar-sarah.jpg',
      quote: 'Nadi Digital Service has completely transformed how I manage my business finances. Paying PHCN bills and buying DSTV subscriptions has never been easier!',
      rating: 5,
    },
    {
      name: 'Michael Chen',
      role: 'Crypto Trader, Abuja',
      avatar: '/avatar-michael.jpg',
      quote: 'The crypto exchange feature is amazing. I can trade Bitcoin and Ethereum with real-time rates, and withdraw directly to my Nigerian bank account.',
      rating: 5,
    },
    {
      name: 'Emma Williams',
      role: 'Restaurant Owner, Port Harcourt',
      avatar: '/avatar-emma.jpg',
      quote: 'I use Nadi for everything - paying suppliers, receiving payments, even ordering cooking gas for my restaurant. It is an all-in-one solution!',
      rating: 5,
    },
  ];

  const nextTestimonial = () => {
    setActiveIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setActiveIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <section ref={sectionRef} className="relative w-full py-20 lg:py-32 bg-[#f5f5f5] overflow-hidden">
      {/* Background Quote Marks */}
      <div className="absolute top-20 left-10 opacity-5">
        <Quote className="w-40 h-40 text-[#4f46e5]" />
      </div>
      <div className="absolute bottom-20 right-10 opacity-5 rotate-180">
        <Quote className="w-40 h-40 text-[#4f46e5]" />
      </div>

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-12 xl:px-20">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-2 rounded-full bg-white text-[#4f46e5] text-sm font-medium mb-4 reveal">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-4 reveal stagger-1">
            Loved by{' '}
            <span className="text-gradient">Thousands</span>
          </h2>
          <p className="text-lg text-[#666] reveal stagger-2">
            See what Nigerians say about Nadi Digital Service and how it has transformed their financial lives.
          </p>
        </div>

        {/* Testimonials Carousel */}
        <div className="relative max-w-4xl mx-auto reveal-scale">
          {/* Main Testimonial Card */}
          <div className="relative bg-white rounded-3xl p-8 lg:p-12 shadow-xl">
            {/* Quote Icon */}
            <div className="absolute -top-6 left-8 w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
              <Quote className="w-6 h-6 text-white" />
            </div>

            {/* Content */}
            <div className="pt-4">
              {/* Stars */}
              <div className="flex gap-1 mb-6">
                {[...Array(testimonials[activeIndex].rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-xl lg:text-2xl text-[#1a1a1a] leading-relaxed mb-8">
                "{testimonials[activeIndex].quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <img
                  src={testimonials[activeIndex].avatar}
                  alt={testimonials[activeIndex].name}
                  className="w-14 h-14 rounded-full object-cover"
                />
                <div>
                  <p className="font-bold text-[#1a1a1a]">{testimonials[activeIndex].name}</p>
                  <p className="text-sm text-[#666]">{testimonials[activeIndex].role}</p>
                </div>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="absolute bottom-8 right-8 flex gap-2">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full w-10 h-10 border-[#e2e2e2] hover:bg-[#4f46e5] hover:text-white hover:border-[#4f46e5] transition-colors"
                onClick={prevTestimonial}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full w-10 h-10 border-[#e2e2e2] hover:bg-[#4f46e5] hover:text-white hover:border-[#4f46e5] transition-colors"
                onClick={nextTestimonial}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Dots Indicator */}
          <div className="flex justify-center gap-2 mt-8">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveIndex(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  index === activeIndex
                    ? 'bg-[#4f46e5] w-8'
                    : 'bg-[#e2e2e2] hover:bg-[#4f46e5]/50'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-6 reveal">
          {[
            { value: '4.9', label: 'App Store Rating' },
            { value: '500K+', label: 'Happy Users' },
            { value: '₦50B+', label: 'Transactions' },
            { value: '36', label: 'States Covered' },
          ].map((stat, index) => (
            <div key={index} className="text-center p-6 rounded-2xl bg-white shadow-sm">
              <p className="text-3xl lg:text-4xl font-bold text-gradient mb-1">{stat.value}</p>
              <p className="text-sm text-[#666]">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
