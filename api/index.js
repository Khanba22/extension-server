const mongoose = require("mongoose");
const path = require("path");

const MONGODB_URI = process.env.MONGODB_URI;

let cachedConnection = global.__mongoose_conn;

async function connectToDb() {
  if (cachedConnection) {
    return cachedConnection;
  }
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }
  cachedConnection = await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  global.__mongoose_conn = cachedConnection;
  return cachedConnection;
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  apiKey: { type: String, required: true },
  coursesSolved: { type: Number, default: 0 },
  modulesSkipped: { type: Number, default: 0 },
  formsSolved: { type: Number, default: 0 },
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    await connectToDb();

    if (req.method === "GET") {
      const totalUsers = await User.countDocuments();
      const [totalCoursesSolved] = await User.aggregate([
        { $group: { _id: null, total: { $sum: "$coursesSolved" } } },
      ]);
      const [totalFormsSolved] = await User.aggregate([
        { $group: { _id: null, total: { $sum: "$formsSolved" } } },
      ]);
      const [totalModulesSkipped] = await User.aggregate([
        { $group: { _id: null, total: { $sum: "$modulesSkipped" } } },
      ]);

      const stats = {
        totalUsers,
        coursesSolved: totalCoursesSolved?.total || 0,
        formsSolved: totalFormsSolved?.total || 0,
        totalModulesSkipped: totalModulesSkipped?.total || 0,
        totalUsage: (totalCoursesSolved?.total || 0) + (totalFormsSolved?.total || 0),
      };

      res.status(200).json({ stats });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};


