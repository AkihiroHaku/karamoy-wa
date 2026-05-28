const ping = require("./ping")
const menu = require("./menu")
const sticker = require("./sticker")
const unsticker = require("./unsticker")
const ai = require("./ai")
const imagine = require("./imagine")

// Daftarkan semua handler command di sini.
// Untuk menambah command baru: buat file baru lalu tambahkan di array ini.
const handlers = [ping, menu, sticker, unsticker, ai, imagine]

/**
 * Dispatch pesan ke handler command yang sesuai.
 * Mendukung dua mode matching:
 *   - Exact match : handler punya `commands: [...]` (array string)
 *   - Prefix match: handler punya `match(command)` (fungsi boolean)
 *
 * Mengembalikan `true` jika command ditemukan dan dihandle.
 *
 * @param {object} sock    - Instance socket Baileys
 * @param {object} msg     - Objek pesan dari Baileys
 * @param {string} command - Teks command (sudah lowercase, sudah trim)
 * @returns {Promise<boolean>}
 */
async function handleCommand(sock, msg, command) {
  for (const handler of handlers) {
    const matched =
      typeof handler.match === "function"
        ? handler.match(command)
        : Array.isArray(handler.commands) && handler.commands.includes(command)

    if (matched) {
      await handler.handle(sock, msg, command)
      return true
    }
  }
  return false
}

module.exports = { handleCommand }
