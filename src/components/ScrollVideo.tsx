import React, { useEffect, useRef } from 'react';

const VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260611_104107_121bfb5a-b1df-4e0d-8240-25b81f7cc85d.mp4';

export const ScrollVideo: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetProgressRef = useRef(0);
  const smoothedProgressRef = useRef(0);
  const isSeekingRef = useRef(false);
  const pendingTimeRef = useRef<number | null>(null);

  const drawFrame = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.readyState < 2) return;

    // alpha: false gives a 2x-3x GPU rendering speedup on mobile devices
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    if (!vw || !vh || !cw || !ch) return;

    const scale = Math.max(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.drawImage(video, dx, dy, dw, dh);
  };

  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    if (isSeekingRef.current) {
      pendingTimeRef.current = time;
      return;
    }

    if (Math.abs(video.currentTime - time) > 0.03) {
      isSeekingRef.current = true;
      video.currentTime = time;
    }
  };

  const handleSeeked = () => {
    isSeekingRef.current = false;
    // Only draw when the decoder has finished preparing the exact frame
    drawFrame();

    if (pendingTimeRef.current !== null) {
      const nextTime = pendingTimeRef.current;
      pendingTimeRef.current = null;
      seekTo(nextTime);
    }
  };

  // 1. Passive scroll listener
  useEffect(() => {
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
  }, []);

  // 2. High-performance Canvas sizing
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const isMobile = window.innerWidth <= 768;
      // Cap mobile resolution to 1x DPR to avoid GPU overload
      const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      drawFrame();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // 3. Smooth animation loop
  useEffect(() => {
    let animId: number;
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    const render = () => {
      const target = targetProgressRef.current;
      smoothedProgressRef.current += (target - smoothedProgressRef.current) * (isMobile ? 0.25 : 0.1);
      const smoothed = smoothedProgressRef.current;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.duration) {
        const targetTime = smoothed * video.duration;
        seekTo(targetTime);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  // 4. Prime video playback buffer for Safari
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.controls = false;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.removeAttribute('controls');
    video.play().catch(() => {});

    const unlock = () => {
      if (video && video.paused) {
        video.play().catch(() => {});
      }
    };
    window.addEventListener('touchstart', unlock, { passive: true, once: true });
    window.addEventListener('scroll', unlock, { passive: true, once: true });

    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('scroll', unlock);
    };
  }, []);

  return (
    <div className="fixed inset-0 -z-10 bg-[#0a0a0a] overflow-hidden pointer-events-none select-none">
      {/* High-speed hardware-accelerated Canvas with zero native controls */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
      />
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />

      {/* Hidden off-screen video element strictly used as decoder source */}
      <video
        ref={videoRef}
        src={VIDEO_URL}
        muted
        playsInline
        webkit-playsinline="true"
        autoPlay
        loop
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        className="pointer-events-none select-none"
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0.01,
          pointerEvents: 'none',
        }}
        onSeeked={handleSeeked}
        onLoadedData={drawFrame}
        onCanPlay={drawFrame}
      />
    </div>
  );
};
