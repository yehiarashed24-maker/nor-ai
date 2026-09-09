import React from 'react';
import { ArrowDown } from 'lucide-react';
import { Reveal } from './Reveal';
import { useLanguage } from '../context/LanguageContext';

export const SectionOne: React.FC<{ onOpenAssistant: () => void }> = ({ onOpenAssistant }) => {
  const { t } = useLanguage();

  return (
    <section className="relative flex min-h-screen flex-col justify-end supports-[height:100svh]:min-h-[100svh]">
      <div className="relative flex flex-col gap-10 px-5 pb-16 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:px-8 md:px-12 md:pb-20">
        {/* Left / Start Headline */}
        <h1 className="max-w-xl text-4xl font-medium uppercase leading-[1.05] tracking-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl lg:text-7xl">
          <Reveal as="span" delay={100} className="block ps-6 sm:ps-12">
            {t.hero.line1}
          </Reveal>
          <Reveal as="span" delay={220} className="block">
            {t.hero.line2Prefix}
            <span className="normal-case italic font-light">{t.hero.line2Highlight}</span>
          </Reveal>
          <Reveal as="span" delay={340} className="block ps-10 sm:ps-20">
            {t.hero.line3}
          </Reveal>
          <Reveal as="span" delay={460} className="block ps-16 sm:ps-32">
            {t.hero.line4}
          </Reveal>
        </h1>

        {/* Right / End Column */}
        <div className="flex w-full max-w-xs flex-col items-start">
          <Reveal delay={400} className="w-full">
            <div className="mb-6 flex w-full items-center justify-between font-mono text-white sm:mb-8">
              <span className="text-lg">{t.hero.badgeA}</span>
              <span className="text-xs text-white/70">{t.hero.badgeCount}</span>
            </div>
          </Reveal>

          <Reveal delay={520} className="w-full">
            <p className="mb-6 text-sm leading-relaxed text-white/85 drop-shadow-md sm:mb-8">
              {t.hero.paragraph}
            </p>
          </Reveal>

          <Reveal delay={640} className="w-full">
            <a
              href="#begin"
              onClick={(event) => {
                event.preventDefault();
                onOpenAssistant();
              }}
              className="block w-full rounded-full border border-white/60 px-8 py-3 text-center font-mono text-xs uppercase tracking-[0.15em] text-white transition-all duration-300 hover:bg-white hover:text-black"
            >
              {t.hero.cta}
            </a>
          </Reveal>
        </div>
      </div>

      {/* Absolute Bottom-Center Arrow */}
      <Reveal delay={760} className="absolute bottom-5 left-1/2 -translate-x-1/2 sm:bottom-6 z-20 pointer-events-none">
        <ArrowDown size={18} className="animate-bounce text-white/80" />
      </Reveal>
    </section>
  );
};
