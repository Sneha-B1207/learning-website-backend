const express = require('express');
const router = express.Router();
const Course = require('../models/Course'); // Adjust path to your Course model
const StudentProgress = require('../models/StudentProgress'); // You'll need this model

// Get course details for multiple courses
router.post('/courses/details', async (req, res) => {
  try {
    const { courseIds } = req.body;

    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'courseIds must be a non-empty array'
      });
    }

    const courses = await Course.find({
      courseId: { $in: courseIds }
    });

    return res.status(200).json({
      status: 'success',
      total: courses.length,
      courses
    });

  } catch (error) {
    console.error("Course fetch error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Get total courses count and basic stats
router.get('/courses/total', async (req, res) => {
  try {
    const totalCourses = await Course.countDocuments();
    
    // Get courses with progress data if user is logged in
    const { userId } = req.query; // or from auth middleware
    
    let userProgress = [];
    if (userId) {
      userProgress = await StudentProgress.find({ userId })
        .populate('courseId')
        .select('courseId completedLessons totalLessons timeSpent progress');
    }

    return res.status(200).json({
      status: 'success',
      data: {
        totalCourses,
        userProgress,
        // Additional stats you might want
        featuredCourses: await Course.find().limit(4), // Top 4 courses
        recentActivity: await getRecentActivity(userId) // Custom function
      }
    });

  } catch (error) {
    console.error("Total courses fetch error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Get student progress and analytics
router.get('/student/progress', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        status: 'fail',
        message: 'User ID is required'
      });
    }

    const progress = await StudentProgress.find({ userId })
      .populate('courseId')
      .select('courseId completedLessons totalLessons timeSpent progress lastAccessed');

    const totalTimeSpent = progress.reduce((sum, item) => sum + item.timeSpent, 0);
    const averageProgress = progress.length > 0 
      ? progress.reduce((sum, item) => sum + item.progress, 0) / progress.length 
      : 0;

    return res.status(200).json({
      status: 'success',
      data: {
        totalCourses: progress.length,
        totalTimeSpent,
        averageProgress: Math.round(averageProgress),
        courseProgress: progress,
        completedCourses: progress.filter(course => course.progress === 100).length,
        inProgressCourses: progress.filter(course => course.progress > 0 && course.progress < 100).length
      }
    });

  } catch (error) {
    console.error("Student progress fetch error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Get time series data for learning progress
router.get('/analytics/time-series', async (req, res) => {
  try {
    const { userId, days = 30 } = req.query;

    const timeSeriesData = await StudentProgress.aggregate([
      {
        $match: {
          userId: userId, // Convert to ObjectId if needed
          date: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { 
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            courseId: "$courseId"
          },
          totalTime: { $sum: "$timeSpent" },
          lessonsCompleted: { $sum: "$completedLessons" }
        }
      },
      {
        $sort: { "_id.date": 1 }
      }
    ]);

    return res.status(200).json({
      status: 'success',
      data: timeSeriesData
    });

  } catch (error) {
    console.error("Time series data fetch error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Get course recommendations
router.get('/recommendations', async (req, res) => {
  try {
    const { userId } = req.query;

    // Simple recommendation logic - you can enhance this
    const enrolledCourses = await StudentProgress.find({ userId }).select('courseId');
    const enrolledCourseIds = enrolledCourses.map(course => course.courseId);

    const recommendations = await Course.find({
      _id: { $nin: enrolledCourseIds }
    }).limit(3);

    return res.status(200).json({
      status: 'success',
      data: recommendations
    });

  } catch (error) {
    console.error("Recommendations fetch error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Helper function for recent activity
async function getRecentActivity(userId) {
  if (!userId) return [];
  
  return await StudentProgress.find({ userId })
    .populate('courseId', 'title')
    .sort({ lastAccessed: -1 })
    .limit(5)
    .select('courseId completedLessons lastAccessed');
}

module.exports = router;