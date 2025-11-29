const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const StudentProgress = require('../models/StudentProgress');

// Get dashboard statistics with aggregation
router.get('/dashboard/stats', async (req, res) => {
  try {
    let { userId } = req.query;

    // If userId is not provided, default to 1
    if (!userId) {
      userId = 1;
      console.log('No userId provided, using default:', userId);
    }

    console.log('Using userId:', userId);

    // First, let's check if we have any data for this user
    const userProgress = await StudentProgress.find({ userId: parseInt(userId) });
    console.log('User progress found:', userProgress.length, 'records');

    if (userProgress.length === 0) {
      console.log('No progress data found for user:', userId);
      return res.status(200).json({
        status: 'success',
        data: {
          totalCourses: 0,
          totalTimeSpent: 0,
          averageProgress: 0,
          completedCourses: 0,
          inProgressCourses: 0,
          recentCourses: []
        }
      });
    }

    // Aggregation for dashboard stats using Mongoose
    const statsPipeline = [
      {
        $match: { userId: parseInt(userId) }
      },
      {
        $group: {
          _id: null,
          totalCourses: { $sum: 1 },
          totalTimeSpent: { $sum: "$timeSpent" },
          averageProgress: { $avg: "$progress" },
          completedCourses: {
            $sum: {
              $cond: [{ $eq: ["$progress", 100] }, 1, 0]
            }
          },
          inProgressCourses: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$progress", 0] }, { $lt: ["$progress", 100] }] },
                1, 0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalCourses: 1,
          totalTimeSpent: { $round: ["$totalTimeSpent", 1] },
          averageProgress: { $round: ["$averageProgress", 1] },
          completedCourses: 1,
          inProgressCourses: 1
        }
      }
    ];

    const stats = await StudentProgress.aggregate(statsPipeline);
    console.log('Stats aggregation result:', stats);

    // Get recent courses with progress
    const recentCourses = await StudentProgress.aggregate([
      {
        $match: { userId: parseInt(userId) }
      },
      {
        $lookup: {
          from: "courses", // Make sure this matches your actual collection name
          localField: "courseId",
          foreignField: "courseId", 
          as: "courseDetails"
        }
      },
      {
        $unwind: {
          path: "$courseDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $sort: { lastAccessed: -1 }
      },
      {
        $limit: 4
      },
      {
        $project: {
          courseId: 1,
          completedLessons: 1,
          totalLessons: 1,
          timeSpent: 1,
          progress: 1,
          lastAccessed: 1,
          title: "$courseDetails.title",
          description: "$courseDetails.description",
          thumbnail: "$courseDetails.thumbnail"
        }
      }
    ]);

    console.log('Recent courses found:', recentCourses.length);

    return res.status(200).json({
      status: 'success',
      data: {
        ...stats[0] || {
          totalCourses: 0,
          totalTimeSpent: 0,
          averageProgress: 0,
          completedCourses: 0,
          inProgressCourses: 0
        },
        recentCourses
      }
    });

  } catch (error) {
    console.error("Dashboard stats error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Get course details with default userId
router.post('/courses/details', async (req, res) => {
  try {
    const { courseIds, userId } = req.body;

    // If userId is not provided, default to 1
    const finalUserId = userId || 1;
    console.log('Using userId:', finalUserId);

    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'courseIds must be a non-empty array'
      });
    }

    const courses = await Course.find({
      courseId: { $in: courseIds }
    });

    console.log('Courses found:', courses.length);

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

// Get time series data with default userId
router.get('/analytics/progress-trend', async (req, res) => {
  try {
    let { userId, days = 30 } = req.query;

    // If userId is not provided, default to 1
    if (!userId) {
      userId = 1;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const pipeline = [
      {
        $match: {
          userId: parseInt(userId),
          lastAccessed: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$lastAccessed" } },
            courseId: "$courseId"
          },
          timeSpent: { $sum: "$timeSpent" },
          lessonsCompleted: { $sum: "$completedLessons" }
        }
      },
      {
        $lookup: {
          from: "courses",
          localField: "_id.courseId",
          foreignField: "courseId",
          as: "course"
        }
      },
      {
        $unwind: "$course"
      },
      {
        $group: {
          _id: "$_id.date",
          dailyTimeSpent: { $sum: "$timeSpent" },
          dailyLessonsCompleted: { $sum: "$lessonsCompleted" },
          courses: {
            $push: {
              courseId: "$_id.courseId",
              title: "$course.title",
              timeSpent: "$timeSpent",
              lessonsCompleted: "$lessonsCompleted"
            }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];

    const timeSeriesData = await StudentProgress.aggregate(pipeline);

    return res.status(200).json({
      status: 'success',
      data: timeSeriesData
    });

  } catch (error) {
    console.error("Progress trend error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Simple dashboard stats without aggregation (fallback)
router.get('/dashboard/stats/simple', async (req, res) => {
  try {
    let { userId } = req.query;

    // If userId is not provided, default to 1
    if (!userId) {
      userId = 1;
    }

    console.log('Simple stats - Using userId:', userId);

    // Get all progress for user
    const userProgress = await StudentProgress.find({ userId: parseInt(userId) });
    
    console.log('Simple stats - Progress records found:', userProgress.length);

    if (userProgress.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          totalCourses: 0,
          totalTimeSpent: 0,
          averageProgress: 0,
          completedCourses: 0,
          inProgressCourses: 0,
          recentCourses: []
        }
      });
    }

    // Calculate stats manually
    const totalCourses = userProgress.length;
    const totalTimeSpent = userProgress.reduce((sum, item) => sum + item.timeSpent, 0);
    const averageProgress = userProgress.reduce((sum, item) => sum + item.progress, 0) / totalCourses;
    const completedCourses = userProgress.filter(item => item.progress === 100).length;
    const inProgressCourses = userProgress.filter(item => item.progress > 0 && item.progress < 100).length;

    // Get recent courses with course details
    const recentProgress = await StudentProgress.find({ userId: parseInt(userId) })
      .sort({ lastAccessed: -1 })
      .limit(4);

    const recentCourses = await Promise.all(
      recentProgress.map(async (progress) => {
        const course = await Course.findOne({ courseId: progress.courseId });
        return {
          courseId: progress.courseId,
          completedLessons: progress.completedLessons,
          totalLessons: progress.totalLessons,
          timeSpent: progress.timeSpent,
          progress: progress.progress,
          lastAccessed: progress.lastAccessed,
          title: course ? course.title : 'Unknown Course',
          description: course ? course.description : '',
          thumbnail: course ? course.thumbnail : ''
        };
      })
    );

    return res.status(200).json({
      status: 'success',
      data: {
        totalCourses,
        totalTimeSpent: Math.round(totalTimeSpent * 10) / 10,
        averageProgress: Math.round(averageProgress * 10) / 10,
        completedCourses,
        inProgressCourses,
        recentCourses
      }
    });

  } catch (error) {
    console.error("Simple dashboard stats error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router;