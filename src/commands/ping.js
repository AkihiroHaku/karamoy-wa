/**
 * Command: .ping
 * Membalas dengan "pong" untuk mengecek apakah bot aktif.
 */
module.exports = {
  commands: [".ping"],

  async handle(sock, msg) {
    await sock.sendMessage(msg.key.remoteJid, { text: "pong 🏓" })
  },
}
