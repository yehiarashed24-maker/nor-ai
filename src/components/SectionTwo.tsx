import React from 'react';
import { Share2 } from 'lucide-react';
import { Reveal } from './Reveal';
import { useLanguage } from '../context/LanguageContext';

export const SectionTwo: React.FC<{ onOpenAssistant: () => void }> = ({ onOpenAssistant }) => {
  const { t } = useLanguage();

  return (
    <section className="relative flex min-h-screen flex-col supports-[height:100svh]:min-h-[100svh]">
      {/* Middle Row */}
      <div className="relative flex flex-1 flex-col justify-center gap-10 px-5 pt-24 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-8 sm:pt-0 md:px-12">
        <h2 className="max-w-sm text-4xl font-medium uppercase leading-[1.05] tracking-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">
          <Reveal as="span" delay={100} className="block">
            {t.sectionTwo.line1Prefix}
            <span className="normal-case italic font-light">{t.sectionTwo.line1Highlight}</span>
          </Reveal>
          <Reveal as="span" delay={220} className="block">
            {t.sectionTwo.line2}
          </Reveal>
        </h2>

        <Reveal delay={340} className="flex items-center justify-between font-mono text-white sm:justify-start sm:gap-16 md:gap-24">
          <span className="text-lg">{t.sectionTwo.badgeB}</span>
          <span className="text-xs text-white/70">{t.sectionTwo.badgeCount}</span>
        </Reveal>
      </div>

      {/* Bottom Block */}
      <div className="relative flex flex-col gap-10 px-5 pb-16 sm:px-8 md:px-12 md:pb-20">
        <Reveal delay={460}>
          <p className="max-w-xs text-sm leading-relaxed text-white/85 drop-shadow-md">
            {t.sectionTwo.paragraph}
          </p>
        </Reveal>

        <Reveal
          delay={580}
          className="w-full max-w-xs sm:absolute sm:bottom-16 sm:left-1/2 sm:w-auto sm:max-w-none sm:-translate-x-1/2 md:bottom-20"
        >
          <a
            href="#demo"
            onClick={(event) => {
              event.preventDefault();
              onOpenAssistant();
            }}
            className="block rounded-full border border-white/60 px-10 py-3 text-center font-mono text-xs uppercase tracking-[0.15em] text-white transition-all duration-300 hover:bg-white hover:text-black"
          >
            {t.sectionTwo.cta}
          </a>
        </Reveal>
      </div>

      {/* Absolute Bottom-Start Share */}
      <Reveal delay={700} className="absolute bottom-5 start-5 sm:bottom-6 sm:start-8 md:start-12 z-20">
        <button
          type="button"
          aria-label={t.shareAria}
          className="text-white/80 transition-colors duration-300 hover:text-white cursor-pointer"
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: 'NOR_AI',
                url: window.location.href,
              }).catch(() => {});
            }
          }}
        >
          <Share2 size={18} />
        </button>
      </Reveal>
    </section>
  );
};
