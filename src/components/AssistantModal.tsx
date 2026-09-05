import React, { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, Mic, MicOff, Send, Volume2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const memoryKey = 'nor_ai_memory';

const selectVoice = (language: 'ar' | 'en'): SpeechSynthesisVoice | null => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || !voices.length) return null;

  if (language === 'ar') {
    const arVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('ar'));
    const preferred = ['Google', 'Maged', 'Majed', 'Tarik', 'Laila', 'Mariam', 'Hamed'];
    for (const name of preferred) {
      const match = arVoices.find((v) => v.name.includes(name));
      if (match) return match;
    }
    return arVoices[0] || null;
  } else {
    const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    const preferred = ['Samantha', 'Google', 'Ava', 'Aria', 'Siri'];
    for (const name of preferred) {
      const match = enVoices.find((v) => v.name.includes(name));
      if (match) return match;
    }
    return enVoices[0] || null;
  }
};

const getRecorderOptions = (): MediaRecorderOptions | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined;
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const labels = {
  ar: {
    title: 'مساعد نور', close: 'إغلاق', camera: 'تشغيل المساعد', stopCamera: 'إيقاف المساعد',
    ask: 'اسأل نور عما أمامك…', listen: 'ابدأ الاستماع', stop: 'إيقاف الاستماع', send: 'إرسال', replay: 'إعادة الرد صوتيًا',
    starting: 'أجهز الكاميرا والمايك…', ready: 'الكاميرا جاهزة. اسألني عن اللي حواليك.',
    listening: 'أنا أسمعك… تحدث الآن', heard: 'سمعتك. أجهز سؤالك…', thinking: 'أحلل الصورة والسؤال…', readyAgain: 'جاهز لسؤالك التالي.',
    cameraError: 'تعذر تشغيل الكاميرا أو المايك. اسمح بالصلاحيات ثم اضغط تشغيل المساعد.',
    apiError: 'تعذر تحليل الصورة. حاول مرة أخرى.',
  },
  en: {
    title: 'NOR Assistant', close: 'Close', camera: 'Start assistant', stopCamera: 'Stop assistant',
    ask: 'Ask NOR about what is in front of you…', listen: 'Start listening', stop: 'Stop listening', send: 'Send', replay: 'Read answer aloud',
    starting: 'Preparing the camera and microphone…', ready: 'Camera ready. Ask me about your surroundings.',
    listening: 'I am listening… speak now', heard: 'Got it. Preparing your question…', thinking: 'Analyzing the image and question…', readyAgain: 'Ready for your next question.',
    cameraError: 'Could not start the camera or microphone. Allow access, then select Start assistant.',
    apiError: 'The image could not be analyzed. Please try again.',
  },
};

export const AssistantModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { lang } = useLanguage();
  const text = labels[lang];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const listeningRef = useRef(false);
  const loadingRef = useRef(false);
  const speechDetectedRef = useRef(false);
  const finalizingRef = useRef(false);

  // Critical fix for MP4 / WebM: keep chunk 0 (container header) permanently
  const headerChunkRef = useRef<Blob | null>(null);
  const preRollRef = useRef<Blob[]>([]);
  const speechChunksRef = useRef<Blob[]>([]);

  const voiceStartedAtRef = useRef(0);
  const silenceStartedAtRef = useRef(0);
  const loudFramesRef = useRef(0);
  const noiseFloorRef = useRef(0.012);
  const calibrateUntilRef = useRef(0);
  const speechTokenRef = useRef(0);
  const speechFallbackRef = useRef<number | null>(null);
  const startListeningRef = useRef<() => void>(() => {});
  const processVoiceRef = useRef<(blob: Blob) => void>(() => {});

  const [cameraOn, setCameraOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState(text.starting);
  const [answer, setAnswer] = useState('');

  const stopListening = () => {
    listeningRef.current = false;
    speechDetectedRef.current = false;
    finalizingRef.current = false;
    preRollRef.current = [];
    speechChunksRef.current = [];
    loudFramesRef.current = 0;
    setListening(false);
  };

  const startListening = () => {
    if (!activeRef.current || loadingRef.current || !streamRef.current) return;
    
    // Resume audio context if suspended (common on mobile)
    if (audioContextRef.current?.state === 'suspended') {
      void audioContextRef.current.resume();
    }

    listeningRef.current = true;
    speechDetectedRef.current = false;
    finalizingRef.current = false;
    preRollRef.current = [];
    speechChunksRef.current = [];
    voiceStartedAtRef.current = 0;
    silenceStartedAtRef.current = 0;
    loudFramesRef.current = 0;
    // Calibrate background noise for 1200ms on mobile
    calibrateUntilRef.current = performance.now() + 1200;
    setListening(true);
    setStatus(text.listening);
  };
  useEffect(() => { startListeningRef.current = startListening; });

  const toggleListening = () => {
    if (audioContextRef.current?.state === 'suspended') {
      void audioContextRef.current.resume();
    }
    if (listening) {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        speechDetectedRef.current = true;
        finalizingRef.current = true;
        listeningRef.current = false;
        setListening(false);
        setStatus(text.heard);
        try { recorderRef.current.requestData(); } catch {}
        return;
      }
      stopListening();
    } else {
      startListening();
    }
  };

  const stopMedia = () => {
    stopListening();
    if (vadFrameRef.current !== null) {
      window.cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    if (recorderRef.current?.state !== 'inactive') {
      try { recorderRef.current?.stop(); } catch {}
    }
    recorderRef.current = null;
    headerChunkRef.current = null;
    try { void audioContextRef.current?.close(); } catch {}
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
    if (speechFallbackRef.current !== null) {
      window.clearTimeout(speechFallbackRef.current);
      speechFallbackRef.current = null;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onFinished?.();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume?.();
    } catch {}

    const utterance = new SpeechSynthesisUtterance(value);
    const voice = selectVoice(lang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      // ar-SA works on both iOS and Android universally for Arabic
      utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    }
    utterance.rate = lang === 'ar' ? 0.92 : 0.95;

    let finished = false;
    const finish = () => {
      if (finished || token !== speechTokenRef.current) return;
      finished = true;
      if (speechFallbackRef.current !== null) window.clearTimeout(speechFallbackRef.current);
      speechFallbackRef.current = null;
      onFinished?.();
    };

    utterance.onend = finish;
    utterance.onerror = (e) => {
      console.warn('TTS on error:', e);
      finish();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      finish();
    }

    const estimatedDuration = Math.min(16000, Math.max(2500, value.length * (lang === 'ar' ? 85 : 65)));
    speechFallbackRef.current = window.setTimeout(finish, estimatedDuration + 1000);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.videoWidth === 0) return null;
    const scale = Math.min(1, 1080 / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  };

  const sendRequest = async ({ typedQuestion, audio }: { typedQuestion?: string; audio?: string }) => {
    const image = captureFrame();
    if (!image || loadingRef.current) {
      startListeningRef.current();
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
        body: JSON.stringify({ question: typedQuestion, audio, image, language: lang, memories }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Server error');

      setAnswer(data.answer);
      setQuestion(data.transcript || typedQuestion || '');
      if (data.memoryToSave) {
        localStorage.setItem(memoryKey, JSON.stringify([...memories, data.memoryToSave].slice(-12)));
      }

      loadingRef.current = false;
      setLoading(false);
      speak(data.answer, () => {
        if (!activeRef.current) return;
        setStatus(text.readyAgain);
        window.setTimeout(() => startListeningRef.current(), 350);
      });
    } catch (err: any) {
      console.error('Request failed:', err);
      loadingRef.current = false;
      setLoading(false);
      setStatus(text.apiError);
      speak(text.apiError, () => {
        if (!activeRef.current) return;
        window.setTimeout(() => startListeningRef.current(), 700);
      });
    }
  };

  const processVoice = async (blob: Blob) => {
    if (blob.size < 600) {
      startListeningRef.current();
      return;
    }
    setStatus(text.heard);
    try {
      const audio = await blobToDataUrl(blob);
      await sendRequest({ audio });
    } catch {
      setStatus(text.apiError);
      startListeningRef.current();
    }
  };
  useEffect(() => { processVoiceRef.current = (blob) => void processVoice(blob); });

  const setupAudioCapture = (stream: MediaStream) => {
    if (typeof MediaRecorder === 'undefined') {
      setStatus(text.cameraError);
      return;
    }
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const audioStream = new MediaStream([audioTrack]);
    const options = getRecorderOptions();
    const recorder = new MediaRecorder(audioStream, options);
    recorderRef.current = recorder;
    headerChunkRef.current = null;

    recorder.ondataavailable = (event) => {
      if (!event.data || !event.data.size) return;

      // Ensure we keep the first chunk as the container header (ftyp/moov for MP4, EBML for WebM)
      if (!headerChunkRef.current) {
        headerChunkRef.current = event.data;
      }

      if (speechDetectedRef.current) {
        speechChunksRef.current.push(event.data);
      } else if (listeningRef.current) {
        preRollRef.current = [...preRollRef.current.slice(-3), event.data];
      }

      if (finalizingRef.current) {
        finalizingRef.current = false;
        const middleChunks = speechChunksRef.current.length > 0 ? speechChunksRef.current : preRollRef.current;
        
        // Assemble valid file: [header, ...audioChunks]
        const allChunks = headerChunkRef.current && !middleChunks.includes(headerChunkRef.current)
          ? [headerChunkRef.current, ...middleChunks]
          : middleChunks;

        const type = recorder.mimeType || event.data.type || 'audio/webm';
        speechChunksRef.current = [];
        preRollRef.current = [];
        processVoiceRef.current(new Blob(allChunks, { type }));
      }
    };

    recorder.start(250);

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const audioContext = new AudioCtx();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    audioContext.createMediaStreamSource(audioStream).connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    // Resume immediately if possible
    void audioContext.resume();

    const samples = new Float32Array(analyser.fftSize);

    const monitor = () => {
      if (!activeRef.current || analyserRef.current !== analyser) return;

      if (listeningRef.current && !loadingRef.current && !finalizingRef.current) {
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const level = Math.sqrt(energy / samples.length);
        const now = performance.now();

        // Calibrate background noise
        if (now < calibrateUntilRef.current && !speechDetectedRef.current) {
          noiseFloorRef.current = Math.max(0.005, noiseFloorRef.current * 0.85 + level * 0.15);
        }

        // Resilient mobile thresholds to avoid false triggers
        const speechThreshold = Math.max(0.032, noiseFloorRef.current * 2.8);
        const silenceThreshold = Math.max(0.018, noiseFloorRef.current * 1.7);

        if (!speechDetectedRef.current) {
          loudFramesRef.current = level > speechThreshold ? loudFramesRef.current + 1 : 0;
          if (now >= calibrateUntilRef.current && loudFramesRef.current >= 4) {
            speechDetectedRef.current = true;
            speechChunksRef.current = [...preRollRef.current];
            preRollRef.current = [];
            voiceStartedAtRef.current = now;
            silenceStartedAtRef.current = 0;
            setStatus(text.listening);
          }
        } else if (level < silenceThreshold) {
          if (!silenceStartedAtRef.current) silenceStartedAtRef.current = now;
          const spokeLongEnough = now - voiceStartedAtRef.current > 450;
          if (spokeLongEnough && now - silenceStartedAtRef.current > 900) {
            listeningRef.current = false;
            setListening(false);
            finalizingRef.current = true;
            setStatus(text.heard);
            try { recorder.requestData(); } catch {}
          }
        } else {
          silenceStartedAtRef.current = 0;
        }
      }

      vadFrameRef.current = window.requestAnimationFrame(monitor);
    };

    vadFrameRef.current = window.requestAnimationFrame(monitor);
  };

  const startAssistant = async () => {
    try {
      stopMedia();
      setStatus(text.starting);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus(text.cameraError + ' (HTTPS required)');
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }

      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((e) => console.warn('Video play blocked:', e));
      }

      try {
        setupAudioCapture(stream);
      } catch (audioErr) {
        console.warn('Audio setup notice:', audioErr);
      }

      setCameraOn(true);
      setStatus(text.ready);

      // Speak greeting and immediately start listening hands-free
      speak(text.ready, () => startListeningRef.current());
    } catch (err: any) {
      console.error('Assistant start error:', err);
      setStatus(text.cameraError + (err?.message ? ` (${err.message})` : ''));
      try { speak(text.cameraError); } catch {}
    }
  };

  useEffect(() => {
    // Unlock iOS Safari / Chrome audio on user gesture
    const unlockAudioAndSpeech = () => {
      if (audioContextRef.current?.state === 'suspended') {
        void audioContextRef.current.resume();
      }
      if (speechTokenRef.current === 0) {
        try {
          const utterance = new SpeechSynthesisUtterance(' ');
          utterance.volume = 0.01;
          window.speechSynthesis.speak(utterance);
          speechTokenRef.current = 1;
        } catch {}
      }
    };
    window.addEventListener('touchstart', unlockAudioAndSpeech, { passive: true });
    window.addEventListener('click', unlockAudioAndSpeech, { passive: true });

    // Cache voices when loaded
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        selectVoice(lang);
      };
    }

    activeRef.current = open;
    if (open) {
      void startAssistant();
    } else {
      stopMedia();
      speechTokenRef.current += 1;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }

    return () => {
      activeRef.current = false;
      window.removeEventListener('touchstart', unlockAudioAndSpeech);
      window.removeEventListener('click', unlockAudioAndSpeech);
    };
  }, [open, lang]);

  useEffect(() => () => {
    activeRef.current = false;
    stopMedia();
    speechTokenRef.current += 1;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const submitTyped = () => {
    const value = question.trim();
    if (!value) return;
    void sendRequest({ typedQuestion: value });
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/90 backdrop-blur-xl sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={text.title}
    >
      <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-[#0a0a0a]/98 pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[94svh] sm:rounded-[2rem] sm:border sm:border-white/20 sm:shadow-2xl">
        {/* Header */}
        <div className="flex flex-none items-center justify-between border-b border-white/10 px-5 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-7 sm:py-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="NOR AI Logo"
              className="h-9 w-9 rounded-full border border-white/20 object-cover shadow-md shadow-blue-500/20"
            />
            <div>
              <p className="font-mono text-xs text-white/50">(NOR_AI)</p>
              <h2 className="text-xl font-medium text-white">{text.title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={text.close}
            className="rounded-full border border-white/20 p-2 text-white/80 transition hover:bg-white hover:text-black cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-7">
          {/* Camera View */}
          <div className="relative aspect-[4/3] max-h-[44dvh] flex-none overflow-hidden rounded-3xl border border-white/15 bg-white/5 sm:aspect-video sm:max-h-none shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {!cameraOn && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera size={42} className="text-white/25" />
              </div>
            )}
            <button
              type="button"
              onClick={cameraOn ? stopMedia : () => void startAssistant()}
              className="absolute bottom-3 start-3 rounded-full border border-white/30 bg-black/70 px-4 py-2 text-xs font-mono text-white backdrop-blur-md transition hover:bg-white hover:text-black cursor-pointer"
            >
              {cameraOn ? text.stopCamera : text.camera}
            </button>
          </div>

          {/* Assistant status and answer */}
          <div aria-live="polite" className="min-h-20 flex-none py-4 sm:min-h-28 sm:py-6">
            {answer && (
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-base font-normal leading-relaxed text-white sm:text-xl">{answer}</p>
                <button
                  type="button"
                  onClick={() => speak(answer, () => startListeningRef.current())}
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white/90 transition hover:bg-white hover:text-black cursor-pointer"
                >
                  <Volume2 size={14} />
                  <span>{text.replay}</span>
                </button>
              </div>
            )}

            {status && (
              <div className="mt-2 flex items-center gap-2 text-sm text-white/75">
                {listening && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
                  </span>
                )}
                <p>{status}</p>
              </div>
            )}
          </div>

          {/* Controls: Input + Mic Toggle */}
          <div className="mt-auto flex flex-none items-center gap-2 rounded-full border border-white/20 bg-white/5 p-2 ps-4 backdrop-blur-md">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitTyped();
              }}
              placeholder={text.ask}
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40 sm:text-base"
            />

            {/* Mic Toggle Button */}
            <button
              type="button"
              onClick={toggleListening}
              disabled={loading || !cameraOn}
              aria-label={listening ? text.stop : text.listen}
              className={`relative rounded-full p-3.5 transition-all duration-300 cursor-pointer disabled:opacity-30 ${
                listening
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 scale-105 animate-pulse'
                  : 'bg-white/10 text-white hover:bg-white hover:text-black'
              }`}
            >
              {listening ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            {/* Send Typed Question */}
            <button
              type="button"
              onClick={submitTyped}
              disabled={loading || !cameraOn || !question.trim()}
              aria-label={text.send}
              className="rounded-full bg-white p-3 text-black transition hover:scale-105 cursor-pointer disabled:opacity-30"
            >
              {loading ? (
                <LoaderCircle size={20} className="animate-spin" />
              ) : (
                <Send size={20} className="rtl:-scale-x-100" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
