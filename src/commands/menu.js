const os = require("os")
const { MAX_VIDEO_SECONDS, AI_RATE_LIMIT } = require("../config")

/**
 * Menghitung uptime proses Node.js dan mengubahnya ke format yang mudah dibaca.
 * @returns {string} Contoh: "2j 15m 30d"
 */
function getUptime() {
  const totalSeconds = Math.floor(process.uptime())
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts = []
  if (hours > 0) parts.push(`${hours}j`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}d`)

  return parts.join(" ")
}

/**
 * Membangun teks menu yang rapi dan informatif.
 * @returns {string}
 */
function buildMenuText() {
  const uptime = getUptime()
  const platform = os.platform()
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  })

  return `gada menu dulu`
}

/**
 * Command: .menu / .help
 * Menampilkan semua command yang tersedia beserta deskripsinya.
 */
module.exports = {
  commands: [".menu", ".help"],

  async handle(sock, msg) {
    const jid = msg.key.remoteJid
    await sock.sendMessage(jid, { text: buildMenuText() }, { quoted: msg })
  },
}
