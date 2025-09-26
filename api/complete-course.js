const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

let cachedConnection = global.__mongoose_conn;

async function connectToDb() {
  if (cachedConnection) return cachedConnection;
  if (!MONGODB_URI) throw new Error("MONGODB_URI is not set");
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
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    await connectToDb();

    const { courseSlug, cAuth, csrf, name } = req.body || {};
    if (!courseSlug || !cAuth || !csrf) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // On Vercel, we cannot spawn Python. Return error instructive.
    const { runCourseCompletion } = require("../lib/courseCompletion");
    const modules = await runCourseCompletion(courseSlug, cAuth, csrf);
    const data = { modulesSkipped: modules };

    if (typeof data.modulesSkipped === "number") {
      const user = await User.findOne({ name });
      if (user) {
        user.coursesSolved += 1;
        user.modulesSkipped = data.modulesSkipped + (user.modulesSkipped || 0);
        await user.save();
      } else if (name) {
        await User.create({
          name,
          apiKey: "not-available",
          coursesSolved: 1,
          modulesSkipped: data.modulesSkipped,
        });
      }
    }

    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};


