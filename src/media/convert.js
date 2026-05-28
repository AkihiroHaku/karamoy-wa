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
 * Mengkonversi stiker WhatsApp (WebP) menjadi gambar PNG statis.
 * Jika stiker animasi, hanya frame pertama yang diambil.
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function stickerToImage(buffer) {
  return sharp(buffer, { animated: false })
    .png()
    .toBuffer()
}

/**
 * Mengkonversi stiker WhatsApp (WebP animasi) menjadi video MP4.
 *
 * Alur kerja:
 * 1. Gunakan sharp untuk extract tiap frame WebP ke PNG
 * 2. Encode PNG sequence ke MP4 via ffmpeg
 *
 * Pendekatan ini menghindari error "decoding stream after EOF"
 * yang terjadi jika ffmpeg langsung membaca file WebP animasi.
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
      // Stiker statis: convert ke PNG lalu wrap jadi video 1 detik
      const pngBuf = await sharp(buffer).png().toBuffer()
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

      const framePromises = []
      for (let i = 0; i < frameCount; i++) {
        const framePath = path.join(tempDir, `frame_${String(i).padStart(4, "0")}.png`)
        framePromises.push(
          sharp(buffer, { animated: false, page: i })
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
