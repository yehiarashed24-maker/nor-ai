import React, { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, Mic, MicOff, Send, Volume2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const memoryKey = 'nor_ai_memory';

// Clean WAV encoder that produces valid 16kHz mono PCM WAV
const encodeWAV = (samples: Float32Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
};

// Downsamples from AudioContext rate (e.g. 48kHz / 44.1kHz) to 16kHz
const downsampleTo16k = (buffer: Float32Array, inputRate: number): Float32Array => {
  if (inputRate === 16000) return buffer;
  const ratio = inputRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
};

const selectVoice = (language: 'ar' | 'en') => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (language === 'ar') {
    // Look for Arabic voices. On iOS, Maged, Tarik, Laila are ar-SA or ar-001.
    const arVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('ar'));
    const preferred = ['Maged', 'Majed', 'Tarik', 'Laila', 'Mariam', 'Google', 'Hamed'];
    for (const name of preferred) {
      const match = arVoices.find((v) => v.name.includes(name));
      if (match) return match;
    }
    return arVoices[0] || null;
  } else {
    const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    const preferred = ['Samantha', 'Ava', 'Google US English', 'Aria', 'Siri'];
    for (const name of preferred) {
      const match = enVoices.find((v) => v.name.includes(name));
      if (match) return match;
    }
    return enVoices[0] || null;
  }
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
    ask: 'اسأل نور عما أمامك…', listen: 'اضغط للتحدث', stop: 'إنهاء السؤال', send: 'إرسال', replay: 'إعادة الرد صوتيًا',
    starting: 'أجهز الكاميرا والمايك…', ready: 'الكاميرا جاهزة. اضغط على المايك واسأل عن اللي حواليك.',
    listening: 'أنا أسمعك… تحدث الآن', heard: 'جاري تجهيز السؤال…', thinking: 'أحلل الصورة والسؤال…', readyAgain: 'جاهز لسؤالك التالي.',
    cameraError: 'تعذر تشغيل الكاميرا أو المايك. يرجى السماح بالصلاحيات.',
    apiError: 'تعذر تحليل الصورة. حاول مرة أخرى.',
    soundTip: 'تأكد من إلغاء وضع الصامت (Silent Mode) في الهاتف لسماع الرد.',
  },
  en: {
    title: 'NOR Assistant', close: 'Close', camera: 'Start assistant', stopCamera: 'Stop assistant',
    ask: 'Ask NOR about what is in front of you…', listen: 'Tap to speak', stop: 'Finish question', send: 'Send', replay: 'Read answer aloud',
    starting: 'Preparing camera and microphone…', ready: 'Camera ready. Tap the mic and ask about your surroundings.',
    listening: 'Listening… speak now', heard: 'Preparing your question…', thinking: 'Analyzing image and question…', readyAgain: 'Ready for your next question.',
    cameraError: 'Could not access camera or microphone. Please allow permissions.',
    apiError: 'Could not analyze. Please try again.',
    soundTip: 'Make sure your phone is not on Silent Mode to hear the voice.',
  },
};

export const AssistantModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { lang } = useLanguage();
  const text = labels[lang];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const recordedSamplesRef = useRef<Float32Array[]>([]);
  const isRecordingRef = useRef(false);
  const activeRef = useRef(false);
  const loadingRef = useRef(false);
  const speechTokenRef = useRef(0);
  const speechFallbackRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const lastSoundTimeRef = useRef(0);

  const [cameraOn, setCameraOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState(text.starting);
  const [answer, setAnswer] = useState('');

  const stopMedia = () => {
    isRecordingRef.current = false;
    setRecording(false);
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  const speak = (value: string, onFinished?: () => void) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onFinished?.();
      return;
    }
    const token = ++speechTokenRef.current;
    if (speechFallbackRef.current !== null) window.clearTimeout(speechFallbackRef.current);
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(value);
    const voice = selectVoice(lang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      // iOS Safari has built-in voice for ar-SA (not ar-EG)
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
      console.warn('TTS error:', e);
      finish();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      finish();
    }

    const estimatedDuration = Math.min(16000, Math.max(2500, value.length * (lang === 'ar' ? 85 : 65)));
    speechFallbackRef.current = window.setTimeout(finish, estimatedDuration + 1200);
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

  const sendRequest = async ({ typedQuestion, audioBlob }: { typedQuestion?: string; audioBlob?: Blob }) => {
    const image = captureFrame();
    if (!image || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setAnswer('');
    setStatus(text.thinking);

    try {
      let audio: string | undefined;
      if (audioBlob) {
        audio = await blobToDataUrl(audioBlob);
      }

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
      setStatus(text.readyAgain);
      speak(data.answer);
    } catch (err: any) {
      console.error('Request failed:', err);
      loadingRef.current = false;
      setLoading(false);
      setStatus(text.apiError);
      speak(text.apiError);
    }
  };

  const stopRecordingAndSend = () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setRecording(false);
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const chunks = recordedSamplesRef.current;
    recordedSamplesRef.current = [];
    const totalSamples = chunks.reduce((acc, chunk) => acc + chunk.length, 0);

    if (totalSamples < 4000) {
      // Too short (< 0.25s)
      setStatus(text.ready);
      return;
    }

    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const sampleRate = audioContextRef.current?.sampleRate || 44100;
    const downsampled = downsampleTo16k(merged, sampleRate);
    const wavBlob = encodeWAV(downsampled, 16000);

    setStatus(text.heard);
    void sendRequest({ audioBlob: wavBlob });
  };

  const startRecording = () => {
    if (loadingRef.current || !streamRef.current) return;

    // Ensure AudioContext is running
    if (audioContextRef.current?.state === 'suspended') {
      void audioContextRef.current.resume();
    }

    // Unlock speech synthesis on user interaction
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0.01;
      window.speechSynthesis.speak(u);
    } catch {}

    recordedSamplesRef.current = [];
    lastSoundTimeRef.current = performance.now();
    isRecordingRef.current = true;
    setRecording(true);
    setStatus(text.listening);

    // Auto-stop after 10 seconds max if user doesn't stop
    silenceTimerRef.current = window.setTimeout(() => {
      if (isRecordingRef.current) {
        stopRecordingAndSend();
      }
    }, 10000);
  };

  const toggleListening = () => {
    if (recording) {
      stopRecordingAndSend();
    } else {
      startRecording();
    }
  };

  const setupAudioEngine = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;
      const audioStream = new MediaStream([audioTrack]);
      const source = audioContext.createMediaStreamSource(audioStream);

      // 4096 buffer gives ~92ms per process callback
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        recordedSamplesRef.current.push(new Float32Array(inputData));

        // Simple silence detection: check energy
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const now = performance.now();

        if (rms > 0.02) {
          lastSoundTimeRef.current = now;
        } else if (now - lastSoundTimeRef.current > 1600 && recordedSamplesRef.current.length > 8) {
          // After 1.6s of silence and at least ~0.7s of audio, auto finish
          stopRecordingAndSend();
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (e) {
      console.warn('AudioEngine setup notice:', e);
    }
  };

  const startAssistant = async () => {
    try {
      stopMedia();
      setStatus(text.starting);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus(text.cameraError + ' (Secure HTTPS required)');
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

      setupAudioEngine(stream);
      setCameraOn(true);
      setStatus(text.ready);

      // Announce readiness aloud in Arabic/English
      speak(text.ready);
    } catch (err: any) {
      console.error('Camera/mic access error:', err);
      setStatus(text.cameraError + (err?.message ? ` (${err.message})` : ''));
    }
  };

  useEffect(() => {
    // Unlock iOS Safari speech synthesis on user interaction
    const unlockSpeech = () => {
      if (speechTokenRef.current > 0) return;
      try {
        const utterance = new SpeechSynthesisUtterance(' ');
        utterance.volume = 0.01;
        window.speechSynthesis.speak(utterance);
        speechTokenRef.current = 1;
      } catch {}
      window.removeEventListener('touchstart', unlockSpeech);
      window.removeEventListener('click', unlockSpeech);
    };
    window.addEventListener('touchstart', unlockSpeech, { once: true });
    window.addEventListener('click', unlockSpeech, { once: true });

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
      window.removeEventListener('touchstart', unlockSpeech);
      window.removeEventListener('click', unlockSpeech);
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
            {answer ? (
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-base font-normal leading-relaxed text-white sm:text-xl">{answer}</p>
                <button
                  type="button"
                  onClick={() => speak(answer)}
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white/90 transition hover:bg-white hover:text-black cursor-pointer"
                >
                  <Volume2 size={14} />
                  <span>{text.replay}</span>
                </button>
              </div>
            ) : null}

            {status && (
              <div className="mt-2 flex items-center gap-2 text-sm text-white/75">
                {recording && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
                  </span>
                )}
                <p>{status}</p>
              </div>
            )}

            <p className="mt-2 text-[11px] text-white/40">{text.soundTip}</p>
          </div>

          {/* Controls: Input + Big Mic button */}
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
              aria-label={recording ? text.stop : text.listen}
              className={`relative rounded-full p-3.5 transition-all duration-300 cursor-pointer disabled:opacity-30 ${
                recording
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 scale-105 animate-pulse'
                  : 'bg-white/10 text-white hover:bg-white hover:text-black'
              }`}
            >
              {recording ? <MicOff size={22} /> : <Mic size={22} />}
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
