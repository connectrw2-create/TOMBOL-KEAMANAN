import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useServiceWorker } from "@/hooks/use-service-worker";
import { AlarmProvider } from "@/hooks/use-alarm-context";
import { ErrorBoundary } from "@/components/error-boundary.tsx";
import { AppLayout } from "@/components/app-layout.tsx";
import { DefaultProviders } from "./components/providers/default.tsx";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
// Index TETAP diimpor langsung (bukan lazy) dengan sengaja: ini halaman
// utama/darurat (tombol panic + status alarm) yang HARUS tersedia instan
// begitu app dibuka, tanpa nunggu network round-trip tambahan untuk
// mengunduh chunk-nya -- penting justru saat koneksi lemah/situasi darurat,
// yang mana "lebih cepat terbuka" paling krusial. Index juga dipakai
// langsung sebagai layar AuthLoading/Unauthenticated di bawah, jadi ia
// sudah harus ada di bundle awal.
import Index from "./pages/Index.tsx";

// Halaman-halaman lain (admin, komunitas, analitik, dst.) bukan bagian dari
// alur darurat utama, jadi kodenya di-lazy-load: baru diunduh browser saat
// user benar-benar membuka halaman itu. Efeknya bundle JS awal jadi jauh
// lebih kecil -> Index (halaman darurat) terbuka lebih cepat, terutama di
// koneksi lemah. React.lazy() + <Suspense> (lihat AppLayout) menangani
// loading state-nya otomatis; tidak ada perubahan pada isi/logic tiap
// halaman itu sendiri, cuma CARA kodenya dimuat.
const ProfilePage = lazy(() => import("./pages/profile/page.tsx"));
const DevicesPage = lazy(() => import("./pages/devices/page.tsx"));
const AdminPage = lazy(() => import("./pages/admin/page.tsx"));
const CommunityPage = lazy(() => import("./pages/community/page.tsx"));
const AnalyticsPage = lazy(() => import("./pages/analytics/page.tsx"));
const FirmwarePage = lazy(() => import("./pages/firmware/page.tsx"));
const SmartPlugSetupPage = lazy(() => import("./pages/devices/smartplug-setup.tsx"));
const SmartPlugQueuePage = lazy(() => import("./pages/admin/smartplug-queue.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

function AuthenticatedApp() {
  return (
    <AlarmProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Index />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/devices/smartplug-setup" element={<SmartPlugSetupPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/smartplug-queue" element={<SmartPlugQueuePage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/firmware" element={<FirmwarePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AlarmProvider>
  );
}

function UnauthenticatedApp() {
  return (
    <Routes>
      <Route path="*" element={<Index />} />
    </Routes>
  );
}

export default function App() {
  useServiceWorker();
  return (
    <div className="dark">
      <ErrorBoundary>
        <DefaultProviders>
          <BrowserRouter>
            <AuthLoading>
              <Routes>
                <Route path="*" element={<Index />} />
              </Routes>
            </AuthLoading>
            <Authenticated>
              <AuthenticatedApp />
            </Authenticated>
            <Unauthenticated>
              <UnauthenticatedApp />
            </Unauthenticated>
          </BrowserRouter>
        </DefaultProviders>
      </ErrorBoundary>
    </div>
  );
}
