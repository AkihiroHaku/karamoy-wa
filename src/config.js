// Semua konfigurasi bot terpusat di sini.
// Ubah nilai-nilai ini sesuai kebutuhan tanpa perlu menyentuh file lain.

module.exports = {
  // Path folder session Baileys
  SESSION_PATH: "session",

  // Nomor telepon untuk pairing code (opsional, dari argument CLI)
  // Contoh: node index.js 628123456789
  PHONE_NUMBER: process.argv[2]?.replace(/\D/g, ""),

  // Batas maksimal durasi video yang bisa dijadikan stiker (detik)
  MAX_VIDEO_SECONDS: 10,

  // Jumlah maksimal percobaan ulang saat download media gagal
  MAX_DOWNLOAD_RETRIES: 3,

  // Ukuran sisi stiker WhatsApp (piksel)
  STICKER_SIZE: 512,

  // Kualitas WebP output stiker (0-100)
  STICKER_QUALITY: 90,

  // FPS default jika delay frame WebP tidak terdeteksi
  DEFAULT_STICKER_FPS: 15,

  // ── AI ──────────────────────────────────────────────────────
  // API key OpenRouter (wajib diisi di .env)
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",

  // Model yang dipakai, lihat https://openrouter.ai/models
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "openrouter/auto",

  // Nomor owner yang boleh pakai .ai (format: 628xxx, pisah koma jika lebih dari satu)
  AI_OWNER_NUMBERS: (process.env.AI_OWNER_NUMBER || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean),

  // Jumlah pesan (user+assistant) yang disimpan sebagai konteks
  AI_MAX_HISTORY: parseInt(process.env.AI_MAX_HISTORY || "10", 10),

  // Maksimal token output model
  AI_MAX_TOKENS: parseInt(process.env.AI_MAX_TOKENS || "800", 10),

  // Kreativitas model: 0.0 (deterministik) – 1.0 (kreatif)
  AI_TEMPERATURE: parseFloat(process.env.AI_TEMPERATURE || "0.7"),

  // ── Rate Limit (user biasa) ──────────────────────────────────
  // Jumlah maksimal pesan AI per window waktu (owner tidak terkena batas ini)
  AI_RATE_LIMIT: parseInt(process.env.AI_RATE_LIMIT || "25", 10),

  // Durasi window rate limit dalam menit
  AI_RATE_WINDOW_MINUTES: parseInt(process.env.AI_RATE_WINDOW_MINUTES || "60", 10),
}

