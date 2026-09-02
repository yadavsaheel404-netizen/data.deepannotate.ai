import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { firebaseAuth } from "@/lib/firebase";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  QrCode,
  Copy,
  Check,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function TwoFactorSection() {
  const { profile, fetchProfile } = useAuthStore();
  const isEnabled = Boolean((profile as any)?.two_factor_enabled);

  // Setup state
  const [step, setStep] = useState<"idle" | "qr" | "backup">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enrollment data
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Backup codes
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [savedBackupAck, setSavedBackupAck] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  // Disable modal / state
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);

  console.log("[2FA RENDER] isEnabled:", isEnabled, "| step:", step, "| qrDataUrl:", Boolean(qrDataUrl), "| secret:", Boolean(secret), "| loading:", loading);

  const getFirebaseIdToken = async (): Promise<string> => {
    let user = firebaseAuth.currentUser;
    if (!user) {
      // Wait briefly for Firebase auth state to resolve if loading
      await new Promise<void>((resolve) => {
        const unsubscribe = firebaseAuth.onAuthStateChanged((u) => {
          user = u;
          unsubscribe();
          resolve();
        });
        setTimeout(() => {
          unsubscribe();
          resolve();
        }, 2500);
      });
    }

    if (!user) {
      throw new Error("No active Firebase session found. Please sign in again.");
    }
    // Use cached token (false) to prevent triggering onIdTokenChanged auth re-initialization
    return await user.getIdToken(false);
  };

  const generateQrCodeDataUrl = async (uri: string): Promise<string> => {
    const fn = (QRCode as any).toDataURL || (QRCode as any).default?.toDataURL;
    if (typeof fn === "function") {
      return await fn(uri, { margin: 2, width: 220 });
    }
    throw new Error("QR code generation library failed to initialize.");
  };

  const handleStartEnrollment = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("[2FA] Requesting Firebase ID token...");
      const idToken = await getFirebaseIdToken();
      console.log("[2FA] ID Token obtained successfully.");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      console.log("[2FA] Initiating fetch to twofa-enroll-start...");
      const res = await fetch(`${supabaseUrl}/functions/v1/twofa-enroll-start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ idToken }),
      });

      console.log("[2FA] twofa-enroll-start response status:", res.status);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("[2FA] enrollment start error payload:", data);
        throw new Error(data.error || data.details || `Server error (${res.status})`);
      }

      if (!data.uri || !data.secret) {
        throw new Error("Server payload missing 2FA secret or URI.");
      }

      console.log("[2FA] Enrollment secret received, generating QR code...");
      setSecret(data.secret);
      const url = await generateQrCodeDataUrl(data.uri);
      setQrDataUrl(url);
      setStep("qr");
      console.log("[2FA] QR code ready. Transitioned step state to 'qr'.");
    } catch (err: any) {
      console.error("[2FA] handleStartEnrollment error:", err);
      const msg = err?.message || String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmCode.trim()) return;

    setLoading(true);
    setError(null);
    try {
      console.log("[2FA] Confirming code with twofa-enroll-confirm...");
      const idToken = await getFirebaseIdToken();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/twofa-enroll-confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ idToken, code: confirmCode.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[2FA] confirm error payload:", data);
        throw new Error(data.error || data.details || "Verification failed.");
      }

      setBackupCodes(data.backupCodes || []);
      setStep("backup");
      toast.success("2FA code verified successfully!");
      if (profile?.id) fetchProfile(profile.id);
    } catch (err: any) {
      console.error("[2FA] handleConfirmEnrollment error:", err);
      const msg = err?.message || String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishBackup = () => {
    if (!savedBackupAck) {
      toast.error("Please confirm you have saved your backup codes.");
      return;
    }
    setStep("idle");
    setSecret(null);
    setQrDataUrl(null);
    setConfirmCode("");
    setBackupCodes([]);
    setSavedBackupAck(false);
    toast.success("Two-Factor Authentication is now enabled!");
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableCode.trim()) return;

    setDisableLoading(true);
    try {
      console.log("[2FA] Disabling 2FA...");
      const idToken = await getFirebaseIdToken();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/twofa-disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ idToken, code: disableCode.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[2FA] disable error payload:", data);
        throw new Error(data.error || data.details || "Failed to disable 2FA.");
      }

      setShowDisableModal(false);
      setDisableCode("");
      toast.success("Two-Factor Authentication has been disabled.");
      if (profile?.id) fetchProfile(profile.id);
    } catch (err: any) {
      console.error("[2FA] handleDisable2FA error:", err);
      toast.error(err?.message || String(err));
    } finally {
      setDisableLoading(false);
    }
  };

  const copySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
    toast.success("Secret copied to clipboard");
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 2000);
    toast.success("Backup codes copied to clipboard");
  };

  const downloadBackupCodes = () => {
    const text = `DeepAnnotate.ai - 2FA Backup Codes\nGenerated: ${new Date().toISOString()}\n\n` + backupCodes.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deepannotate-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="bg-white border border-[#E5E7EB] shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${isEnabled ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-[#0A1628] flex items-center gap-2">
                Two-Factor Authentication (TOTP)
                {isEnabled && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-sm text-[#6B7280]">
                Secure your account with Google Authenticator, Authy, or any TOTP app.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-700 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Authentication Error</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* STATE 1: 2FA ENABLED */}
        {isEnabled && step === "idle" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-900">
                <p className="font-medium">Two-Factor Authentication is currently enabled on your account.</p>
                <p className="text-xs text-emerald-700 mt-1">
                  Every sign-in will require a 6-digit security code from your authenticator app.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDisableModal(true)}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
              >
                <ShieldAlert className="h-4 w-4 mr-2" />
                Disable 2FA
              </Button>
            </div>
          </div>
        )}

        {/* STATE 2: 2FA DISABLED — IDLE */}
        {!isEnabled && step === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-[#4B5563]">
              Adding 2FA adds an extra layer of protection to your account by requiring a code from your mobile authenticator app when logging in.
            </p>

            <Button
              type="button"
              onClick={handleStartEnrollment}
              disabled={loading}
              className="bg-[#0A1628] hover:bg-[#050C16] text-white font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating Secret...
                </>
              ) : (
                <>
                  <QrCode className="h-4 w-4 mr-2 text-[#06B6D4]" />
                  Enable 2FA
                </>
              )}
            </Button>
          </div>
        )}

        {/* STATE 3: ENROLLMENT - SCAN QR CODE & ENTER CODE */}
        {step === "qr" && qrDataUrl && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-center gap-6 p-5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm shrink-0">
                <img src={qrDataUrl} alt="2FA QR Code" className="h-44 w-44" />
              </div>

              <div className="space-y-3 text-sm text-slate-700">
                <h4 className="font-bold text-[#0A1628]">Step 1: Scan QR Code</h4>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600">
                  <li>Open Google Authenticator, Authy, or 1Password.</li>
                  <li>Tap <strong>+</strong> and scan this QR code.</li>
                  <li>If you can't scan, copy the key below manually.</li>
                </ol>

                {secret && (
                  <div className="pt-2">
                    <span className="text-xs text-slate-500 block mb-1">Secret Key (Manual Entry):</span>
                    <div className="flex items-center gap-2">
                      <code className="px-2.5 py-1.5 rounded bg-white border border-slate-200 text-xs font-mono text-[#06B6D4] font-bold select-all">
                        {secret}
                      </code>
                      <Button type="button" size="sm" variant="ghost" onClick={copySecret} className="h-7 text-xs text-slate-600 hover:bg-slate-200">
                        {copiedSecret ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* STEP 2: CONFIRM VERIFICATION CODE */}
            <form onSubmit={handleConfirmEnrollment} className="space-y-4 pt-4 border-t border-slate-200">
              <div>
                <h4 className="font-bold text-[#0A1628] text-sm mb-1">Step 2: Enter Verification Code</h4>
                <p className="text-xs text-slate-500 mb-3">Enter the 6-digit code shown in your authenticator app to activate 2FA.</p>
                <div className="flex items-center gap-3">
                  <Input
                    type="text"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                    className="max-w-[180px] bg-white border-slate-300 font-mono text-center tracking-widest text-base font-bold text-[#0A1628]"
                  />
                  <Button type="submit" disabled={loading || confirmCode.trim().length !== 6} className="bg-[#0A1628] hover:bg-[#050C16] text-white font-semibold">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2 text-[#06B6D4]" />}
                    Confirm & Enable
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setStep("idle")} className="text-slate-600">
                    Cancel
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* STATE 4: BACKUP CODES DISPLAY */}
        {step === "backup" && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm space-y-1">
              <h4 className="font-bold flex items-center gap-2 text-amber-800">
                <KeyRound className="h-4 w-4 text-amber-600" /> Save Your Backup Codes
              </h4>
              <p className="text-xs text-amber-700">
                If you lose access to your phone or authenticator app, these backup codes are the ONLY way to access your account. Store them safely.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-[#0A1628] font-bold text-center select-all">
              {backupCodes.map((c, i) => (
                <div key={i} className="p-2 rounded bg-white border border-slate-200 shadow-sm">
                  {c}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={copyBackupCodes} className="border-slate-300 text-slate-700">
                {copiedBackup ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                Copy All
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={downloadBackupCodes} className="border-slate-300 text-slate-700">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download .txt
              </Button>
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-4">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={savedBackupAck}
                  onChange={(e) => setSavedBackupAck(e.target.checked)}
                  className="rounded border-slate-300 text-[#06B6D4] focus:ring-[#06B6D4]/20"
                />
                <span>I have saved these backup codes in a safe place.</span>
              </label>

              <Button
                type="button"
                onClick={handleFinishBackup}
                disabled={!savedBackupAck}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold w-full sm:w-auto"
              >
                Complete 2FA Setup
              </Button>
            </div>
          </div>
        )}

        {/* DISABLE MODAL / INLINE DIALOG */}
        {showDisableModal && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
            <h4 className="font-bold text-rose-900 text-sm">Disable Two-Factor Authentication</h4>
            <p className="text-xs text-rose-700">
              Enter a current 6-digit TOTP code or backup code to confirm disabling 2FA.
            </p>
            <form onSubmit={handleDisable2FA} className="flex items-center gap-3">
              <Input
                type="text"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="Code or backup code"
                className="max-w-[200px] bg-white border-rose-300 font-mono text-center text-sm font-bold text-[#0A1628]"
                autoFocus
              />
              <Button type="submit" variant="destructive" disabled={disableLoading || !disableCode.trim()}>
                {disableLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Confirm Disable
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowDisableModal(false)} className="text-slate-600">
                Cancel
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
