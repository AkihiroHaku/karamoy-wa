const https = require("https")

/**
 * Mengubah detik ke format menit:detik yang mudah dibaca.
 * Contoh: 125.4 → "02:05"
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/**
 * Mencari sumber screenshot anime menggunakan trace.moe API.
 * Tidak memerlukan API key untuk free tier (10 request/hari anonymous).
 *
 * @param {Buffer} imageBuffer - Buffer screenshot anime
 * @returns {Promise<Array<{
 *   similarity: string,
 *   titleEnglish: string|null,
 *   titleRomaji: string|null,
 *   isAdult: boolean,
 *   episode: number|string|null,
 *   from: string,
 *   to: string,
 *   anilistId: number|null
 * }>>}
 */
async function searchTraceMoe(imageBuffer) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.trace.moe",
        // anilistInfo = sertakan data lengkap judul dari AniList
        path: "/search?anilistInfo",
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": imageBuffer.length,
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString("utf8"))

            if (json.error) {
              const err = new Error("tracemoe_api_error")
              err.userMessage = `trace.moe: ${json.error}`
              return reject(err)
            }

            const results = (json.result ?? [])
              .filter((r) => r.similarity >= 0.75) // 75% minimum
              .map((r) => ({
                similarity: (r.similarity * 100).toFixed(1),
                titleEnglish: r.anilist?.title?.english ?? null,
                titleRomaji: r.anilist?.title?.romaji ?? null,
                isAdult: r.anilist?.isAdult ?? false,
                episode: r.episode ?? null,
                from: formatTime(r.from),
                to: formatTime(r.to),
                anilistId: r.anilist?.id ?? null,
              }))
              .slice(0, 2)

            resolve(results)
          } catch {
            reject(new Error("parse_error"))
          }
        })
        res.on("error", reject)
      }
    )

    req.setTimeout(30_000, () => {
      req.destroy()
      const err = new Error("timeout")
      err.userMessage = "Request timeout. Coba lagi."
      reject(err)
    })

    req.on("error", reject)
    req.write(imageBuffer)
    req.end()
  })
}

module.exports = { searchTraceMoe }
