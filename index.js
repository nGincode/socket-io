const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Buat CORS lebih ketat jika perlu
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Log setiap event masuk
  socket.onAny((event, ...args) => {
    console.log(`📨 [${socket.id}] Event received:`, event, args);
  });

  socket.on("join-store", (storeId) => {
    socket.join(`store-${storeId}`);
    console.log(`Socket ${socket.id} joined room store-${storeId}`);
  });

  socket.on("input-change", ({ storeId, data }) => {
    console.log(`✏️  Input from ${socket.id} (store-${storeId}):`, data);
    // Kirim ke semua client di room yang sama (kecuali pengirim)
    socket.to(`store-${storeId}`).emit("input-update", data);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = 1991;
server.listen(PORT, () => {
  console.log(`Socket.IO server listening on port ${PORT}`);
});
