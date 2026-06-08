const sharp = require("sharp")
const { isOwner } = require("../utils/roles")
const { getQuotedMessage } = require("../utils/message")
const { downloadMessageBuffer } = require("../media/download")
const { imageToSticker } = require("../media/sticker")

const DEFAULT_BLOCK = 16  // ukuran blok pixel default (px)
const MIN_BLOCK     = 4   // terlalu kecil → hampir tidak terlihat
const MAX_BLOCK     = 64  // terlalu besar → gambar hancur

/**
 * Buat efek piksel pada gambar.
 * Teknik: scale-down ke ukuran kecil (nearest-neighbor) lalu scale-up kembali.
 *
 * @param {Buffer} inputBuffer  - Buffer gambar / stiker input
 * @param {number} blockSize    - Ukuran blok piksel dalam piksel (4–64)
 * @returns {Promise<Buffer>}   - Buffer gambar WebP hasil pixelate
 */
async function pixelate(inputBuffer, blockSize = DEFAULT_BLOCK) {
  const { width, height } = await sharp(inputBuffer).metadata()

  const smallW = Math.max(1, Math.round(width / blockSize))
  const smallH = Math.max(1, Math.round(height / blockSize))

  // Langkah 1: Downscale ke ukuran kecil dengan kernel nearest (piksel kasar)
  const smallBuffer = await sharp(inputBuffer)
    .resize(smallW, smallH, { kernel: "nearest" })
    .toBuffer()

  // Langkah 2: Upscale kembali ke ukuran asli dengan kernel nearest (mempertahankan blok)
  return sharp(smallBuffer)
    .resize(width, height, { kernel: "nearest" })
    .webp({ quality: 90 })
    .toBuffer()
}

/**
 * Cari sumber gambar/stiker dari pesan (langsung atau quoted).
 * @param {object} msg
 * @returns {{ buffer: null, msg: object, isSticker: boolean } | null}
 */
function findMediaSource(msg) {
  const message = msg.message
  const quoted = getQuotedMessage(msg)
  const quotedMessage = quoted?.message

  // 1. Gambar/stiker langsung
  if (message?.imageMessage) {
    return { msg, isSticker: false }
  }
  if (message?.stickerMessage) {
    return { msg, isSticker: true }
  }

  // 1b. Direct ViewOnce
  const directViewOnce = message?.viewOnceMessage?.message || message?.viewOnceMessageV2?.message
  if (directViewOnce?.imageMessage) {
    return { msg: { key: msg.key, message: { imageMessage: directViewOnce.imageMessage } }, isSticker: false }
  }

  // 2. Gambar/stiker dari quoted message (reply)
  if (quotedMessage?.imageMessage) {
    return { msg: quoted, isSticker: false }
  }
  if (quotedMessage?.stickerMessage) {
    return { msg: quoted, isSticker: true }
  }

  // 2b. Quoted ViewOnce
  const quotedViewOnce = quotedMessage?.viewOnceMessage?.message || quotedMessage?.viewOnceMessageV2?.message
  if (quotedViewOnce?.imageMessage) {
    return { msg: { key: quoted.key, message: { imageMessage: quotedViewOnce.imageMessage } }, isSticker: false }
  }

  return null
}

/**
 * Command: .pixel [ukuran]
 * Buat efek pixelated pada gambar atau stiker.
 *
 * Cara pakai:
 *   .pixel              → pixelate dengan blok 16px (default)
 *   .pixel 8            → blok lebih kecil (halus)
 *   .pixel 32           → blok lebih besar (blocky)
 *
 * Bisa dipakai pada: gambar, stiker, atau reply gambar/stiker.
 */
module.exports = {
  match(command) {
    return command === ".pixel" || command.startsWith(".pixel ")
  },

  async handle(sock, msg, command) {
    const jid = msg.key.remoteJid
    console.log("[Pixel] Handler dipanggil, chat JID:", jid)

    try {
      // ── Parse ukuran blok ───────────────────────────────────────
      const rawArg = command.slice(".pixel".length).trim()
      let blockSize = DEFAULT_BLOCK
      console.log("[Pixel] Parse argumen:", { rawArg, defaultBlock: DEFAULT_BLOCK })

      if (rawArg) {
        const parsed = parseInt(rawArg, 10)
        if (!isNaN(parsed) && parsed >= MIN_BLOCK && parsed <= MAX_BLOCK) {
          blockSize = parsed
        } else {
          console.log("[Pixel] Ukuran blok invalid:", rawArg)
          await sock.sendMessage(
            jid,
            { text: `⚠️ Ukuran blok harus antara ${MIN_BLOCK}–${MAX_BLOCK}.\nContoh: _.pixel 16_` },
            { quoted: msg }
          )
          return
        }
      }
      console.log("[Pixel] Block size yang digunakan:", blockSize)

      // ── Cek apakah ada gambar/stiker ────────────────────────────
      console.log("[Pixel] Mencari media source...")
      const source = findMediaSource(msg)
      console.log("[Pixel] Media source ditemukan:", source ? { isSticker: source.isSticker } : "null")

      if (!source) {
        console.log("[Pixel] Mengirim help text ke JID:", jid)
        await sock.sendMessage(
          jid,
          {
            text: [
              "🎨 *Cara pakai .pixel:*",
              "",
              "▸ Kirim gambar/stiker + caption *.pixel*",
              "▸ Reply gambar/stiker dengan *.pixel*",
              "",
              "Opsional — atur ukuran blok (4–64):",
              "_.pixel 8_  → halus (blok kecil)",
              "_.pixel 16_ → sedang (default)",
              "_.pixel 32_ → blocky (blok besar)",
            ].join("\n"),
          },
          { quoted: msg }
        )
        console.log("[Pixel] Help text terkirim!")
        return
      }

      // ── Pesan "sedang diproses" ─────────────────────────────────
      console.log("[Pixel] Mengirim status sedang diproses...")
      await sock.sendMessage(
        jid,
        { text: `Membuat efek pixel (blok ${blockSize}px)... 🎨` },
        { quoted: msg }
      )
      console.log("[Pixel] Status sedang diproses terkirim!")

      // ── Download & proses ───────────────────────────────────────
      console.log("[Pixel] Mendownload buffer media...")
      const inputBuffer = await downloadMessageBuffer(source.msg, sock)
      console.log("[Pixel] Media buffer terdownload, ukuran:", inputBuffer.length)

      console.log("[Pixel] Melakukan pixelasi...")
      const pixelatedBuffer = await pixelate(inputBuffer, blockSize)
      console.log("[Pixel] Pixelasi selesai, ukuran:", pixelatedBuffer.length)

      // ── Konversi ke format stiker resmi (512x512 WebP) ───────────
      console.log("[Pixel] Mengonversi ke stiker format resmi...")
      const resultBuffer = await imageToSticker(pixelatedBuffer)
      console.log("[Pixel] Konversi stiker selesai, ukuran:", resultBuffer.length)

      // ── Kirim hasil sebagai stiker ──────────────────────────────
      console.log("[Pixel] Mengirim stiker hasil ke JID:", jid)
      await sock.sendMessage(
        jid,
        { sticker: resultBuffer },
        { quoted: msg }
      )
      console.log("[Pixel] Stiker berhasil dikirim!")
    } catch (error) {
      console.error("[Pixel] Error:", error.message, error.stack)
      try {
        await sock.sendMessage(
          jid,
          { text: `⚠️ Gagal membuat efek pixel: ${error.message}` },
          { quoted: msg }
        )
      } catch (sendErr) {
        console.error("[Pixel] Gagal kirim pesan error:", sendErr.message)
      }
    }
  },
}
