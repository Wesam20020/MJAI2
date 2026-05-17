const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { generateChatReply } = require('../services/openaiService');
const { authenticateToken } = require('../middleware/authMiddleware');

const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS || 30000);

function buildChatFallback(recommendedMajor, language = 'en') {
  const major = recommendedMajor || 'your recommended major';
  if (language === 'ar') {
    return `توصيتي الحالية هي ${major}. أستطيع مساعدتك في فهم صعوبة التخصص، المواد، الوظائف، أو خطة الدراسة. جرّب تسألني سؤالًا محددًا عن هذا التخصص.`;
  }
  if (language === 'es') {
    return `Your current recommended major is ${major}. I can help explain difficulty, subjects, careers, or a study plan. Try asking a specific question about it.`;
  }
  if (language === 'fr') {
    return `Your current recommended major is ${major}. I can help explain difficulty, subjects, careers, or a study plan. Try asking a specific question about it.`;
  }
  return `Your current recommended major is ${major}. I can help explain difficulty, subjects, careers, or a study plan. Try asking a specific question about it.`;
}

async function generateChatReplyFast(recommendedMajor, explanation, message, language, history) {
  const fallback = buildChatFallback(recommendedMajor, language);

  if (!process.env.OPENAI_API_KEY) return fallback;

  const aiPromise = generateChatReply(recommendedMajor, explanation, message, language, history)
    .catch((error) => {
      console.warn('[chat] AI chat failed; using fallback:', error.message);
      return fallback;
    });

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      console.warn(`[chat] AI chat exceeded ${CHAT_TIMEOUT_MS}ms; returning fallback so chat does not hang.`);
      resolve(fallback);
    }, CHAT_TIMEOUT_MS);
  });

  return Promise.race([aiPromise, timeoutPromise]);
}


router.post('/', authenticateToken, (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    if (Number.isNaN(Number(userId))) {
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

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'message is required'
      });
    }

    if (typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'message must be a string'
      });
    }

    if (message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'message cannot be empty'
      });
    }

    if (message.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: 'message is too long'
      });
    }

    const sql = `
      SELECT recommended_major, explanation
      FROM results
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;

    const { language, history } = req.body;
    const SUPPORTED_LANGUAGES = ['en', 'ar', 'es', 'fr'];
    const safeLanguage = SUPPORTED_LANGUAGES.includes(language) ? language : 'en';
    const safeHistory = Array.isArray(history) ? history.slice(0, 20) : [];

    db.get(sql, [Number(userId)], async (err, row) => {
      if (err) {
        console.error('Failed to fetch recommendation context:', err);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch recommendation context'
        });
      }

      if (!row) {
        return res.status(404).json({
          success: false,
          message: 'No recommendation found for this user'
        });
      }

      try {
        const reply = await generateChatReplyFast(
          row.recommended_major,
          row.explanation,
          message.trim(),
          safeLanguage,
          safeHistory
        );

        return res.json({
          success: true,
          message: 'Chat reply generated successfully',
          data: {
            recommendedMajor: row.recommended_major,
            reply,
            timestamp: new Date().toISOString()
          }
        });
      } catch (chatError) {
        console.error('AI chat error:', chatError);
        return res.status(500).json({
          success: false,
          message: 'Failed to generate chat reply'
        });
      }
    });
  } catch (error) {
    console.error('Error in chat route:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;