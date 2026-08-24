export function DigitalGlobeGraphic() {
  return (
    <div className="relative w-full overflow-hidden flex justify-center items-end shrink-0 pointer-events-none -mb-4">
      <svg
        viewBox="0 0 800 380"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-[540px] max-h-[220px] xl:max-h-[260px] h-auto drop-shadow-[0_15px_35px_rgba(2,132,199,0.2)]"
      >
        <defs>
          <radialGradient id="globeGrad" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#1E50A2" />
            <stop offset="40%" stopColor="#0B2B6B" />
            <stop offset="85%" stopColor="#051438" />
            <stop offset="100%" stopColor="#02091A" />
          </radialGradient>

          <radialGradient id="atmoGlow" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="#38BDF8" stopOpacity="0" />
            <stop offset="95%" stopColor="#38BDF8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0284C7" stopOpacity="0.6" />
          </radialGradient>

          <radialGradient id="pinGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0284C7" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer Glow Halo */}
        <circle cx="400" cy="380" r="300" fill="url(#atmoGlow)" />

        {/* Globe Base Sphere */}
        <circle cx="400" cy="380" r="290" fill="url(#globeGrad)" stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.4" />

        {/* Latitude Lines */}
        <ellipse cx="400" cy="380" rx="290" ry="100" fill="none" stroke="#38BDF8" strokeWidth="0.75" strokeOpacity="0.25" strokeDasharray="4 4" />
        <ellipse cx="400" cy="380" rx="280" ry="170" fill="none" stroke="#38BDF8" strokeWidth="0.75" strokeOpacity="0.25" strokeDasharray="4 4" />

        {/* Longitude Curved Lines */}
        <path d="M 400 90 Q 270 380 400 670" fill="none" stroke="#38BDF8" strokeWidth="0.75" strokeOpacity="0.3" />
        <path d="M 400 90 Q 530 380 400 670" fill="none" stroke="#38BDF8" strokeWidth="0.75" strokeOpacity="0.3" />

        {/* Dotted Continents */}
        <g fill="#38BDF8" fillOpacity="0.5">
          <circle cx="300" cy="220" r="2.5" />
          <circle cx="315" cy="210" r="3" />
          <circle cx="330" cy="205" r="2.5" />
          <circle cx="345" cy="200" r="3.5" />
          <circle cx="360" cy="208" r="2.5" />

          <circle cx="410" cy="190" r="3" />
          <circle cx="425" cy="180" r="2.5" />
          <circle cx="440" cy="185" r="3.5" />
          <circle cx="455" cy="195" r="2.5" />
          <circle cx="470" cy="205" r="3" />

          <circle cx="510" cy="210" r="3" />
          <circle cx="530" cy="220" r="2.5" />
          <circle cx="550" cy="235" r="3.5" />
        </g>

        {/* Connecting Lines */}
        <path d="M 240 220 Q 340 150 435 180" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.7" strokeDasharray="3 3" />
        <path d="M 435 180 Q 520 160 560 230" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.7" strokeDasharray="3 3" />

        {/* Location Pins */}
        <g transform="translate(240, 220)">
          <circle cx="0" cy="0" r="12" fill="url(#pinGlow)" />
          <circle cx="0" cy="0" r="5" fill="#0284C7" />
          <path d="M 0 -16 C -5 -16 -8 -10 -8 -5 C -8 2 0 8 0 8 C 0 8 8 2 8 -5 C 8 -10 5 -16 0 -16 Z" fill="#0284C7" stroke="#FFFFFF" strokeWidth="1.8" />
          <circle cx="0" cy="-8" r="2.8" fill="#FFFFFF" />
        </g>

        <g transform="translate(435, 180)">
          <circle cx="0" cy="0" r="14" fill="url(#pinGlow)" />
          <path d="M 0 -18 C -6 -18 -10 -11 -10 -5 C -10 2 0 10 0 10 C 0 10 10 2 10 -5 C 10 -11 6 -18 0 -18 Z" fill="#0284C7" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="0" cy="-9" r="3" fill="#FFFFFF" />
        </g>

        <g transform="translate(560, 230)">
          <circle cx="0" cy="0" r="14" fill="url(#pinGlow)" />
          <path d="M 0 -18 C -6 -18 -10 -11 -10 -5 C -10 2 0 10 0 10 C 0 10 10 2 10 -5 C 10 -11 6 -18 0 -18 Z" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="0" cy="-9" r="3" fill="#FFFFFF" />
        </g>

        <g transform="translate(320, 280)">
          <circle cx="0" cy="0" r="12" fill="url(#pinGlow)" />
          <path d="M 0 -16 C -5 -16 -8 -10 -8 -5 C -8 2 0 8 0 8 C 0 8 8 2 8 -5 C 8 -10 5 -16 0 -16 Z" fill="#0284C7" stroke="#FFFFFF" strokeWidth="1.8" />
          <circle cx="0" cy="-8" r="2.8" fill="#FFFFFF" />
        </g>
      </svg>
    </div>
  );
}
