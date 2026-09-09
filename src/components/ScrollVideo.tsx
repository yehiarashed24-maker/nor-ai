import React, { useEffect, useRef } from 'react';

const VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260611_104107_121bfb5a-b1df-4e0d-8240-25b81f7cc85d.mp4';

export const ScrollVideo: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('loop', '');

    const startPlay = () => {
      if (video) {
        video.muted = true;
        void video.play().catch(() => {});
      }
    };

    startPlay();

    // Auto-loop safety fallback in case iOS/Safari stops at end
    const handleEnded = () => {
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => {});
      }
    };
    video.addEventListener('ended', handleEnded);

    window.addEventListener('touchstart', startPlay, { passive: true, once: true });
    window.addEventListener('pointerdown', startPlay, { passive: true, once: true });
    window.addEventListener('scroll', startPlay, { passive: true, once: true });

    return () => {
      video.removeEventListener('ended', handleEnded);
      window.removeEventListener('touchstart', startPlay);
      window.removeEventListener('pointerdown', startPlay);
      window.removeEventListener('scroll', startPlay);
    };
  }, []);

  return (
    <div aria-hidden="true" className="fixed inset-0 z-0 bg-[#0a0a0a] overflow-hidden pointer-events-none select-none">
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
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/25" />
    </div>
  );
};
