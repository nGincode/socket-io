require("dotenv").config(); // Load .env
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet"); // Tambahan security header HTTP

const app = express();
app.use(helmet()); // Basic security headers

const server = http.createServer(app);

const io = new Server(server, {
  allowUpgrades: true,
  cors: {
    origin: (origin, callback) => {
      // ❌ Allow mobile apps (no origin)
      if (!origin) return callback(null, true);

      // ✅ Allowed web origins
      const allowedOrigins = [
        "https://backoffice.ekasir.web.id",
        "https://ekasir.web.id",
        "https://socket.ekasir.web.id:8443", // Jika via port
        "https://socket.ekasir.web.id", // Jika via domain utama
      ];

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS_NOT_ALLOWED"));
    },
    allowEIO3: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// --- 🛡️ 1. AUTHENTICATION MIDDLEWARE ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    // Jangan beri detail error ke hacker, cukup generic message
    return next(new Error("AUTH_FAILED"));
  }

  // Ambil secret dari .env (JANGAN HARDCODE)
  const VALID_SECRET = process.env.SOCKET_SECRET_KEY;

  // ⚠️ CATATAN KEAMANAN:
  // Idealnya token ini adalah JWT yang di-verify (jwt.verify).
  // Menggunakan Static String di APK Android masih berisiko jika APK dibongkar.
  // Tapi setidaknya ini lebih rapi daripada hardcode di file.
  if (token !== VALID_SECRET) {
    console.warn(
      `⚠️ Invalid token attempt from IP: ${socket.handshake.address}`,
    );
    return next(new Error("AUTH_FAILED"));
  }

  socket.authenticated = true;
  next();
});

// --- 🛡️ 2. CONNECTION RATE LIMITER (Anti DDOS Sederhana) ---
const ipCount = new Map();
const MAX_CONN_PER_IP = 10;

io.use((socket, next) => {
  // Ambil IP Asli dari Cloudflare atau Direct
  const ip =
    socket.handshake.headers["cf-connecting-ip"] || socket.handshake.address;

  const current = ipCount.get(ip) || 0;

  if (current >= MAX_CONN_PER_IP) {
    console.warn(`⛔ IP ${ip} blocked due to too many connections.`);
    return next(new Error("TOO_MANY_CONNECTIONS"));
  }

  ipCount.set(ip, current + 1);

  socket.on("disconnect", () => {
    const now = ipCount.get(ip) || 1;
    if (now <= 1) {
      ipCount.delete(ip); // Hapus dari memori agar Map tidak bengkak
    } else {
      ipCount.set(ip, now - 1);
    }
  });

  next();
});

// --- 🛡️ 3. EVENT RATE LIMITER (Anti Spam Event) ---
// Mencegah user mengirim "sync-transaction" 100x per detik
const rateLimitMap = new Map();

function isRateLimited(socketId) {
  const now = Date.now();
  const lastTime = rateLimitMap.get(socketId) || 0;

  // Batasi event hanya boleh 1x per 200ms (5 request/detik)
  if (now - lastTime < 200) {
    return true;
  }

  rateLimitMap.set(socketId, now);
  return false;
}

// --- LOGIC UTAMA ---
io.on("connection", (socket) => {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) console.log("🔌 Client connected:", socket.id);

  // Bersihkan memori rate limiter saat disconnect
  socket.on("disconnect", () => {
    rateLimitMap.delete(socket.id);
    if (isDev) console.log("❌ Client disconnected:", socket.id);
  });

  // Debugging log (Hanya aktif di mode dev agar log server bersih)
  if (isDev) {
    socket.onAny((event, ...args) => {
      console.log(`📨 [${socket.id}]`, event, args);
    });
  }

  // --- JOIN STORE ---
  socket.on("join-store", (storeId) => {
    // 🛡️ VALIDASI INPUT
    if (
      !storeId ||
      (typeof storeId !== "string" && typeof storeId !== "number")
    ) {
      return console.warn(`⚠️ [${socket.id}] Invalid join-store data`);
    }

    const room = `store-${String(storeId)}`;
    socket.join(room);
    // console.log(`🏪 ${socket.id} joined ${room}`); // Uncomment jika perlu
  });

  // --- LEAVE STORE ---
  socket.on("leave-store", (storeId) => {
    if (!storeId) return;
    const room = `store-${String(storeId)}`;
    socket.leave(room);
  });

  // --- 🔥 SYNC TRANSACTION ---
  socket.on("sync-transaction", (data) => {
    // 🛡️ 1. Cek Rate Limit (Anti Spam)
    if (isRateLimited(socket.id)) return;

    // 🛡️ 2. Validasi Input Object
    if (!data || !data.storeId) {
      return console.error("❌ Invalid sync-transaction payload");
    }

    const { storeId, userId, senderSocketId } = data;
    const room = `store-${String(storeId)}`;

    // console.log(`🔄 sync-transaction ${room}`); // Log seperlunya saja

    // Broadcast ke device lain di toko yang sama (kecuali pengirim)
    socket
      .to(room)
      .emit("sync-transaction", { storeId, userId, senderSocketId });
  });

  // --- 🔥 SYNC ITEM ---
  socket.on("sync-item", (data) => {
    if (isRateLimited(socket.id)) return;

    if (!data || !data.storeId) return;

    const { storeId } = data;
    const room = `store-${String(storeId)}`;

    // Broadcast ke SEMUA orang di room (termasuk server/pengirim jika perlu)
    // Gunakan io.to jika ingin broadcast ke semua, socket.to jika exclude pengirim
    io.to(room).emit("sync-item", { storeId });
  });

  // --- 🔥 Payment ---
  socket.on("sync-payment-update", (data) => {
    if (isRateLimited(socket.id)) return;

    if (!data || !data.storeId) return;

    const { storeId } = data;
    const room = `store-${String(storeId)}`;

    io.to(room).emit("sync-payment-update", {
      storeId: data.storeId,
      orderId: data.orderId,
      transactionStatus: data.transactionStatus,
    });
  });
});

app.disable("x-powered-by");

app.get("/", (req, res) => {
  res.redirect("https://ekasir.web.id");
});

const PORT = process.env.PORT || 1991;
server.listen(PORT, () => {
  console.log(`🚀 Socket Server running on port ${PORT}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || "development"}`);
});
