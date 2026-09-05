import React, { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, Mic, MicOff, Send, Volume2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const memoryKey = 'nor_ai_memory';

const selectVoice = (language: 'ar' | 'en') => {
  const locale = language === 'ar' ? 'ar' : 'en';
  const preferredNames = language === 'ar'
    ? ['Majed', 'Maged', 'Hamed', 'Laila', 'Google العربية', 'Microsoft Hamed']
    : ['Samantha', 'Ava', 'Google US English', 'Microsoft Aria'];
  return window.speechSynthesis.getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith(locale))
    .sort((a, b) => {
      const aIndex = preferredNames.findIndex((name) => a.name.includes(name));
      const bIndex = preferredNames.findIndex((name) => b.name.includes(name));
      const aRank = aIndex === -1 ? preferredNames.length : aIndex;
      const bRank = bIndex === -1 ? preferredNames.length : bIndex;
      return aRank - bRank || Number(b.localService) - Number(a.localService);
    })[0];
};

const getRecorderOptions = (): MediaRecorderOptions | undefined => {
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
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
    listening: 'أنا أسمعك…', heard: 'سمعتك. أجهز سؤالك…', thinking: 'أحلل الصورة والسؤال…', readyAgain: 'جاهز لسؤالك التالي.',
    cameraError: 'تعذر تشغيل الكاميرا أو المايك. اسمح بالصلاحيات ثم اضغط تشغيل المساعد.',
    apiError: 'تعذر تحليل الصورة. حاول مرة أخرى بعد لحظة.',
    noRecorder: 'التسجيل الصوتي غير مدعوم هنا. يمكنك كتابة السؤال وإرساله.',
  },
  en: {
    title: 'NOR Assistant', close: 'Close', camera: 'Start assistant', stopCamera: 'Stop assistant',
    ask: 'Ask NOR about what is in front of you…', listen: 'Start listening', stop: 'Stop listening', send: 'Send', replay: 'Read answer aloud',
    starting: 'Preparing the camera and microphone…', ready: 'Camera ready. Ask me about your surroundings.',
    listening: 'I am listening…', heard: 'Got it. Preparing your question…', thinking: 'Analyzing the image and question…', readyAgain: 'Ready for your next question.',
    cameraError: 'Could not start the camera or microphone. Allow access, then select Start assistant.',
    apiError: 'The image could not be analyzed. Please try again in a moment.',
    noRecorder: 'Audio recording is unavailable here. You can type and send your question.',
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
  const preRollRef = useRef<Blob[]>([]);
  const speechChunksRef = useRef<Blob[]>([]);
  const voiceStartedAtRef = useRef(0);
  const silenceStartedAtRef = useRef(0);
  const loudFramesRef = useRef(0);
  const noiseFloorRef = useRef(0.01);
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

  const stopMedia = () => {
    stopListening();
    if (vadFrameRef.current !== null) window.cancelAnimationFrame(vadFrameRef.current);
    vadFrameRef.current = null;
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    recorderRef.current = null;
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
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = lang === 'ar' ? 'ar-EG' : 'en-US';
    utterance.voice = selectVoice(lang) ?? null;
    utterance.rate = lang === 'ar' ? 0.88 : 0.95;
    let finished = false;
    const finish = () => {
      if (finished || token !== speechTokenRef.current) return;
      finished = true;
      if (speechFallbackRef.current !== null) window.clearTimeout(speechFallbackRef.current);
      speechFallbackRef.current = null;
      onFinished?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
    const estimatedDuration = Math.min(16000, Math.max(2500, value.length * (lang === 'ar' ? 85 : 65)));
    speechFallbackRef.current = window.setTimeout(finish, estimatedDuration + 1200);
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
    try {
      const saved = JSON.parse(localStorage.getItem(memoryKey) || '[]');
      const memories = Array.isArray(saved) ? saved : [];
      const response = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: typedQuestion, audio, image, language: lang, memories }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
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
    } catch {
      loadingRef.current = false;
      setLoading(false);
      setStatus(text.apiError);
      speak(text.apiError, () => window.setTimeout(() => startListeningRef.current(), 700));
    }
  };

  const processVoice = async (blob: Blob) => {
    if (blob.size < 500) {
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

  const startListening = () => {
    if (!activeRef.current || loadingRef.current || !streamRef.current || !recorderRef.current) return;
    listeningRef.current = true;
    speechDetectedRef.current = false;
    finalizingRef.current = false;
    preRollRef.current = [];
    speechChunksRef.current = [];
    voiceStartedAtRef.current = 0;
    silenceStartedAtRef.current = 0;
    loudFramesRef.current = 0;
    calibrateUntilRef.current = performance.now() + 700;
    setListening(true);
    setStatus(text.listening);
  };
  useEffect(() => { startListeningRef.current = startListening; });

  const setupAudioCapture = (stream: MediaStream) => {
    if (typeof MediaRecorder === 'undefined') {
      setStatus(text.noRecorder);
      return;
    }
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      setStatus(text.noRecorder);
      return;
    }
    const audioStream = new MediaStream([audioTrack]);
    const recorder = new MediaRecorder(audioStream, getRecorderOptions());
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      if (speechDetectedRef.current) speechChunksRef.current.push(event.data);
      else if (listeningRef.current) preRollRef.current = [...preRollRef.current.slice(-3), event.data];
      if (finalizingRef.current) {
        finalizingRef.current = false;
        const chunks = speechChunksRef.current;
        const type = recorder.mimeType || event.data.type || 'audio/webm';
        speechChunksRef.current = [];
        processVoiceRef.current(new Blob(chunks, { type }));
      }
    };
    recorder.start(250);

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    audioContext.createMediaStreamSource(audioStream).connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
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
        if (now < calibrateUntilRef.current && !speechDetectedRef.current) {
          noiseFloorRef.current = Math.max(0.004, noiseFloorRef.current * 0.85 + level * 0.15);
        }
        const speechThreshold = Math.max(0.018, noiseFloorRef.current * 2.6);
        const silenceThreshold = Math.max(0.012, noiseFloorRef.current * 1.6);

        if (!speechDetectedRef.current) {
          loudFramesRef.current = level > speechThreshold ? loudFramesRef.current + 1 : 0;
          if (now >= calibrateUntilRef.current && loudFramesRef.current >= 3) {
            speechDetectedRef.current = true;
            speechChunksRef.current = [...preRollRef.current];
            preRollRef.current = [];
            voiceStartedAtRef.current = now;
            silenceStartedAtRef.current = 0;
            setStatus(text.listening);
          }
        } else if (level < silenceThreshold) {
          if (!silenceStartedAtRef.current) silenceStartedAtRef.current = now;
          const spokeLongEnough = now - voiceStartedAtRef.current > 350;
          if (spokeLongEnough && now - silenceStartedAtRef.current > 850) {
            listeningRef.current = false;
            setListening(false);
            finalizingRef.current = true;
            setStatus(text.heard);
            recorder.requestData();
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setupAudioCapture(stream);
      setCameraOn(true);
      setStatus(text.ready);
      speak(text.ready, () => startListeningRef.current());
    } catch {
      setStatus(text.cameraError);
      speak(text.cameraError);
    }
  };

  useEffect(() => {
    activeRef.current = open;
    if (open) void startAssistant();
    else {
      stopMedia();
      speechTokenRef.current += 1;
      window.speechSynthesis.cancel();
    }
    return () => { activeRef.current = false; };
  }, [open, lang]);

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
          <button type="button" onClick={onClose} aria-label={text.close} className="rounded-full border border-white/20 p-2 hover:bg-white hover:text-black"><X size={20} /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-7">
          <div className="relative aspect-[4/3] max-h-[46dvh] flex-none overflow-hidden rounded-3xl border border-white/15 bg-white/5 sm:aspect-video sm:max-h-none">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            {!cameraOn && <div className="absolute inset-0 flex items-center justify-center"><Camera size={42} className="text-white/25" /></div>}
            <button type="button" onClick={cameraOn ? stopMedia : () => void startAssistant()} className="absolute bottom-3 start-3 rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm backdrop-blur-md hover:bg-white hover:text-black">
              {cameraOn ? text.stopCamera : text.camera}
            </button>
          </div>

          <div aria-live="polite" className="min-h-20 flex-none py-4 sm:min-h-28 sm:py-6">
            {answer && <p className="text-base leading-relaxed sm:text-xl">{answer}</p>}
            {status && <p className="mt-1 text-sm text-white/65">{status}</p>}
          </div>

          <div className="mt-auto flex flex-none items-center gap-2 rounded-full border border-white/20 bg-white/5 p-2 ps-4">
            <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitTyped(); }} placeholder={text.ask} className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/40" />
            <button type="button" onClick={listening ? stopListening : startListening} disabled={loading || !cameraOn} aria-label={listening ? text.stop : text.listen} className={`rounded-full p-3 transition ${listening ? 'bg-red-500 text-white' : 'bg-white/10 hover:bg-white hover:text-black'} disabled:opacity-30`}>
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button type="button" onClick={submitTyped} disabled={loading || !cameraOn || !question.trim()} aria-label={text.send} className="rounded-full bg-white p-3 text-black transition hover:scale-105 disabled:opacity-30">
              {loading ? <LoaderCircle size={20} className="animate-spin" /> : <Send size={20} className="rtl:-scale-x-100" />}
            </button>
            {answer && <button type="button" onClick={() => speak(answer, () => startListeningRef.current())} aria-label={text.replay} className="rounded-full bg-white/10 p-3 hover:bg-white hover:text-black"><Volume2 size={20} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
};
