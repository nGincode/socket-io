const fs = require("fs");
const https = require("https");
const { Server } = require("socket.io");

const server = https.createServer({
  key: fs.readFileSync(
    "/etc/letsencrypt/live/socket.ekasir.web.id/privkey.pem",
  ),
  cert: fs.readFileSync(
    "/etc/letsencrypt/live/socket.ekasir.web.id/fullchain.pem",
  ),
});

const ipCount = new Map();

const io = new Server(server, {
  transports: ["websocket"],
  allowUpgrades: false,
  cors: {
    origin: (origin, callback) => {
      // React Native (origin undefined)
      if (!origin) return callback(null, true);

      const allowed = [
        "https://backoffice.ekasir.web.id",
        "https://ekasir.web.id",
      ];

      if (allowed.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS_NOT_ALLOWED"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/* =====================
   🔐 AUTH
===================== */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) return next(new Error("NO_TOKEN"));
  if (token !== process.env.SOCKET_SECRET) {
    return next(new Error("INVALID_TOKEN"));
  }

  next();
});

/* =====================
   🛡️ RATE LIMIT (AMAN)
===================== */
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

/* =====================
   🔌 SOCKET EVENTS
===================== */
io.on("connection", (socket) => {
  console.log("🟢 CONNECTED:", socket.id);

  socket.on("join-store", (storeId) => {
    socket.join(`store:${storeId}`);
  });

  socket.on("leave-store", (storeId) => {
    socket.leave(`store:${storeId}`);
  });

  socket.on("sync-transaction", ({ storeId, userId }) => {
    socket.to(`store:${storeId}`).emit("sync-transaction", {
      storeId,
      userId,
    });
  });

  socket.on("sync-item", ({ storeId }) => {
    io.to(`store:${storeId}`).emit("sync-item", { storeId });
  });

  socket.on("disconnect", (reason) => {
    console.log("🔴 DISCONNECTED:", socket.id, reason);
  });
});

/* =====================
   🚀 START
===================== */
server.listen(1991, () => {
  console.log("🚀  socket on");
});
