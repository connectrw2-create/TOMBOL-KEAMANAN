import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";
import { X, ScanLine, Image as GalleryIcon } from "lucide-react";

interface QRScannerModalProps {
  onScan: (data: string) => void;
  onClose: () => void;
  title?: string;
}

// Gambar dari galeri (terutama foto kamera HP) bisa sangat besar (4000x3000+).
// Menggambar itu ke canvas seukuran aslinya boros memori & lambat tanpa
// menambah keakuratan decode QR sama sekali -- QR tetap terbaca jelas pada
// resolusi yang jauh lebih kecil. Dibatasi ke sisi terpanjang maksimal ini.
const MAX_DECODE_DIMENSION = 1600;

/**
 * Fullscreen scanner untuk QR pairing perangkat.
 *
 * Mendukung DUA cara input:
 *  1) Kamera langsung (live, seperti sebelumnya) via getUserMedia.
 *  2) Pilih gambar dari galeri/berkas -- dipakai saat QR device ditampilkan
 *     di HP lain dan sudah disimpan sebagai gambar (lihat tombol "Simpan QR
 *     ke Galeri" di halaman setup perangkat), jadi pairing tidak perlu 2 HP
 *     sekaligus (satu menampilkan QR "hidup", satu lagi mengarahkan kamera).
 *
 * Kamera dihentikan begitu kode ditemukan atau modal ditutup, sama seperti
 * sebelumnya -- opsi galeri tidak mengubah perilaku itu.
 */
export function QRScannerModal({ onScan, onClose, title = "Pindai Kode QR" }: QRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [decodingFile, setDecodingFile] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        scanLoop();
      } catch {
        setError("Tidak bisa mengakses kamera. Pastikan izin kamera diizinkan di browser, atau pilih gambar QR dari galeri.");
      }
    }

    function scanLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        onScan(code.data);
        return; // stop loop — cleanup effect will stop the camera
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePickFromGallery() {
    setGalleryError(null);
    fileInputRef.current?.click();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset value supaya memilih file yang sama dua kali tetap memicu onChange.
    e.target.value = "";
    if (!file) return;

    setGalleryError(null);
    setDecodingFile(true);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_DECODE_DIMENSION / Math.max(img.width, img.height));
        const canvas = canvasRef.current ?? document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setGalleryError("Tidak bisa memproses gambar ini di browser.");
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          onScan(code.data);
        } else {
          setGalleryError("Tidak ada kode QR yang terbaca dari gambar ini. Coba gambar lain yang lebih jelas/tidak terpotong.");
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
        setDecodingFile(false);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setDecodingFile(false);
      setGalleryError("Gagal membuka file ini sebagai gambar.");
    };
    img.src = objectUrl;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <p className="text-white font-bold text-sm">{title}</p>
        <button onClick={onClose} className="p-2 text-white cursor-pointer">
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <p className="text-white/80 text-sm text-center px-8">{error}</p>
        ) : (
          <>
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
            <div className="relative z-10 w-64 h-64 border-2 border-primary/80 rounded-2xl">
              <ScanLine className="absolute inset-x-0 mx-auto top-1/2 -translate-y-1/2 size-8 text-primary/70 animate-pulse" />
            </div>
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="px-6 pb-6 pt-2 flex flex-col items-center gap-3">
        <p className="text-white/60 text-xs text-center">
          {error ? "Kamera tidak tersedia — pilih gambar QR dari galeri sebagai gantinya." : "Arahkan kamera ke kode QR, atau pilih gambar QR yang sudah tersimpan."}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelected}
        />
        <button
          onClick={handlePickFromGallery}
          disabled={decodingFile}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium border border-white/20 disabled:opacity-60 cursor-pointer"
        >
          <GalleryIcon className="size-4" />
          {decodingFile ? "Memproses gambar..." : "Pilih dari Galeri"}
        </button>

        {galleryError && (
          <p className="text-red-400 text-xs text-center px-4">{galleryError}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
