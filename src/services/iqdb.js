const https = require("https")

/**
 * Membangun body multipart/form-data untuk upload gambar ke IQDB.
 * @param {Buffer} imageBuffer
 * @returns {{ body: Buffer, boundary: string }}
 */
function buildMultipart(imageBuffer) {
  const boundary = `----IQDBBoundary${Date.now().toString(16)}`
  const CRLF = "\r\n"

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="image.jpg"${CRLF}` +
        `Content-Type: image/jpeg${CRLF}${CRLF}`
    ),
    imageBuffer,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  ])

  return { body, boundary }
}

// Pemetaan domain ke nama yang lebih ramah
const DOMAIN_NAMES = {
  "danbooru.donmai.us": "Danbooru",
  "gelbooru.com": "Gelbooru",
  "konachan.com": "Konachan",
  "yande.re": "Yande.re",
  "sankakucomplex.com": "Sankaku",
  "chan.sankakucomplex.com": "Sankaku Chan",
  "anime-pictures.net": "Anime-Pictures",
  "zerochan.net": "Zerochan",
  "e-shuushuu.net": "E-Shuushuu",
  "www.pixiv.net": "Pixiv",
  "pixiv.net": "Pixiv",
}

/**
 * Mem-parse HTML response IQDB dan mengekstrak hasil pencarian.
 * @param {string} html
 * @returns {Array}
 */
function parseIQDBHTML(html) {
  const results = []

  if (/no (?:relevant )?(?:results?|matches)/i.test(html)) return results

  // Setiap hasil diawali oleh tag <h4>
  const sections = html.split(/<h4>/i).slice(1)

  for (const section of sections) {
    const heading = section.split("</h4>")[0]
    if (/your image/i.test(heading)) continue
    if (/no relevant/i.test(heading)) continue

    const simMatch = section.match(/(\d+(?:\.\d+)?)\s*%\s*similarity/i)
    if (!simMatch) continue

    const similarity = parseFloat(simMatch[1])
    if (similarity < 60) continue

    // URL eksternal (format: //domain.com/path)
    const urlMatch = section.match(/href="(\/\/[^"#]+)"/)
    if (!urlMatch) continue

    const url = "https:" + urlMatch[1]

    let domain = ""
    try {
      domain = new URL(url).hostname.replace(/^www\./, "")
    } catch {
      domain = url.split("/")[2] || "Unknown"
    }

    results.push({
      similarity: Math.round(similarity).toString(),
      source: DOMAIN_NAMES[domain] || domain,
      url,
      engine: "IQDB",
    })

    if (results.length >= 3) break
  }

  return results
}

/**
 * Mencari sumber gambar menggunakan IQDB.
 * Gratis, tanpa API key — covers Danbooru, Gelbooru, Konachan, Yande.re, dll.
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<Array>}
 */
async function searchIQDB(imageBuffer) {
  const { body, boundary } = buildMultipart(imageBuffer)

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "iqdb.org",
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
          "User-Agent": "Mozilla/5.0 (compatible; WaBot/1.0)",
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          try {
            resolve(parseIQDBHTML(Buffer.concat(chunks).toString("utf8")))
          } catch {
            reject(new Error("iqdb_parse_error"))
          }
        })
        res.on("error", reject)
      }
    )

    req.setTimeout(90_000, () => {
      req.destroy()
      const err = new Error("timeout")
      err.userMessage = "IQDB timeout (60-90 detik). Silakan coba lagi nanti."
      reject(err)
    })

    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

module.exports = { searchIQDB }
