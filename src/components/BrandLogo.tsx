import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showScanAnimation?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  className = '',
  showScanAnimation = true,
}) => {
  const sizeMap = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  const dimension = sizeMap[size] || sizeMap.md;

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 rounded-2xl bg-gradient-to-br from-stone-900 via-stone-950 to-neutral-900 p-1.5 shadow-md shadow-red-950/20 border border-stone-800/80 group select-none ${dimension} ${className}`}
    >
      {/* Outer ambient glow */}
      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-red-600/30 via-rose-500/20 to-emerald-500/30 opacity-70 blur-xs transition group-hover:opacity-100" />

      {/* SVG Modern Vision Logo */}
      <svg
        className="relative h-full w-full drop-shadow-sm"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Tomato Red Gradient */}
          <linearGradient id="bd-tomato-grad" x1="8" y1="12" x2="40" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="50%" stopColor="#DC2626" />
            <stop offset="100%" stopColor="#991B1B" />
          </linearGradient>

          {/* Leaf Emerald Gradient */}
          <linearGradient id="bd-leaf-grad" x1="24" y1="4" x2="36" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>

          {/* Specular Highlight */}
          <radialGradient id="bd-gloss" cx="19" cy="19" r="10" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>

          {/* Scanning Beam Gradient */}
          <linearGradient id="bd-laser-grad" x1="6" y1="24" x2="42" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
            <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Outer Corner Optical Reticles */}
        <path
          d="M 6 12 L 6 8 A 2 2 0 0 1 8 6 L 12 6"
          stroke="#38BDF8"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M 36 6 L 40 6 A 2 2 0 0 1 42 8 L 42 12"
          stroke="#38BDF8"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M 6 36 L 6 40 A 2 2 0 0 0 8 42 L 12 42"
          stroke="#38BDF8"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M 36 42 L 40 42 A 2 2 0 0 0 42 40 L 42 36"
          stroke="#38BDF8"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Tomato Fruit Geometry */}
        <path
          d="M 24 16 C 14 16 10 21 10 29 C 10 37 16 41 24 41 C 32 41 38 37 38 29 C 38 21 34 16 24 16 Z"
          fill="url(#bd-tomato-grad)"
        />

        {/* Organic Tomato Segments / Contours */}
        <path
          d="M 17 20 C 14 24 14 34 19 39"
          stroke="#B91C1C"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.4"
        />
        <path
          d="M 31 20 C 34 24 34 34 29 39"
          stroke="#B91C1C"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.4"
        />

        {/* Gloss Specular Light */}
        <ellipse cx="18" cy="23" rx="4" ry="2.5" transform="rotate(-25 18 23)" fill="url(#bd-gloss)" />

        {/* Emerald Stem & Calyx Leaves */}
        <path
          d="M 24 16 C 24 13 23 9 21 7 C 23.5 7.5 25 10 25 14"
          stroke="#10B981"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        {/* Center Calyx Leaf */}
        <path
          d="M 24 16 L 24 11 C 25 12.5 26 13.5 28 14 Z"
          fill="url(#bd-leaf-grad)"
        />
        {/* Left Calyx Leaf */}
        <path
          d="M 24 16 C 21 15 17 14 15 16 C 17 18 21 17.5 24 16 Z"
          fill="url(#bd-leaf-grad)"
        />
        {/* Right Calyx Leaf */}
        <path
          d="M 24 16 C 27 15 31 14 33 16 C 31 18 27 17.5 24 16 Z"
          fill="url(#bd-leaf-grad)"
        />

        {/* Central Precision Crosshairs */}
        <circle
          cx="24"
          cy="28.5"
          r="8.5"
          stroke="#38BDF8"
          strokeWidth="1.2"
          strokeDasharray="2 2"
          opacity="0.9"
        />
        <circle cx="24" cy="28.5" r="2" fill="#38BDF8" />

        {/* Target crosshair ticks */}
        <line x1="24" y1="17.5" x2="24" y2="20" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="24" y1="37" x2="24" y2="39.5" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="13" y1="28.5" x2="15.5" y2="28.5" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="32.5" y1="28.5" x2="35" y2="28.5" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />

        {/* AI Laser Scan Line Overlay */}
        {showScanAnimation && (
          <line
            x1="8"
            y1="28.5"
            x2="40"
            y2="28.5"
            stroke="url(#bd-laser-grad)"
            strokeWidth="1.5"
          />
        )}
      </svg>
    </div>
  );
};
