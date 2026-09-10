import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Cpu, MessageCircle } from "lucide-react";

/**
 * Halaman generator firmware LAMA sudah dinonaktifkan (mengandung beberapa
 * bug arsitektur yang sudah diperbaiki di firmware terpisah, di luar web
 * app ini). Firmware sekarang didistribusikan sebagai file .ino terpisah
 * langsung dari admin/pengembang, bukan lagi digenerate dari dalam app.
 *
 * Route ini SENGAJA dipertahankan (bukan dihapus dari routing) supaya link
 * lama yang mungkin ke-bookmark pengguna tidak menampilkan 404, cukup
 * menampilkan pesan penjelasan ini.
 */
export default function FirmwarePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/devices")} className="p-2 rounded-lg hover:bg-card transition-colors cursor-pointer">
          <ArrowLeft className="size-5 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-foreground flex items-center gap-2">
            <Cpu className="size-4 text-primary" /> Firmware
          </h1>
        </div>
      </div>

      <motion.div
        className="max-w-md mx-auto px-4 py-10 text-center space-y-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mx-auto size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <MessageCircle className="size-7 text-primary" />
        </div>
        <p className="font-bold text-foreground">Firmware tidak lagi dibagikan lewat halaman ini</p>
        <p className="text-sm text-muted-foreground">
          Untuk mendapatkan firmware terbaru, cara pemasangan, atau pengaturan WiFi perangkat, silakan hubungi admin secara langsung.
        </p>
        <button
          onClick={() => navigate("/devices")}
          className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold cursor-pointer"
        >
          Kembali ke Perangkat
        </button>
      </motion.div>
    </div>
  );
}
