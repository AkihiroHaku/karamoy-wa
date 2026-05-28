// Load variabel dari .env sebelum modul lain diimport.
require("dotenv").config()

// Entry point — hanya menjalankan bot.
// Semua logika ada di dalam folder src/.
const fs = require("fs")
const path = require("path")
const { startBot } = require("./src/bot")

const LOCK_FILE = path.join(__dirname, "bot.pid")

// ── Cek apakah ada instance lain yang sedang berjalan ─────────────────────
if (fs.existsSync(LOCK_FILE)) {
  const oldPid = fs.readFileSync(LOCK_FILE, "utf8").trim()

  // Cek apakah proses dengan PID tersebut masih aktif
  let isRunning = false
  try {
    process.kill(Number(oldPid), 0) // signal 0 = hanya cek, tidak kill
    isRunning = true
  } catch {
    // Proses sudah mati, lock file basi — hapus saja
    fs.unlinkSync(LOCK_FILE)
  }

  if (isRunning) {
    console.error(`❌ Bot sudah berjalan! (PID: ${oldPid})`)
    console.error("   Hentikan dulu dengan Ctrl+C sebelum menjalankan lagi.")
    process.exit(1)
  }
}

// Simpan PID proses saat ini
fs.writeFileSync(LOCK_FILE, String(process.pid))

// Hapus lock file saat bot berhenti (normal maupun karena error)
function cleanup() {
  try { fs.unlinkSync(LOCK_FILE) } catch {}
}
process.on("exit", cleanup)
process.on("SIGINT", () => { cleanup(); process.exit(0) })
process.on("SIGTERM", () => { cleanup(); process.exit(0) })
process.on("uncaughtException", (err) => { console.error(err); cleanup(); process.exit(1) })

// ── Jalankan bot ───────────────────────────────────────────────────────────
startBot().catch((error) => {
  console.error("Bot gagal dijalankan:", error)
  cleanup()
  process.exit(1)
})
