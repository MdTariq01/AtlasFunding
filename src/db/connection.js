const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let isConnected = false;
let mongoServer = null;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/atlasfunding";

  try {
    // Set a 3 second selection timeout so it fails quickly if local Mongo is not running
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    isConnected = true;
    console.log("✅ Connected to MongoDB:", uri.split("@").pop());
  } catch (err) {
    console.warn("⚠️  Local MongoDB not detected, starting In-Memory MongoDB server...");
    try {
      mongoServer = await MongoMemoryServer.create();
      const memoryUri = mongoServer.getUri();
      await mongoose.connect(memoryUri);
      isConnected = true;
      console.log("🚀 In-Memory MongoDB connected:", memoryUri);
    } catch (memErr) {
      console.error("❌ Failed to start In-Memory MongoDB:", memErr.message);
      process.exit(1);
    }
  }

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
    console.warn("⚠️  MongoDB disconnected");
  });
}

module.exports = connectDB;

