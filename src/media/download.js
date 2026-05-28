const { downloadMediaMessage } = require("@whiskeysockets/baileys")
const P = require("pino")
const { sleep, } = require("../utils/fs")
const { findErrorCode, isRetryableDownloadError } = require("../utils/error")
const { MAX_DOWNLOAD_RETRIES } = require("../config")

/**
 * Download media dari pesan WhatsApp sebagai Buffer,
 * dengan mekanisme retry otomatis untuk error jaringan sementara.
 *
 * @param {object} message - Objek pesan dari Baileys
 * @param {object} sock    - Instance socket Baileys
 * @returns {Promise<Buffer>}
 */
async function downloadMessageBuffer(message, sock) {
  let lastError

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
    try {
      return await downloadMediaMessage(
        message,
        "buffer",
        { host: sock.getMediaHost() },
        {
          logger: P({ level: "silent" }),
          reuploadRequest: sock.updateMediaMessage,
        }
      )
    } catch (error) {
      lastError = error

      if (!isRetryableDownloadError(error) || attempt === MAX_DOWNLOAD_RETRIES) {
        throw error
      }

      console.log(
        `Download media gagal (${findErrorCode(error)}), mencoba ulang ${attempt}/${MAX_DOWNLOAD_RETRIES}...`
      )
      await sleep(attempt * 1000)
    }
  }

  throw lastError
}

module.exports = { downloadMessageBuffer }
