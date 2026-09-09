import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

// Convex Auth routes (sign in, sign out, session)
auth.addHttpRoutes(http);

function statusFor(result: { rateLimited?: boolean }): number {
  return result.rateLimited ? 429 : 200;
}

// Heartbeat from Wemos D1
http.route({
  path: "/wemos/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json() as { deviceId: string; pairingCode: string; wifi?: number; battery?: number };
    const result = await ctx.runMutation(internal.iot.heartbeat, {
      deviceId: body.deviceId,
      pairingCode: body.pairingCode,
      wifiStrength: body.wifi,
      batteryLevel: body.battery,
    });
    return new Response(JSON.stringify(result), {
      status: statusFor(result),
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Fase 8: laporan sensor tambahan (pintu/api/air) dari device Wemos-series.
// Sebelumnya endpoint ini belum ada sama sekali — internal.iot.reportSensorEvent
// sudah lama tertulis tapi tidak ada satupun jalur HTTP yang memanggilnya,
// jadi laporan sensor dari firmware manapun tidak pernah benar-benar sampai.
http.route({
  path: "/wemos/sensor/report",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json() as { deviceId: string; pairingCode: string; sensorKind: "door" | "fire" | "flood"; triggered: boolean };
    const result = await ctx.runMutation(internal.iot.reportSensorEvent, {
      deviceId: body.deviceId,
      pairingCode: body.pairingCode,
      sensorKind: body.sensorKind,
      triggered: body.triggered,
    });
    return new Response(JSON.stringify(result), {
      status: statusFor(result),
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Alarm ON -- SATU endpoint untuk personal MAUPUN komunal. Server yang
// mendeteksi sendiri dari deviceId (lihat internal.iot.getDeviceRoutingInfo)
// device ini terdaftar sebagai apa, lalu memanggil mutation yang sesuai.
// Firmware tidak perlu lagi tahu/pilih "personal" atau "community" --
// tinggal selalu panggil /wemos/alarm/on, apa pun tipe device-nya.
// /wemos/community/alarm/on TETAP ADA (alias) supaya firmware versi lama
// yang masih eksplisit memanggil endpoint komunal tetap jalan tanpa upgrade.
async function handleAlarmOn(ctx: ActionCtx, request: Request) {
  const body = await request.json() as { deviceId: string; pairingCode: string; type: "panic" | "silent" };
  const routing = await ctx.runQuery(internal.iot.getDeviceRoutingInfo, { deviceId: body.deviceId });
  const mutationRef = routing.found && routing.deviceType === "community"
    ? internal.iot.activateCommunityAlarm
    : internal.iot.activateAlarm;
  const result = await ctx.runMutation(mutationRef, {
    deviceId: body.deviceId,
    pairingCode: body.pairingCode,
    type: body.type ?? "panic",
  });
  return new Response(JSON.stringify(result), {
    status: statusFor(result),
    headers: { "Content-Type": "application/json" },
  });
}

async function handleAlarmOff(ctx: ActionCtx, request: Request) {
  const body = await request.json() as { deviceId: string; pairingCode: string };
  const routing = await ctx.runQuery(internal.iot.getDeviceRoutingInfo, { deviceId: body.deviceId });
  const mutationRef = routing.found && routing.deviceType === "community"
    ? internal.iot.deactivateCommunityAlarm
    : internal.iot.deactivateAlarm;
  const result = await ctx.runMutation(mutationRef, {
    deviceId: body.deviceId,
    pairingCode: body.pairingCode,
  });
  return new Response(JSON.stringify(result), {
    status: statusFor(result),
    headers: { "Content-Type": "application/json" },
  });
}

http.route({ path: "/wemos/alarm/on", method: "POST", handler: httpAction(handleAlarmOn) });
http.route({ path: "/wemos/alarm/off", method: "POST", handler: httpAction(handleAlarmOff) });

// Escalate alarm
http.route({
  path: "/wemos/alarm/escalate",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json() as { deviceId: string; pairingCode: string };
    const result = await ctx.runMutation(internal.iot.escalateAlarm, {
      deviceId: body.deviceId,
      pairingCode: body.pairingCode,
    });
    return new Response(JSON.stringify(result), {
      status: statusFor(result),
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Alarm status polling
http.route({
  path: "/wemos/alarm/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("deviceId") ?? "";
    const pairingCode = url.searchParams.get("pairingCode") ?? "";
    const result = await ctx.runQuery(internal.iot.getAlarmStatus, { deviceId, pairingCode });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Alarm status LONG-POLL — versi hybrid untuk mengurangi jumlah request dari
// Wemos secara drastis. Endpoint LAMA (/wemos/alarm/status) di atas TETAP ADA
// dan tidak berubah sama sekali, supaya firmware lama tetap jalan tanpa
// perlu upgrade. Ini endpoint TAMBAHAN, opsional dipakai firmware baru.
//
// Cara kerja: request DITAHAN (tidak langsung dijawab) sampai salah satu dari
// dua hal terjadi — (a) ada alarm yang menargetkan device ini, dijawab SAAT
// ITU JUGA (nyaris instan), atau (b) 25 detik berlalu tanpa alarm, dijawab
// "aman" dan device diharapkan langsung buka koneksi baru lagi. Idle-wait di
// server ini TIDAK memakan CPU (cuma nunggu), jadi tidak menambah beban biaya
// berarti dibanding polling singkat — yang berkurang drastis adalah JUMLAH
// requestnya, bukan cost per requestnya.
http.route({
  path: "/wemos/alarm/status/longpoll",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("deviceId") ?? "";
    const pairingCode = url.searchParams.get("pairingCode") ?? "";

    const CHECK_INTERVAL_MS = 2000; // seberapa sering cek ulang status di database selama menahan
    const MAX_WAIT_MS = 25000; // total maksimal request ini ditahan sebelum dipaksa dijawab
    const deadline = Date.now() + MAX_WAIT_MS;

    let result = await ctx.runQuery(internal.iot.getAlarmStatus, { deviceId, pairingCode });

    // deviceId/pairingCode salah — jangan ditahan sama sekali, langsung balas
    // supaya device tahu ada masalah pairing dan bisa tampilkan errornya.
    if (!result.ok) {
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    while (!result.alarmActive && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
      result = await ctx.runQuery(internal.iot.getAlarmStatus, { deviceId, pairingCode });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ── Community device (Pos Satpam/Kantor RT/RW/Fasum) — tombol fisik memicu
// alarm atas nama LOKASI, bukan atas nama satu orang. Endpoint status
// polling TETAP sama (/wemos/alarm/status) — device apa pun cukup pakai satu
// endpoint status yang sama karena modelnya sudah berbasis target list.

// /wemos/community/alarm/on & /off -- DIPERTAHANKAN sebagai ALIAS ke handler
// yang sama dengan /wemos/alarm/on & /off di atas (yang sudah auto-deteksi
// personal/komunal sendiri). Ini murni untuk kompatibilitas mundur, supaya
// firmware versi lama yang masih eksplisit memanggil endpoint komunal ini
// tetap jalan tanpa perlu upgrade -- perilakunya sekarang identik.
http.route({ path: "/wemos/community/alarm/on", method: "POST", handler: httpAction(handleAlarmOn) });
http.route({ path: "/wemos/community/alarm/off", method: "POST", handler: httpAction(handleAlarmOff) });

export default http;
