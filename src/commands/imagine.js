const { isOwner } = require("../utils/roles")
const { textToImage } = require("../services/huggingface")

/**
 * Command: .imagine <prompt>
 * Generate gambar AI dari deskripsi teks — khusus owner.
 * Menggunakan FLUX.1-schnell via Hugging Face Inference API.
 */
module.exports = {
  match(command) {
    return command === ".imagine" || command.startsWith(".imagine ")
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

    // ── Ambil prompt ──────────────────────────────────────────────
    const prompt = command.slice(".imagine".length).trim()

    if (!prompt) {
      await sock.sendMessage(
        jid,
        {
          text: [
            "🎨 *Cara pakai .imagine:*",
            "",
            "▸ *.imagine <deskripsi gambar>*",
            "",
            "Contoh:",
            "_.imagine kucing astronot di luar angkasa, digital art_",
            "_.imagine pemandangan gunung saat matahari terbenam, realistic_",
            "_.imagine anime girl with blue hair, studio ghibli style_",
          ].join("\n"),
        },
        { quoted: msg }
      )
      return
    }

    // ── Kirim pesan "sedang diproses" ─────────────────────────────
    await sock.sendMessage(
      jid,
      { text: `Sedang membuat gambar... 🎨\n_"${prompt}"_` },
      { quoted: msg }
    )

    // ── Generate & kirim gambar ───────────────────────────────────
    try {
      const imageBuffer = await textToImage(prompt)
      await sock.sendMessage(
        jid,
        { image: imageBuffer, caption: `🎨 _${prompt}_` },
        { quoted: msg }
      )
    } catch (error) {
      console.error("[Imagine] Error:", error.message)
      const text = error.userMessage ?? "⚠️ Gagal membuat gambar. Coba lagi."
      await sock.sendMessage(jid, { text }, { quoted: msg })
    }
  },
}

