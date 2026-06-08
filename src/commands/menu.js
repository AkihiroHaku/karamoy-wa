const os = require("os")
const fs = require("fs")
const path = require("path")
const { MAX_VIDEO_SECONDS, AI_RATE_LIMIT } = require("../config")

// Path logo bot — letakkan file gambar di sini
const LOGO_PATH = path.join(__dirname, "../../assets/logo.jpeg")

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

  return `╔══════════════════════╗
║   🥺  *KARAMOY BOT*   ║
╚══════════════════════╝

📅 *${now}*
⏱️ Uptime: *${uptime}*
💻 Platform: *${platform}*

━━━━━━━━━━━━━━━━━━━━━━━
🛠️ *UMUM*
━━━━━━━━━━━━━━━━━━━━━━━

▸ *.menu* / *.help*
  └ Tampilkan menu ini

━━━━━━━━━━━━━━━━━━━━━━━
🎨 *STIKER*
━━━━━━━━━━━━━━━━━━━━━━━
▸ *.sticker* / *.s*
  └ Ubah foto/video (maks ${MAX_VIDEO_SECONDS}d) jadi stiker
  └ Kirim media + caption, atau reply media

▸ *.toimg*
  └ Ubah stiker → gambar PNG

▸ *.tovideo*
  └ Ubah stiker animasi → video MP4

▸ *.togif*
  └ Ubah stiker animasi → GIF

▸ *.edits <teks>* — _(owner)_
  └ Ganti/tambah teks pada stiker
  └ _.edits Bagas_ → kotak putih di bawah
  └ _.edits top Bagas_ → kotak putih di atas
  └ _.edits center Bagas_ → kotak putih di tengah

▸ *.pixel [ukuran]*
  └ Buat efek pixelated pada gambar/stiker
  └ _.pixel_    → blok 16px (default)
  └ _.pixel 8_  → halus | _.pixel 32_ → blocky

━━━━━━━━━━━━━━━━━━━━━━━
🤖 *AI CHAT*
━━━━━━━━━━━━━━━━━━━━━━━
▸ *.ai <pesan>*
  └ Chat dengan AI (semua orang)
  └ Batas: ${AI_RATE_LIMIT}x per jam

▸ *.aireset*
  └ Hapus memori percakapan AI

━━━━━━━━━━━━━━━━━━━━━━━
🎨 *AI VISUAL* _(owner only)_
━━━━━━━━━━━━━━━━━━━━━━━
▸ *.imagine <deskripsi>*
  └ Generate gambar dari teks

▸ *.aiedit <instruksi>*
  └ Edit gambar pakai AI 🪄
  └ Reply atau kirim gambar + instruksi
  └ Contoh: _.aiedit ubah jadi anime_

━━━━━━━━━━━━━━━━━━━━━━━
🔍 *CARI SUMBER* _(owner only)_
━━━━━━━━━━━━━━━━━━━━━━━
▸ *.sauce* / *.source*
  └ Cari sumber gambar (reverse image)

▸ *.anime*
  └ Cari sumber screenshot anime
  └ Hasil: judul, episode, timestamp

━━━━━━━━━━━━━━━━━━━━━━━
📌 *Cara pakai:*
Ketik command, atau reply pesan
dengan command yang sesuai.
━━━━━━━━━━━━━━━━━━━━━━━`
}

/**
 * Command: .menu / .help
 * Menampilkan semua command yang tersedia beserta deskripsinya.
 */
module.exports = {
  commands: [".menu", ".help"],

  async handle(sock, msg) {
    const jid = msg.key.remoteJid
    const caption = buildMenuText()

    // Kirim sebagai gambar + caption jika logo tersedia
    if (fs.existsSync(LOGO_PATH)) {
      const image = fs.readFileSync(LOGO_PATH)
      await sock.sendMessage(jid, { image, caption }, { quoted: msg })
    } else {
      // Fallback: teks biasa jika logo belum diletakkan
      await sock.sendMessage(jid, { text: caption }, { quoted: msg })
    }
  },
}
