const mongoose = require('mongoose');

const studentProgressSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true
  },
  courseId: {
    type: Number,
    required: true
  },
  completedLessons: {
    type: Number,
    default: 0
  },
  totalLessons: {
    type: Number,
    required: true
  },
  timeSpent: {
    type: Number, // in hours
    default: 0
  },
  progress: {
    type: Number, // percentage
    default: 0,
    min: 0,
    max: 100
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  enrolledAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for unique user-course combination
studentProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('StudentProgress', studentProgressSchema);