import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import { AppNav } from "@/components/app-nav.tsx";
import { EscortWidget } from "@/components/escort-widget.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";

/**
 * Wraps every authenticated top-level page so AppNav is always present —
 * this is the fix for "nav bar hilang setelah pindah halaman, harus balik
 * ke home dulu". Padding here reserves space so fixed nav never overlaps
 * page content: bottom padding for the mobile tab bar, left padding for
 * the desktop sidebar.
 *
 * Suspense di sini membungkus HANYA <Outlet /> (area konten halaman), bukan
 * AppNav/EscortWidget di luarnya -- jadi saat pindah ke halaman yang
 * di-lazy-load (lihat React.lazy() di App.tsx), nav bar & tombol darurat
 * TETAP terlihat/tidak hilang-muncul, cuma area kontennya yang sebentar
 * menampilkan spinner sambil kode halaman itu diunduh.
 */
export function AppLayout() {
  return (
    <>
      <div className="pb-20 md:pb-0 md:pl-20">
        <Suspense fallback={<PageLoadingFallback />}>
          <Outlet />
        </Suspense>
      </div>
      <EscortWidget />
      <AppNav />
    </>
  );
}

function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
