import React, { useEffect, useState } from 'react';
import { Download, PlusSquare, Share2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const { lang } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSModal, setShowIOSModal] = useState(false);

  const [isIOS] = useState(() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  });

  const [isStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('nor_pwa_dismissed') === 'true';
  });

  useEffect(() => {
    // Listen for beforeinstallprompt (Android / Chrome / Edge)
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      setShowIOSModal(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('nor_pwa_dismissed', 'true');
  };

  if (isStandalone || dismissed) return null;

  const t = {
    ar: {
      badge: 'تطبيق هاتف',
      title: 'تثبيت نور AI على جهازك',
      desc: 'ثبته كتطبيق مستقل على شاشة هاتفك واستخدمه بكبسة زر بدون شريط المتصفح.',
      installBtn: 'تثبيت التطبيق',
      close: 'إغلاق',
      iosTitle: 'خطوات التثبيت على الآيفون',
      iosStep1: 'اضغط على زر المشاركة أسفل شاشة سفاري',
      iosStep2: 'مرر للأسفل واختر «إضافة إلى الشاشة الرئيسية»',
      iosStep3: 'اضغط «إضافة» وستجد أيقونة نور AI على شاشتك فوراً!',
      gotIt: 'فهمت',
    },
    en: {
      badge: 'Mobile App',
      title: 'Install NOR AI App',
      desc: 'Add to your home screen for full-screen, hands-free experience without browser bars.',
      installBtn: 'Install App',
      close: 'Close',
      iosTitle: 'How to install on iOS',
      iosStep1: 'Tap the Share button in Safari toolbar',
      iosStep2: 'Scroll down and tap «Add to Home Screen»',
      iosStep3: 'Tap «Add» in top right and launch NOR AI anytime!',
      gotIt: 'Got it',
    },
  }[lang];

  return (
    <>
      {/* Floating Install Notification / Banner */}
      <div className="fixed bottom-4 start-4 end-4 z-40 mx-auto max-w-lg sm:bottom-6 sm:start-8 sm:end-auto sm:max-w-md">
        <div className="relative flex items-center justify-between gap-4 rounded-2xl border border-white/20 bg-[#0e0e0e]/90 p-4 shadow-2xl backdrop-blur-xl transition-all">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src="/logo.png"
              alt="NOR AI Logo"
              className="h-11 w-11 shrink-0 rounded-xl object-cover border border-white/20 shadow-lg shadow-blue-500/20"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/70">
                  {t.badge}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white truncate">{t.title}</h4>
              <p className="text-xs text-white/60 line-clamp-1">{t.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 font-mono text-xs font-semibold text-black transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-md"
            >
              <Download size={14} />
              <span>{t.installBtn}</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t.close}
              className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* iOS & Manual Install Guide Modal */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/20 bg-[#121212] p-6 shadow-2xl text-white">
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 end-4 rounded-full border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>

            <img
              src="/logo.png"
              alt="NOR AI Logo"
              className="mb-4 h-16 w-16 rounded-2xl object-cover border border-white/20 shadow-xl shadow-blue-500/25"
            />

            <h3 className="text-lg font-bold mb-2">{t.iosTitle}</h3>

            <div className="space-y-4 my-5 text-sm text-white/80">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 font-mono text-xs font-bold text-white">
                  1
                </div>
                <p className="flex items-center gap-1.5 pt-0.5">
                  <span>{t.iosStep1}</span>
                  <Share2 size={16} className="inline text-blue-400 shrink-0" />
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 font-mono text-xs font-bold text-white">
                  2
                </div>
                <p className="flex items-center gap-1.5 pt-0.5">
                  <span>{t.iosStep2}</span>
                  <PlusSquare size={16} className="inline text-green-400 shrink-0" />
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 font-mono text-xs font-bold text-white">
                  3
                </div>
                <p className="pt-0.5">{t.iosStep3}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full rounded-full bg-white py-3 font-mono text-xs font-bold uppercase tracking-wider text-black transition-all hover:bg-white/90 cursor-pointer"
            >
              {t.gotIt}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
