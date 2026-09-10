import { mutation, query, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Filter dari daftar device ID mana saja yang smart plug Tuya (outputMethod
 * "tuya_smartplug") DAN sudah punya tuyaDeviceId terisi. Dipanggil dari
 * convex/tuya.ts (action "use node" tidak bisa akses ctx.db langsung).
 */
export const getTuyaDevicesFromIds = internalQuery({
  args: { deviceIds: v.array(v.id("devices")) },
  handler: async (ctx, args) => {
    const devices = await Promise.all(args.deviceIds.map((id) => ctx.db.get(id)));
    return devices
      .filter((d): d is NonNullable<typeof d> => d !== null && d.outputMethod === "tuya_smartplug" && !!d.tuyaDeviceId)
      .map((d) => ({ tuyaDeviceId: d.tuyaDeviceId as string, tuyaDpCode: d.tuyaDpCode ?? "switch_1" }));
  },
});

function generateDeviceId(): string {
  return "WD1-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function generatePairingCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const createDevice = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const id = await ctx.db.insert("devices", {
      userId,
      deviceId: generateDeviceId(),
      name: args.name,
      pairingCode: generatePairingCode(),
      isOnline: false,
      deviceType: "personal",
    });
    return { id };
  },
});

/**
 * Klaim device yang Device ID + Pairing Code-nya SUDAH di-generate sendiri
 * oleh perangkat (bukan lagi server yang generate lebih dulu). User tinggal
 * salin/scan ID+kode yang tertampil di halaman setup AP device, lalu daftar
 * di sini. Pengaman: kalau deviceId ini SUDAH pernah diklaim (oleh siapa
 * pun), ditolak -- mencegah 1 device fisik diklaim dobel oleh 2 akun.
 */
export const claimDevice = mutation({
  args: { deviceId: v.string(), pairingCode: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const deviceId = args.deviceId.trim();
    const pairingCode = args.pairingCode.trim();
    const name = args.name.trim();
    if (!deviceId || !pairingCode) {
      throw new ConvexError({ message: "Device ID dan Pairing Code wajib diisi.", code: "INVALID_INPUT" });
    }

    const existing = await ctx.db
      .query("devices")
      .withIndex("by_device_id", (q) => q.eq("deviceId", deviceId))
      .first();
    if (existing) {
      throw new ConvexError({
        message: "Device ini sudah terdaftar sebelumnya. Kalau ini device Anda sendiri, cek daftar device yang sudah ada -- atau hubungi admin kalau merasa ini keliru.",
        code: "ALREADY_CLAIMED",
      });
    }

    const id = await ctx.db.insert("devices", {
      userId,
      deviceId,
      name: name || "Device Saya",
      pairingCode,
      isOnline: false,
      deviceType: "personal",
    });
    return { id };
  },
});

export const getMyDevices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const devices = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Device komunal (Pos Satpam, dst) dikelola lewat halaman grup, bukan
    // tercampur di daftar "device pribadi saya" meski admin yang mendaftarkannya.
    return devices.filter((d) => (d.deviceType ?? "personal") === "personal");
  },
});

export const deleteDevice = mutation({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const device = await ctx.db.get(args.deviceId);
    if (!device) return;
    if (device.userId !== userId) {
      throw new ConvexError({ message: "Anda tidak memiliki izin untuk menghapus device ini.", code: "FORBIDDEN" });
    }
    await ctx.db.delete(args.deviceId);
  },
});

export const deviceHeartbeat = mutation({
  args: {
    deviceId: v.string(),
    pairingCode: v.string(),
    wifiStrength: v.optional(v.number()),
    batteryLevel: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_device_id", (q) => q.eq("deviceId", args.deviceId))
      .first();
    if (!device || device.pairingCode !== args.pairingCode) return { ok: false };

    await ctx.db.patch(device._id, {
      isOnline: true,
      lastHeartbeat: new Date().toISOString(),
      wifiStrength: args.wifiStrength,
      batteryLevel: args.batteryLevel,
    });
    return { ok: true };
  },
});

export const setDeviceSensors = mutation({
  args: {
    deviceId: v.id("devices"),
    sensorsEnabled: v.array(v.union(v.literal("door"), v.literal("fire"), v.literal("flood"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const device = await ctx.db.get(args.deviceId);
    if (!device) return;
    if (device.userId !== userId) {
      throw new ConvexError({ message: "Anda tidak memiliki izin untuk device ini.", code: "FORBIDDEN" });
    }
    await ctx.db.patch(args.deviceId, { sensorsEnabled: args.sensorsEnabled });
  },
});

export const regeneratePairingCode = mutation({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const device = await ctx.db.get(args.deviceId);
    if (!device) return;
    if (device.userId !== userId) {
      throw new ConvexError({ message: "Anda tidak memiliki izin untuk device ini.", code: "FORBIDDEN" });
    }
    await ctx.db.patch(args.deviceId, { pairingCode: generatePairingCode() });
  },
});
