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

    const resp = await fetch(`/api/course_completion`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseSlug, cAuth, csrf })
    });
    const data = await resp.json();

    if (resp.ok && typeof data.modulesSkipped === "number") {
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

    res.status(resp.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};


