const https = require("https")
const { isOwner } = require("../utils/roles")

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt"

/**
 * Generate gambar dari teks prompt via Pollinations.ai.
 * Gratis, tanpa API key, pakai model Flux.
 *
 * @param {string} prompt - Deskripsi gambar yang ingin dibuat
 * @returns {Promise<Buffer>} - Buffer gambar JPEG hasil generate
 */
function generateImage(prompt) {
  const encoded = encodeURIComponent(prompt)
  const seed = Math.floor(Math.random() * 999_999)
  const url = `${POLLINATIONS_BASE}/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`

  return new Promise((resolve, reject) => {
    function doGet(targetUrl) {
      const req = https.get(targetUrl, (res) => {
        // Ikuti redirect (301/302)
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doGet(res.headers.location)
        }

        if (res.statusCode !== 200) {
          return reject(
            Object.assign(new Error("http_error"), {
              statusCode: res.statusCode,
            })
          )
        }

        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => resolve(Buffer.concat(chunks)))
        res.on("error", reject)
      })

      req.setTimeout(90_000, () => {
        req.destroy()
        reject(Object.assign(new Error("timeout"), { isTimeout: true }))
      })

      req.on("error", reject)
    }

    doGet(url)
  })
}

/**
 * Command: .imagine <prompt>
 * Generate gambar AI dari deskripsi teks — khusus owner.
 * Menggunakan Pollinations.ai (gratis, tanpa API key).
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
      const imageBuffer = await generateImage(prompt)
      await sock.sendMessage(
        jid,
        { image: imageBuffer, caption: `🎨 _${prompt}_` },
        { quoted: msg }
      )
    } catch (error) {
      console.error("[Imagine] Error:", error.message)

      const text = error.isTimeout
        ? "⚠️ Generate gambar timeout (>90 detik). Coba lagi atau pakai prompt lebih singkat."
        : "⚠️ Gagal membuat gambar. Coba lagi."

      await sock.sendMessage(jid, { text }, { quoted: msg })
    }
  },
}
