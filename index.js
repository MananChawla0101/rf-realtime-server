// index.js (Realtime Server)
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // allow all while testing
});

// Environment variables
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "radiationDB";
const COLLECTION_NAME = "rf_data";

let mongoClient;

async function connectMongo() {
  try {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    console.log("✅ Realtime server connected to MongoDB");

    const collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);

    // Change Stream (listen for inserts/updates)
    const changeStream = collection.watch(
      [
        { $match: { operationType: { $in: ["insert", "update", "replace"] } } }
      ],
      { fullDocument: "updateLookup" }
    );

    changeStream.on("change", (change) => {
      const doc = change.fullDocument;
      if (!doc) return;

      console.log("🔔 New realtime update:", doc);

      // Broadcast to all devices
      io.emit("newReading", {
        frequency: doc.frequency,
        signalStrength: doc.signalStrength,
        classification: doc.classification,
        timestamp: doc.timestamp
      });
    });

    changeStream.on("error", (err) => {
      console.error("❌ ChangeStream error:", err);
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}

connectMongo();

io.on("connection", (socket) => {
  console.log("⚡ Device connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Device disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.json({ message: "Realtime server running" });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Realtime server listening on port ${PORT}`);
});
// GET /getRF  — returns latest readings
app.get("/getRF", async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(500).json({ success: false, error: "Mongo not connected" });
    }
    const collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
    // fetch latest 50 by timestamp (assumes timestamp is stored as Date or ISO string)
    const docs = await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    res.json({ success: true, data: docs });
  } catch (err) {
    console.error("GET /getRF error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
