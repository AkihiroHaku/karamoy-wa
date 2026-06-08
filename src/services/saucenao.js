const https = require("https")
const { SAUCENAO_API_KEY } = require("../config")

const SAUCENAO_HOST = "saucenao.com"
const MIN_SIMILARITY = 60 // Hasil di bawah ini diabaikan

/**
 * Mengambil nama sumber yang bersih dari index_name SauceNAO.
 * Contoh: "Index #5: Pixiv Images" → "Pixiv Images"
 * @param {string} indexName
 * @returns {string}
 */
function cleanSourceName(indexName) {
  const match = indexName.match(/:\s*(.+)$/)
  return match ? match[1].trim() : indexName
}

/**
 * Membangun body multipart/form-data untuk upload gambar ke SauceNAO.
 * @param {Buffer} imageBuffer
 * @returns {{ body: Buffer, boundary: string }}
 */
function buildMultipartBody(imageBuffer, apiKey) {
  const boundary = `----WaBotBoundary${Date.now().toString(16)}`
  const CRLF = "\r\n"

  const textField = (name, value) =>
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
        `${value}${CRLF}`
    )

  const parts = []
  // Hanya sertakan api_key jika ada — tanpa key, SauceNAO berjalan di mode guest
  if (apiKey) parts.push(textField("api_key", apiKey))
  parts.push(
    textField("db", "999"),
    textField("output_type", "2"),
    textField("numres", "6"),
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="image.jpg"${CRLF}` +
        `Content-Type: image/jpeg${CRLF}${CRLF}`
    ),
    imageBuffer,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`)
  )

  return { body: Buffer.concat(parts), boundary }
}

/**
 * Mencari sumber gambar menggunakan SauceNAO API.
 *
 * @param {Buffer} imageBuffer - Buffer gambar yang akan dicari
 * @returns {Promise<Array<{
 *   similarity: string,
 *   source: string,
 *   title: string|null,
 *   author: string|null,
 *   urls: string[]
 * }>>}
 */
async function searchSauceNAO(imageBuffer) {
  // Bisa jalan tanpa API key (mode guest: ~30 req/hari)
  // Dengan API key gratis: ~100 req/hari
  const { body, boundary } = buildMultipartBody(imageBuffer, SAUCENAO_API_KEY || null)

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: SAUCENAO_HOST,
        path: "/search.php",
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString("utf8"))

            // Status negatif = error dari API
            if ((json.header?.status ?? 0) < 0) {
              const err = new Error("saucenao_api_error")
              err.userMessage = `SauceNAO error: ${json.header?.message ?? "Unknown"}`
              return reject(err)
            }

            const results = (json.results ?? [])
              .filter((r) => parseFloat(r.header.similarity) >= MIN_SIMILARITY)
              .map((r) => ({
                similarity: parseFloat(r.header.similarity).toFixed(1),
                source: cleanSourceName(r.header.index_name),
                title: r.data.title ?? r.data.source ?? null,
                author:
                  r.data.author_name ??
                  r.data.member_name ??
                  r.data.creator ??
                  null,
                urls: r.data.ext_urls ?? [],
              }))
              .slice(0, 3)

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
    req.write(body)
    req.end()
  })
}

module.exports = { searchSauceNAO }
