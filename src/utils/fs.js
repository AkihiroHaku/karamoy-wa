const fs = require("fs/promises")

/**
 * Menunda eksekusi selama `ms` milidetik.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Menghapus folder temporary dengan mekanisme retry
 * untuk menangani error EBUSY / EPERM di Windows.
 * @param {string} tempDir - Path folder yang akan dihapus
 */
async function removeTempDir(tempDir) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
      return
    } catch (error) {
      if (!["EBUSY", "EPERM"].includes(error.code)) {
        throw error
      }
      await sleep(250)
    }
  }
}

module.exports = { sleep, removeTempDir }
