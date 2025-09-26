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
    const isVercel = !!process.env.VERCEL;
    if (isVercel) {
      res.status(501).json({ error: "Python side-process is not supported on Vercel. Host Node server or create an external worker." });
      return;
    }

    // Local/Node hosting: spawn python side process and parse output
    const { spawn } = require("child_process");
    const pythonBinary = process.env.PYTHON_BINARY || "python";
    const scriptPath = require("path").join(process.cwd(), "script", "course_completion.py");

    const output = await new Promise((resolve, reject) => {
      const p = spawn(pythonBinary, [scriptPath, courseSlug, cAuth, csrf]);
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += d.toString()));
      p.stderr.on("data", (d) => (err += d.toString()));
      p.on("close", (code) => {
        if (code !== 0) reject(new Error(err || `Python exited ${code}`));
        else resolve(out);
      });
      p.on("error", (e) => reject(e));
    });

    const match = String(output).match(/[0-9]+/);
    const data = match ? { modulesSkipped: parseInt(match[0], 10) } : { output: String(output) };

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


