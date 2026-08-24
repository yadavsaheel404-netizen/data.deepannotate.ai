export function DeepAnnotateLogoIcon({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="40" height="40" rx="10" fill="#0284C7" />
      {/* Outer frame */}
      <rect x="7" y="7" width="22" height="22" rx="4" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeDasharray="3 2" />
      {/* Corner nodes */}
      <rect x="5.5" y="5.5" width="5" height="5" fill="#38BDF8" rx="1" />
      <rect x="25.5" y="5.5" width="5" height="5" fill="#38BDF8" rx="1" />
      <rect x="5.5" y="25.5" width="5" height="5" fill="#38BDF8" rx="1" />
      {/* Mountain & Sun graphic inside frame */}
      <path d="M 10 24 L 14 18 L 18 24" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="14" r="2" fill="#FFFFFF" />
      {/* Annotation Pencil */}
      <g transform="translate(18, 18)">
        <path d="M 2 14 L 14 2 L 18 6 L 6 18 Z" fill="#0B1E48" stroke="#FFFFFF" strokeWidth="1.5" />
        <path d="M 2 14 L 0 20 L 6 18 Z" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="1" />
      </g>
    </svg>
  );
}

export function DeepAnnotateLogo() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <DeepAnnotateLogoIcon className="h-9 w-9 shrink-0 shadow-sm" />
      <span className="font-display text-xl font-extrabold tracking-tight text-[#0B1E48]">
        data.deepannotate<span className="text-[#0284C7]">.ai</span>
      </span>
    </div>
  );
}
