import React, { useEffect, useRef, useState } from 'react';

const VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260611_104107_121bfb5a-b1df-4e0d-8240-25b81f7cc85d.mp4';

export const ScrollVideo: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<number | null>(null);
  const isSeekingRef = useRef(false);
  const pendingTimeRef = useRef<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    const updateDevice = () => setIsMobile(mediaQuery.matches);
    updateDevice();
    mediaQuery.addEventListener('change', updateDevice);
    return () => mediaQuery.removeEventListener('change', updateDevice);
  }, []);

  // Phone/tablet: play the background normally. Desktop: map scroll position to
  // video time. The seek runs only once per painted scroll frame, never in a loop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    if (isMobile) {
      const play = () => {
        video.muted = true;
        void video.play().catch(() => {
          // A browser may delay autoplay until the first user interaction.
        });
      };

      play();
      window.addEventListener('pointerdown', play, { passive: true, once: true });
      return () => window.removeEventListener('pointerdown', play);
    }

    video.pause();
    video.loop = false;

    const applySeek = () => {
      frameRef.current = null;
      const duration = video.duration;
      const nextTime = pendingTimeRef.current;
      if (!Number.isFinite(duration) || !nextTime || isSeekingRef.current) return;

      if (Math.abs(video.currentTime - nextTime) < 0.04) return;
      isSeekingRef.current = true;
      video.currentTime = nextTime;
    };

    const updateFromScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(Math.max(window.scrollY / maxScroll, 0), 1) : 0;
      if (Number.isFinite(video.duration)) pendingTimeRef.current = progress * video.duration;

      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(applySeek);
      }
    };

    const onSeeked = () => {
      isSeekingRef.current = false;
      if (pendingTimeRef.current !== null && Math.abs(video.currentTime - pendingTimeRef.current) >= 0.04) {
        updateFromScroll();
      }
    };

    video.addEventListener('loadedmetadata', updateFromScroll, { once: true });
    video.addEventListener('seeked', onSeeked);
    window.addEventListener('scroll', updateFromScroll, { passive: true });
    window.addEventListener('resize', updateFromScroll, { passive: true });
    updateFromScroll();

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      isSeekingRef.current = false;
      video.removeEventListener('loadedmetadata', updateFromScroll);
      video.removeEventListener('seeked', onSeeked);
      window.removeEventListener('scroll', updateFromScroll);
      window.removeEventListener('resize', updateFromScroll);
    };
  }, [isMobile]);

  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 bg-[#0a0a0a] overflow-hidden pointer-events-none">
      <video
        ref={videoRef}
        src={VIDEO_URL}
        muted
        playsInline
        webkit-playsinline="true"
        autoPlay={isMobile}
        loop
        preload="metadata"
        disablePictureInPicture
        disableRemotePlayback
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
};
