const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const cors = require("cors");
const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");
require("dotenv").config();
const pingServer = require("./cron");
const { spawn } = require("child_process");

// Function to execute Python script
const runPythonScript = (scriptPath, args = []) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python", [scriptPath, ...args]);

    let output = "";
    let error = "";

    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      error += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`Python script exited with code ${code}\nError: ${error}`)
        );
      } else {
        resolve(output);
      }
    });

    pythonProcess.on("error", (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
};

// Ping the server every 3 minutes
setInterval(pingServer, 180000);
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Stats Server API",
      version: "1.0.0",
      description: "API for tracking Coursera and Google Forms solutions",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
  },
  apis: ["./index.js"],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  apiKey: { type: String, required: true },
  coursesSolved: { type: Number, default: 0 },
  modulesSkipped: { type: Number, default: 0 },
  formsSolved: { type: Number, default: 0 },
});

const User = mongoose.model("User", userSchema);

app.post("/api/user", async (req, res) => {
  try {
    const { name, apiKey, type } = req.body;

    if (!name || !apiKey) {
      return res.status(400).json({ error: "Name and API key are required" });
    }

    let user = await User.findOne({ name });
    user.apiKey = await bcrypt.hash(apiKey, 10);
    await user.save();

    if (!user) {
      // Create new user
      const hashedApiKey = await bcrypt.hash(apiKey, 10);
      user = new User({
        name,
        apiKey: hashedApiKey,
        coursesSolved: type === "coursera" ? 1 : 0,
        formsSolved: type === "gforms" ? 1 : 0,
      });
      await user.save();
      return res.json({ message: "User created successfully" });
    }

    // Update stats if type is provided
    if (type) {
      if (type === "coursera") {
        user.coursesSolved += 1;
      } else if (type === "gforms") {
        user.formsSolved += 1;
      } else {
        return res.status(400).json({ error: "Invalid type" });
      }
      await user.save();
    }

    res.json({
      name: user.name,
      coursesSolved: user.coursesSolved,
      formsSolved: user.formsSolved,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCoursesSolved = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$coursesSolved" } } },
    ]);
    const totalFormsSolved = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$formsSolved" } } },
    ]);

    const totalModulesSkipped = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$modulesSkipped" } } },
    ]);

    const stats = {
      totalUsers,
      coursesSolved: totalCoursesSolved[0]?.total || 0,
      formsSolved: totalFormsSolved[0]?.total || 0,
      totalModulesSkipped: totalModulesSkipped[0]?.total || 0,
      totalUsage:
        (totalCoursesSolved[0]?.total || 0) + (totalFormsSolved[0]?.total || 0),
    };

    res.render("stats", { stats });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Server error");
  }
});

app.post("/api/complete-course", async (req, res) => {
  try {
    const { courseSlug, cAuth, csrf, name } = req.body;
    // Run the Python script with the provided arguments
    const output = await runPythonScript("./script/course_completion.py", [
      courseSlug,
      cAuth,
      csrf,
    ]);
    console.log(output);
    const isIntegerRegex = output.match(/[0-9]+/);
    if (isIntegerRegex) {
      console.log("Output is an integer");
      const user = await User.findOne({ name });
      console.log(user);
      if (user) {
        user.coursesSolved += 1;
        user.modulesSkipped = parseInt(output) + (user.modulesSkipped || 0);
        await user.save();
      } else {
        await User.create({
          name,
          apiKey: "not-available",
          coursesSolved: 1,
          modulesSkipped: parseInt(output),
        });
      }
    }

    // Process the output as needed
    res.send(output);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(
    `Swagger documentation available at http://localhost:${PORT}/api-docs`
  );
});
