const https = require("https")

/**
 * Helper: HTTPS request → { statusCode, headers, body: Buffer }
 */
function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", (chunk) => chunks.push(chunk))
      res.on("end", () =>
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      )
      res.on("error", reject)
    })
    req.setTimeout(30_000, () => {
      req.destroy()
      const err = new Error("timeout")
      err.userMessage = "ASCII2D timeout. Coba lagi."
      reject(err)
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

/**
 * Membangun body multipart/form-data dengan CSRF token untuk ASCII2D.
 */
function buildMultipart(imageBuffer, csrfToken) {
  const boundary = `----A2DBoundary${Date.now().toString(16)}`
  const CRLF = "\r\n"

  const textField = (name, value) =>
    Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
      `${value}${CRLF}`
    )

  const body = Buffer.concat([
    textField("utf8", "✓"),
    textField("authenticity_token", csrfToken),
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

/**
 * Mem-parse HTML hasil pencarian ASCII2D.
 * Mengambil item-box yang punya sumber (gray-link), skip box pertama (gambar upload).
 */
function parseASCII2DHTML(html) {
  const results = []

  // Split by item-box: [0]=sebelum box pertama, [1]=box upload, [2+]=hasil
  const boxes = html.split('class="item-box"').slice(2)

  for (const box of boxes) {
    if (results.length >= 3) break
    if (!box.includes("gray-link")) continue

    const detailStart = box.indexOf("detail-box")
    if (detailStart === -1) continue
    const detail = box.slice(detailStart)

    const smallMatch = detail.match(/<small>([^<]+)<\/small>/)
    const sourceType = smallMatch ? smallMatch[1].trim() : ""

    const links = [...detail.matchAll(/<a\s+href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
    if (!links.length) continue

    const url = links[0][1]
    const title = links[0][2].trim() || null
    const author = links[1]?.[2].trim() || null

    if (!url || url.startsWith("#") || url.startsWith("/")) continue

    results.push({
      source: sourceType || "Unknown",
      url,
      title: title || null,
      author: author || null,
      engine: "ASCII2D",
    })
  }

  return results
}

/**
 * Mencari sumber gambar menggunakan ASCII2D.
 * Gratis, tanpa API key — sering menemukan sumber yang IQDB lewatin.
 *
 * Alur:
 * 1. GET homepage → ambil session cookie + CSRF token
 * 2. POST gambar (multipart) dengan cookie + CSRF
 * 3. Ikuti redirect 302 ke halaman hasil
 * 4. GET halaman hasil → parse HTML
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<Array>}
 */
async function searchASCII2D(imageBuffer) {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

  // ── Step 1: GET homepage ──────────────────────────────────────
  const getRes = await httpsRequest({
    hostname: "ascii2d.net",
    path: "/",
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "max-age=0",
      "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1"
    },
  })

  const rawCookies = getRes.headers["set-cookie"] ?? []
  const cookieString = rawCookies.map((c) => c.split(";")[0]).join("; ")

  const homeHtml = getRes.body.toString("utf8")
  const csrfMatch = homeHtml.match(/<meta name="csrf-token" content="([^"]+)"/)
  if (!csrfMatch) {
    const err = new Error("ascii2d_no_csrf")
    err.userMessage = "ASCII2D: tidak bisa ambil CSRF token."
    throw err
  }
  const csrfToken = csrfMatch[1]

  // ── Step 2: POST gambar ────────────────────────────────────────
  const { body, boundary } = buildMultipart(imageBuffer, csrfToken)

  const postRes = await httpsRequest(
    {
      hostname: "ascii2d.net",
      path: "/search/file",
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
        Cookie: cookieString,
        "User-Agent": UA,
        "Origin": "https://ascii2d.net",
        "Referer": "https://ascii2d.net/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1"
      },
    },
    body
  )

  // ── Step 3: Ikuti redirect ────────────────────────────────────
  const location = postRes.headers["location"]
  if (!location) {
    const err = new Error("ascii2d_no_redirect")
    err.userMessage = "ASCII2D: tidak mendapat redirect."
    throw err
  }

  const resultsPath = location.startsWith("/") ? location : new URL(location).pathname

  // ── Step 4: GET halaman hasil ─────────────────────────────────
  const resultsRes = await httpsRequest({
    hostname: "ascii2d.net",
    path: resultsPath,
    method: "GET",
    headers: {
      Cookie: cookieString,
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "Referer": "https://ascii2d.net/"
    },
  })

  return parseASCII2DHTML(resultsRes.body.toString("utf8"))
}

module.exports = { searchASCII2D }
