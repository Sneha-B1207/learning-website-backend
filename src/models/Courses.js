const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  courseId: { type: Number, required: true, unique: true },
  title: String,
  description: String,
  thumbnail: String,
  total_lessons: Number,
  completed_lessons: Number,
  time_spent: Number,
  progress: Number
});

module.exports = mongoose.model('Course', CourseSchema);