import React, { useEffect, useRef } from 'react';

const VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260611_104107_121bfb5a-b1df-4e0d-8240-25b81f7cc85d.mp4';

export const ScrollVideo: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetProgressRef = useRef(0);
  const smoothedProgressRef = useRef(0);
  const isSeekingRef = useRef(false);

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

  useEffect(() => {
    let animId: number;
    let isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    const render = () => {
      const target = targetProgressRef.current;
      // Faster smoothing on mobile to feel more responsive, smoother on desktop
      smoothedProgressRef.current += (target - smoothedProgressRef.current) * (isMobile ? 0.2 : 0.08);
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
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="fixed inset-0 -z-10 bg-[#0a0a0a] overflow-hidden">
      <video
        ref={videoRef}
        src={VIDEO_URL}
        muted
        playsInline
        autoPlay
        loop
        className="absolute inset-0 h-full w-full object-cover"
        onSeeked={() => {
          isSeekingRef.current = false;
        }}
      />
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
    </div>
  );
};
