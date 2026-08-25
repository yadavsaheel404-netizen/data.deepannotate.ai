import logoImg from '@/assets/logo.png';

export function DeepAnnotateLogoIcon({ className = 'h-16 w-16' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[16px] bg-[#0E1F3E] flex items-center justify-center p-2 shadow-md ${className}`}>
      <img
        src={logoImg}
        alt="data.deepannotate.ai logo"
        className="h-full w-full object-contain"
      />
    </div>
  );
}

export function DeepAnnotateLogo() {
  return (
    <div className="flex items-center gap-3 select-none">
      <DeepAnnotateLogoIcon className="h-10 w-10 shrink-0 shadow-sm" />
      <span className="font-display text-xl font-extrabold tracking-tight text-[#0E1F3E]">
        data.deepannotate<span className="text-[#0BA8D3]">.ai</span>
      </span>
    </div>
  );
}

