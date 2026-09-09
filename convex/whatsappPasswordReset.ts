import { Email } from "@convex-dev/auth/providers/Email";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { GenericActionCtx } from "convex/server";

/**
 * Fase 10: reset password lewat WhatsApp, bukan email — karena project ini
 * belum (dan tidak wajib) punya layanan pengirim email pihak ketiga, tapi
 * SUDAH punya jalur WhatsApp (Fonnte) yang aktif untuk notifikasi kontak
 * darurat (lihat convex/notifyContact.ts). "Email" di sini cuma nama tipe
 * provider bawaan @convex-dev/auth (pola Auth.js) — sendVerificationRequest
 * di bawah ini BEBAS mengirim kode lewat kanal apa pun, termasuk WhatsApp.
 *
 * Alur: user isi EMAIL akun di form "Lupa Password" → convex-auth memanggil
 * sendVerificationRequest ini → kita cari NOMOR HP yang tersimpan di akun
 * tsb (field users.phone, diisi user sendiri di halaman Profil) → kirim
 * kode 6 digit ke nomor itu via Fonnte. Kalau akun belum punya nomor HP
 * tersimpan, reset TIDAK BISA dilakukan (dilempar error yang jelas).
 */
/**
 * PENTING soal tipe `ctx` di bawah ini:
 *
 * Provider `Email()` dari @convex-dev/auth mewarisi tipe `EmailConfig`
 * bawaan Auth.js (@auth/core), yang HANYA mendeklarasikan 1 parameter untuk
 * `sendVerificationRequest` (tidak tahu-menahu soal `ctx` Convex). Padahal
 * saudaranya, provider `Phone()` milik convex-auth sendiri, punya tipe
 * `sendVerificationRequest` yang eksplisit menerima 2 parameter — `(params,
 * ctx)` — dan convex-auth memang SELALU memanggil kedua provider ini dengan
 * ctx aksi Convex di runtime. Kita tidak bisa pakai `Phone()` di sini karena
 * field `reset` pada provider `Password<DataModel>()` (lihat auth.ts) hanya
 * menerima `EmailConfig`. Solusinya: tulis implementasinya dengan tipe ctx
 * yang benar, lalu `cast` saat diserahkan ke `Email()` supaya TSC tidak
 * memaksakan tipe 1-parameter yang terlalu sempit itu. `GenericActionCtx<DataModel>`
 * dipakai (bukan `any`) supaya `runQuery`/`runAction` tetap type-safe penuh
 * terhadap skema project ini — sekaligus lolos rule ESLint no-explicit-any.
 */
async function sendVerificationRequest(
  { identifier: email, token }: { identifier: string; token: string },
  ctx: GenericActionCtx<DataModel>,
) {
  const phone: string | null = await ctx.runQuery(internal.users.getPhoneForPasswordReset, { email });
  if (!phone) {
    throw new Error(
      "Akun ini belum punya nomor HP tersimpan untuk reset password via WhatsApp. Silakan isi nomor HP di halaman Profil terlebih dahulu (kalau masih bisa login), atau hubungi admin.",
    );
  }
  const message = `Kode reset password PANIC BUTTON Anda: ${token}\n\nJangan bagikan kode ini ke siapa pun. Kode berlaku beberapa menit saja.`;
  const result = await ctx.runAction(internal.notifyContact.sendPasswordResetCode, { phone, message });
  if (!result.ok) {
    throw new Error("Gagal mengirim kode reset lewat WhatsApp. Coba lagi beberapa saat lagi.");
  }
}

export const WhatsAppOTPPasswordReset = Email({
  id: "whatsapp-otp-password-reset",

  async generateVerificationToken() {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const code = (array[0] % 1000000).toString().padStart(6, "0");
    return code;
  },

  // "expires" dipakai convex-auth sendiri buat kadaluarsa kode (default
  // beberapa menit) — kita cuma perlu identifier (email) & token (kode).
  // Cast di bawah ini AMAN: bukan menyembunyikan bug, cuma mengoreksi tipe
  // `EmailConfig["sendVerificationRequest"]` bawaan Auth.js yang terlalu
  // sempit (lihat penjelasan di atas fungsi `sendVerificationRequest`).
  sendVerificationRequest: sendVerificationRequest as unknown as Parameters<
    typeof Email
  >[0]["sendVerificationRequest"],
});
