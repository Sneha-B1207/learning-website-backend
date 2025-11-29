const express = require('express');
const router = express.Router();
const Course = require('../models/Courses');
const StudentProgress = require('../models/StudentProgress');

// Static data for when no database data is found
const staticData = {
  stats: {
    totalCourses: 2,
    totalTimeSpent: 13.7,
    averageProgress: 37.5,
    completedCourses: 0,
    inProgressCourses: 2
  },
  recentCourses: [
    {
      courseId: 1,
      completedLessons: 2,
      totalLessons: 4,
      timeSpent: 8.5,
      progress: 50,
      lastAccessed: new Date("2024-01-15T10:30:00Z"),
      title: "JavaScript Fundamentals",
      description: "Learn basics of JS",
      thumbnail: "js.png"
    },
    {
      courseId: 2,
      completedLessons: 1,
      totalLessons: 4,
      timeSpent: 5.2,
      progress: 25,
      lastAccessed: new Date("2024-01-14T14:20:00Z"),
      title: "React.js for Beginners",
      description: "Learn React from scratch",
      thumbnail: "react.png"
    }
  ],
  courses: [
    {
      _id: "692a8e5aa1c00f30a58de671",
      title: "JavaScript Fundamentals",
      courseId: 1,
      description: "Learn basics of JS",
      thumbnail: "js.png",
      total_lessons: 4
    },
    {
      _id: "692a8e5aa1c00f30a58de672",
      courseId: 2,
      title: "React.js for Beginners",
      description: "Learn React from scratch",
      thumbnail: "react.png",
      total_lessons: 4
    }
  ]
};

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
      console.log('No progress data found for user:', userId, '- Returning static data');
      return res.status(200).json({
        status: 'success',
        data: {
          ...staticData.stats,
          recentCourses: staticData.recentCourses
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

    // If no recent courses found in DB, use static data
    const finalRecentCourses = recentCourses.length > 0 ? recentCourses : staticData.recentCourses;

    return res.status(200).json({
      status: 'success',
      data: {
        ...stats[0] || staticData.stats,
        recentCourses: finalRecentCourses
      }
    });

  } catch (error) {
    console.error("Dashboard stats error:", error, "- Returning static data");
    // Return static data even on error
    return res.status(200).json({
      status: 'success',
      data: {
        ...staticData.stats,
        recentCourses: staticData.recentCourses
      }
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

    // If no courses found in DB, use static data filtered by courseIds
    const finalCourses = courses.length > 0 ? courses : 
      staticData.courses.filter(course => courseIds.includes(course.courseId));

    return res.status(200).json({
      status: 'success',
      total: finalCourses.length,
      courses: finalCourses
    });

  } catch (error) {
    console.error("Course fetch error:", error, "- Returning static data");
    // Return static data even on error
    const { courseIds = [1, 2] } = req.body;
    const filteredCourses = staticData.courses.filter(course => courseIds.includes(course.courseId));
    
    return res.status(200).json({
      status: 'success',
      total: filteredCourses.length,
      courses: filteredCourses
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

    // If no time series data, return static demo data
    if (timeSeriesData.length === 0) {
      const staticTimeSeries = generateStaticTimeSeriesData(days);
      return res.status(200).json({
        status: 'success',
        data: staticTimeSeries
      });
    }

    return res.status(200).json({
      status: 'success',
      data: timeSeriesData
    });

  } catch (error) {
    console.error("Progress trend error:", error, "- Returning static data");
    // Return static time series data on error
    const { days = 30 } = req.query;
    const staticTimeSeries = generateStaticTimeSeriesData(days);
    
    return res.status(200).json({
      status: 'success',
      data: staticTimeSeries
    });
  }
});

// Helper function to generate static time series data
function generateStaticTimeSeriesData(days = 30) {
  const data = [];
  const baseDate = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);
    
    const dateString = date.toISOString().split('T')[0];
    
    data.push({
      _id: dateString,
      dailyTimeSpent: Math.random() * 4 + 1, // 1-5 hours
      dailyLessonsCompleted: Math.floor(Math.random() * 3) + 1, // 1-3 lessons
      courses: [
        {
          courseId: 1,
          title: "JavaScript Fundamentals",
          timeSpent: Math.random() * 2 + 0.5,
          lessonsCompleted: Math.floor(Math.random() * 2) + 1
        },
        {
          courseId: 2,
          title: "React.js for Beginners", 
          timeSpent: Math.random() * 2 + 0.5,
          lessonsCompleted: Math.floor(Math.random() * 2) + 1
        }
      ]
    });
  }
  
  return data;
}

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
      console.log('No data found, returning static data');
      return res.status(200).json({
        status: 'success',
        data: {
          ...staticData.stats,
          recentCourses: staticData.recentCourses
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
        recentCourses: recentCourses.length > 0 ? recentCourses : staticData.recentCourses
      }
    });

  } catch (error) {
    console.error("Simple dashboard stats error:", error, "- Returning static data");
    return res.status(200).json({
      status: 'success',
      data: {
        ...staticData.stats,
        recentCourses: staticData.recentCourses
      }
    });
  }
});

module.exports = router;