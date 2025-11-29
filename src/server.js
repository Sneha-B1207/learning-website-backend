const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const loginRoute = require('./routes/login');
const cors = require('cors');
const courseRoute = require('./routes/courses');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.use(cors({ 
  origin: 'https://learningwebsiteui.vercel.app/login',  // or your frontend URL
  credentials: true
}));

// Middleware
app.use(express.json());

// Connect to MongoDB
connectDB();

// Basic route
app.get('/', (req, res) => {
  res.send('Hello, The Backend is Up and Running');
});

// Routes
app.use('/api', loginRoute);
app.use('/course', courseRoute);

// Start server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
