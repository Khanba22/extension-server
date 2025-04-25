const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require('cors');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Stats Server API',
      version: '1.0.0',
      description: 'API for tracking Coursera and Google Forms solutions'
    },
    servers: [
      {
        url: 'http://localhost:3000'
      }
    ]
  },
  apis: ['./index.js']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  apiKey: { type: String, required: true },
  coursesSolved: { type: Number, default: 0 },
  formsSolved: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

/**
 * @swagger
 * /api/user:
 *   post:
 *     summary: Create a new user or update stats
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               apiKey:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [coursera, gforms]
 *     responses:
 *       200:
 *         description: User created or stats updated successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication failed
 */
app.post('/api/user', async (req, res) => {
  try {
    const { name, apiKey, type } = req.body;

    if (!name || !apiKey) {
      return res.status(400).json({ error: 'Name and API key are required' });
    }

    let user = await User.findOne({ name });

    if (!user) {
      // Create new user
      const hashedApiKey = await bcrypt.hash(apiKey, 10);
      user = new User({
        name,
        apiKey: hashedApiKey
      });
      await user.save();
      return res.json({ message: 'User created successfully' });
    }

    // Update stats if type is provided
    if (type) {
      if (type === 'coursera') {
        user.coursesSolved += 1;
      } else if (type === 'gforms') {
        user.formsSolved += 1;
      } else {
        return res.status(400).json({ error: 'Invalid type' });
      }
      await user.save();
    }

    res.json({
      name: user.name,
      coursesSolved: user.coursesSolved,
      formsSolved: user.formsSolved
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCoursesSolved = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$coursesSolved' } } }
    ]);
    const totalFormsSolved = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$formsSolved' } } }
    ]);

    const stats = {
      totalUsers,
      coursesSolved: totalCoursesSolved[0]?.total || 0,
      formsSolved: totalFormsSolved[0]?.total || 0,
      totalUsage: (totalCoursesSolved[0]?.total || 0) + (totalFormsSolved[0]?.total || 0)
    };

    res.render('stats', { stats });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Server error');
  }
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
});