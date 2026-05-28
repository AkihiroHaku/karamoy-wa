const {
  default: makeWASocket,
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys")
const P = require("pino")
const qrcode = require("qrcode-terminal")
const { getMessageText } = require("./utils/message")
const { handleCommand } = require("./commands")
const { SESSION_PATH, PHONE_NUMBER } = require("./config")

/**
 * Memulai bot WhatsApp:
 * - Load/buat session Baileys
 * - Setup event connection, QR/pairing, dan pesan masuk
 */
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)

  const { version, isLatest } = await fetchLatestBaileysVersion()
  console.log(
    `Memakai WhatsApp Web version ${version.join(".")} ${isLatest ? "(latest)" : ""}`
  )

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu("Chrome"),
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    markOnlineOnConnect: false,
    printQRInTerminal: false,
    version,
    logger: P({ level: "silent" }),
  })

  let pairingCodeRequested = false

  sock.ev.on("creds.update", saveCreds)

  // ── Koneksi ──────────────────────────────────────────────────────────────
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (PHONE_NUMBER && !pairingCodeRequested && !sock.authState.creds.registered) {
        pairingCodeRequested = true
        const code = await sock.requestPairingCode(PHONE_NUMBER)
        console.log(`Kode pairing untuk ${PHONE_NUMBER}: ${code}`)
        console.log("Buka WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon.")
        return
      }

      console.log("Scan QR ini pakai WhatsApp:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("Bot WhatsApp berhasil tersambung. ✅")
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const errorMessage = lastDisconnect?.error?.message
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      console.log(
        "Koneksi terputus.",
        statusCode ? `Kode: ${statusCode}.` : "",
        errorMessage ? `Error: ${errorMessage}.` : "",
        shouldReconnect ? "Mencoba menyambung ulang..." : "Session logout, scan QR ulang."
      )

      if (shouldReconnect) {
        startBot()
      }
    }
  })

  // ── Pesan Masuk ───────────────────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]

    if (!msg.message) return
    if (msg.key.fromMe) return

    const text = getMessageText(msg).trim()
    if (!text) return

    const command = text.toLowerCase()
    console.log("Pesan:", text)

    await handleCommand(sock, msg, command)
  })
}

module.exports = { startBot }
