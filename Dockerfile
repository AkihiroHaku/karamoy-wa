# Pakai Node.js 20 LTS Alpine (ringan)
FROM node:20-alpine

# Install ffmpeg untuk fitur stiker video
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Copy package files dulu (manfaatkan Docker layer cache)
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Copy semua source code
COPY . .

# Buat folder session agar volume bisa di-mount di sini
RUN mkdir -p /app/session

# Jalankan bot
CMD ["node", "index.js"]
