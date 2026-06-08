const { isOwner } = require("../utils/roles")
const { getAIImageSource } = require("../utils/message")
const { downloadMessageBuffer } = require("../media/download")
const { searchIQDB } = require("../services/iqdb")
const { searchASCII2D } = require("../services/ascii2d")
const { searchTraceMoe } = require("../services/tracemoe")
const { searchSauceNAO } = require("../services/saucenao")
const { captionImage } = require("../services/huggingface")
const { SAUCENAO_API_KEY } = require("../config")

/**
 * Format satu hasil IQDB menjadi baris teks.
 */
function formatIQDBItem(r) {
  return [`📌 *${r.source}* _(IQDB • ${r.similarity}%)_`, `🔗 ${r.url}`, ""]
}

/**
 * Format satu hasil SauceNAO menjadi baris teks.
 */
function formatSauceNAOItem(r) {
  const lines = [`📌 *${r.source}* _(SauceNAO • ${r.similarity}%)_`]
  if (r.title) lines.push(`🎨 ${r.title}`)
  if (r.author) lines.push(`👤 ${r.author}`)
  r.urls.forEach((url) => {
    lines.push(`🔗 ${url}`)
  })
  lines.push("")
  return lines
}

/**
 * Format satu hasil ASCII2D menjadi baris teks.
 */
function formatASCII2DItem(r) {
  const lines = [`📌 *${r.source}* _(ASCII2D)_`]
  if (r.title) lines.push(`🎨 ${r.title}`)
  if (r.author) lines.push(`👤 ${r.author}`)
  lines.push(`🔗 ${r.url}`, "")
  return lines
}

/**
 * Gabungkan hasil IQDB + SauceNAO + ASCII2D, deduplikasi berdasarkan URL.
 * Jika tidak ada hasil, tampilkan pesan + deskripsi gambar jika tersedia.
 */
function formatCombinedResults(iqdbResults, sauceResults, a2dResults, hasSauceNAOKey, caption) {
  if (!iqdbResults.length && !sauceResults.length && !a2dResults.length) {
    const lines = [
      "🔍 Tidak ditemukan sumber yang cocok.",
      "",
      "_Engine yang dipakai (IQDB + SauceNAO + ASCII2D) optimal untuk:_",
      "  • Gambar anime / manga / ilustrasi",
      "  • Artwork dari Pixiv, Danbooru, dll",
      "  • Gambar foto umum (selfie, meme) biasanya tidak ketemu",
    ]

    if (caption) {
      lines.push("", `🤖 *AI melihat gambar ini sebagai:*`, `_${caption}_`)
    }

    if (!hasSauceNAOKey) {
      lines.push("", "💡 *Tip:* Tambahkan `SAUCENAO_API_KEY` di `.env` untuk hasil lebih banyak (100 req/hari).")
    }

    return lines.join("\n")
  }

  const lines = ["🔍 *Hasil Pencarian Sumber Gambar*\n"]
  const seenUrls = new Set()

  if (sauceResults.length) {
    for (const r of sauceResults) {
      const primaryUrl = r.urls[0]
      if (primaryUrl && seenUrls.has(primaryUrl)) continue
      r.urls.forEach((url) => seenUrls.add(url))
      lines.push(...formatSauceNAOItem(r))
    }
  }

  for (const r of iqdbResults) {
    if (seenUrls.has(r.url)) continue
    seenUrls.add(r.url)
    lines.push(...formatIQDBItem(r))
  }

  for (const r of a2dResults) {
    if (seenUrls.has(r.url)) continue
    seenUrls.add(r.url)
    lines.push(...formatASCII2DItem(r))
  }

  lines.push("─────────────────")
  const engines = []
  if (sauceResults.length) engines.push("SauceNAO")
  if (iqdbResults.length) engines.push("IQDB")
  if (a2dResults.length) engines.push("ASCII2D")
  lines.push(`_Powered by ${engines.join(" + ") || "Search Engines"}_`)

  if (!hasSauceNAOKey) {
    lines.push("")
    lines.push("💡 *Tip:* Tambahkan `SAUCENAO_API_KEY` di `.env` untuk hasil SauceNAO yang lebih lengkap!")
  }

  return lines.join("\n")
}

/**
 * Format hasil trace.moe menjadi teks WhatsApp yang rapi.
 */
function formatAnimeResults(results) {
  if (!results.length) {
    return (
      "🎌 Anime tidak ditemukan.\n\n" +
      "_Kemiripan di bawah 75%, atau gambar bukan screenshot anime._"
    )
  }

  const lines = ["🎌 *Hasil Pencarian Sumber Anime*\n"]

  results.forEach((r, i) => {
    const title = r.titleEnglish || r.titleRomaji || "Unknown"
    lines.push(`📌 *#${i + 1} — ${title}*`)
    if (r.titleRomaji && r.titleEnglish) lines.push(`🈴 ${r.titleRomaji}`)
    lines.push(`📊 Kemiripan: *${r.similarity}%*`)
    if (r.episode !== null) lines.push(`📺 Episode: ${r.episode}`)
    lines.push(`⏱️ Timestamp: ${r.from} – ${r.to}`)
    if (r.anilistId) lines.push(`🔗 https://anilist.co/anime/${r.anilistId}`)
    if (r.isAdult) lines.push(`⚠️ _Konten dewasa_`)
    lines.push("")
  })

  lines.push("─────────────────")
  lines.push("_Powered by trace.moe_")

  return lines.join("\n")
}

/**
 * Pesan bantuan pemakaian command.
 */
function helpText(isAnime) {
  if (isAnime) {
    return [
      "🎌 *Cara pakai .anime:*",
      "",
      "▸ Kirim screenshot anime + caption *.anime*",
      "▸ Reply screenshot anime dengan *.anime*",
      "",
      "_Mencari judul, episode, dan timestamp anime._",
    ].join("\n")
  }
  return [
    "🔍 *Cara pakai .sauce:*",
    "",
    "▸ Kirim gambar + caption *.sauce*",
    "▸ Reply gambar dengan *.sauce*",
    "",
    "_Mencari sumber asli gambar menggunakan IQDB + ASCII2D._",
  ].join("\n")
}

/**
 * Command: .sauce / .source
 * Mencari sumber gambar via IQDB + ASCII2D (paralel) — khusus owner.
 *
 * Command: .anime
 * Mencari sumber screenshot anime via trace.moe — khusus owner.
 */
module.exports = {
  match(command) {
    return [".sauce", ".source", ".anime"].includes(command)
  },

  async handle(sock, msg, command) {
    const jid = msg.key.remoteJid

    // ── Guard: hanya owner ────────────────────────────────────────
    if (!isOwner(msg)) {
      await sock.sendMessage(
        jid,
        { text: "Fitur ini hanya untuk owner. 👑" },
        { quoted: msg }
      )
      return
    }

    const isAnime = command === ".anime"
    const imageSource = getAIImageSource(msg)

    // ── Tidak ada gambar → tampilkan bantuan ──────────────────────
    if (!imageSource) {
      await sock.sendMessage(jid, { text: helpText(isAnime) }, { quoted: msg })
      return
    }

    // ── Pesan "sedang mencari" ────────────────────────────────────
    await sock.sendMessage(
      jid,
      {
        text: isAnime
          ? "Sedang mencari anime... 🎌"
          : "Sedang mencari sumber gambar... 🔍",
      },
      { quoted: msg }
    )

    try {
      const imageBuffer = await downloadMessageBuffer(imageSource.msg, sock)

      if (isAnime) {
        // ── trace.moe ──────────────────────────────────────────────
        const results = await searchTraceMoe(imageBuffer)
        await sock.sendMessage(jid, { text: formatAnimeResults(results) }, { quoted: msg })
      } else {
        const hasSauceNAOKey = !!SAUCENAO_API_KEY
        const searchPromises = []

        // Selalu panggil IQDB (free & keyless)
        searchPromises.push(searchIQDB(imageBuffer))

        // Selalu panggil SauceNAO (guest mode ~30/hari, API key ~100/hari)
        searchPromises.push(searchSauceNAO(imageBuffer))

        // Panggil ASCII2D (bisa error karena Cloudflare WAF)
        searchPromises.push(searchASCII2D(imageBuffer))

        const [iqdbResult, sauceResult, a2dResult] = await Promise.allSettled(searchPromises)

        const iqdbResults = iqdbResult.status === "fulfilled" ? iqdbResult.value : []
        const sauceResults = sauceResult.status === "fulfilled" ? sauceResult.value : []
        const a2dResults = a2dResult.status === "fulfilled" ? a2dResult.value : []

        if (iqdbResult.status === "rejected") {
          console.error("[IQDB] Error:", iqdbResult.reason?.message)
        }
        if (sauceResult.status === "rejected") {
          console.error("[SauceNAO] Error:", sauceResult.reason?.message)
        }
        if (a2dResult.status === "rejected") {
          console.error("[ASCII2D] Error:", a2dResult.reason?.message)
        }

        // Jika tidak ada hasil, gunakan BLIP untuk deskripsikan gambar sebagai fallback
        let caption = null
        if (!iqdbResults.length && !sauceResults.length && !a2dResults.length) {
          caption = await captionImage(imageBuffer)
          if (caption) console.log("[Sauce] BLIP caption:", caption)
        }

        await sock.sendMessage(
          jid,
          { text: formatCombinedResults(iqdbResults, sauceResults, a2dResults, hasSauceNAOKey, caption) },
          { quoted: msg }
        )
      }
    } catch (error) {
      console.error("[Sauce] Error:", error.message)
      const userMessage = error.userMessage ?? "Terjadi kesalahan. Coba lagi."
      await sock.sendMessage(jid, { text: `⚠️ ${userMessage}` }, { quoted: msg })
    }
  },
}
