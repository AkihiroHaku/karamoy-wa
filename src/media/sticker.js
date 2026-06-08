const fs = require("fs/promises")
const os = require("os")
const path = require("path")
const sharp = require("sharp")
const ffmpeg = require("fluent-ffmpeg")
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg")
const { removeTempDir } = require("../utils/fs")
const { downloadMessageBuffer } = require("./download")
const { STICKER_SIZE, STICKER_QUALITY, DEFAULT_STICKER_FPS } = require("../config")

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

/**
 * Mengkonversi gambar (buffer) menjadi stiker WhatsApp format WebP.
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function imageToSticker(buffer) {
  return sharp(buffer)
    .resize(STICKER_SIZE, STICKER_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: STICKER_QUALITY })
    .toBuffer()
}

/**
 * Mengkonversi video (buffer) menjadi stiker animasi WhatsApp format WebP.
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function videoToSticker(buffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-sticker-"))
  const inputPath = path.join(tempDir, "input.mp4")
  const outputPath = path.join(tempDir, "sticker.webp")

  await fs.writeFile(inputPath, buffer)

  try {
    await new Promise((resolve, reject) => {
      const S = STICKER_SIZE
      const FPS = DEFAULT_STICKER_FPS

      // Filter complex:
      // [bg] — video diperbesar & di-blur, dipakai sebagai latar
      // [fg] — video asli diperkecil agar muat penuh tanpa crop
      // overlay — tempel fg di tengah bg
      const filterComplex = [
        `[0:v]scale=${S}:${S}:force_original_aspect_ratio=increase,crop=${S}:${S},gblur=sigma=20[bg]`,
        `[0:v]scale=${S}:${S}:force_original_aspect_ratio=decrease[fg]`,
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${FPS}[out]`,
      ].join(";")

      ffmpeg(inputPath)
        .duration(10)
        .outputOptions([
          "-vcodec libwebp",
          "-filter_complex", filterComplex,
          "-map", "[out]",
          "-loop 0",
          "-an",
          "-vsync 0",
          "-preset default",
        ])
        .save(outputPath)
        .on("end", resolve)
        .on("error", reject)
    })

    return await fs.readFile(outputPath)
  } finally {
    await removeTempDir(tempDir)
  }
}

/**
 * Download media dari pesan lalu konversi ke stiker WhatsApp.
 * @param {{ type: string, message: object }} source
 * @param {object} sock
 * @returns {Promise<Buffer>}
 */
async function createStickerBuffer(source, sock) {
  const buffer = await downloadMessageBuffer(source.message, sock)

  if (source.type === "video") {
    return videoToSticker(buffer)
  }

  return imageToSticker(buffer)
}

module.exports = { imageToSticker, videoToSticker, createStickerBuffer }
