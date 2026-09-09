import React, { useState } from 'react';
import { LanguageProvider } from './context/LanguageContext';
import { ScrollVideo } from './components/ScrollVideo';
import { Navbar } from './components/Navbar';
import { SectionOne } from './components/SectionOne';
import { SectionTwo } from './components/SectionTwo';
import { AssistantModal, primeSpeechAudio } from './components/AssistantModal';

export const App: React.FC = () => {
  const [assistantOpen, setAssistantOpen] = useState(false);

  const handleOpenAssistant = () => {
    primeSpeechAudio();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
        const silent = new SpeechSynthesisUtterance(' ');
        silent.volume = 0.01;
        window.speechSynthesis.speak(silent);
      } catch {}
    }
    setAssistantOpen(true);
  };

  return (
    <LanguageProvider>
      <div className="relative isolate selection:bg-white/20 transition-all duration-300">
        <ScrollVideo />
        <Navbar />
        <main className="relative z-10">
          <SectionOne onOpenAssistant={handleOpenAssistant} />
          <div aria-hidden="true" className="h-[80vh]" />
          <SectionTwo onOpenAssistant={handleOpenAssistant} />
        </main>
        <AssistantModal open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      </div>
    </LanguageProvider>
  );
};

export default App;
