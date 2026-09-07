import React, { useEffect, useRef, useState } from 'react';

const VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260611_104107_121bfb5a-b1df-4e0d-8240-25b81f7cc85d.mp4';

export const ScrollVideo: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetProgressRef = useRef(0);
  const smoothedProgressRef = useRef(0);
  const isSeekingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    };
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Desktop only: scroll scrubbing
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

    let animId: number;
    const render = () => {
      const target = targetProgressRef.current;
      smoothedProgressRef.current += (target - smoothedProgressRef.current) * 0.08;
      const smoothed = smoothedProgressRef.current;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.duration) {
        const targetTime = smoothed * video.duration;

        if (!isSeekingRef.current && Math.abs(video.currentTime - targetTime) > 0.03) {
          isSeekingRef.current = true;
          video.currentTime = targetTime;
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(animId);
    };
  }, [isMobile]);

  // Video initialization and guaranteed play without play button
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

    const startPlaying = () => {
      if (video) {
        video.muted = true;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch(() => {});
        }
      }
    };

    startPlaying();

    window.addEventListener('touchstart', startPlaying, { passive: true, once: true });
    window.addEventListener('scroll', startPlaying, { passive: true, once: true });
    window.addEventListener('click', startPlaying, { passive: true, once: true });

    return () => {
      window.removeEventListener('touchstart', startPlaying);
      window.removeEventListener('scroll', startPlaying);
      window.removeEventListener('click', startPlaying);
    };
  }, []);

  return (
    <div className="fixed inset-0 -z-10 bg-[#0a0a0a] overflow-hidden pointer-events-none select-none">
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
        onPlaying={() => setIsPlaying(true)}
        onSeeked={() => {
          isSeekingRef.current = false;
        }}
        className={`absolute inset-0 h-full w-full object-cover pointer-events-none select-none transition-opacity duration-700 ${
          isMobile && !isPlaying ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ pointerEvents: 'none' }}
      />
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
    </div>
  );
};
