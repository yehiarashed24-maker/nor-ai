import React, { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, Mic, MicOff, Send, Volume2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const memoryKey = 'nor_ai_memory';
let sharedSpeechAudio: HTMLAudioElement | null = null;

const getSharedSpeechAudio = () => {
  if (!sharedSpeechAudio && typeof Audio !== 'undefined') sharedSpeechAudio = new Audio();
  return sharedSpeechAudio;
};

export const primeSpeechAudio = () => {
  const audio = getSharedSpeechAudio();
  if (!audio) return;
  const sampleRate = 8_000;
  const sampleBytes = 800;
  const wav = new ArrayBuffer(44 + sampleBytes);
  const view = new DataView(wav);
  const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + sampleBytes, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, sampleBytes, true);
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  audio.volume = 0;
  audio.src = url;
  void audio.play().catch(() => {}).finally(() => {
    audio.volume = 1;
    URL.revokeObjectURL(url);
  });
};

const selectVoice = (language: 'ar' | 'en') => {
  const locale = language === 'ar' ? 'ar' : 'en';
  const preferredNames = language === 'ar'
    ? ['Hoda', 'Salma', 'Shaimaa', 'Maged', 'Majed', 'Hamed', 'Laila', 'Google Arabic', 'Google العربية', 'Microsoft']
    : ['Samantha', 'Ava', 'Google US English', 'Microsoft Aria'];
  return window.speechSynthesis.getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith(locale))
    .sort((a, b) => {
      const exactEgyptian = (voice: SpeechSynthesisVoice) =>
        language === 'ar' && voice.lang.toLowerCase().replace('_', '-') === 'ar-eg' ? 0 : 1;
      const localeRank = exactEgyptian(a) - exactEgyptian(b);
      if (localeRank) return localeRank;
      const aIndex = preferredNames.findIndex((name) => a.name.includes(name));
      const bIndex = preferredNames.findIndex((name) => b.name.includes(name));
      const aRank = aIndex === -1 ? preferredNames.length : aIndex;
      const bRank = bIndex === -1 ? preferredNames.length : bIndex;
      return aRank - bRank || Number(b.localService) - Number(a.localService);
    })[0];
};

const labels = {
  ar: {
    title: 'مساعد نور',
    close: 'إغلاق',
    camera: 'تشغيل المساعد',
    stopCamera: 'إيقاف المساعد',
    ask: 'اسأل نور عن محيطك، الفلوس، المنتجات، أو المستندات…',
    listen: 'ابدأ الاستماع',
    stop: 'إيقاف الاستماع',
    send: 'إرسال',
    replay: 'إعادة الرد صوتيًا',
    starting: 'أجهز الكاميرا والمايك…',
    ready: 'الكاميرا والمايك جاهزين. اسألني عن أي شيء أمامك.',
    listening: 'أنا أسمعك… تكلم الآن',
    heard: 'سمعتك. أحلل الصورة والسؤال…',
    thinking: 'أحلل الصورة والسؤال…',
    readyAgain: 'جاهز لسؤالك التالي.',
    cameraError: 'تعذر تشغيل الكاميرا أو المايك. اسمح بالصلاحيات ثم اضغط تشغيل المساعد.',
    apiError: 'تعذر تحليل الصورة. حاول مرة أخرى بعد لحظة.',
  },
  en: {
    title: 'NOR Assistant',
    close: 'Close',
    camera: 'Start assistant',
    stopCamera: 'Stop assistant',
    ask: 'Ask NOR about what is in front of you…',
    listen: 'Start listening',
    stop: 'Stop listening',
    send: 'Send',
    replay: 'Read answer aloud',
    starting: 'Preparing camera and microphone…',
    ready: 'Camera & mic ready. Speak anytime.',
    listening: 'I am listening… speak now',
    heard: 'Got it. Analyzing your question…',
    thinking: 'Analyzing the image and question…',
    readyAgain: 'Ready for your next question.',
    cameraError: 'Could not start camera or microphone. Allow permissions then retry.',
    apiError: 'Could not analyze this view. Please try again.',
  },
};

export const AssistantModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { lang } = useLanguage();
  const text = labels[lang];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const speechDetectedRef = useRef(false);
  const voiceStartedAtRef = useRef(0);
  const silenceStartedAtRef = useRef(0);
  const noiseFloorRef = useRef(0.01);
  const activeRef = useRef(false);
  const listeningRef = useRef(false);
  const loadingRef = useRef(false);
  const speechTokenRef = useRef(0);
  const speechFallbackRef = useRef<number | null>(null);
  const startListeningRef = useRef<() => void>(() => {});

  const [cameraOn, setCameraOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState(text.starting);
  const [answer, setAnswer] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [assistContext, setAssistContext] = useState<any>(null);

  const startRecordingUtterance = () => {
    if (isRecordingRef.current || !streamRef.current || typeof MediaRecorder === 'undefined') return;
    try {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (!audioTrack) return;

      const mimeTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/aac'];
      const supportedMime = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(new MediaStream([audioTrack]), supportedMime ? { mimeType: supportedMime } : undefined);

      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        if (chunks.length > 0 && activeRef.current) {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' });
          if (blob.size > 1200) {
            const reader = new FileReader();
            reader.onload = () => {
              const audioDataUrl = String(reader.result);
              void sendRequest({ audio: audioDataUrl });
            };
            reader.readAsDataURL(blob);
          } else {
            // Audio was too short, reset and continue listening
            startListeningRef.current();
          }
        }
      };

      recorder.start(100);
      recorderRef.current = recorder;
      isRecordingRef.current = true;
    } catch (err) {
      console.warn('Failed to start MediaRecorder utterance:', err);
    }
  };

  const stopRecordingUtterance = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {}
    }
    isRecordingRef.current = false;
    recorderRef.current = null;
  };

  const stopListening = () => {
    listeningRef.current = false;
    speechDetectedRef.current = false;
    voiceStartedAtRef.current = 0;
    silenceStartedAtRef.current = 0;
    setListening(false);
    setAudioLevel(0);
    stopRecordingUtterance();
  };

  const startListening = () => {
    if (!activeRef.current || loadingRef.current || !streamRef.current) return;

    if (audioContextRef.current?.state === 'suspended') {
      void audioContextRef.current.resume();
    }

    listeningRef.current = true;
    speechDetectedRef.current = false;
    voiceStartedAtRef.current = 0;
    silenceStartedAtRef.current = 0;
    setListening(true);
    setStatus(text.listening);
  };
  useEffect(() => { startListeningRef.current = startListening; });

  const toggleListening = () => {
    if (audioContextRef.current?.state === 'suspended') {
      void audioContextRef.current.resume();
    }
    if (listening) {
      // If user taps mic button while speaking, immediately finalize and send!
      if (isRecordingRef.current) {
        setStatus(text.heard);
        stopListening();
      } else {
        stopListening();
        setStatus(text.readyAgain);
      }
    } else {
      startListening();
    }
  };

  const stopMedia = () => {
    stopListening();
    const output = getSharedSpeechAudio();
    output?.pause();
    if (vadFrameRef.current !== null) cancelAnimationFrame(vadFrameRef.current);
    vadFrameRef.current = null;
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
    if (speechFallbackRef.current !== null) window.clearTimeout(speechFallbackRef.current);
    const prevAudio = getSharedSpeechAudio();
    if (prevAudio) {
      prevAudio.pause();
      prevAudio.onended = null;
      prevAudio.onerror = null;
    }
    let finished = false;
    const finish = () => {
      if (finished || token !== speechTokenRef.current) return;
      finished = true;
      if (speechFallbackRef.current !== null) window.clearTimeout(speechFallbackRef.current);
      speechFallbackRef.current = null;
      const audio = getSharedSpeechAudio();
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
      }
      onFinished?.();
    };

    // Global safety watchdog timer: guarantees finish() is called even if audio playback stalls
    const estimatedDuration = Math.min(25000, Math.max(3500, value.length * (lang === 'ar' ? 85 : 70) + 2000));
    speechFallbackRef.current = window.setTimeout(() => {
      console.warn('Speech playback watchdog timeout fired');
      finish();
    }, estimatedDuration);

    const speakWithDevice = () => {
      if (finished || token !== speechTokenRef.current) return;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        finish();
        return;
      }
      try { window.speechSynthesis.resume(); } catch {}
      const utterance = new SpeechSynthesisUtterance(value);
      const voice = selectVoice(lang);
      if (voice) utterance.voice = voice;
      utterance.lang = lang === 'ar' ? 'ar-EG' : (voice?.lang || 'en-US');
      utterance.rate = lang === 'ar' ? 1.02 : 1.05;
      utterance.onend = finish;
      utterance.onerror = finish;
      try { window.speechSynthesis.speak(utterance); } catch { finish(); }
    };

    if (lang !== 'ar') {
      speakWithDevice();
      return;
    }

    let fallbackStarted = false;
    const fallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      speakWithDevice();
    };

    void fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: value }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('TTS request failed');
        return response.json();
      })
      .then((data) => {
        if (token !== speechTokenRef.current || !data.audio) return fallback();
        
        const audioUrls = Array.isArray(data.audio) ? data.audio : [data.audio];
        if (audioUrls.length === 0) return fallback();

        let currentIndex = 0;
        const playNext = () => {
          if (currentIndex >= audioUrls.length || token !== speechTokenRef.current) {
            return finish();
          }
          const audio = getSharedSpeechAudio();
          if (!audio) return fallback();
          audio.src = audioUrls[currentIndex];
          audio.onended = () => {
            currentIndex++;
            playNext();
          };
          audio.onerror = fallback;
          void audio.play().catch(fallback);
        };
        
        playNext();
      })
      .catch(fallback);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.videoWidth === 0) return null;
    const scale = Math.min(1, 1280 / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  };

  const sendRequest = async ({ typedQuestion, audio }: { typedQuestion?: string; audio?: string }) => {
    const image = captureFrame();
    if (!image || loadingRef.current) return;
    stopListening();
    loadingRef.current = true;
    setLoading(true);
    setAnswer('');
    setStatus(text.thinking);

    const watchdog = window.setTimeout(() => {
      if (loadingRef.current) {
        console.warn('Assist API watchdog timeout');
        loadingRef.current = false;
        setLoading(false);
        setStatus(text.apiError);
        window.setTimeout(() => startListeningRef.current(), 1000);
      }
    }, 25000);

    try {
      const saved = JSON.parse(localStorage.getItem(memoryKey) || '[]');
      const memories = Array.isArray(saved) ? saved : [];
      const response = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: typedQuestion, audio, image, language: lang, memories, context: assistContext }),
      });
      window.clearTimeout(watchdog);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAnswer(data.answer);
      setQuestion(data.transcript || typedQuestion || '');
      setAssistContext(data.context || null);
      if (data.memoryToSave) {
        localStorage.setItem(memoryKey, JSON.stringify([...memories, data.memoryToSave].slice(-12)));
      }
      loadingRef.current = false;
      setLoading(false);
      speak(data.answer, () => {
        if (!activeRef.current) return;
        setStatus(text.readyAgain);
        if (data.action?.type === 'CALL') {
          window.location.href = 'tel:123456789';
        } else {
          window.setTimeout(() => startListeningRef.current(), 400);
        }
      });
    } catch {
      window.clearTimeout(watchdog);
      loadingRef.current = false;
      setLoading(false);
      setStatus(text.apiError);
      speak(text.apiError, () => window.setTimeout(() => startListeningRef.current(), 700));
    }
  };

  const startAssistant = async () => {
    try {
      stopMedia();
      setStatus(text.starting);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: true,
        }).catch(() => {
          return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        });
      }

      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', '');
        videoRef.current.setAttribute('webkit-playsinline', '');
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch {
          // Autoplay bypass
        }
      }

      // Initialize real-time AudioContext VAD
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioCtx();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
        source.connect(analyser);
      }

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      void audioContext.resume();

      // Start continuous Voice Activity Detection monitor
      const samples = new Float32Array(analyser.fftSize);
      const monitorVAD = () => {
        if (!activeRef.current || !analyserRef.current) return;

        if (listeningRef.current && !loadingRef.current) {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
          const level = Math.sqrt(sum / samples.length);
          setAudioLevel(Math.min(1, level * 5));

          const now = performance.now();
          if (!speechDetectedRef.current) {
            noiseFloorRef.current = Math.max(0.003, noiseFloorRef.current * 0.9 + level * 0.1);
          }

          const speechThreshold = Math.max(0.015, noiseFloorRef.current * 2.2);
          const silenceThreshold = Math.max(0.008, noiseFloorRef.current * 1.4);

          if (!speechDetectedRef.current) {
            if (level > speechThreshold) {
              speechDetectedRef.current = true;
              voiceStartedAtRef.current = now;
              silenceStartedAtRef.current = 0;
              setStatus(text.listening);
              startRecordingUtterance();
            }
          } else {
            const duration = now - voiceStartedAtRef.current;
            if (level < silenceThreshold) {
              if (!silenceStartedAtRef.current) silenceStartedAtRef.current = now;
              const silenceDuration = now - silenceStartedAtRef.current;
              // User spoke and paused for 800ms, or reached max recording limit (12s)
              if ((duration > 400 && silenceDuration > 800) || duration > 12000) {
                listeningRef.current = false;
                setListening(false);
                speechDetectedRef.current = false;
                setStatus(text.heard);
                stopRecordingUtterance();
              }
            } else {
              silenceStartedAtRef.current = 0;
              if (duration > 12000) {
                listeningRef.current = false;
                setListening(false);
                speechDetectedRef.current = false;
                setStatus(text.heard);
                stopRecordingUtterance();
              }
            }
          }
        } else {
          setAudioLevel(0);
        }

        vadFrameRef.current = requestAnimationFrame(monitorVAD);
      };

      if (vadFrameRef.current !== null) cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = requestAnimationFrame(monitorVAD);

      setCameraOn(true);
      setStatus(text.ready);
      speak(text.ready, () => startListeningRef.current());
    } catch (err) {
      console.error('Camera/Mic access failed:', err);
      setStatus(text.cameraError);
      speak(text.cameraError);
    }
  };

  useEffect(() => {
    const unlockTouch = () => {
      if (audioContextRef.current?.state === 'suspended') {
        void audioContextRef.current.resume();
      }
    };
    window.addEventListener('touchstart', unlockTouch, { passive: true });
    window.addEventListener('pointerdown', unlockTouch, { passive: true });
    activeRef.current = open;
    if (open) void startAssistant();
    else {
      stopMedia();
      speechTokenRef.current += 1;
      window.speechSynthesis.cancel();
    }
    return () => {
      activeRef.current = false;
      window.removeEventListener('touchstart', unlockTouch);
      window.removeEventListener('pointerdown', unlockTouch);
    };
  }, [open, lang]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => { selectVoice(lang); };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [lang]);

  useEffect(() => () => {
    activeRef.current = false;
    stopMedia();
    speechTokenRef.current += 1;
    window.speechSynthesis.cancel();
  }, []);

  const submitTyped = () => {
    const value = question.trim();
    if (!value) return;
    void sendRequest({ typedQuestion: value });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/90 backdrop-blur-xl sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={text.title}>
      <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-[#0a0a0a]/98 pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[94svh] sm:rounded-[2rem] sm:border sm:border-white/20 sm:shadow-2xl">
        <div className="flex flex-none items-center justify-between border-b border-white/10 px-5 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-7 sm:py-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="NOR AI Logo" className="h-9 w-9 rounded-full border border-white/20 object-cover shadow-md shadow-blue-500/20" />
            <div><p className="font-mono text-xs text-white/50">(NOR_AI)</p><h2 className="text-xl font-medium">{text.title}</h2></div>
          </div>
          <button type="button" onClick={onClose} aria-label={text.close} className="rounded-full border border-white/20 p-2 hover:bg-white hover:text-black cursor-pointer"><X size={20} /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-7">
          <div className="relative aspect-[4/3] max-h-[46dvh] flex-none overflow-hidden rounded-3xl border border-white/15 bg-white/5 sm:aspect-video sm:max-h-none">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            {!cameraOn && <div className="absolute inset-0 flex items-center justify-center"><Camera size={42} className="text-white/25" /></div>}
            <button type="button" onClick={cameraOn ? stopMedia : () => void startAssistant()} className="absolute bottom-3 start-3 rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm backdrop-blur-md hover:bg-white hover:text-black cursor-pointer">
              {cameraOn ? text.stopCamera : text.camera}
            </button>
          </div>

          <div aria-live="polite" className="min-h-20 flex-none py-4 sm:min-h-28 sm:py-6">
            {answer && <p className="text-base leading-relaxed sm:text-xl text-white font-medium">{answer}</p>}
            {status && (
              <div className="mt-1 flex items-center gap-2">
                {listening && <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />}
                <p className="text-sm text-white/70">{status}</p>
              </div>
            )}
          </div>

          <div className="mt-auto flex flex-none items-center gap-2 rounded-full border border-white/20 bg-white/5 p-2 ps-4">
            <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitTyped(); }} placeholder={text.ask} className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/40 text-white" />
            
            {/* Microphone Button with Real-Time Audio Level Visualizer */}
            <button
              type="button"
              onClick={toggleListening}
              disabled={loading || !cameraOn}
              aria-label={listening ? text.stop : text.listen}
              className={`relative rounded-full p-3 transition-all cursor-pointer ${
                listening ? 'bg-red-500 text-white shadow-lg shadow-red-500/50' : 'bg-white/10 hover:bg-white hover:text-black text-white'
              } disabled:opacity-30`}
            >
              {listening && audioLevel > 0.05 && (
                <span
                  className="absolute inset-0 rounded-full bg-red-400 opacity-60 animate-ping pointer-events-none"
                  style={{ transform: `scale(${1 + Math.min(0.8, audioLevel * 2)})` }}
                />
              )}
              {listening ? <MicOff size={20} className="relative z-10" /> : <Mic size={20} className="relative z-10" />}
            </button>

            <button type="button" onClick={submitTyped} disabled={loading || !cameraOn || !question.trim()} aria-label={text.send} className="rounded-full bg-white p-3 text-black transition hover:scale-105 disabled:opacity-30 cursor-pointer">
              {loading ? <LoaderCircle size={20} className="animate-spin" /> : <Send size={20} className="rtl:-scale-x-100" />}
            </button>
            {answer && <button type="button" onClick={() => speak(answer, () => startListeningRef.current())} aria-label={text.replay} className="rounded-full bg-white/10 p-3 hover:bg-white hover:text-black text-white cursor-pointer"><Volume2 size={20} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
};
