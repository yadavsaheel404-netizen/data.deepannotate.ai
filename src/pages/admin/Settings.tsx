import TwoFactorSection from '@/components/profile/TwoFactorSection';

export default function AdminSettings() {
  return (
    <div className="space-y-6 max-w-4xl animate-slide-up">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#0A1628]">Admin Settings & Security</h1>
        <p className="text-sm text-[#6B7280]">
          Manage your account security and two-factor authentication (2FA).
        </p>
      </div>

      <TwoFactorSection />
    </div>
  );
}
