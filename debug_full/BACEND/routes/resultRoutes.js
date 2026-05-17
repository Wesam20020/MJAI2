const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { generateRecommendationDetails } = require('../services/openaiService');
const { authenticateToken } = require('../middleware/authMiddleware');

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

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function normalizeAnswerRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.question_id)) {
      grouped.set(row.question_id, {
        questionId: row.question_id,
        questionText: row.question_text,
        category: row.category,
        selectedOptions: []
      });
    }

    grouped.get(row.question_id).selectedOptions.push({
      optionId: row.option_id,
      optionText: row.option_text,
      score: row.score,
      targetMajor: row.target_major
    });
  }

  return Array.from(grouped.values());
}

function parseJsonSafely(value, fallback = []) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch (error) {
    return fallback;
  }
}


const RECOMMENDATION_TIMEOUT_MS = Number(process.env.RECOMMENDATION_TIMEOUT_MS || 30000);

function buildFastRecommendationFallback(recommendedMajor, topMajors = []) {
  const safeMajor = recommendedMajor || topMajors?.[0]?.major || 'Computer Science';

  return {
    recommendedMajor: safeMajor,
    explanation: `Based on your answers, ${safeMajor} appears to be the strongest fit for your interests, skills, work style, and long-term goals.`,
    majorDescription: `${safeMajor} is a suitable academic path based on the score pattern from your assessment. It matches several of the strengths and preferences shown in your selected answers.`,
    studyPlan: [
      'Year 1: Build strong foundations and improve your study habits.',
      'Year 2: Focus on core subjects and practice with small projects.',
      'Year 3: Choose electives, build a portfolio, and explore internships.',
      'Year 4: Complete a final project and prepare for job or graduate study opportunities.'
    ],
    subjectDescriptions: [
      `Core principles and introductory topics in ${safeMajor}.`,
      'Applied projects that connect theory with real-world practice.',
      'Professional skills such as communication, teamwork, and problem solving.'
    ],
    careerPaths: [
      `${safeMajor} Specialist`,
      'Project Assistant',
      'Junior Analyst'
    ]
  };
}

async function getRecommendationDetailsFast(recommendedMajor, topMajors, answerDetails) {
  const fallback = buildFastRecommendationFallback(recommendedMajor, topMajors);

  if (!process.env.OPENAI_API_KEY || process.env.USE_AI_RECOMMENDATION === 'false') {
    return fallback;
  }

  const aiPromise = generateRecommendationDetails(recommendedMajor, topMajors, answerDetails)
    .then((recommendation) => recommendation || fallback)
    .catch((error) => {
      console.warn('[results] AI recommendation failed; using fast fallback:', error.message);
      return fallback;
    });

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      console.warn(
        `[results] AI recommendation exceeded ${RECOMMENDATION_TIMEOUT_MS}ms; returning fast fallback so submit-answers does not hang.`
      );
      resolve(fallback);
    }, RECOMMENDATION_TIMEOUT_MS);
  });

  return Promise.race([aiPromise, timeoutPromise]);
}

function normalizeText(value = '') {
  return String(value).toLowerCase().trim();
}

function incrementSignal(signals, key, amount = 1) {
  signals[key] = (signals[key] || 0) + amount;
}

function extractUserSignalsFromAnswers(answerDetails = [], topMajors = []) {
  const signals = {
    analytical: 0,
    people_oriented: 0,
    creativity: 0,
    technical: 0,
    leadership: 0,
    business: 0,
    research: 0,
    health: 0,
    communication: 0,
    structure: 0,
    ambiguity_tolerance: 0,
    hands_on: 0
  };

  const majorSignals = {};

  for (const item of answerDetails) {
    const questionText = normalizeText(item.questionText);
    const category = normalizeText(item.category);

    for (const option of item.selectedOptions || []) {
      const optionText = normalizeText(option.optionText);
      const major = option.targetMajor;
      const scoreWeight = Math.max(Number(option.score || 0), 1);

      majorSignals[major] = (majorSignals[major] || 0) + scoreWeight;

      const combined = `${questionText} ${optionText} ${normalizeText(major)}`;

      if (
        combined.includes('data') ||
        combined.includes('logic') ||
        combined.includes('pattern') ||
        combined.includes('analysis') ||
        combined.includes('analytical') ||
        combined.includes('complex problem')
      ) {
        incrementSignal(signals, 'analytical', scoreWeight);
      }

      if (
        combined.includes('people') ||
        combined.includes('community') ||
        combined.includes('empathy') ||
        combined.includes('support') ||
        combined.includes('helping') ||
        combined.includes('human impact') ||
        combined.includes('well being')
      ) {
        incrementSignal(signals, 'people_oriented', scoreWeight);
      }

      if (
        combined.includes('design') ||
        combined.includes('creative') ||
        combined.includes('visual') ||
        combined.includes('art') ||
        combined.includes('music') ||
        combined.includes('interface') ||
        combined.includes('user experience')
      ) {
        incrementSignal(signals, 'creativity', scoreWeight);
      }

      if (
        combined.includes('software') ||
        combined.includes('system') ||
        combined.includes('technical') ||
        combined.includes('programming') ||
        combined.includes('developer') ||
        combined.includes('engineering')
      ) {
        incrementSignal(signals, 'technical', scoreWeight);
      }

      if (
        combined.includes('lead') ||
        combined.includes('leadership') ||
        combined.includes('manage') ||
        combined.includes('team') ||
        combined.includes('strategic decisions') ||
        combined.includes('organization')
      ) {
        incrementSignal(signals, 'leadership', scoreWeight);
      }

      if (
        combined.includes('business') ||
        combined.includes('market') ||
        combined.includes('startup') ||
        combined.includes('finance') ||
        combined.includes('financial') ||
        combined.includes('growth')
      ) {
        incrementSignal(signals, 'business', scoreWeight);
      }

      if (
        combined.includes('research') ||
        combined.includes('scientific') ||
        combined.includes('discovery') ||
        combined.includes('evidence') ||
        combined.includes('study') ||
        combined.includes('knowledge')
      ) {
        incrementSignal(signals, 'research', scoreWeight);
      }

      if (
        combined.includes('health') ||
        combined.includes('medical') ||
        combined.includes('medicine') ||
        combined.includes('human body') ||
        combined.includes('patient') ||
        combined.includes('hospital') ||
        combined.includes('biology')
      ) {
        incrementSignal(signals, 'health', scoreWeight);
      }

      if (
        combined.includes('communicat') ||
        combined.includes('audience') ||
        combined.includes('present') ||
        combined.includes('explain') ||
        combined.includes('persuasive')
      ) {
        incrementSignal(signals, 'communication', scoreWeight);
      }

      if (
        combined.includes('structured') ||
        combined.includes('plan') ||
        combined.includes('process') ||
        combined.includes('organized') ||
        combined.includes('clear path')
      ) {
        incrementSignal(signals, 'structure', scoreWeight);
      }

      if (
        combined.includes('ambiguity') ||
        combined.includes('open ended') ||
        combined.includes('without a clear') ||
        combined.includes('uncertain') ||
        combined.includes('adapt quickly')
      ) {
        incrementSignal(signals, 'ambiguity_tolerance', scoreWeight);
      }

      if (
        combined.includes('hands on') ||
        combined.includes('build') ||
        combined.includes('create') ||
        combined.includes('prototype') ||
        combined.includes('tangible') ||
        combined.includes('practical')
      ) {
        incrementSignal(signals, 'hands_on', scoreWeight);
      }

      if (category === 'skills' && combined.includes('explain')) {
        incrementSignal(signals, 'communication', 1);
      }

      if (category === 'work style' && combined.includes('independent')) {
        incrementSignal(signals, 'structure', 1);
      }
    }
  }

  const sortedSignals = Object.entries(signals)
    .map(([signal, value]) => ({ signal, value }))
    .sort((a, b) => b.value - a.value);

  const strongestSignals = sortedSignals.filter((item) => item.value > 0).slice(0, 6);
  const strongestMajors = topMajors.slice(0, 3).map((item) => item.major);

  return {
    strongestMajors,
    strongestSignals,
    signalScores: signals,
    majorScores: majorSignals
  };
}

async function validateSessionOwnership(sessionId, userId) {
  if (!sessionId) return null;

  const session = await get(
    `
      SELECT id, user_id, status
      FROM assessment_sessions
      WHERE id = ?
      LIMIT 1
    `,
    [Number(sessionId)]
  );

  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  if (Number(session.user_id) !== Number(userId)) {
    throw new Error('SESSION_USER_MISMATCH');
  }

  return session;
}

async function completeSession(sessionId, topMajors, answerSignals) {
  if (!sessionId) return;

  await run(
    `
      UPDATE assessment_sessions
      SET
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        strongest_major_signals = ?
      WHERE id = ?
    `,
    [
      JSON.stringify({
        topMajors: topMajors.slice(0, 3),
        answerSignals
      }),
      Number(sessionId)
    ]
  );
}

router.post('/submit-answers', authenticateToken, async (req, res) => {
  try {
    const { userId, sessionId, answers } = req.body;
    const numericUserId = Number(req.user.id);

    if (!numericUserId || Number.isNaN(numericUserId)) {
      return res.status(401).json({
        success: false,
        message: 'Please log in again before submitting answers'
      });
    }

    if (userId && Number(userId) !== numericUserId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: userId does not match the authenticated user'
      });
    }

    if (sessionId !== undefined && sessionId !== null && Number.isNaN(Number(sessionId))) {
      return res.status(400).json({
        success: false,
        message: 'sessionId must be a valid number'
      });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'answers must be a non-empty array'
      });
    }

    if (answers.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'Too many answers provided'
      });
    }

    try {
      if (sessionId) {
        await validateSessionOwnership(Number(sessionId), numericUserId);
      }
    } catch (sessionError) {
      if (sessionError.message === 'SESSION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      if (sessionError.message === 'SESSION_USER_MISMATCH') {
        return res.status(403).json({
          success: false,
          message: 'This session does not belong to the provided userId'
        });
      }

      throw sessionError;
    }

    const optionIds = answers.flatMap((answer) => {
      if (Array.isArray(answer.optionIds)) {
        return answer.optionIds
          .map((id) => Number(id))
          .filter((id) => !Number.isNaN(id));
      }

      if (
        answer.optionId !== undefined &&
        answer.optionId !== null &&
        !Number.isNaN(Number(answer.optionId))
      ) {
        return [Number(answer.optionId)];
      }

      return [];
    });

    if (!optionIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Each answer must include a valid optionId or optionIds array'
      });
    }

    let rows = [];

    if (sessionId) {
      const placeholders = optionIds.map(() => '?').join(',');

      const sessionSql = `
        SELECT
          sq.id AS question_id,
          sq.question_text_snapshot AS question_text,
          sq.category,
          sqo.id AS option_id,
          sqo.option_text,
          sqo.score,
          sqo.target_major
        FROM session_question_options sqo
        INNER JOIN session_questions sq ON sq.id = sqo.session_question_id
        WHERE sq.session_id = ?
          AND sqo.id IN (${placeholders})
        ORDER BY sq.question_order ASC, sqo.option_order ASC, sqo.id ASC
      `;

      rows = await all(sessionSql, [Number(sessionId), ...optionIds]);
    } else {
      const placeholders = optionIds.map(() => '?').join(',');

      const sql = `
        SELECT
          q.id AS question_id,
          q.question_text,
          q.category,
          qo.id AS option_id,
          qo.option_text,
          qo.score,
          qo.target_major
        FROM question_options qo
        INNER JOIN questions q ON q.id = qo.question_id
        WHERE qo.id IN (${placeholders})
        ORDER BY q.question_order ASC, qo.option_order ASC, qo.id ASC
      `;

      rows = await all(sql, optionIds);
    }

    if (!rows || rows.length !== optionIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some selected option IDs are invalid'
      });
    }

    const answerDetails = normalizeAnswerRows(rows);
    const scoreMap = {};

    rows.forEach((row) => {
      scoreMap[row.target_major] = (scoreMap[row.target_major] || 0) + Number(row.score || 0);
    });

    const allRankedMajors = Object.entries(scoreMap)
      .map(([major, score]) => ({ major, score }))
      .sort((a, b) => b.score - a.score);

    const topMajors = allRankedMajors.slice(0, 5);
    const topThreeMajors = allRankedMajors.slice(0, 3);

    const answerSignals = extractUserSignalsFromAnswers(answerDetails, topMajors);

    const recommendedMajor = topMajors[0]?.major || 'Computer Science';
    const recommendation = await getRecommendationDetailsFast(
      recommendedMajor,
      topMajors,
      answerDetails
    );

    const enrichedAnswers = {
      rawAnswers: answers,
      answerDetails,
      answerSignals
    };

    const insertResult = await run(
      `
        INSERT INTO results (
          user_id,
          answers,
          recommended_major,
          explanation,
          major_description,
          study_plan,
          subject_explanations,
          career_paths,
          top_majors
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        numericUserId,
        JSON.stringify(enrichedAnswers),
        recommendation.recommendedMajor,
        recommendation.explanation,
        recommendation.majorDescription,
        JSON.stringify(recommendation.studyPlan),
        JSON.stringify(recommendation.subjectDescriptions),
        JSON.stringify(recommendation.careerPaths),
        JSON.stringify(topMajors)
      ]
    );

    if (sessionId) {
      await completeSession(Number(sessionId), topMajors, answerSignals);
    }

    return res.json({
      success: true,
      message: 'Recommendations generated and saved successfully',
      data: {
        resultId: insertResult.lastID,
        sessionId: sessionId ? Number(sessionId) : null,
        recommendedMajor: recommendation.recommendedMajor,
        explanation: recommendation.explanation,
        majorDescription: recommendation.majorDescription,
        studyPlan: recommendation.studyPlan,
        subjectDescriptions: recommendation.subjectDescriptions,
        careerOpportunities: recommendation.careerPaths,
        topMajors,
        topThreeMajors,
        answerSignals,
        answers
      }
    });
  } catch (error) {
    console.error('Error in submit-answers:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.get('/latest', authenticateToken, (req, res) => {
  const { userId } = req.query;

  if (!userId || Number.isNaN(Number(userId))) {
    return res.status(400).json({
      success: false,
      message: 'userId must be a valid number'
    });
  }

  if (Number(userId) !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  const sql = `
    SELECT
      id,
      user_id,
      recommended_major,
      explanation,
      major_description,
      study_plan,
      subject_explanations,
      career_paths,
      top_majors,
      answers,
      created_at
    FROM results
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;

  db.get(sql, [Number(userId)], (err, row) => {
    if (err) {
      console.error('Failed to fetch latest result:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch latest result'
      });
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'No results found for this user'
      });
    }

    const parsedTopMajors = parseJsonSafely(row.top_majors, []);
    const parsedAnswers = parseJsonSafely(row.answers, {});

    return res.json({
      success: true,
      message: 'Latest result fetched successfully',
      data: {
        resultId: row.id,
        userId: row.user_id,
        recommendedMajor: row.recommended_major,
        explanation: row.explanation,
        majorDescription: row.major_description,
        studyPlan: parseJsonSafely(row.study_plan, []),
        subjectDescriptions: parseJsonSafely(row.subject_explanations, []),
        careerOpportunities: parseJsonSafely(row.career_paths, []),
        topMajors: parsedTopMajors,
        topThreeMajors: parsedTopMajors.slice(0, 3),
        answers: parsedAnswers.rawAnswers || [],
        answerDetails: parsedAnswers.answerDetails || [],
        answerSignals: parsedAnswers.answerSignals || {},
        createdAt: row.created_at
      }
    });
  });
});

router.get('/history', authenticateToken, (req, res) => {
  const { userId } = req.query;

  if (!userId || Number.isNaN(Number(userId))) {
    return res.status(400).json({
      success: false,
      message: 'userId must be a valid number'
    });
  }

  if (Number(userId) !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  const sql = `
    SELECT
      id,
      user_id,
      recommended_major,
      explanation,
      major_description,
      study_plan,
      subject_explanations,
      career_paths,
      top_majors,
      answers,
      created_at
    FROM results
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
  `;

  db.all(sql, [Number(userId)], (err, rows) => {
    if (err) {
      console.error('Failed to fetch user history:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user history'
      });
    }

    const history = rows.map((row, index) => {
      const parsedTopMajors = parseJsonSafely(row.top_majors, []);
      const parsedAnswers = parseJsonSafely(row.answers, {});

      return {
        resultId: row.id,
        userId: row.user_id,
        attemptNumber: rows.length - index,
        recommendedMajor: row.recommended_major,
        explanation: row.explanation,
        majorDescription: row.major_description,
        studyPlan: parseJsonSafely(row.study_plan, []),
        subjectDescriptions: parseJsonSafely(row.subject_explanations, []),
        careerOpportunities: parseJsonSafely(row.career_paths, []),
        topMajors: parsedTopMajors,
        topThreeMajors: parsedTopMajors.slice(0, 3),
        answers: parsedAnswers.rawAnswers || [],
        answerDetails: parsedAnswers.answerDetails || [],
        answerSignals: parsedAnswers.answerSignals || {},
        createdAt: row.created_at
      };
    });

    return res.json({
      success: true,
      message: 'User history fetched successfully',
      count: history.length,
      data: history
    });
  });
});

router.get('/:resultId', authenticateToken, (req, res) => {
  const { resultId } = req.params;

  if (!resultId || Number.isNaN(Number(resultId))) {
    return res.status(400).json({
      success: false,
      message: 'resultId must be a valid number'
    });
  }

  const sql = `
    SELECT
      id,
      user_id,
      recommended_major,
      explanation,
      major_description,
      study_plan,
      subject_explanations,
      career_paths,
      top_majors,
      answers,
      created_at
    FROM results
    WHERE id = ?
    LIMIT 1
  `;

  db.get(sql, [Number(resultId)], (err, row) => {
    if (err) {
      console.error('Failed to fetch result details:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch result details'
      });
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'Result not found'
      });
    }

    if (Number(row.user_id) !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const parsedTopMajors = parseJsonSafely(row.top_majors, []);
    const parsedAnswers = parseJsonSafely(row.answers, {});

    return res.json({
      success: true,
      message: 'Result details fetched successfully',
      data: {
        resultId: row.id,
        userId: row.user_id,
        recommendedMajor: row.recommended_major,
        explanation: row.explanation,
        majorDescription: row.major_description,
        studyPlan: parseJsonSafely(row.study_plan, []),
        subjectDescriptions: parseJsonSafely(row.subject_explanations, []),
        careerOpportunities: parseJsonSafely(row.career_paths, []),
        topMajors: parsedTopMajors,
        topThreeMajors: parsedTopMajors.slice(0, 3),
        answers: parsedAnswers.rawAnswers || [],
        answerDetails: parsedAnswers.answerDetails || [],
        answerSignals: parsedAnswers.answerSignals || {},
        createdAt: row.created_at
      }
    });
  });
});

module.exports = router;