import React, { useState } from 'react';
import { LanguageProvider } from './context/LanguageContext';
import { ScrollVideo } from './components/ScrollVideo';
import { Navbar } from './components/Navbar';
import { SectionOne } from './components/SectionOne';
import { SectionTwo } from './components/SectionTwo';
import { AssistantModal } from './components/AssistantModal';
import { InstallPrompt } from './components/InstallPrompt';

export const App: React.FC = () => {
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <LanguageProvider>
      <div className="relative selection:bg-white/20 transition-all duration-300">
        <ScrollVideo />
        <Navbar />
        <main>
          <SectionOne onOpenAssistant={() => setAssistantOpen(true)} />
          <div aria-hidden="true" className="h-[80vh]" />
          <SectionTwo onOpenAssistant={() => setAssistantOpen(true)} />
        </main>
        <AssistantModal open={assistantOpen} onClose={() => setAssistantOpen(false)} />
        <InstallPrompt />
      </div>
    </LanguageProvider>
  );
};

export default App;
