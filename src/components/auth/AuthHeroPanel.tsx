import authHeroImg from '@/assets/auth-hero.png';

export function AuthHeroPanel() {
  return (
    <div className="relative hidden w-1/2 h-screen max-h-screen overflow-hidden lg:flex shrink-0 select-none bg-slate-900 border-r border-slate-800">
      <img
        src={authHeroImg}
        alt="Smart Annotation Better AI Future"
        className="w-full h-full object-cover object-left-top"
      />
    </div>
  );
}
