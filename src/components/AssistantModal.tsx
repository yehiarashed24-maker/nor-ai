import React, { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, Mic, MicOff, Send, Volume2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

type SpeechEvent = Event & { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const memoryKey = 'nor_ai_memory';

const selectVoice = (language: 'ar' | 'en') => {
  const voices = window.speechSynthesis.getVoices();
  const locale = language === 'ar' ? 'ar' : 'en';
  const preferredNames = language === 'ar'
    ? ['Majed', 'Maged', 'Hamed', 'Laila', 'Google العربية', 'Microsoft Hamed']
    : ['Samantha', 'Ava', 'Google US English', 'Microsoft Aria'];
  const matchingVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(locale));
  return matchingVoices.sort((a, b) => {
    const aIndex = preferredNames.findIndex((name) => a.name.includes(name));
    const bIndex = preferredNames.findIndex((name) => b.name.includes(name));
    const aRank = aIndex === -1 ? preferredNames.length : aIndex;
    const bRank = bIndex === -1 ? preferredNames.length : bIndex;
    return aRank - bRank || Number(b.localService) - Number(a.localService);
  })[0];
};
const labels = {
  ar: {
    title: 'مساعد نور', close: 'إغلاق', camera: 'تشغيل الكاميرا', stopCamera: 'إيقاف الكاميرا',
    ask: 'اسأل نور عما أمامك…', listen: 'ابدأ التحدث', stop: 'إيقاف الاستماع', send: 'إرسال', replay: 'إعادة الرد صوتيًا',
    starting: 'أجهز الكاميرا والمايك…', ready: 'الكاميرا جاهزة. اسألني عن اللي حواليك.',
    listening: 'أنا أسمعك…', thinking: 'أحلل الصورة…', readyAgain: 'جاهز لسؤالك التالي.',
    cameraError: 'تعذر تشغيل الكاميرا. اسمح للموقع باستخدامها ثم اضغط تشغيل الكاميرا.',
    apiError: 'تعذر تحليل الصورة. حاول مرة أخرى بعد لحظة.',
    noSpeech: 'المتصفح لا يدعم التعرف الصوتي. يمكنك كتابة السؤال وإرساله.',
  },
  en: {
    title: 'NOR Assistant', close: 'Close', camera: 'Start camera', stopCamera: 'Stop camera',
    ask: 'Ask NOR about what is in front of you…', listen: 'Start speaking', stop: 'Stop listening', send: 'Send', replay: 'Read answer aloud',
    starting: 'Preparing the camera and microphone…', ready: 'Camera ready. Ask me about your surroundings.',
    listening: 'I am listening…', thinking: 'Analyzing the image…', readyAgain: 'Ready for your next question.',
    cameraError: 'Could not start the camera. Allow access, then select Start camera.',
    apiError: 'The image could not be analyzed. Please try again in a moment.',
    noSpeech: 'Voice recognition is unavailable in this browser. You can type and send your question.',
  },
};

export const AssistantModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { lang } = useLanguage();
  const text = labels[lang];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceActivityFrameRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const speechTokenRef = useRef(0);
  const interruptAfterRef = useRef(0);
  const noiseFloorRef = useRef(0.012);
  const loudFramesRef = useRef(0);
  const activeRef = useRef(false);
  const loadingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const startListeningRef = useRef<() => void>(() => {});
  const [cameraOn, setCameraOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState(text.starting);
  const [answer, setAnswer] = useState('');

  const clearRestartTimer = () => {
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  };

  const stopListening = () => {
    clearRestartTimer();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  };

  const stopCamera = () => {
    if (voiceActivityFrameRef.current !== null) {
      window.cancelAnimationFrame(voiceActivityFrameRef.current);
      voiceActivityFrameRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  const speak = (value: string, onFinished?: () => void) => {
    stopListening();
    const token = ++speechTokenRef.current;
    speakingRef.current = true;
    interruptAfterRef.current = performance.now() + 650;
    loudFramesRef.current = 0;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = lang === 'ar' ? 'ar-EG' : 'en-US';
    utterance.voice = selectVoice(lang) ?? null;
    utterance.rate = lang === 'ar' ? 0.88 : 0.95;
    utterance.pitch = 1;
    const finish = () => {
      if (token !== speechTokenRef.current) return;
      speakingRef.current = false;
      onFinished?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  };

  const startVoiceActivityDetection = (stream: MediaStream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.25;
    audioContext.createMediaStreamSource(new MediaStream([audioTrack])).connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    void audioContext.resume();
    const samples = new Float32Array(analyser.fftSize);

    const monitor = () => {
      if (!activeRef.current || analyserRef.current !== analyser) return;
      analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const level = Math.sqrt(energy / samples.length);

      if (!speakingRef.current && !listening) {
        noiseFloorRef.current = noiseFloorRef.current * 0.96 + level * 0.04;
      }

      const threshold = Math.max(0.04, noiseFloorRef.current * 3.5);
      if (speakingRef.current && performance.now() >= interruptAfterRef.current && level > threshold) {
        loudFramesRef.current += 1;
        if (loudFramesRef.current >= 4) {
          loudFramesRef.current = 0;
          speakingRef.current = false;
          speechTokenRef.current += 1;
          window.speechSynthesis.cancel();
          setStatus(text.listening);
          restartTimerRef.current = window.setTimeout(() => startListeningRef.current(), 80);
        }
      } else {
        loudFramesRef.current = 0;
      }
      voiceActivityFrameRef.current = window.requestAnimationFrame(monitor);
    };
    voiceActivityFrameRef.current = window.requestAnimationFrame(monitor);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.videoWidth === 0) return null;
    const scale = Math.min(1, 1280 / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  };

  const scheduleListening = (delay = 350) => {
    clearRestartTimer();
    if (!activeRef.current || loadingRef.current || !streamRef.current) return;
    restartTimerRef.current = window.setTimeout(() => startListeningRef.current(), delay);
  };

  const submit = async (value = question) => {
    const cleanQuestion = value.trim();
    const image = capture();
    if (!cleanQuestion || !image || loadingRef.current) {
      scheduleListening();
      return;
    }
    stopListening();
    loadingRef.current = true;
    setLoading(true);
    setAnswer('');
    setStatus(text.thinking);
    try {
      const saved = JSON.parse(localStorage.getItem(memoryKey) || '[]');
      const memories = Array.isArray(saved) ? saved : [];
      const response = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: cleanQuestion, image, language: lang, memories }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAnswer(data.answer);
      setStatus('');
      setQuestion('');
      if (data.memoryToSave) {
        localStorage.setItem(memoryKey, JSON.stringify([...memories, data.memoryToSave].slice(-12)));
      }
      loadingRef.current = false;
      setLoading(false);
      speak(data.answer, () => {
        if (!activeRef.current) return;
        setStatus(text.readyAgain);
        scheduleListening(450);
      });
    } catch {
      loadingRef.current = false;
      setLoading(false);
      setStatus(text.apiError);
      speak(text.apiError, () => scheduleListening(700));
    }
  };

  const startListening = () => {
    if (!activeRef.current || loadingRef.current || !streamRef.current || recognitionRef.current) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus(text.noSpeech);
      return;
    }
    const recognition = new Recognition();
    let receivedResult = false;
    recognition.lang = lang === 'ar' ? 'ar-EG' : 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      receivedResult = true;
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setQuestion(transcript);
      void submit(transcript);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      if (!receivedResult) scheduleListening(500);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
      scheduleListening(900);
    };
    recognitionRef.current = recognition;
    setListening(true);
    setStatus(text.listening);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      scheduleListening(900);
    }
  };
  useEffect(() => {
    startListeningRef.current = startListening;
  });

  const startCamera = async (announce = false) => {
    try {
      stopCamera();
      setStatus(text.starting);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      startVoiceActivityDetection(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setStatus(text.ready);
      if (announce) speak(text.ready, () => scheduleListening(450));
      else scheduleListening();
    } catch {
      setStatus(text.cameraError);
      speak(text.cameraError);
    }
  };

  useEffect(() => {
    activeRef.current = open;
    if (open) {
      setStatus(text.starting);
      void startCamera(true);
    } else {
      stopListening();
      stopCamera();
      speakingRef.current = false;
      speechTokenRef.current += 1;
      window.speechSynthesis.cancel();
    }
    return () => {
      activeRef.current = false;
      clearRestartTimer();
    };
  }, [open, lang]);

  useEffect(() => () => {
    activeRef.current = false;
    stopListening();
    stopCamera();
    speakingRef.current = false;
    speechTokenRef.current += 1;
    window.speechSynthesis.cancel();
  }, []);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/85 p-0 sm:p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label={text.title}>
      <div className="relative flex max-h-[100dvh] sm:max-h-[94svh] h-full sm:h-auto w-full max-w-3xl flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] border-t sm:border border-white/20 bg-[#0a0a0a]/98 shadow-2xl pb-[env(safe-area-inset-bottom,0.5rem)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 sm:py-4 sm:px-7 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="NOR AI Logo"
              className="h-9 w-9 rounded-full object-cover border border-white/20 shadow-md shadow-blue-500/20"
            />
            <div>
              <p className="font-mono text-xs text-white/50">(NOR_AI)</p>
              <h2 className="text-xl font-medium">{text.title}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={text.close} className="rounded-full border border-white/20 p-2 hover:bg-white hover:text-black"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-7">
          <div className="relative aspect-video overflow-hidden rounded-3xl border border-white/15 bg-white/5">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            {!cameraOn && <div className="absolute inset-0 flex items-center justify-center"><Camera size={42} className="text-white/25" /></div>}
            <button type="button" onClick={cameraOn ? () => { stopListening(); stopCamera(); } : () => void startCamera(true)} className="absolute bottom-4 start-4 rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm backdrop-blur-md hover:bg-white hover:text-black">
              {cameraOn ? text.stopCamera : text.camera}
            </button>
          </div>
          <div aria-live="polite" className="min-h-28 py-6">
            {answer && <p className="text-lg leading-relaxed sm:text-xl">{answer}</p>}
            {status && <p className="text-sm text-white/65">{status}</p>}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 p-2 ps-5">
            <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }} placeholder={text.ask} className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/40" />
            <button type="button" onClick={listening ? stopListening : startListening} disabled={loading || !cameraOn} aria-label={listening ? text.stop : text.listen} className={`rounded-full p-3 transition ${listening ? 'bg-red-500 text-white' : 'bg-white/10 hover:bg-white hover:text-black'} disabled:opacity-30`}>
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button type="button" onClick={() => void submit()} disabled={loading || !cameraOn || !question.trim()} aria-label={text.send} className="rounded-full bg-white p-3 text-black transition hover:scale-105 disabled:opacity-30">
              {loading ? <LoaderCircle size={20} className="animate-spin" /> : <Send size={20} className="rtl:-scale-x-100" />}
            </button>
            {answer && <button type="button" onClick={() => speak(answer, () => scheduleListening())} aria-label={text.replay} className="rounded-full bg-white/10 p-3 hover:bg-white hover:text-black"><Volume2 size={20} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
};
