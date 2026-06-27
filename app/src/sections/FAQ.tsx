import { useEffect, useRef, useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

const FAQ = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

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

  const faqs = [
    {
      question: 'How do I create an account?',
      answer: 'Creating an account is quick and easy. Simply download the QuickPay app or visit our website, click "Sign Up," and enter your email or phone number. You will receive a verification code to confirm your identity, and then you are all set to start using QuickPay!',
    },
    {
      question: 'What are the transfer fees?',
      answer: 'QuickPay offers some of the lowest fees in the industry. Domestic transfers are often free, while international transfers typically cost between 0.5% to 1% of the transfer amount. There are no hidden fees - what you see is what you pay.',
    },
    {
      question: 'How long do transfers take?',
      answer: 'Most transfers on QuickPay are instant, especially for domestic transactions. International transfers may take 1-2 business days depending on the destination country and banking system. You will always see the estimated delivery time before confirming your transfer.',
    },
    {
      question: 'Is my money secure?',
      answer: 'Absolutely! QuickPay uses bank-grade 256-bit encryption to protect your data and transactions. We are SOC 2 certified, PCI DSS compliant, and use advanced fraud detection systems. Your funds are also held in segregated accounts for added security.',
    },
    {
      question: 'Which countries can I send money to?',
      answer: 'QuickPay supports transfers to over 150 countries worldwide. We support 50+ currencies and are constantly expanding our coverage. You can check if your destination country is supported directly in the app before initiating a transfer.',
    },
    {
      question: 'How do I verify my identity?',
      answer: 'Identity verification is required for security and regulatory compliance. Simply upload a photo of your government-issued ID (passport, driver license, or national ID) and take a selfie. Our AI-powered system verifies your identity within minutes in most cases.',
    },
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" ref={sectionRef} className="relative w-full py-20 lg:py-32 bg-white overflow-hidden">
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-12 xl:px-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          {/* Left Side - Illustration & Header */}
          <div className="lg:sticky lg:top-32">
            <span className="inline-block px-4 py-2 rounded-full bg-[#4f46e5]/10 text-[#4f46e5] text-sm font-medium mb-4 reveal">
              FAQ
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-4 reveal stagger-1">
              Frequently Asked{' '}
              <span className="text-gradient">Questions</span>
            </h2>
            <p className="text-lg text-[#666] mb-8 reveal stagger-2">
              Everything you need to know about QuickPay. Can not find what you are looking for? Contact our support team.
            </p>

            {/* Illustration */}
            <div className="relative hidden lg:block reveal stagger-3">
              <img
                src="/support-illustration.png"
                alt="Customer Support"
                className="w-64 h-64 object-contain animate-float-slow"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#4f46e5]/20 to-[#7c3aed]/20 rounded-full blur-3xl -z-10" />
            </div>

            {/* Contact CTA */}
            <div className="mt-8 p-6 rounded-2xl bg-[#f5f5f5] reveal stagger-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#4f46e5]/10 flex items-center justify-center">
                  <HelpCircle className="w-6 h-6 text-[#4f46e5]" />
                </div>
                <div>
                  <p className="font-semibold text-[#1a1a1a]">Still have questions?</p>
                  <p className="text-sm text-[#666]">Our support team is here to help 24/7</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - FAQ Accordion */}
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="border border-[#e2e2e2] rounded-2xl overflow-hidden hover:border-[#4f46e5]/30 transition-colors reveal-right"
                style={{ transitionDelay: `${index * 0.1}s` }}
              >
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full flex items-center justify-between p-6 text-left bg-white hover:bg-[#f5f5f5] transition-colors"
                >
                  <span className="font-semibold text-[#1a1a1a] pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-[#4f46e5] flex-shrink-0 transition-transform duration-300 ${
                      openIndex === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openIndex === index ? 'max-h-96' : 'max-h-0'
                  }`}
                >
                  <div className="p-6 pt-0 text-[#666] leading-relaxed">
                    {faq.answer}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
