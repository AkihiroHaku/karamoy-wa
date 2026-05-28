const { getReverseStickerSource } = require("../utils/message")
const { getMediaDownloadErrorMessage } = require("../utils/error")
const { downloadMessageBuffer } = require("../media/download")
const { stickerToImage, stickerToVideo } = require("../media/convert")

/**
 * Command: .toimg / .tovideo / .togif
 * Mengubah stiker WhatsApp kembali menjadi gambar, video, atau GIF.
 */
module.exports = {
  commands: [".toimg", ".tovideo", ".togif"],

  async handle(sock, msg, command) {
    const jid = msg.key.remoteJid
    const source = getReverseStickerSource(msg)

    if (!source) {
      await sock.sendMessage(
        jid,
        { text: "Reply stiker dengan .toimg, .tovideo, atau .togif" },
        { quoted: msg }
      )
      return
    }

    try {
      await sock.sendMessage(
        jid,
        { text: "Bentar, stikernya lagi diubah... ⚙️" },
        { quoted: msg }
      )

      const buffer = await downloadMessageBuffer(source, sock)

      if (command === ".toimg") {
        const image = await stickerToImage(buffer)
        await sock.sendMessage(jid, { image }, { quoted: msg })
        return
      }

      const video = await stickerToVideo(buffer)
      await sock.sendMessage(
        jid,
        {
          video,
          gifPlayback: command === ".togif",
          mimetype: "video/mp4",
        },
        { quoted: msg }
      )
    } catch (error) {
      console.error("Gagal mengubah stiker:", error)
      await sock.sendMessage(
        jid,
        { text: getMediaDownloadErrorMessage(error) },
        { quoted: msg }
      )
    }
  },
}
