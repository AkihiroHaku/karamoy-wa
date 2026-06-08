const sharp = require("sharp")
const { createCanvas, loadImage } = require("@napi-rs/canvas")

/**
 * Scan piksel gambar dari bawah ke atas untuk menemukan area kotak putih.
 * Piksel dianggap "putih" jika R, G, B semuanya >= threshold.
 *
 * @param {Buffer} rawData  - Raw RGBA pixel buffer dari sharp
 * @param {{ width, height, channels }} info
 * @param {number} whiteThreshold  - Nilai minimum R/G/B untuk dianggap putih (default 230)
 * @param {number} minWhiteFraction - Fraksi minimum piksel putih per baris (default 0.80)
 * @returns {{ x, y, width, height } | null}  - Bounding box atau null jika tidak ditemukan
 */
function detectWhiteRegion(rawData, info, whiteThreshold = 230, minWhiteFraction = 0.80) {
  const { width, height, channels } = info

  let regionBottom = -1
  let regionTop = -1

  // Scan dari bawah ke atas, cari baris putih
  for (let row = height - 1; row >= 0; row--) {
    let whiteCount = 0
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * channels
      const r = rawData[i]
      const g = rawData[i + 1]
      const b = rawData[i + 2]
      if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
        whiteCount++
      }
    }

    const fraction = whiteCount / width
    if (fraction >= minWhiteFraction) {
      // Baris ini termasuk area putih
      if (regionBottom === -1) regionBottom = row
      regionTop = row
    } else if (regionBottom !== -1) {
      // Ketemu batas atas area putih, berhenti
      break
    }
  }

  if (regionBottom === -1 || regionTop === -1) return null

  const regionHeight = regionBottom - regionTop + 1
  // Minimal 10px tinggi agar tidak false-positive
  if (regionHeight < 10) return null

  return { x: 0, y: regionTop, width, height: regionHeight }
}

/**
 * Hitung ukuran font optimal agar teks muat di dalam kotak.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxHeight
 * @param {number} startSize
 * @returns {number}  - Ukuran font dalam piksel
 */
function fitFontSize(ctx, text, maxWidth, maxHeight, startSize = 60) {
  let size = startSize
  ctx.font = `bold ${size}px Arial`
  while (size > 8) {
    ctx.font = `bold ${size}px Arial`
    const metrics = ctx.measureText(text)
    if (metrics.width <= maxWidth * 0.9 && size <= maxHeight * 0.75) break
    size -= 2
  }
  return size
}

/**
 * Ganti teks di dalam area kotak putih pada stiker WhatsApp.
 *
 * Alur:
 *  1. Decode WebP → raw RGBA pixels via sharp
 *  2. Deteksi kotak putih dari bawah
 *  3. Gambar ulang lewat canvas: gambar asli + kotak putih bersih + teks baru
 *  4. Encode kembali ke WebP stiker
 *
 * @param {Buffer} stickerBuffer  - Buffer stiker WebP dari WhatsApp
 * @param {string} newText        - Teks pengganti
 * @param {object} [opts]
 * @param {string} [opts.textColor="black"]  - Warna teks
 * @param {string} [opts.bgColor="white"]    - Warna latar kotak
 * @returns {Promise<Buffer>}     - Buffer stiker WebP baru
 */
async function replaceTextInSticker(stickerBuffer, newText, opts = {}) {
  const { textColor = "black", bgColor = "white" } = opts

  // ── 1. Decode gambar ─────────────────────────────────────────────────────────
  const { data: rawData, info } = await sharp(stickerBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info

  // ── 2. Deteksi kotak putih ───────────────────────────────────────────────────
  const region = detectWhiteRegion(rawData, info)
  if (!region) {
    const err = new Error("white_region_not_found")
    err.userMessage =
      "Tidak ditemukan kotak putih di stiker ini. " +
      "Fitur ini hanya bekerja pada stiker yang punya label teks berlatar putih."
    throw err
  }

  // ── 3. Render ulang via canvas ───────────────────────────────────────────────
  const pngBuffer = await sharp(stickerBuffer).png().toBuffer()
  const srcImage = await loadImage(pngBuffer)

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")

  // Gambar asli
  ctx.drawImage(srcImage, 0, 0, width, height)

  // Timpa area teks dengan kotak warna latar
  ctx.fillStyle = bgColor
  ctx.fillRect(region.x, region.y, region.width, region.height)

  // Hitung ukuran font agar teks muat
  const fontSize = fitFontSize(ctx, newText, region.width, region.height)
  ctx.font = `bold ${fontSize}px Arial`
  ctx.fillStyle = textColor
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  const textX = region.x + region.width / 2
  const textY = region.y + region.height / 2

  ctx.fillText(newText, textX, textY)

  // ── 4. Export ke WebP ────────────────────────────────────────────────────────
  const pngOut = canvas.toBuffer("image/png")
  return sharp(pngOut).webp({ quality: 90 }).toBuffer()
}

/**
 * Tambahkan teks baru dengan kotak putih di posisi tertentu pada stiker.
 * Dipakai untuk stiker yang teksnya tidak punya background — kotak putih
 * akan menutupi teks lama jika berada di posisi yang sama.
 *
 * @param {Buffer} stickerBuffer  - Buffer stiker WebP dari WhatsApp
 * @param {string} newText        - Teks yang ingin ditulis
 * @param {'top'|'bottom'|'center'} [position='bottom']
 * @param {object} [opts]
 * @param {string}  [opts.textColor='black']   - Warna teks
 * @param {string}  [opts.bgColor='white']     - Warna kotak latar
 * @param {number}  [opts.heightFraction=0.22] - Tinggi kotak relatif terhadap gambar (0–1)
 * @returns {Promise<Buffer>}  - Buffer stiker WebP baru
 */
async function addTextWithBackground(stickerBuffer, newText, position = "bottom", opts = {}) {
  const {
    textColor = "black",
    bgColor = "white",
    heightFraction = 0.22,
  } = opts

  // ── Baca metadata gambar ──────────────────────────────────────────────────────
  const meta = await sharp(stickerBuffer).metadata()
  const width = meta.width
  const height = meta.height
  const boxH = Math.round(height * heightFraction)

  // Tentukan koordinat Y kotak putih berdasarkan posisi
  let boxY
  if (position === "top") {
    boxY = 0
  } else if (position === "center") {
    boxY = Math.round((height - boxH) / 2)
  } else {
    // bottom (default)
    boxY = height - boxH
  }

  // ── Gambar ulang via canvas ───────────────────────────────────────────────────
  const pngBuffer = await sharp(stickerBuffer).png().toBuffer()
  const srcImage = await loadImage(pngBuffer)

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")

  // Gambar asli
  ctx.drawImage(srcImage, 0, 0, width, height)

  // Kotak putih (dengan sedikit shadow agar terlihat jelas di semua stiker)
  ctx.shadowColor = "rgba(0,0,0,0.15)"
  ctx.shadowBlur = 4
  ctx.fillStyle = bgColor
  ctx.fillRect(0, boxY, width, boxH)
  ctx.shadowBlur = 0

  // Teks di tengah kotak
  const fontSize = fitFontSize(ctx, newText, width, boxH)
  ctx.font = `bold ${fontSize}px Arial`
  ctx.fillStyle = textColor
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(newText, width / 2, boxY + boxH / 2)

  // ── Export ke WebP ────────────────────────────────────────────────────────────
  const pngOut = canvas.toBuffer("image/png")
  return sharp(pngOut).webp({ quality: 90 }).toBuffer()
}

module.exports = { replaceTextInSticker, addTextWithBackground, detectWhiteRegion }
