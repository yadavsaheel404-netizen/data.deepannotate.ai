import React, { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, KeyRound, LogOut, Loader2, AlertCircle } from "lucide-react";
import logoImg from "@/assets/logo.png";

export default function TwoFactorGate() {
  const [code, setCode] = useState("");
  const [isBackup, setIsBackup] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { completeTwoFactor, signOut, loading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setErrorMsg(null);
    try {
      await completeTwoFactor(code.trim());
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to verify 2FA code.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 backdrop-blur-xl p-8 rounded-2xl shadow-2xl relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <img src={logoImg} alt="DeepAnnotate Logo" className="h-12 w-auto mb-4" />
          <div className="h-12 w-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-3">
            <ShieldCheck className="h-6 w-6 text-cyan-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-100">Two-Factor Authentication</h1>
          <p className="text-sm text-slate-400 mt-1">
            {isBackup
              ? "Enter one of your 12-character backup codes."
              : "Enter the 6-digit security code from your authenticator app."}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              {isBackup ? "Backup Code" : "Authenticator Code"}
            </label>
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={isBackup ? "e.g. a1b2c3d4e5f6" : "000000"}
              maxLength={isBackup ? 20 : 6}
              autoFocus
              className="bg-slate-950/60 border-slate-800 focus:border-cyan-500 text-center text-lg font-mono tracking-widest text-slate-100 placeholder:text-slate-600 h-12"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full h-11 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-lg shadow-cyan-500/20 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Verifying...
              </>
            ) : (
              "Verify Code"
            )}
          </Button>
        </form>

        {/* Footer Actions */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => {
              setIsBackup(!isBackup);
              setCode("");
              setErrorMsg(null);
            }}
            className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {isBackup ? "Use Authenticator App" : "Use Backup Code"}
          </button>

          <button
            type="button"
            onClick={() => signOut()}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
