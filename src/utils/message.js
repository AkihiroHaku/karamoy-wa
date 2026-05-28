/**
 * Mengambil teks dari berbagai tipe pesan WhatsApp.
 * @param {object} msg - Objek pesan dari Baileys
 * @returns {string}
 */
function getMessageText(msg) {
  const message = msg.message
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  )
}

/**
 * Mengambil konten media (gambar/video) dari pesan atau reply-nya.
 * @param {object} message
 */
function getMessageContent(message) {
  return (
    message?.imageMessage ||
    message?.videoMessage ||
    message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
    message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage
  )
}

/**
 * Mengambil pesan yang di-reply (quoted message).
 * @param {object} msg
 * @returns {{ key: object, message: object } | null}
 */
function getQuotedMessage(msg) {
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo
  if (!contextInfo?.quotedMessage) return null

  return {
    key: {
      remoteJid: msg.key.remoteJid,
      id: contextInfo.stanzaId,
      participant: contextInfo.participant,
    },
    message: contextInfo.quotedMessage,
  }
}

/**
 * Mencari sumber media (foto/video) untuk dijadikan stiker.
 * Prioritas: pesan langsung → pesan yang di-reply.
 * @param {object} msg
 * @returns {{ type: string, seconds: number, message: object } | null}
 */
function getStickerSource(msg) {
  const message = msg.message
  const quoted = getQuotedMessage(msg)
  const quotedMessage = quoted?.message

  if (message?.imageMessage) {
    return { type: "image", seconds: 0, message: msg }
  }

  if (message?.videoMessage) {
    return {
      type: "video",
      seconds: message.videoMessage.seconds || 0,
      message: msg,
    }
  }

  if (quotedMessage?.imageMessage || quotedMessage?.videoMessage) {
    return {
      type: quotedMessage.imageMessage ? "image" : "video",
      seconds: quotedMessage.videoMessage?.seconds || 0,
      message: quoted,
    }
  }

  const media = getMessageContent(message)
  if (!media) return null

  return {
    type: media.mimetype?.startsWith("video/") ? "video" : "image",
    seconds: media.seconds || 0,
    message: msg,
  }
}

/**
 * Mencari pesan stiker — baik langsung maupun dari reply —
 * untuk dikonversi kembali ke gambar/video.
 * @param {object} msg
 * @returns {object | null}
 */
function getReverseStickerSource(msg) {
  const quoted = getQuotedMessage(msg)

  if (quoted?.message?.stickerMessage) return quoted
  if (msg.message?.stickerMessage) return msg

  return null
}

/**
 * Mencari sumber gambar untuk dianalisis oleh AI (vision).
 * Prioritas: gambar langsung → gambar di pesan yang di-reply.
 *
 * @param {object} msg
 * @returns {{ msg: object, mimetype: string } | null}
 */
function getAIImageSource(msg) {
  const message = msg.message

  // Gambar langsung (user kirim foto dengan caption ".ai ...")
  if (message?.imageMessage) {
    return {
      msg,
      mimetype: message.imageMessage.mimetype || "image/jpeg",
    }
  }

  // Reply ke foto (user reply foto orang lain dengan ".ai ...")
  const quoted = getQuotedMessage(msg)
  if (quoted?.message?.imageMessage) {
    return {
      msg: quoted,
      mimetype: quoted.message.imageMessage.mimetype || "image/jpeg",
    }
  }

  return null
}

module.exports = {
  getMessageText,
  getMessageContent,
  getQuotedMessage,
  getStickerSource,
  getReverseStickerSource,
  getAIImageSource,
}
