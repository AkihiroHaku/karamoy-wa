/**
 * Script debug: test API image generation OpenRouter
 * Jalankan: node test_aiedit.js
 */
require("dotenv").config()
const https = require("https")

const API_KEY = process.env.OPENROUTER_API_KEY
const MODEL = "google/gemini-2.5-flash-image"

// Gambar 1x1 pixel PNG transparan (base64) sebagai dummy test
const DUMMY_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname } = new URL(url)
    const options = {
      hostname,
      path: pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
    }

    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => resolve({ status: res.statusCode, body: data }))
    })

    req.on("error", reject)
    req.setTimeout(120_000, () => {
      req.destroy()
      reject(new Error("timeout"))
    })
    req.write(body)
    req.end()
  })
}

async function test() {
  console.log("🔍 Testing model:", MODEL)
  console.log("🔑 API Key:", API_KEY ? API_KEY.slice(0, 20) + "..." : "❌ TIDAK ADA")
  console.log("")

  const body = JSON.stringify({
    model: MODEL,
    modalities: ["image", "text"],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Make this image look like anime style" },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${DUMMY_IMAGE_BASE64}` },
          },
        ],
      },
    ],
  })

  try {
    console.log("📡 Mengirim request ke OpenRouter...")
    const { status, body: rawBody } = await httpPost(
      "https://openrouter.ai/api/v1/chat/completions",
      body
    )

    console.log("📥 HTTP Status:", status)
    console.log("")

    const json = JSON.parse(rawBody)

    if (json.error) {
      console.log("❌ API Error:")
      console.log("   Code   :", json.error.code ?? json.error.status)
      console.log("   Message:", json.error.message)
    } else {
      console.log("✅ HTTP 200 — Full JSON response:")
      console.log(JSON.stringify(json, null, 2).slice(0, 3000))
    }
  } catch (err) {
    console.error("💥 Unexpected error:", err.message)
  }
}

test()
