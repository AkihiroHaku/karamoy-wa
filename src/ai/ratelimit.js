const { AI_RATE_LIMIT, AI_RATE_WINDOW_MINUTES } = require("../config")

/**
 * In-memory rate limiter per pengirim.
 * Key: senderJid
 * Value: { count: number, windowStart: number (timestamp ms) }
 *
 * Data hilang saat bot restart — by design untuk v1.
 */
const store = new Map()

/**
 * Mengecek apakah pengirim masih dalam batas, dan jika ya, catat 1 pemakaian.
 *
 * Mengembalikan:
 * - `allowed: true`  jika masih dalam batas (counter langsung dikonsumsi)
 * - `allowed: false` jika sudah melebihi batas, beserta waktu reset
 *
 * @param {string} senderJid
 * @returns {{ allowed: boolean, remaining: number, resetInMinutes: number }}
 */
function checkAndConsume(senderJid) {
  const now = Date.now()
  const windowMs = AI_RATE_WINDOW_MINUTES * 60 * 1000

  const entry = store.get(senderJid)

  // Window baru atau window lama sudah kedaluwarsa
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(senderJid, { count: 1, windowStart: now })
    return {
      allowed: true,
      remaining: AI_RATE_LIMIT - 1,
      resetInMinutes: AI_RATE_WINDOW_MINUTES,
    }
  }

  // Window masih aktif, cek batas
  if (entry.count >= AI_RATE_LIMIT) {
    const resetInMs = windowMs - (now - entry.windowStart)
    const resetInMinutes = Math.ceil(resetInMs / 60_000)
    return { allowed: false, remaining: 0, resetInMinutes }
  }

  // Masih dalam batas, tambah counter
  entry.count++
  const resetInMs = windowMs - (now - entry.windowStart)
  return {
    allowed: true,
    remaining: AI_RATE_LIMIT - entry.count,
    resetInMinutes: Math.ceil(resetInMs / 60_000),
  }
}

module.exports = { checkAndConsume }
