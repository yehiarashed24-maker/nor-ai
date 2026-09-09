import React from 'react';
import { ArrowUpRight, Globe } from 'lucide-react';
import { Reveal } from './Reveal';
import { useLanguage } from '../context/LanguageContext';

export const Navbar: React.FC = () => {
  const { lang, t, toggleLang } = useLanguage();

  return (
    <header>
      {/* Top start (left in LTR, right in RTL) */}
      <div className="fixed start-5 top-[max(env(safe-area-inset-top,1.5rem),1.5rem)] z-50 sm:start-8 sm:top-8 md:start-12">
        <Reveal>
          <a
            href="#"
            className="flex items-center gap-2.5 font-mono text-lg font-medium tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl group"
          >
            <img
              src="/logo.png"
              alt="NOR AI"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover border border-white/25 shadow-lg shadow-blue-500/20 transition-transform duration-300 group-hover:scale-105"
            />
            <span>{t.brand}</span>
          </a>
        </Reveal>
        <Reveal delay={150}>
          <div className="mt-6 font-mono text-[10px] text-white/60 sm:mt-8 sm:text-xs">
            {t.version}
          </div>
        </Reveal>
      </div>

      {/* Top end (right in LTR, left in RTL) */}
      <nav className="fixed end-5 top-[max(env(safe-area-inset-top,1.5rem),1.5rem)] z-50 sm:end-8 sm:top-8 md:end-12">
        {/* Language Switcher */}
        <div className="flex justify-end mb-3 sm:mb-4">
          <Reveal delay={80}>
            <button
              onClick={toggleLang}
              className="group flex items-center gap-1.5 rounded-full border border-white/30 bg-black/40 px-3 py-1 text-xs font-mono text-white/90 backdrop-blur-md transition-all duration-300 hover:border-white hover:bg-white/10 hover:text-white cursor-pointer"
              aria-label={lang === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
            >
              <Globe size={12} className="text-white/60 group-hover:text-white transition-colors" />
              <span className={lang === 'en' ? 'text-white font-medium' : 'text-white/40'}>EN</span>
              <span className="text-white/30 text-[10px]">/</span>
              <span className={lang === 'ar' ? 'text-white font-medium' : 'text-white/40'}>عربي</span>
            </button>
          </Reveal>
        </div>

        <ul className="flex flex-col items-end gap-1.5 sm:gap-2">
          {t.nav.map((link, i) => (
            <li key={link.name}>
              <Reveal delay={140 + i * 100}>
                <a
                  href={link.href}
                  className="group flex items-center gap-1 font-mono text-xs text-white/80 drop-shadow-md transition-colors duration-300 hover:text-white sm:text-sm"
                >
                  <span>{link.name}</span>
                  <ArrowUpRight
                    size={14}
                    className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 rtl:-scale-x-100"
                  />
                </a>
              </Reveal>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
};
