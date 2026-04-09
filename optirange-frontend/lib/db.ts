import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/optirange";

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    return;
  }
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB via Mongoose");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
