const RETRYABLE_CODES = ["ECONNRESET", "EAI_AGAIN", "ENETUNREACH", "ENOTFOUND", "ETIMEDOUT"]

/**
 * Mencari error code dari rantai error (termasuk error.cause).
 * @param {Error} error
 * @returns {string | null}
 */
function findErrorCode(error) {
  let current = error
  while (current) {
    if (current.code) return current.code
    current = current.cause
  }
  return null
}

/**
 * Mengecek apakah error saat download layak untuk dicoba ulang.
 * @param {Error} error
 * @returns {boolean}
 */
function isRetryableDownloadError(error) {
  return RETRYABLE_CODES.includes(findErrorCode(error))
}

/**
 * Menghasilkan pesan error yang ramah pengguna untuk kegagalan download media.
 * @param {Error} error
 * @returns {string}
 */
function getMediaDownloadErrorMessage(error) {
  const code = findErrorCode(error)

  if (["EAI_AGAIN", "ENOTFOUND"].includes(code)) {
    return "Media gagal diunduh karena DNS/jaringan tidak bisa menjangkau server WhatsApp. Coba ulang beberapa saat lagi."
  }

  if (["ECONNRESET", "ENETUNREACH", "ETIMEDOUT"].includes(code)) {
    return "Media gagal diunduh karena koneksi ke WhatsApp terputus. Coba ulang lagi."
  }

  return "Gagal memproses media. Coba kirim atau reply media lain."
}

module.exports = {
  findErrorCode,
  isRetryableDownloadError,
  getMediaDownloadErrorMessage,
}
