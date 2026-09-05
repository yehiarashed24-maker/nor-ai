import React, { useEffect, useRef, useState } from 'react';
import heroImage from '../assets/hero.png';

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260611_104107_121bfb5a-b1df-4e0d-8240-25b81f7cc85d.mp4';

export const ScrollVideo: React.FC = () => {
  const [isMobile] = useState(() => window.matchMedia('(max-width: 768px), (pointer: coarse)').matches);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const [framesReady, setFramesReady] = useState(false);

  const framesRef = useRef<ImageBitmap[]>([]);
  const targetProgressRef = useRef(0);
  const smoothedProgressRef = useRef(0);
  const lastDrawnIndexRef = useRef(-1);
  const isSeekingRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);

  // 1. Frame Extraction
  useEffect(() => {
    if (isMobile) return;
    let isCancelled = false;
    const abortController = new AbortController();

    async function loadAndExtractFrames() {
      try {
        const response = await fetch(VIDEO_URL, {
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        if (isCancelled) return;

        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = blobUrl;

        await new Promise<void>((resolve, reject) => {
          if (video.readyState >= 1) {
            resolve();
            return;
          }
          const onLoaded = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error('Video metadata load failed'));
          };
          const cleanup = () => {
            video.removeEventListener('loadedmetadata', onLoaded);
            video.removeEventListener('error', onError);
          };
          video.addEventListener('loadedmetadata', onLoaded);
          video.addEventListener('error', onError);
        });

        if (isCancelled) return;

        const duration = video.duration || 5;
        // Frame count = clamp(round(duration * 24), 30, 120)
        const frameCount = Math.min(Math.max(Math.round(duration * 24), 30), 120);

        // Scale to max width 1280
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        const scale = vw > 1280 ? 1280 / vw : 1;
        const targetWidth = Math.round(vw * scale);
        const targetHeight = Math.round(vh * scale);

        const extractedFrames: ImageBitmap[] = [];
        const safeDuration = Math.max(0.1, duration - 0.05);

        for (let i = 0; i < frameCount; i++) {
          if (isCancelled) {
            extractedFrames.forEach((bmp) => bmp.close());
            return;
          }

          const targetTime = frameCount > 1 ? (i / (frameCount - 1)) * safeDuration : 0;
          video.currentTime = targetTime;

          await new Promise<void>((resolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            };
            video.addEventListener('seeked', onSeeked);
          });

          if (isCancelled) {
            extractedFrames.forEach((bmp) => bmp.close());
            return;
          }

          let bitmap: ImageBitmap;
          try {
            bitmap = await createImageBitmap(video, {
              resizeWidth: targetWidth,
              resizeHeight: targetHeight,
              resizeQuality: 'high',
            });
          } catch {
            bitmap = await createImageBitmap(video);
          }

          extractedFrames.push(bitmap);
        }

        if (!isCancelled) {
          framesRef.current = extractedFrames;
          lastDrawnIndexRef.current = -1; // Force redraw on canvas
          setFramesReady(true);
        } else {
          extractedFrames.forEach((bmp) => bmp.close());
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Frame pre-extraction failed or aborted:', err);
        }
      }
    }

    loadAndExtractFrames();

    return () => {
      isCancelled = true;
      abortController.abort();
      framesRef.current.forEach((bmp) => bmp.close());
      framesRef.current = [];
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [isMobile]);

  // 2. Passive Scroll Listener & Calculation
  useEffect(() => {
    if (isMobile) return;
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const innerHeight = window.innerHeight;
      const maxScroll = scrollHeight - innerHeight;
      const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      targetProgressRef.current = Math.min(Math.max(progress, 0), 1);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  // 3. Canvas Sizing & Resize Listener
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      lastDrawnIndexRef.current = -1; // Trigger redraw
    }
  };

  useEffect(() => {
    if (isMobile) return;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [isMobile]);

  // 4. Animation Loop
  useEffect(() => {
    if (isMobile) return;
    let animId: number;

    const render = () => {
      // Smooth progress calculation
      const target = targetProgressRef.current;
      smoothedProgressRef.current += (target - smoothedProgressRef.current) * 0.1;
      const smoothed = smoothedProgressRef.current;

      const frames = framesRef.current;
      const canvas = canvasRef.current;

      if (frames.length > 0 && canvas) {
        // Redraw canvas with frames
        const frameIndex = Math.min(
          Math.max(Math.floor(smoothed * frames.length), 0),
          frames.length - 1
        );

        if (frameIndex !== lastDrawnIndexRef.current) {
          const ctx = canvas.getContext('2d');
          const frame = frames[frameIndex];

          if (ctx && frame) {
            const cw = canvas.width;
            const ch = canvas.height;
            const fw = frame.width;
            const fh = frame.height;

            // Cover math: scale = max of canvas/frame ratios, center overflow
            const scale = Math.max(cw / fw, ch / fh);
            const drawW = fw * scale;
            const drawH = fh * scale;
            const dx = (cw - drawW) / 2;
            const dy = (ch - drawH) / 2;

            ctx.clearRect(0, 0, cw, ch);
            ctx.drawImage(frame, dx, dy, drawW, drawH);
            lastDrawnIndexRef.current = frameIndex;
          }
        }
      } else if (fallbackVideoRef.current) {
        // Scrub fallback video
        const fallback = fallbackVideoRef.current;
        if (fallback.duration && !Number.isNaN(fallback.duration)) {
          const targetTime = smoothed * fallback.duration;
          if (
            !isSeekingRef.current &&
            Math.abs(fallback.currentTime - targetTime) > 0.001
          ) {
            isSeekingRef.current = true;
            fallback.currentTime = targetTime;
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isMobile]);

  if (isMobile) {
    return (
      <div className="fixed inset-0 -z-10 overflow-hidden bg-[#0a0a0a]">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <video
          src={VIDEO_URL}
          muted
          playsInline
          autoPlay
          loop
          preload="metadata"
          poster={heroImage}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 -z-10 bg-[#0a0a0a] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!framesReady && (
        <video
          ref={fallbackVideoRef}
          src={VIDEO_URL}
          muted
          playsInline
          autoPlay={false}
          className="absolute inset-0 h-full w-full object-cover"
          onSeeked={() => {
            isSeekingRef.current = false;
          }}
        />
      )}

      {/* Contrast overlay */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
    </div>
  );
};
