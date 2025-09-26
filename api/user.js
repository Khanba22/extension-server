const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

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
    const { name, apiKey, type } = req.body || {};
    if (!name || !apiKey) {
      res.status(400).json({ error: "Name and API key are required" });
      return;
    }

    let user = await User.findOne({ name });
    if (!user) {
      const hashedApiKey = await bcrypt.hash(apiKey, 10);
      user = new User({
        name,
        apiKey: hashedApiKey,
        coursesSolved: type === "coursera" ? 1 : 0,
        formsSolved: type === "gforms" ? 1 : 0,
      });
      await user.save();
      res.json({ message: "User created successfully" });
      return;
    }

    user.apiKey = await bcrypt.hash(apiKey, 10);
    await user.save();

    if (type) {
      if (type === "coursera") user.coursesSolved += 1;
      else if (type === "gforms") user.formsSolved += 1;
      else {
        res.status(400).json({ error: "Invalid type" });
        return;
      }
      await user.save();
    }

    res.json({ name: user.name, coursesSolved: user.coursesSolved, formsSolved: user.formsSolved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};


