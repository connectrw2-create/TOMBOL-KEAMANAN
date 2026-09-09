import { forwardRef, useState, useEffect, useCallback } from "react";
import { type VariantProps } from "class-variance-authority";
import { Loader2, LogIn, LogOut, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Button, buttonVariants } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";

export interface SignInButtonProps
  extends Omit<React.ComponentProps<"button">, "onClick">,
    VariantProps<typeof buttonVariants> {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  showIcon?: boolean;
  signInText?: string;
  signOutText?: string;
  loadingText?: string;
  asChild?: boolean;
}

// ── Auth Modal (Login + Register) ────────────────────────────────────────────
function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const [mode, setMode] = useState<"login" | "register" | "forgot-request" | "forgot-verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Tutup modal otomatis saat Convex sudah konfirmasi authenticated
  useEffect(() => {
    if (isAuthenticated) onClose();
  }, [isAuthenticated, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "register") {
        await signIn("password", { email, password, name, flow: "signUp" });
        toast.success("Akun berhasil dibuat. Selamat datang!");
      } else if (mode === "login") {
        await signIn("password", { email, password, flow: "signIn" });
        toast.success("Berhasil masuk.");
      } else if (mode === "forgot-request") {
        await signIn("password", { email, flow: "reset" });
        toast.success("Kode reset sudah dikirim ke WhatsApp Anda.");
        setMode("forgot-verify");
      } else if (mode === "forgot-verify") {
        await signIn("password", { email, code: resetCode, newPassword, flow: "reset-verification" });
        toast.success("Password berhasil diganti. Anda otomatis masuk.");
      }
      // Jangan panggil onClose() di sini — biarkan useEffect di atas yang handle
      // setelah isAuthenticated berubah jadi true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      toast.error(mode === "login" ? "Gagal masuk. Periksa email dan password." : msg);
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<typeof mode, string> = {
    login: "Masuk ke PANIC BUTTON",
    register: "Daftar Akun Baru",
    "forgot-request": "Lupa Password",
    "forgot-verify": "Masukkan Kode & Password Baru",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-black tracking-wide">
            {titles[mode]}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">Nama Lengkap</Label>
              <Input
                id="auth-name"
                type="text"
                placeholder="Budi Santoso"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          {mode === "forgot-verify" ? (
            <p className="text-xs text-muted-foreground">
              Kode reset dikirim lewat WhatsApp ke nomor HP yang terdaftar untuk <span className="font-semibold text-foreground">{email}</span>.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                placeholder="budi@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-password">Password</Label>
              <div className="relative">
                <Input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimal 8 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => setMode("forgot-request")}
                  className="text-xs text-muted-foreground hover:text-primary hover:underline cursor-pointer"
                >
                  Lupa password?
                </button>
              )}
            </div>
          )}

          {mode === "forgot-verify" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="reset-code">Kode dari WhatsApp</Label>
                <Input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Password Baru</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Minimal 8 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label={showNewPassword ? "Sembunyikan password" : "Tampilkan password"}
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          <Button type="submit" className="w-full font-bold" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin mr-2" />}
            {mode === "login" ? "Masuk" : mode === "register" ? "Daftar" : mode === "forgot-request" ? "Kirim Kode via WhatsApp" : "Ganti Password"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground mt-2">
          {mode === "login" && (
            <>
              Belum punya akun?{" "}
              <button
                type="button"
                className="text-primary font-semibold hover:underline"
                onClick={() => setMode("register")}
              >
                Daftar di sini
              </button>
            </>
          )}
          {mode === "register" && (
            <>
              Sudah punya akun?{" "}
              <button
                type="button"
                className="text-primary font-semibold hover:underline"
                onClick={() => setMode("login")}
              >
                Masuk
              </button>
            </>
          )}
          {(mode === "forgot-request" || mode === "forgot-verify") && (
            <button
              type="button"
              className="text-primary font-semibold hover:underline"
              onClick={() => setMode("login")}
            >
              Kembali ke halaman Masuk
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── SignInButton ──────────────────────────────────────────────────────────────
export const SignInButton = forwardRef<HTMLButtonElement, SignInButtonProps>(
  (
    {
      onClick,
      disabled,
      showIcon = true,
      signInText = "Masuk",
      signOutText = "Keluar",
      loadingText,
      className,
      variant,
      size,
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const { signOut } = useAuthActions();
    const { isAuthenticated, isLoading } = useConvexAuth();
    const [modalOpen, setModalOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (isAuthenticated) {
        setSigningOut(true);
        try {
          await signOut();
        } finally {
          setSigningOut(false);
        }
      } else {
        setModalOpen(true);
      }
    };

    const busy = isLoading || signingOut;
    const isDisabled = disabled || busy;

    const buttonText = busy
      ? (loadingText ?? (isAuthenticated ? "Keluar..." : "Memuat..."))
      : isAuthenticated
        ? signOutText
        : signInText;

    const icon = busy ? (
      <Loader2 className="size-4 animate-spin" />
    ) : isAuthenticated ? (
      <LogOut className="size-4" />
    ) : (
      <LogIn className="size-4" />
    );

    return (
      <>
        <Button
          ref={ref}
          onClick={handleClick}
          disabled={isDisabled}
          variant={variant}
          size={size}
          className={className}
          asChild={asChild}
          aria-label={isAuthenticated ? "Keluar dari akun" : "Masuk ke akun"}
          {...props}
        >
          {showIcon && icon}
          {buttonText}
        </Button>
        <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  },
);

SignInButton.displayName = "SignInButton";
