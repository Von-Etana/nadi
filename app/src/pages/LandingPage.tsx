import Navigation from '@/sections/Navigation';
import Hero from '@/sections/Hero';
import Services from '@/sections/Services';
import Features from '@/sections/Features';
import Benefits from '@/sections/Benefits';
import HowItWorks from '@/sections/HowItWorks';
import Testimonials from '@/sections/Testimonials';
import FAQ from '@/sections/FAQ';
import CTA from '@/sections/CTA';
import Footer from '@/sections/Footer';

/**
 * Landing Page — Assembles all section components.
 * No longer needs onNavigate props since sections will be updated to use react-router-dom.
 * For now, existing sections still accept onNavigate for backward compatibility.
 */
const LandingPage = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <Hero />
      <Services />
      <Features />
      <Benefits />
      <HowItWorks />
      <Testimonials />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
};

export default LandingPage;
