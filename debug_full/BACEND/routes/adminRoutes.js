const express = require('express');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminOnly');

const router = express.Router();

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
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

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function toRole(isAdmin) {
  return Number(isAdmin) === 1 ? 'admin' : 'user';
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildLast7DaysSeries(rowsMap = {}) {
  const series = [];
  const now = new Date();

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = date.toISOString().slice(0, 10);

    series.push({
      label: key,
      value: Number(rowsMap[key] || 0)
    });
  }

  return series;
}

router.use(authenticateToken, adminOnly);

router.get('/dashboard', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.max(Number(req.query.pageSize || 8), 1);
    const search = String(req.query.search || '').trim();
    const offset = (page - 1) * pageSize;
    const searchLike = `%${search}%`;

    const [
      totalUsersRow,
      totalAttemptsRow,
      mostRecommendedMajors,
      latestRegistrationRow,
      recentRegistrations,
      recentAssessments,
      recentResults,
      allTimelineRows,
      filteredUsersCountRow,
      usersRows,
      attemptsLast7DaysRows,
      registrationsLast7DaysRows,
      recommendationTrendRows
    ] = await Promise.all([
      get(`SELECT COUNT(*) AS totalUsers FROM users`),
      get(`SELECT COUNT(*) AS totalAttempts FROM results`),
      all(`
        SELECT recommended_major AS major, COUNT(*) AS count
        FROM results
        GROUP BY recommended_major
        ORDER BY count DESC
        LIMIT 5
      `),
      get(`
        SELECT created_at
        FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `),
      all(`
        SELECT id, name, email, created_at
        FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT 5
      `),
      all(`
        SELECT r.id, r.user_id, u.name, u.email, r.recommended_major, r.created_at
        FROM results r
        INNER JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 5
      `),
      all(`
        SELECT r.id, r.user_id, u.name, u.email, r.recommended_major, r.created_at
        FROM results r
        INNER JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 5
      `),
      all(`
        SELECT 'registration' AS type, u.id, u.name, u.email, NULL AS recommended_major, u.created_at AS timestamp
        FROM users u
        UNION ALL
        SELECT 'assessment' AS type, r.id, u.name, u.email, r.recommended_major, r.created_at AS timestamp
        FROM results r
        INNER JOIN users u ON u.id = r.user_id
        ORDER BY timestamp DESC
        LIMIT 12
      `),
      get(
        `
          SELECT COUNT(*) AS totalFilteredUsers
          FROM (
            SELECT
              u.id,
              u.name,
              u.email,
              MAX(r.created_at) AS latest_attempt_at,
              (
                SELECT r2.recommended_major
                FROM results r2
                WHERE r2.user_id = u.id
                ORDER BY r2.created_at DESC, r2.id DESC
                LIMIT 1
              ) AS latest_recommended_major
            FROM users u
            LEFT JOIN results r ON r.user_id = u.id
            GROUP BY u.id
          ) q
          WHERE
            ? = ''
            OR q.name LIKE ?
            OR q.email LIKE ?
            OR COALESCE(q.latest_recommended_major, '') LIKE ?
        `,
        [search, searchLike, searchLike, searchLike]
      ),
      all(
        `
          SELECT *
          FROM (
            SELECT
              u.id,
              u.name,
              u.email,
              u.is_admin,
              u.created_at AS joined_at,
              COUNT(r.id) AS attempts,
              MAX(r.created_at) AS latest_attempt_at,
              (
                SELECT r2.recommended_major
                FROM results r2
                WHERE r2.user_id = u.id
                ORDER BY r2.created_at DESC, r2.id DESC
                LIMIT 1
              ) AS latest_recommended_major
            FROM users u
            LEFT JOIN results r ON r.user_id = u.id
            GROUP BY u.id
          ) q
          WHERE
            ? = ''
            OR q.name LIKE ?
            OR q.email LIKE ?
            OR COALESCE(q.latest_recommended_major, '') LIKE ?
          ORDER BY COALESCE(q.latest_attempt_at, q.joined_at) DESC, q.id DESC
          LIMIT ? OFFSET ?
        `,
        [search, searchLike, searchLike, searchLike, pageSize, offset]
      ),
      all(`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM results
        WHERE DATE(created_at) >= DATE('now', '-6 days')
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      `),
      all(`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM users
        WHERE DATE(created_at) >= DATE('now', '-6 days')
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      `),
      all(`
        SELECT recommended_major AS label, COUNT(*) AS value
        FROM results
        GROUP BY recommended_major
        ORDER BY value DESC
        LIMIT 8
      `)
    ]);

    const attemptsMap = Object.fromEntries(
      attemptsLast7DaysRows.map((row) => [row.day, Number(row.count)])
    );

    const registrationsMap = Object.fromEntries(
      registrationsLast7DaysRows.map((row) => [row.day, Number(row.count)])
    );

    const totalFilteredUsers = Number(filteredUsersCountRow?.totalFilteredUsers || 0);
    const totalPages = Math.max(Math.ceil(totalFilteredUsers / pageSize), 1);

    return res.json({
      success: true,
      message: 'Admin dashboard fetched successfully',
      data: {
        summary: {
          totalUsers: Number(totalUsersRow?.totalUsers || 0),
          totalAttempts: Number(totalAttemptsRow?.totalAttempts || 0),
          mostRecommendedMajors: mostRecommendedMajors.map((item) => ({
            major: item.major,
            count: Number(item.count)
          })),
          latestRegistrationAt: latestRegistrationRow?.created_at || null,
          recentActivityCount: allTimelineRows.length
        },
        users: usersRows.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: toRole(user.is_admin),
          attempts: Number(user.attempts || 0),
          latestRecommendedMajor: user.latest_recommended_major || '—',
          latestAttemptAt: user.latest_attempt_at || null,
          joinedAt: user.joined_at
        })),
        usersMeta: {
          page,
          pageSize,
          totalFilteredUsers,
          totalPages,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPages
        },
        recentActivity: allTimelineRows.map((item) => ({
          id: item.id,
          title:
            item.type === 'registration'
              ? `${item.name} joined the platform`
              : `${item.name} submitted an assessment`,
          description:
            item.type === 'registration'
              ? item.email
              : item.recommended_major || 'Assessment recorded',
          status: item.type,
          timestamp: item.timestamp
        })),
        activity: {
          recentRegistrations: recentRegistrations.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.created_at
          })),
          recentAssessments: recentAssessments.map((item) => ({
            id: item.id,
            title: `${item.name} submitted an assessment`,
            description: item.recommended_major || 'Recommendation generated',
            recommendedMajor: item.recommended_major,
            createdAt: item.created_at
          })),
          recentResults: recentResults.map((item) => ({
            id: item.id,
            title: `${item.name} received a recommendation`,
            description: item.recommended_major || 'Result available',
            recommendedMajor: item.recommended_major,
            createdAt: item.created_at
          }))
        },
        analytics: {
          recommendationTrends: recommendationTrendRows.map((item) => ({
            label: item.label,
            value: Number(item.value)
          })),
          attemptsLast7Days: buildLast7DaysSeries(attemptsMap),
          registrationsLast7Days: buildLast7DaysSeries(registrationsMap)
        }
      }
    });
  } catch (error) {
    console.error('Failed to fetch admin dashboard:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin dashboard'
    });
  }
});

router.get('/users/export', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const searchLike = `%${search}%`;

    const rows = await all(
      `
        SELECT *
        FROM (
          SELECT
            u.id,
            u.name,
            u.email,
            u.is_admin,
            u.created_at AS joined_at,
            COUNT(r.id) AS attempts,
            MAX(r.created_at) AS latest_attempt_at,
            (
              SELECT r2.recommended_major
              FROM results r2
              WHERE r2.user_id = u.id
              ORDER BY r2.created_at DESC, r2.id DESC
              LIMIT 1
            ) AS latest_recommended_major
          FROM users u
          LEFT JOIN results r ON r.user_id = u.id
          GROUP BY u.id
        ) q
        WHERE
          ? = ''
          OR q.name LIKE ?
          OR q.email LIKE ?
          OR COALESCE(q.latest_recommended_major, '') LIKE ?
        ORDER BY COALESCE(q.latest_attempt_at, q.joined_at) DESC, q.id DESC
      `,
      [search, searchLike, searchLike, searchLike]
    );

    const header = [
      'User ID',
      'Name',
      'Email',
      'Role',
      'Attempts',
      'Latest Recommended Major',
      'Latest Attempt At',
      'Joined At'
    ];

    const lines = [
      header.join(','),
      ...rows.map((row) =>
        [
          row.id,
          escapeCsv(row.name),
          escapeCsv(row.email),
          escapeCsv(toRole(row.is_admin)),
          row.attempts || 0,
          escapeCsv(row.latest_recommended_major || ''),
          escapeCsv(row.latest_attempt_at || ''),
          escapeCsv(row.joined_at || '')
        ].join(',')
      )
    ];

    const csv = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admin-users.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Failed to export users CSV:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export users CSV'
    });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (Number.isNaN(targetId) || targetId < 1) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (targetId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    const user = await get('SELECT id FROM users WHERE id = ?', [targetId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await run('DELETE FROM session_question_options WHERE session_question_id IN (SELECT id FROM session_questions WHERE session_id IN (SELECT id FROM assessment_sessions WHERE user_id = ?))', [targetId]);
    await run('DELETE FROM session_questions WHERE session_id IN (SELECT id FROM assessment_sessions WHERE user_id = ?)', [targetId]);
    await run('DELETE FROM assessment_sessions WHERE user_id = ?', [targetId]);
    await run('DELETE FROM generated_question_sets WHERE user_id = ?', [targetId]);
    await run('DELETE FROM results WHERE user_id = ?', [targetId]);
    await run('DELETE FROM profiles WHERE user_id = ?', [targetId]);
    await run('DELETE FROM users WHERE id = ?', [targetId]);

    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

router.patch('/users/:id/admin', async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (Number.isNaN(targetId) || targetId < 1) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (targetId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot change your own admin status' });
    }

    const { isAdmin } = req.body;
    if (typeof isAdmin !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isAdmin must be a boolean' });
    }

    const user = await get('SELECT id FROM users WHERE id = ?', [targetId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await run('UPDATE users SET is_admin = ? WHERE id = ?', [isAdmin ? 1 : 0, targetId]);

    return res.json({ success: true, message: `User ${isAdmin ? 'promoted to admin' : 'demoted to user'}` });
  } catch (error) {
    console.error('Failed to update admin status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update admin status' });
  }
});

router.get('/questions', async (req, res) => {
  try {
    const questions = await all('SELECT id, question_text, category, question_type, question_order FROM questions ORDER BY question_order ASC, id ASC');
    const options = await all('SELECT id, question_id, option_text, score, target_major, option_order FROM question_options ORDER BY question_id ASC, option_order ASC');

    const optionsByQuestion = options.reduce((acc, opt) => {
      if (!acc[opt.question_id]) acc[opt.question_id] = [];
      acc[opt.question_id].push({ id: opt.id, optionText: opt.option_text, score: opt.score, targetMajor: opt.target_major, optionOrder: opt.option_order });
      return acc;
    }, {});

    return res.json({
      success: true,
      data: questions.map(q => ({
        id: q.id,
        questionText: q.question_text,
        category: q.category,
        questionType: q.question_type,
        questionOrder: q.question_order,
        options: optionsByQuestion[q.id] || []
      }))
    });
  } catch (error) {
    console.error('Failed to fetch questions:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch questions' });
  }
});

router.post('/questions', async (req, res) => {
  try {
    const { questionText, category, questionType, questionOrder, options } = req.body;

    if (!questionText || !String(questionText).trim()) {
      return res.status(400).json({ success: false, message: 'questionText is required' });
    }
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ success: false, message: 'At least 2 options are required' });
    }

    const result = await run(
      'INSERT INTO questions (question_text, category, question_type, question_order) VALUES (?, ?, ?, ?)',
      [String(questionText).trim(), category || 'Interests', questionType || 'multiple-choice', Number(questionOrder) || 0]
    );

    for (let i = 0; i < options.length; i += 1) {
      const opt = options[i];
      await run(
        'INSERT INTO question_options (question_id, option_text, score, target_major, option_order) VALUES (?, ?, ?, ?, ?)',
        [result.lastID, String(opt.optionText || '').trim(), Number(opt.score || 0), String(opt.targetMajor || ''), i + 1]
      );
    }

    return res.status(201).json({ success: true, message: 'Question created', data: { id: result.lastID } });
  } catch (error) {
    console.error('Failed to create question:', error);
    return res.status(500).json({ success: false, message: 'Failed to create question' });
  }
});

router.put('/questions/:id', async (req, res) => {
  try {
    const questionId = Number(req.params.id);
    if (Number.isNaN(questionId) || questionId < 1) {
      return res.status(400).json({ success: false, message: 'Invalid question ID' });
    }

    const existing = await get('SELECT id FROM questions WHERE id = ?', [questionId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    const { questionText, category, questionType, questionOrder, options } = req.body;

    if (questionText !== undefined) {
      await run(
        'UPDATE questions SET question_text = ?, category = ?, question_type = ?, question_order = ? WHERE id = ?',
        [String(questionText).trim(), category || 'Interests', questionType || 'multiple-choice', Number(questionOrder) || 0, questionId]
      );
    }

    if (Array.isArray(options)) {
      // Historical session answers keep snapshots, so detach old option IDs before replacing/deleting DB options.
      await run('UPDATE session_question_options SET option_id = NULL WHERE option_id IN (SELECT id FROM question_options WHERE question_id = ?)', [questionId]);
      await run('DELETE FROM question_options WHERE question_id = ?', [questionId]);
      for (let i = 0; i < options.length; i += 1) {
        const opt = options[i];
        await run(
          'INSERT INTO question_options (question_id, option_text, score, target_major, option_order) VALUES (?, ?, ?, ?, ?)',
          [questionId, String(opt.optionText || '').trim(), Number(opt.score || 0), String(opt.targetMajor || ''), i + 1]
        );
      }
    }

    return res.json({ success: true, message: 'Question updated' });
  } catch (error) {
    console.error('Failed to update question:', error);
    return res.status(500).json({ success: false, message: 'Failed to update question' });
  }
});

router.delete('/questions/:id', async (req, res) => {
  try {
    const questionId = Number(req.params.id);
    if (Number.isNaN(questionId) || questionId < 1) {
      return res.status(400).json({ success: false, message: 'Invalid question ID' });
    }

    const existing = await get('SELECT id FROM questions WHERE id = ?', [questionId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    // Historical sessions keep question/option snapshots; detach FK references before deleting the source question.
    await run('UPDATE session_question_options SET option_id = NULL WHERE option_id IN (SELECT id FROM question_options WHERE question_id = ?)', [questionId]);
    await run('UPDATE session_questions SET question_id = NULL WHERE question_id = ?', [questionId]);
    await run('DELETE FROM question_options WHERE question_id = ?', [questionId]);
    await run('DELETE FROM questions WHERE id = ?', [questionId]);

    return res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    console.error('Failed to delete question:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete question' });
  }
});

module.exports = router;