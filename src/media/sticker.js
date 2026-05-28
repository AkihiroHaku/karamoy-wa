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
      ffmpeg(inputPath)
        .duration(10)
        .outputOptions([
          "-vcodec libwebp",
          `-vf scale=${STICKER_SIZE}:${STICKER_SIZE}:force_original_aspect_ratio=decrease,fps=${DEFAULT_STICKER_FPS},pad=${STICKER_SIZE}:${STICKER_SIZE}:-1:-1:color=0x00000000`,
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
