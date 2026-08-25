import logoImg from '@/assets/logo.png';

export function DeepAnnotateLogoIcon({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <img
      src={logoImg}
      alt="data.deepannotate.ai logo"
      className={`object-contain ${className}`}
    />
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

