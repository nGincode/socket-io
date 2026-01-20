const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  transports: ["polling", "websocket"],
  allowUpgrades: true,
  cors: {
    origin: (origin, callback) => {
      // ❌ React Native tidak kirim origin (undefined/null)
      if (!origin) return callback(null, true);

      // ✅ Allowed web origins (Backoffice)
      const allowedOrigins = [
        "https://backoffice.ekasir.web.id",
        "https://ekasir.web.id",
      ];

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // ❌ origin lain ditolak
      return callback(new Error("CORS_NOT_ALLOWED"));
    },
    methods: ["GET", "POST"],
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error("NO_TOKEN"));
  }

  if (token !== "fembinurilham+nGincode+WGyR/aeiufhnowty=") {
    return next(new Error("INVALID_TOKEN"));
  }

  socket.authenticated = true;
  next();
});

const ipCount = new Map();
io.use((socket, next) => {
  const ip =
    socket.handshake.headers["cf-connecting-ip"] || socket.handshake.address;

  const current = ipCount.get(ip) || 0;

  if (current >= 10) {
    return next(new Error("TOO_MANY_CONNECTIONS"));
  }

  ipCount.set(ip, current + 1);

  socket.on("disconnect", () => {
    const now = ipCount.get(ip) || 1;
    ipCount.set(ip, Math.max(0, now - 1));
  });

  next();
});

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.onAny((event, ...args) => {
    console.log(`📨 [${socket.id}]`, event, args);
  });

  // JOIN STORE
  socket.on("join-store", (storeId) => {
    const room = `store-${String(storeId)}`;
    socket.join(room);
    console.log(`🏪 ${socket.id} joined ${room}`);
  });

  // LEAVE STORE
  socket.on("leave-store", (storeId) => {
    const room = `store-${String(storeId)}`;
    socket.leave(room);
    console.log(`🚪 ${socket.id} left ${room}`);
  });

  // 🔥 SYNC TRANSACTION
  socket.on("sync-transaction", ({ storeId, userId }) => {
    const room = `store-${String(storeId)}`;
    console.log(`🔄 sync-transaction from ${socket.id} → ${room}`);

    // broadcast ke device lain
    socket.to(room).emit("sync-transaction", { storeId, userId });
  });

  // 🔥 SYNC ITEM
  socket.on("sync-item", ({ storeId }) => {
    const room = `store-${String(storeId)}`;
    console.log(`📦 sync-item → ${room}`);

    io.to(room).emit("sync-item", { storeId });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

const PORT = 1991;
server.listen(PORT, () => {
  console.log(`🚀 socket on`);
});
