const https = require("https")
const { HF_TOKEN } = require("../config")

// ── Model ─────────────────────────────────────────────────────────────────────
// Text-to-image: FLUX.1-schnell (cepat, gratis, berkualitas tinggi)
const TEXT_TO_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell"

// Image captioning: BLIP — mendeskripsikan isi gambar dalam bahasa Inggris
const CAPTION_MODEL = "Salesforce/blip-image-captioning-large"

// router.huggingface.co — domain alternatif yang bisa diakses dari Indonesia
const HF_ROUTER_BASE = "https://router.huggingface.co/hf-inference/models"

// ── HTTP Helper ───────────────────────────────────────────────────────────────

/**
 * Kirim HTTP POST ke HF Inference API, terima response sebagai Buffer.
 * @param {string} url
 * @param {object} body
 * @returns {Promise<{ status: number, buffer: Buffer }>}
 */
function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const bodyBuf = Buffer.from(JSON.stringify(body))

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": bodyBuf.length,
        "x-wait-for-model": "true",
      },
    }

    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () =>
        resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) })
      )
    })

    req.on("error", reject)
    req.setTimeout(120_000, () => {
      req.destroy()
      reject(
        Object.assign(new Error("timeout"), {
          userMessage: "Request ke Hugging Face timeout (>2 menit). Coba lagi.",
        })
      )
    })

    req.write(bodyBuf)
    req.end()
  })
}

/**
 * Periksa status response HF API dan lempar error yang ramah pengguna.
 * @param {number} status
 * @param {Buffer} buffer
 */
function checkResponse(status, buffer) {
  if (status === 200) return

  let errorMsg = `HTTP ${status}`
  try {
    const json = JSON.parse(buffer.toString())
    errorMsg = json.error ?? json.message ?? JSON.stringify(json)
  } catch {
    // bukan JSON, mungkin binary
  }

  if (status === 503) {
    throw Object.assign(new Error("model_loading"), {
      userMessage: "Model sedang loading. Tunggu ~30 detik lalu coba lagi.",
    })
  }

  if (status === 401 || status === 403) {
    throw Object.assign(new Error("hf_auth"), {
      userMessage:
        "HF_TOKEN tidak punya izin. Buat token Fine-grained + centang 'Make calls to Inference Providers'.",
    })
  }

  if (status === 404) {
    throw Object.assign(new Error("hf_not_found"), {
      userMessage:
        "Model tidak ditemukan di HF Inference. Mungkin model tidak tersedia di tier gratis.",
    })
  }

  throw Object.assign(new Error("hf_api_error"), {
    userMessage: `Hugging Face error (${status}): ${errorMsg}`,
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate gambar dari teks prompt (text-to-image).
 * Menggunakan FLUX.1-schnell via HF router.
 *
 * @param {string} prompt
 * @returns {Promise<Buffer>} Buffer gambar
 */
async function textToImage(prompt) {
  if (!HF_TOKEN) {
    throw Object.assign(new Error("no_hf_token"), {
      userMessage:
        "HF_TOKEN belum diset di .env. Daftar gratis di huggingface.co/settings/tokens.",
    })
  }

  // Format standar HF Inference API — response adalah binary image
  const url = `${HF_ROUTER_BASE}/${TEXT_TO_IMAGE_MODEL}`
  const { status, buffer } = await httpPost(url, {
    inputs: prompt,
    parameters: { num_inference_steps: 4 },
  })
  checkResponse(status, buffer)

  // Coba parse JSON (beberapa model kembalikan { generated_image: "base64" })
  // Jika gagal parse, anggap response langsung binary image
  try {
    const json = JSON.parse(buffer.toString())
    // Format OpenAI-compatible: { data: [{ b64_json: "..." }] }
    const b64 = json.data?.[0]?.b64_json ?? json[0]?.generated_image
    if (b64) return Buffer.from(b64, "base64")
    // Jika ada field error, lempar
    if (json.error) throw Object.assign(new Error("hf_api_error"), { userMessage: json.error })
  } catch (e) {
    if (e.userMessage) throw e
    // Bukan JSON = binary image, lanjutkan
  }

  return buffer
}

/**
 * Analisis gambar dan kembalikan deskripsi teksnya (image captioning).
 * Menggunakan BLIP via HF router — hasil dipakai untuk .aiedit.
 *
 * Mengembalikan `null` jika gagal (soft fail — tidak lempar error).
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<string|null>}
 */
function captionImage(imageBuffer) {
  if (!HF_TOKEN) return Promise.resolve(null)

  const url = `${HF_ROUTER_BASE}/${CAPTION_MODEL}`
  const parsedUrl = new URL(url)

  return new Promise((resolve) => {
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        // BLIP butuh raw image bytes, bukan JSON
        "Content-Type": "image/jpeg",
        "Content-Length": imageBuffer.length,
        "x-wait-for-model": "true",
      },
    }

    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString())
          const text = Array.isArray(json)
            ? json[0]?.generated_text
            : json?.generated_text
          resolve(text ?? null)
        } catch {
          resolve(null)
        }
      })
    })

    // Soft fail — captioning gagal tidak perlu crash
    req.on("error", () => resolve(null))
    req.setTimeout(30_000, () => { req.destroy(); resolve(null) })
    req.write(imageBuffer)
    req.end()
  })
}

module.exports = { textToImage, captionImage }
