const https = require("https")
const {
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  AI_MAX_TOKENS,
  AI_TEMPERATURE,
} = require("../config")

const SYSTEM_PROMPT = `Kamu adalah asisten WhatsApp yang membantu. Jawab dalam Bahasa Indonesia, \
santai, jelas, dan ringkas. Hindari jawaban bertele-tele. \
Jika diminta menulis kode, berikan contoh praktis yang langsung bisa dipakai.`

const API_URL = "https://openrouter.ai/api/v1/chat/completions"

/**
 * Mengirim request ke OpenRouter Chat Completions.
 *
 * @param {{ role: string, content: string }[]} messages - History + pesan baru
 * @returns {Promise<string>} - Teks balasan dari model
 * @throws {Error} - Error dengan pesan yang ramah pengguna
 */
async function chatWithAI(messages) {
  if (!OPENROUTER_API_KEY) {
    throw Object.assign(new Error("api_key_empty"), {
      userMessage: "OPENROUTER_API_KEY belum disetel di file .env.",
    })
  }

  const body = JSON.stringify({
    model: OPENROUTER_MODEL,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    max_tokens: AI_MAX_TOKENS,
    temperature: AI_TEMPERATURE,
  })

  const response = await httpPost(API_URL, body)
  return parseResponse(response)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Melakukan HTTP POST dan mengembalikan response body sebagai string.
 * @param {string} url
 * @param {string} body
 * @returns {Promise<string>}
 */
function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname } = new URL(url)

    const options = {
      hostname,
      path: pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
    }

    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => resolve(data))
    })

    req.on("error", (err) => reject(err))
    req.setTimeout(30_000, () => {
      req.destroy()
      reject(Object.assign(new Error("timeout"), {
        userMessage: "Request ke AI timeout (>30 detik). Coba lagi.",
      }))
    })

    req.write(body)
    req.end()
  })
}

/**
 * Mem-parse body response JSON dari OpenRouter.
 * @param {string} rawBody
 * @returns {string}
 */
function parseResponse(rawBody) {
  let json
  try {
    json = JSON.parse(rawBody)
  } catch {
    throw Object.assign(new Error("parse_error"), {
      userMessage: "Respons dari AI tidak bisa dibaca. Coba lagi.",
    })
  }

  // Tangani error dari API (misal: API key salah, model tidak ada, rate limit)
  if (json.error) {
    const code = json.error.code ?? json.error.status
    const msg = json.error.message ?? ""

    if (code === 401 || msg.includes("No auth")) {
      throw Object.assign(new Error("auth_error"), {
        userMessage: "API key tidak valid. Periksa OPENROUTER_API_KEY di .env.",
      })
    }
    if (code === 429 || msg.toLowerCase().includes("rate limit")) {
      throw Object.assign(new Error("rate_limit"), {
        userMessage: "Terlalu banyak request ke AI. Tunggu sebentar lalu coba lagi.",
      })
    }
    if (code === 402) {
      throw Object.assign(new Error("quota"), {
        userMessage: "Kredit OpenRouter habis. Isi ulang di https://openrouter.ai.",
      })
    }

    throw Object.assign(new Error("api_error"), {
      userMessage: `AI error: ${msg || "Unknown error dari OpenRouter."}`,
    })
  }

  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw Object.assign(new Error("empty_response"), {
      userMessage: "AI mengembalikan respons kosong. Coba ulangi pertanyaanmu.",
    })
  }

  return content
}

module.exports = { chatWithAI }
