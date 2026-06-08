const https = require("https")
const { isOwner } = require("../utils/roles")
const { getAIImageSource } = require("../utils/message")
const { downloadMessageBuffer } = require("../media/download")
const { captionImage } = require("../services/huggingface")

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt"

/**
 * Generate gambar baru via Pollinations berdasarkan prompt teks.
 * @param {string} prompt
 * @returns {Promise<Buffer>}
 */
function generateViaPollinaitons(prompt) {
  const encoded = encodeURIComponent(prompt)
  const seed = Math.floor(Math.random() * 999_999)
  const url = `${POLLINATIONS_BASE}/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`

  return new Promise((resolve, reject) => {
    function doGet(targetUrl) {
      const req = https.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doGet(res.headers.location)
        }
        if (res.statusCode !== 200) {
          return reject(
            Object.assign(new Error("http_error"), { statusCode: res.statusCode })
          )
        }
        const chunks = []
        res.on("data", (c) => chunks.push(c))
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
 * Command: .aiedit <instruksi>
 * Edit gambar menggunakan AI — khusus owner.
 *
 * Cara kerja:
 *   1. Gambar dianalisis oleh BLIP (HF) untuk mendapat deskripsi detail
 *   2. Deskripsi + instruksi user digabung menjadi prompt baru
 *   3. Gambar baru di-generate via Pollinations (FLUX, gratis)
 *
 * Hasilnya adalah gambar baru yang terinspirasi dari gambar asli
 * dengan modifikasi sesuai instruksi.
 *
 * Contoh:
 *   .aiedit ubah jadi gaya anime
 *   .aiedit tambahkan efek salju
 *   .aiedit buat jadi oil painting
 */
module.exports = {
  match(command) {
    return command === ".aiedit" || command.startsWith(".aiedit ")
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

    // ── Ambil instruksi edit ──────────────────────────────────────
    const instruction = command.slice(".aiedit".length).trim()

    // ── Cek apakah ada gambar ─────────────────────────────────────
    const imageSource = getAIImageSource(msg)

    if (!imageSource) {
      await sock.sendMessage(
        jid,
        {
          text: [
            "🖼️ *Cara pakai .aiedit:*",
            "",
            "Kirim gambar dengan caption, atau reply gambar dengan:",
            "▸ *.aiedit <instruksi edit>*",
            "",
            "Contoh:",
            "_.aiedit ubah jadi gaya anime_",
            "_.aiedit tambahkan efek salju_",
            "_.aiedit buat jadi oil painting_",
            "_.aiedit ganti background jadi pantai_",
            "_.aiedit jadikan foto hitam putih vintage_",
          ].join("\n"),
        },
        { quoted: msg }
      )
      return
    }

    if (!instruction) {
      await sock.sendMessage(
        jid,
        { text: "Kasih instruksi editnya juga!\nContoh: _.aiedit ubah jadi anime_" },
        { quoted: msg }
      )
      return
    }

    // ── Kirim pesan "sedang diproses" ─────────────────────────────
    await sock.sendMessage(
      jid,
      { text: `✨ Sedang menganalisis gambar & mengedit...\n_"${instruction}"_` },
      { quoted: msg }
    )

    try {
      const imageBuffer = await downloadMessageBuffer(imageSource.msg, sock)

      // ── Langkah 1: Dapatkan deskripsi gambar via BLIP ─────────
      let caption = await captionImage(imageBuffer)
      console.log("[AiEdit] Caption:", caption ?? "(gagal, pakai fallback)")

      // Jika BLIP gagal, pakai deskripsi generik
      const baseDescription = caption
        ? caption.trim()
        : "a detailed scene with objects and people"

      // ── Langkah 2: Bangun prompt gabungan ─────────────────────
      // Format: "<deskripsi gambar>, <instruksi user>, high quality, detailed"
      const prompt = `${baseDescription}, ${instruction}, highly detailed, high quality`
      console.log("[AiEdit] Final prompt:", prompt)

      // ── Langkah 3: Generate gambar baru via Pollinations ──────
      const resultBuffer = await generateViaPollinaitons(prompt)

      await sock.sendMessage(
        jid,
        { image: resultBuffer, caption: `🎨 _${instruction}_` },
        { quoted: msg }
      )
    } catch (error) {
      console.error("[AiEdit] Error:", error.message, "|", error.userMessage ?? "")

      const text = error.isTimeout
        ? "⚠️ Timeout saat generate gambar. Coba lagi."
        : error.userMessage ?? "Gagal mengedit gambar. Coba instruksi berbeda."

      await sock.sendMessage(jid, { text: `⚠️ ${text}` }, { quoted: msg })
    }
  },
}
