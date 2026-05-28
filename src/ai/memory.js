const { AI_MAX_HISTORY } = require("../config")

/**
 * In-memory store untuk history chat per user.
 * Key: remoteJid (nomor WA pengirim)
 * Value: array of { role: "user"|"assistant", content: string }
 *
 * Data hilang saat bot restart — by design untuk v1.
 */
const store = new Map()

/**
 * Mengambil history chat milik user tertentu.
 * @param {string} jid - remoteJid pengirim
 * @returns {{ role: string, content: string }[]}
 */
function getHistory(jid) {
  return store.get(jid) ?? []
}

/**
 * Menambahkan satu pesan ke history user, lalu memangkas
 * agar tidak melebihi AI_MAX_HISTORY (dihitung per pasang user/assistant).
 *
 * @param {string} jid
 * @param {"user"|"assistant"} role
 * @param {string} content
 */
function appendHistory(jid, role, content) {
  const history = store.get(jid) ?? []
  history.push({ role, content })

  // Potong dari awal jika melebihi batas
  const maxMessages = AI_MAX_HISTORY * 2 // setiap "turn" = 1 user + 1 assistant
  if (history.length > maxMessages) {
    history.splice(0, history.length - maxMessages)
  }

  store.set(jid, history)
}

/**
 * Menghapus seluruh history chat milik user.
 * @param {string} jid
 */
function clearHistory(jid) {
  store.delete(jid)
}

module.exports = { getHistory, appendHistory, clearHistory }
