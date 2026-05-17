const express = require('express');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/authMiddleware');
const { generateCourseContentForMajor } = require('../services/openaiService');

const router = express.Router();

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function parseJsonSafely(value, fallback = []) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function normalizeMajorName(value) {
  return String(value || '').trim();
}

const COURSE_CONTENT_TIMEOUT_MS = Number(process.env.COURSE_CONTENT_TIMEOUT_MS || 30000);

function buildCourseContentFallback(major) {
  const safeMajor = normalizeMajorName(major) || 'Computer Science';
  return {
    title: `${safeMajor} Learning Path`,
    overview: `A practical beginner-friendly path to explore ${safeMajor}, build foundational skills, and prepare for courses or projects.`,
    starterCourses: [
      { title: `${safeMajor} Fundamentals`, description: `Start with the core ideas and vocabulary used in ${safeMajor}.`, keywords: `${safeMajor} fundamentals course` },
      { title: 'Study Skills and Time Management', description: 'Build habits that help you handle university workload and projects.', keywords: 'study skills time management course' },
      { title: 'Introductory Project Practice', description: `Apply what you learn through small beginner projects related to ${safeMajor}.`, keywords: `${safeMajor} beginner projects` },
      { title: 'Career Exploration', description: `Explore jobs, specializations, and portfolios connected to ${safeMajor}.`, keywords: `${safeMajor} careers overview` }
    ],
    roadmap: [
      'Review the main subjects and required skills.',
      'Take one beginner course and summarize the key concepts.',
      'Build a small project or portfolio example.',
      'Explore internships, job roles, and advanced electives.'
    ],
    youtubeSearchQueries: [
      `${safeMajor} beginner roadmap`,
      `${safeMajor} fundamentals course`,
      `${safeMajor} career paths`
    ],
    freeResources: [
      { name: 'Coursera search', url: 'https://www.coursera.org/search' },
      { name: 'edX search', url: 'https://www.edx.org/search' },
      { name: 'Khan Academy', url: 'https://www.khanacademy.org/' }
    ],
    projectIdeas: [
      `Create a beginner portfolio project related to ${safeMajor}.`,
      `Summarize three career paths in ${safeMajor}.`,
      `Build a weekly study tracker for ${safeMajor}.`
    ]
  };
}

async function generateCourseContentFast(major, topMajors) {
  const fallback = buildCourseContentFallback(major);

  if (!process.env.OPENAI_API_KEY) return fallback;

  const aiPromise = generateCourseContentForMajor(major, topMajors)
    .catch((error) => {
      console.warn('[courses] AI course content failed; using fallback:', error.message);
      return fallback;
    });

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      console.warn(`[courses] AI course content exceeded ${COURSE_CONTENT_TIMEOUT_MS}ms; returning fallback so courses page does not hang.`);
      resolve(fallback);
    }, COURSE_CONTENT_TIMEOUT_MS);
  });

  return Promise.race([aiPromise, timeoutPromise]);
}


async function getLatestTopMajorsForUser(userId) {
  const latestResult = await get(
    `
      SELECT recommended_major, top_majors, created_at
      FROM results
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [userId]
  );

  if (!latestResult) return null;

  const parsedTopMajors = parseJsonSafely(latestResult.top_majors, []);
  const topThreeMajors = parsedTopMajors.slice(0, 3);

  return {
    latestRecommendedMajor: latestResult.recommended_major,
    topThreeMajors,
    createdAt: latestResult.created_at
  };
}

async function getCachedCourseContent(major) {
  const row = await get(
    `SELECT content, updated_at FROM courses_cache WHERE major = ?`,
    [major]
  );

  if (!row) return null;

  return {
    content: parseJsonSafely(row.content, null),
    updatedAt: row.updated_at
  };
}

async function upsertCourseCache(major, content) {
  const existing = await get(`SELECT id FROM courses_cache WHERE major = ?`, [major]);

  if (existing) {
    await run(
      `
        UPDATE courses_cache
        SET content = ?, updated_at = CURRENT_TIMESTAMP
        WHERE major = ?
      `,
      [JSON.stringify(content), major]
    );
  } else {
    await run(
      `
        INSERT INTO courses_cache (major, content)
        VALUES (?, ?)
      `,
      [major, JSON.stringify(content)]
    );
  }
}

router.use(authenticateToken);

router.get('/majors', async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await getLatestTopMajorsForUser(userId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'No recommendation result found for this user'
      });
    }

    return res.json({
      success: true,
      message: 'Top 3 majors fetched successfully',
      data: {
        latestRecommendedMajor: summary.latestRecommendedMajor,
        topThreeMajors: summary.topThreeMajors,
        createdAt: summary.createdAt
      }
    });
  } catch (error) {
    console.error('Failed to fetch course majors:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch course majors'
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const selectedMajor = normalizeMajorName(req.query.major);

    if (!selectedMajor) {
      return res.status(400).json({
        success: false,
        message: 'major query parameter is required'
      });
    }

    const summary = await getLatestTopMajorsForUser(userId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'No recommendation result found for this user'
      });
    }

    const allowedMajors = summary.topThreeMajors.map((item) => item.major);

    if (!allowedMajors.includes(selectedMajor)) {
      return res.status(400).json({
        success: false,
        message: 'Selected major is not part of the user top 3 majors'
      });
    }

    const cached = await getCachedCourseContent(selectedMajor);

    if (cached?.content) {
      return res.json({
        success: true,
        message: 'Course content fetched successfully from cache',
        data: {
          latestRecommendedMajor: summary.latestRecommendedMajor,
          topThreeMajors: summary.topThreeMajors,
          selectedMajor,
          courseContent: cached.content,
          cached: true,
          cachedAt: cached.updatedAt
        }
      });
    }

    const courseContent = await generateCourseContentFast(
      selectedMajor,
      summary.topThreeMajors
    );

    await upsertCourseCache(selectedMajor, courseContent);

    return res.json({
      success: true,
      message: 'Course content generated successfully',
      data: {
        latestRecommendedMajor: summary.latestRecommendedMajor,
        topThreeMajors: summary.topThreeMajors,
        selectedMajor,
        courseContent,
        cached: false
      }
    });
  } catch (error) {
    console.error('Failed to fetch course content:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch course content'
    });
  }
});

router.get('/selected/:major', async (req, res) => {
  try {
    const userId = req.user.id;
    const selectedMajor = normalizeMajorName(req.params.major);

    if (!selectedMajor) {
      return res.status(400).json({
        success: false,
        message: 'Selected major is required'
      });
    }

    const summary = await getLatestTopMajorsForUser(userId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'No recommendation result found for this user'
      });
    }

    const allowedMajors = summary.topThreeMajors.map((item) => item.major);

    if (!allowedMajors.includes(selectedMajor)) {
      return res.status(400).json({
        success: false,
        message: 'Selected major is not part of the user top 3 majors'
      });
    }

    const cached = await getCachedCourseContent(selectedMajor);

    if (cached?.content) {
      return res.json({
        success: true,
        message: 'Course content fetched successfully from cache',
        data: {
          latestRecommendedMajor: summary.latestRecommendedMajor,
          topThreeMajors: summary.topThreeMajors,
          selectedMajor,
          courseContent: cached.content,
          cached: true,
          cachedAt: cached.updatedAt
        }
      });
    }

    const courseContent = await generateCourseContentFast(
      selectedMajor,
      summary.topThreeMajors
    );

    await upsertCourseCache(selectedMajor, courseContent);

    return res.json({
      success: true,
      message: 'Course content generated successfully',
      data: {
        latestRecommendedMajor: summary.latestRecommendedMajor,
        topThreeMajors: summary.topThreeMajors,
        selectedMajor,
        courseContent,
        cached: false
      }
    });
  } catch (error) {
    console.error('Failed to fetch selected major course content:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch selected major course content'
    });
  }
});

module.exports = router;