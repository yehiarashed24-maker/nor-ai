import React, { useEffect, useRef, useState } from 'react';
import heroImage from '../assets/hero.png';

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260611_104107_121bfb5a-b1df-4e0d-8240-25b81f7cc85d.mp4';

export const ScrollVideo: React.FC = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#0a0a0a]">
      <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <video
        src={VIDEO_URL}
        muted
        playsInline
        autoPlay
        loop
        className="absolute inset-0 h-full w-full object-cover opacity-60 mix-blend-screen"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/90 pointer-events-none" />
    </div>
  );
};
