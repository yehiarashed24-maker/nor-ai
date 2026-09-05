import React, { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'en' | 'ar';

export interface Translations {
  siteTitle: string;
  siteDesc: string;
  brand: string;
  version: string;
  nav: { name: string; href: string }[];
  hero: {
    line1: string;
    line2Prefix: string;
    line2Highlight: string;
    line3: string;
    line4: string;
    badgeA: string;
    badgeCount: string;
    paragraph: string;
    cta: string;
  };
  sectionTwo: {
    line1Prefix: string;
    line1Highlight: string;
    line2: string;
    badgeB: string;
    badgeCount: string;
    paragraph: string;
    cta: string;
  };
  shareAria: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    siteTitle: 'NOR_AI — Guiding Vision With Intelligent Light',
    siteDesc:
      'NOR_AI — Empowering the blind and visually impaired with real-time AI perception, auditory vision, and spatial awareness.',
    brand: '(NOR_AI)',
    version: '[ v.01b ]',
    nav: [
      { name: 'vision', href: '#vision' },
      { name: 'assist', href: '#assist' },
      { name: 'technology', href: '#tech' },
      { name: 'talk to us', href: '#contact' },
    ],
    hero: {
      line1: 'Today AI',
      line2Prefix: 'Guides ',
      line2Highlight: 'with',
      line3: '// Boundless',
      line4: 'Light',
      badgeA: '( A )',
      badgeCount: '[ 001 /004 · VISION ]',
      paragraph:
        'NorAI transforms the visual world into intuitive, real-time auditory perception and spatial awareness. Handing the visually impaired the freedom to navigate, perceive, and live without limits.',
      cta: 'Experience Nor',
    },
    sectionTwo: {
      line1Prefix: 'Learn ',
      line1Highlight: 'to see',
      line2: 'Beyond Sight',
      badgeB: '( B )',
      badgeCount: '[ 002 /004 · AUDITORY ]',
      paragraph:
        "Our AI doesn't just recognize obstacles — it interprets scenes, identifies faces, reads signs, and whispers spatial clarity in real time. Turning the unseen into effortless freedom.",
      cta: 'Experience The Demo',
    },
    shareAria: 'Share NOR_AI',
  },
  ar: {
    siteTitle: 'نور AI — توجيه البصر بضياء الذكاء الاصطناعي',
    siteDesc:
      'نور AI — تمكين المكفوفين وضعاف البصر عبر الإدراك البصري الصوتي والتوجيه المكاني الذكي في الوقت الفعلي.',
    brand: '(NOR_AI)',
    version: '[ إصدار v.01b ]',
    nav: [
      { name: 'الرؤية', href: '#vision' },
      { name: 'المساعدة', href: '#assist' },
      { name: 'التقنية', href: '#tech' },
      { name: 'تواصل معنا', href: '#contact' },
    ],
    hero: {
      line1: 'اليوم الذكاء الاصطناعي',
      line2Prefix: 'يقود ',
      line2Highlight: 'بضياء',
      line3: '// رؤية حيّة',
      line4: 'بلا حدود',
      badgeA: '( أ )',
      badgeCount: '[ 001 /004 · الرؤية ]',
      paragraph:
        'نور AI يُحوّل العالم المرئي إلى إدراك صوتي فوري وتوجيه مكاني ذكي للمكفوفين وضعاف البصر. نمنحكم الحرية الكاملة للتنقل، الاستكشاف، وتجربة الحياة دون عوائق.',
      cta: 'اكتشف نور AI',
    },
    sectionTwo: {
      line1Prefix: 'تعلّم ',
      line1Highlight: 'أن ترى',
      line2: 'ما وراء البصر',
      badgeB: '( ب )',
      badgeCount: '[ 002 /004 · الإدراك الصوتي ]',
      paragraph:
        'ذكاؤنا الاصطناعي لا يكتفي بكشف العوائق — بل يصف المحيط، يتعرف على الوجوه، يقرأ النصوص، ويهمس بالتفاصيل عبر صوت مكاني ثلاثي الأبعاد في الوقت الفعلي. ليتحول العالم الخفي إلى استقلالية كاملة.',
      cta: 'جرّب العرض التفاعلي',
    },
    shareAria: 'مشاركة نور AI',
  },
};

interface LanguageContextType {
  lang: Language;
  t: Translations;
  toggleLang: () => void;
  setLang: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('nor_lang');
    return saved === 'ar' || saved === 'en' ? saved : 'ar';
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('nor_lang', newLang);
  };

  const toggleLang = () => {
    setLang(lang === 'en' ? 'ar' : 'en');
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = translations[lang].siteTitle;
  }, [lang]);

  return (
    <LanguageContext.Provider
      value={{
        lang,
        t: translations[lang],
        toggleLang,
        setLang,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
