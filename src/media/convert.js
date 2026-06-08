const fs = require("fs/promises")
const os = require("os")
const path = require("path")
const sharp = require("sharp")
const ffmpeg = require("fluent-ffmpeg")
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg")
const { removeTempDir } = require("../utils/fs")
const { DEFAULT_STICKER_FPS } = require("../config")

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

/**
 * Mendeteksi area transparan (letterboxing) dari satu frame PNG
 * dan mengembalikan region crop yang konsisten untuk semua frame.
 *
 * Hanya aktif jika frame benar-benar memiliki alpha channel dengan
 * area transparan — aman untuk stiker tanpa letterboxing (tidak memotong apa pun).
 *
 * @param {Buffer} buffer   - Buffer WebP animasi
 * @param {object} meta     - Metadata sharp (harus sudah ada width, height, hasAlpha)
 * @returns {Promise<object|null>} region { left, top, width, height } atau null
 */
async function getContentCrop(buffer, meta) {
  if (!meta.hasAlpha) return null

  try {
    const firstFrameBuf = await sharp(buffer, { animated: false, page: 0 }).png().toBuffer()
    const { info } = await sharp(firstFrameBuf)
      .trim({ threshold: 10 })
      .toBuffer({ resolveWithObject: true })

    const origW = meta.width
    const origH = meta.height

    // Jika ukuran hasil trim sama dengan original → tidak ada letterboxing
    if (info.width >= origW && info.height >= origH) return null

    // trimOffsetLeft/Top adalah offset negatif (berapa piksel yang dihapus dari sisi kiri/atas)
    const left = Math.max(0, -(info.trimOffsetLeft ?? 0))
    const top = Math.max(0, -(info.trimOffsetTop ?? 0))
    const width = Math.min(info.width, origW - left)
    const height = Math.min(info.height, origH - top)

    // Pastikan region valid
    if (width <= 0 || height <= 0) return null

    return { left, top, width, height }
  } catch {
    return null // Gagal detect → pakai ukuran penuh
  }
}

/**
 * Mengkonversi stiker WhatsApp (WebP) menjadi gambar PNG statis.
 * Jika stiker animasi, hanya frame pertama yang diambil.
 * Area transparan (letterboxing dari stiker non-persegi) otomatis dipangkas.
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function stickerToImage(buffer) {
  return sharp(buffer, { animated: false })
    .trim({ threshold: 10 })
    .png()
    .toBuffer()
}

/**
 * Mengkonversi stiker WhatsApp (WebP animasi) menjadi video MP4.
 *
 * Alur kerja:
 * 1. Deteksi letterboxing transparan dari frame pertama
 * 2. Gunakan sharp untuk extract tiap frame WebP ke PNG (dengan crop konsisten)
 * 3. Encode PNG sequence ke MP4 via ffmpeg
 *
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function stickerToVideo(buffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-unsticker-"))
  const outputPath = path.join(tempDir, "sticker.mp4")

  try {
    const meta = await sharp(buffer, { animated: true }).metadata()
    const isAnimated = (meta.pages ?? 1) > 1

    if (!isAnimated) {
      // Stiker statis: trim transparan lalu wrap jadi video 1 detik
      const pngBuf = await sharp(buffer).trim({ threshold: 10 }).png().toBuffer()
      const pngPath = path.join(tempDir, "frame.png")
      await fs.writeFile(pngPath, pngBuf)

      await new Promise((resolve, reject) => {
        ffmpeg(pngPath)
          .inputOptions(["-loop 1"])
          .outputOptions([
            "-t 1",
            "-c:v libx264",
            "-pix_fmt yuv420p",
            "-movflags +faststart",
            "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2",
          ])
          .save(outputPath)
          .on("end", resolve)
          .on("error", reject)
      })
    } else {
      // Stiker animasi: extract frame dulu, lalu encode sebagai image sequence
      const frameCount = meta.pages
      const frameDelay = meta.delay ?? []
      const avgDelayMs = frameDelay.length
        ? frameDelay.reduce((a, b) => a + b, 0) / frameDelay.length
        : 1000 / DEFAULT_STICKER_FPS
      const fps = Math.round(1000 / avgDelayMs) || DEFAULT_STICKER_FPS

      // Deteksi letterboxing dari frame pertama (null = tidak ada, pakai ukuran penuh)
      const crop = await getContentCrop(buffer, meta)

      const framePromises = []
      for (let i = 0; i < frameCount; i++) {
        const framePath = path.join(tempDir, `frame_${String(i).padStart(4, "0")}.png`)

        let transformer = sharp(buffer, { animated: false, page: i })
        if (crop) {
          transformer = transformer.extract(crop)
        }

        framePromises.push(
          transformer
            .flatten({ background: { r: 0, g: 0, b: 0 } })
            .png()
            .toFile(framePath)
        )
      }
      await Promise.all(framePromises)

      const inputPattern = path.join(tempDir, "frame_%04d.png")

      await new Promise((resolve, reject) => {
        ffmpeg(inputPattern)
          .inputOptions([`-framerate ${fps}`])
          .outputOptions([
            "-c:v libx264",
            "-pix_fmt yuv420p",
            "-movflags +faststart",
            "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2",
          ])
          .save(outputPath)
          .on("end", resolve)
          .on("error", reject)
      })
    }

    return await fs.readFile(outputPath)
  } finally {
    await removeTempDir(tempDir)
  }
}

module.exports = { stickerToImage, stickerToVideo }
