const { isOwner } = require("../utils/roles")
const { downloadMessageBuffer } = require("../media/download")
const { replaceTextInSticker, addTextWithBackground } = require("../media/stickerEdit")

// Kata kunci posisi yang dikenali
const POSITIONS = ["top", "bottom", "center"]

/**
 * Parse argumen command .edits:
 *   ".edits Bagas"          → { position: "bottom", text: "Bagas" }
 *   ".edits top Bagas"      → { position: "top",    text: "Bagas" }
 *   ".edits bottom Bagas"   → { position: "bottom", text: "Bagas" }
 *   ".edits center Bagas"   → { position: "center", text: "Bagas" }
 *
 * @param {string} rawArg - Argumen setelah ".edits "
 * @returns {{ position: string, text: string }}
 */
function parseArgs(rawArg) {
  const parts = rawArg.split(/\s+/)
  if (parts.length > 1 && POSITIONS.includes(parts[0].toLowerCase())) {
    return { position: parts[0].toLowerCase(), text: parts.slice(1).join(" ") }
  }
  return { position: "bottom", text: rawArg }
}

/**
 * Command: .edits <teks_baru>
 *          .edits top|bottom|center <teks_baru>
 *
 * Ganti/tambah teks pada stiker — khusus owner.
 *
 * Mode A (auto): Stiker sudah punya kotak putih → teks di dalam kotak diganti.
 * Mode B (manual): Teks tanpa background → kotak putih + teks baru ditambahkan
 *                  di posisi yang ditentukan (top / bottom / center).
 *
 * Cara pakai:
 *   Reply stiker + .edits Bagas           → kotak putih di bawah
 *   Reply stiker + .edits top Bagas       → kotak putih di atas
 *   Reply stiker + .edits center Bagas    → kotak putih di tengah
 */
module.exports = {
  match(command) {
    return command === ".edits" || command.startsWith(".edits ")
  },

  async handle(sock, msg, command) {
    const jid = msg.key.remoteJid

    // ── Guard: hanya owner ────────────────────────────────────────
    if (!isOwner(msg)) {
      await sock.sendMessage(
        jid,
        { text: "Fitur ini hanya untuk owner. 👑" },
        { quoted: msg }
      )
      return
    }

    // ── Ambil argumen ─────────────────────────────────────────────
    const rawArg = command.slice(".edits".length).trim()

    if (!rawArg) {
      await sock.sendMessage(
        jid,
        {
          text: [
            "✏️ *Cara pakai .edits:*",
            "",
            "▸ *.edits <teks>*",
            "  └ Kotak putih di bawah (default)",
            "",
            "▸ *.edits top <teks>*",
            "  └ Kotak putih di atas",
            "",
            "▸ *.edits center <teks>*",
            "  └ Kotak putih di tengah",
            "",
            "Contoh:",
            "_.edits Bagas_",
            "_.edits top MAS BAGAS 😎_",
            "",
            "_Jika stiker sudah punya kotak putih, teks di dalamnya akan diganti otomatis._",
          ].join("\n"),
        },
        { quoted: msg }
      )
      return
    }

    const { position, text: newText } = parseArgs(rawArg)

    // ── Cek apakah ada stiker ─────────────────────────────────────
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const isDirectSticker = msg.message?.stickerMessage
    const isQuotedSticker = quoted?.stickerMessage

    if (!isDirectSticker && !isQuotedSticker) {
      await sock.sendMessage(
        jid,
        {
          text: [
            "⚠️ Tidak ada stiker.",
            "Kirim stiker dengan caption *.edits <teks>*, atau reply stiker.",
          ].join("\n"),
        },
        { quoted: msg }
      )
      return
    }

    // ── Pesan "sedang diproses" ───────────────────────────────────
    await sock.sendMessage(
      jid,
      { text: `✏️ Mengedit stiker...\n_"${newText}"_ (${position})` },
      { quoted: msg }
    )

    try {
      // Tentukan sumber stiker
      const stickerMsg = isDirectSticker
        ? msg
        : { key: msg.key, message: quoted }

      const stickerBuffer = await downloadMessageBuffer(stickerMsg, sock)

      let resultBuffer

      // ── Mode A: coba deteksi kotak putih dulu ────────────────────
      try {
        resultBuffer = await replaceTextInSticker(stickerBuffer, newText)
        console.log("[EditSticker] Mode A: kotak putih terdeteksi, teks diganti")
      } catch (errA) {
        if (errA.message !== "white_region_not_found") throw errA

        // ── Mode B: tidak ada kotak putih → tambah kotak putih baru ─
        console.log(`[EditSticker] Mode B: tambah kotak putih di posisi '${position}'`)
        resultBuffer = await addTextWithBackground(stickerBuffer, newText, position)
      }

      // ── Kirim hasil sebagai stiker ────────────────────────────────
      await sock.sendMessage(
        jid,
        { sticker: resultBuffer },
        { quoted: msg }
      )
    } catch (error) {
      console.error("[EditSticker] Error:", error.message)
      const text = error.userMessage ?? "Gagal mengedit stiker. Coba lagi."
      await sock.sendMessage(jid, { text: `⚠️ ${text}` }, { quoted: msg })
    }
  },
}
