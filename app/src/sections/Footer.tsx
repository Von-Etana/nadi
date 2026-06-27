import { Twitter, Linkedin, Instagram, Facebook, Youtube, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const Footer = () => {
  const footerLinks = {
    company: [
      { name: 'About Us', href: '#' },
      { name: 'Careers', href: '#' },
      { name: 'Press', href: '#' },
      { name: 'Contact', href: '#' },
    ],
    services: [
      { name: 'Money Transfer', href: '#' },
      { name: 'Crypto Exchange', href: '#' },
      { name: 'Utility Payments', href: '#' },
      { name: 'Gift Cards', href: '#' },
      { name: 'Fuel Delivery', href: '#' },
    ],
    resources: [
      { name: 'Blog', href: '#' },
      { name: 'Help Center', href: '#' },
      { name: 'API Docs', href: '#' },
      { name: 'Status', href: '#' },
    ],
    legal: [
      { name: 'Privacy Policy', href: '#' },
      { name: 'Terms of Service', href: '#' },
      { name: 'Cookie Policy', href: '#' },
      { name: 'Licenses', href: '#' },
    ],
  };

  const socialLinks = [
    { icon: Twitter, href: 'https://twitter.com/Nadigroup_', label: 'Twitter', username: '@Nadigroup_' },
    { icon: Instagram, href: 'https://instagram.com/Nadigroup_', label: 'Instagram', username: '@Nadigroup_' },
    { icon: Facebook, href: 'https://facebook.com/Nadigroup', label: 'Facebook', username: '@Nadigroup' },
    { icon: Youtube, href: 'https://youtube.com/@Nadigroup', label: 'YouTube', username: '@Nadigroup' },
    { icon: Linkedin, href: 'https://linkedin.com/company/nadigroup', label: 'LinkedIn', username: 'Nadi Group' },
  ];

  return (
    <footer className="relative w-full bg-[#1a1a1a] text-white overflow-hidden">
      {/* Top Gradient Line */}
      <div className="h-1 w-full bg-gradient-to-r from-[#ea580c] via-[#f97316] to-[#ea580c]" />

      <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20 py-16 lg:py-20">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            {/* Logo */}
            <a href="#home" className="flex items-center gap-3 mb-6">
              <div className="w-14 h-14 rounded-xl overflow-hidden">
                <img src="/logo.jpg" alt="Nadi Digital Service" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-white leading-tight">Nadi</span>
                <span className="text-xs text-[#ea580c] font-medium -mt-1">Digital Service</span>
              </div>
            </a>

            <p className="text-gray-400 mb-6 max-w-sm">
              Your all-in-one Nigerian fintech platform. Send money, trade crypto, pay bills, and access emergency services - all from one secure app.
            </p>

            {/* Newsletter */}
            <div className="mb-6">
              <p className="text-sm font-medium mb-3">Stay updated</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 rounded-full px-4"
                />
                <Button className="bg-gradient-to-r from-[#ea580c] to-[#f97316] rounded-full px-4 hover:opacity-90">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Social Links */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-white">Follow us</p>
              <div className="flex gap-3">
                {socialLinks.map((social, index) => (
                  <a
                    key={index}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-gradient-to-r hover:from-[#ea580c] hover:to-[#f97316] transition-colors duration-300"
                  >
                    <social.icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
              <p className="text-sm text-[#ea580c]">@Nadigroup_</p>
            </div>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors duration-300 text-sm"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Services Links */}
          <div>
            <h4 className="font-semibold mb-4">Services</h4>
            <ul className="space-y-3">
              {footerLinks.services.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors duration-300 text-sm"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors duration-300 text-sm"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors duration-300 text-sm"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} Nadi Digital Service. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-gray-400 text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              All systems operational
            </span>
            <span className="text-gray-500 text-sm">Licensed by CBN</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
