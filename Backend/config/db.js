const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("DB connected!");
  } catch (error) {
    console.log("DB not connected. Server will fall back to in-memory database simulation.", error);
  }
};

module.exports = connectDB;