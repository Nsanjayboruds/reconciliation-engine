require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const reconcileRoutes = require('./src/routes/reconcile');

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/reconciliation';

app.use(express.json());

// Routes
app.use('/', reconcileRoutes);

// Database connection
mongoose.connect(mongoUri)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch(err => console.error('MongoDB connection error:', err));
