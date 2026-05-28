const { isOwner, getSenderJid } = require("../utils/roles")
const { checkAndConsume } = require("../ai/ratelimit")
const { getHistory, appendHistory, clearHistory } = require("../ai/memory")
const { getAIImageSource } = require("../utils/message")
const { downloadMessageBuffer } = require("../media/download")
const { chatWithAI } = require("../ai/openrouter")

/**
 * Membangun content multimodal (teks + gambar) untuk dikirim ke API vision.
 * @param {string} text - Prompt teks dari user
 * @param {Buffer} imageBuffer - Buffer gambar
 * @param {string} mimetype - Tipe MIME gambar (misal: "image/jpeg")
 * @returns {Array} - Array content format OpenAI vision
 */
function buildVisionContent(text, imageBuffer, mimetype) {
  const base64 = imageBuffer.toString("base64")
  return [
    { type: "text", text: text || "Deskripsikan gambar ini." },
    { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } },
  ]
}

/**
 * Command: .ai <pesan>
 * Chat AI — terbuka untuk semua orang, dengan rate limit untuk user biasa.
 * Mendukung vision: kirim/reply foto dengan caption .ai untuk menganalisis gambar.
 * Owner bypass rate limit.
 *
 * Command: .aireset
 * Menghapus history percakapan AI untuk pengirim ini.
 */
module.exports = {
  match(command) {
    return command === ".ai" || command.startsWith(".ai ") || command === ".aireset"
  },

  async handle(sock, msg, command) {
    const jid = msg.key.remoteJid
    const senderJid = getSenderJid(msg)

    // ── .aireset — semua orang boleh reset memori sendiri ────────
    if (command === ".aireset") {
      clearHistory(senderJid)
      await sock.sendMessage(
        jid,
        { text: "Memori percakapan AI sudah dihapus. 🧹" },
        { quoted: msg }
      )
      return
    }

    // ── Ambil prompt dan cek apakah ada gambar ────────────────────
    const prompt = command.slice(3).trim()
    const imageSource = getAIImageSource(msg)

    // Jika tidak ada prompt dan tidak ada gambar → tampilkan bantuan
    if (!prompt && !imageSource) {
      await sock.sendMessage(
        jid,
        {
          text: [
            "💬 *Cara pakai fitur AI:*",
            "",
            "▸ *.ai <pesan>* — Kirim pesan ke AI",
            "  Contoh: _.ai jelaskan apa itu API_",
            "",
            "▸ *.ai* + kirim/reply foto — Analisis gambar 🖼️",
            "  Contoh: kirim foto + caption _.ai ini foto apa?_",
            "",
            "▸ *.aireset* — Hapus memori percakapan",
          ].join("\n"),
        },
        { quoted: msg }
      )
      return
    }

    // ── Rate limit (owner selalu bypass) ─────────────────────────
    if (!isOwner(msg)) {
      const { allowed, resetInMinutes } = checkAndConsume(senderJid)
      if (!allowed) {
        await sock.sendMessage(
          jid,
          {
            text: `⏳ Kamu sudah mencapai batas pemakaian AI.\nCoba lagi dalam *${resetInMinutes} menit*.`,
          },
          { quoted: msg }
        )
        return
      }
    }

    // ── Kirim pesan "sedang diproses" ─────────────────────────────
    const thinkingText = imageSource
      ? "Sebentar, aku lihat gambarnya... 👀"
      : "Sebentar, aku pikirkan... 🤔"
    await sock.sendMessage(jid, { text: thinkingText }, { quoted: msg })

    // ── Bangun pesan untuk dikirim ke AI ─────────────────────────
    const history = getHistory(senderJid)
    let userContent
    let historyText // teks yang disimpan di history (tanpa base64)

    if (imageSource) {
      try {
        const imageBuffer = await downloadMessageBuffer(imageSource.msg, sock)
        userContent = buildVisionContent(prompt, imageBuffer, imageSource.mimetype)
        historyText = prompt ? `[gambar] ${prompt}` : "[gambar]"
      } catch (downloadError) {
        console.error("[AI Vision] Gagal download gambar:", downloadError.message)
        await sock.sendMessage(
          jid,
          { text: "⚠️ Gagal mengunduh gambar. Coba kirim ulang." },
          { quoted: msg }
        )
        return
      }
    } else {
      userContent = prompt
      historyText = prompt
    }

    appendHistory(senderJid, "user", historyText)

    // ── Panggil AI ────────────────────────────────────────────────
    try {
      const messages = [
        ...history,
        { role: "user", content: userContent },
      ]
      const reply = await chatWithAI(messages)

      appendHistory(senderJid, "assistant", reply)
      await sock.sendMessage(jid, { text: reply }, { quoted: msg })
    } catch (error) {
      const userMessage =
        error.userMessage ?? "Terjadi kesalahan saat menghubungi AI. Coba lagi."

      console.error("[AI] Error:", error.message, error.userMessage ?? "")
      await sock.sendMessage(jid, { text: `⚠️ ${userMessage}` }, { quoted: msg })
    }
  },
}
