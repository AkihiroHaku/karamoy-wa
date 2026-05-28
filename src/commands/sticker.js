const { getStickerSource } = require("../utils/message")
const { getMediaDownloadErrorMessage } = require("../utils/error")
const { createStickerBuffer } = require("../media/sticker")
const { MAX_VIDEO_SECONDS } = require("../config")

/**
 * Command: .sticker / .s
 * Mengubah foto atau video pendek menjadi stiker WhatsApp.
 */
module.exports = {
  commands: [".sticker", ".s"],

  async handle(sock, msg) {
    const jid = msg.key.remoteJid
    const source = getStickerSource(msg)

    if (!source) {
      await sock.sendMessage(
        jid,
        { text: "Kirim atau reply foto/video pendek dengan caption .sticker" },
        { quoted: msg }
      )
      return
    }

    if (source.type === "video" && source.seconds > MAX_VIDEO_SECONDS) {
      await sock.sendMessage(
        jid,
        { text: `Videonya maksimal ${MAX_VIDEO_SECONDS} detik ya.` },
        { quoted: msg }
      )
      return
    }

    try {
      await sock.sendMessage(
        jid,
        { text: "Bentar, stikernya lagi dibuat... 🎨" },
        { quoted: msg }
      )

      const sticker = await createStickerBuffer(source, sock)

      await sock.sendMessage(jid, { sticker }, { quoted: msg })
    } catch (error) {
      console.error("Gagal membuat stiker:", error)
      await sock.sendMessage(
        jid,
        { text: getMediaDownloadErrorMessage(error) },
        { quoted: msg }
      )
    }
  },
}
