const { AI_OWNER_NUMBERS } = require("../config")

/**
 * Mendapatkan JID pengirim sebenarnya.
 * - Private chat : remoteJid = JID pengirim
 * - Group chat   : participant = JID pengirim di dalam grup
 * @param {object} msg
 * @returns {string}
 */
function getSenderJid(msg) {
  return msg.key.participant || msg.key.remoteJid
}

/**
 * Mengambil nomor bersih dari JID (tanpa @suffix dan device suffix).
 * Contoh: "628xxx:5@lid" → "628xxx"
 * @param {object} msg
 * @returns {string}
 */
function getSenderNumber(msg) {
  const jid = getSenderJid(msg)
  return jid.replace(/@.+$/, "").replace(/:\d+$/, "")
}

/**
 * Mengecek apakah pengirim adalah owner yang terdaftar di config.
 * @param {object} msg
 * @returns {boolean}
 */
function isOwner(msg) {
  if (!AI_OWNER_NUMBERS.length) return false
  return AI_OWNER_NUMBERS.includes(getSenderNumber(msg))
}

module.exports = { getSenderJid, getSenderNumber, isOwner }
