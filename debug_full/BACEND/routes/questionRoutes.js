const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { generateDynamicQuestions, FALLBACK_QUESTIONS } = require('../services/openaiService');
const { authenticateToken } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminOnly');

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

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

async function userExists(userId) {
  const row = await get('SELECT id FROM users WHERE id = ? LIMIT 1', [Number(userId)]);
  return Boolean(row?.id);
}

async function assertUserExists(userId, context = 'question operation') {
  if (!(await userExists(userId))) {
    const error = new Error(`USER_NOT_FOUND:${context}`);
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
}

function normalizeCategory(category = '') {
  const value = String(category).trim().toLowerCase();

  if (value === 'interests') return 'Interests';
  if (value === 'skills') return 'Skills';
  if (value === 'work style' || value === 'workstyle') return 'Work Style';
  if (value === 'future goals' || value === 'futuregoals') return 'Future Goals';

  return 'Interests';
}

function buildSimilarityKey(questionText = '') {
  return String(questionText)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function questionTokens(text = '') {
  return buildSimilarityKey(text)
    .split(' ')
    .filter((token) => token.length >= 4 && !['which', 'what', 'would', 'could', 'should', 'your', 'you', 'that', 'this', 'with', 'most', 'kind', 'type'].includes(token));
}

function tokenOverlapRatio(textA = '', textB = '') {
  const tokensA = new Set(questionTokens(textA));
  const tokensB = new Set(questionTokens(textB));
  if (!tokensA.size || !tokensB.size) return 0;
  let overlap = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) overlap += 1;
  });
  return overlap / Math.min(tokensA.size, tokensB.size);
}

function isTooSimilarToPreviousQuestions(questionText = '', history = {}) {
  const key = buildSimilarityKey(questionText);
  if (!key) return true;
  if (history?.similarityKeys?.has(key)) return true;

  const previousRows = Array.isArray(history?.rows) ? history.rows : [];
  return previousRows.some((row) => {
    const previousText = row.question_text_snapshot || '';
    const previousKey = row.similarity_key || buildSimilarityKey(previousText);
    if (!previousKey) return false;
    if (previousKey === key) return true;
    if (previousKey.includes(key) || key.includes(previousKey)) return true;
    return tokenOverlapRatio(questionText, previousText) >= 0.68;
  });
}

function hasNoSemanticHistoryOverlap(questions = [], history = {}) {
  return questions.every((question) => !isTooSimilarToPreviousQuestions(question.questionText, history));
}

function waitWithTimeout(promise, ms = 18000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(false), ms))
  ]);
}

function shuffleArray(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function groupOptionsByQuestionId(options) {
  return options.reduce((acc, option) => {
    if (!acc[option.question_id]) acc[option.question_id] = [];
    acc[option.question_id].push({
      id: option.id,
      optionText: option.option_text,
      score: option.score,
      targetMajor: option.target_major,
      optionOrder: option.option_order
    });
    return acc;
  }, {});
}

function detectIntentTag(questionText = '') {
  const text = buildSimilarityKey(questionText);

  if (text.startsWith('which ') || text.startsWith('what ') || text.startsWith('how ')) {
    return 'preference';
  }

  if (text.startsWith('i ') || text.startsWith('my ')) {
    return 'self-reflection';
  }

  if (text.includes('career') || text.includes('future') || text.includes('long term')) {
    return 'goal';
  }

  if (text.includes('project') || text.includes('environment') || text.includes('workplace')) {
    return 'scenario';
  }

  return 'general';
}

function extractThemeTags(questionText = '', options = []) {
  const text = `${questionText} ${(options || []).map((option) => option.optionText || '').join(' ')}`.toLowerCase();

  const themeMap = {
    technology: ['technology', 'software', 'coding', 'programming', 'developer', 'digital', 'ai', 'machine learning', 'systems', 'technical', 'app'],
    health: ['health', 'medical', 'medicine', 'patient', 'hospital', 'clinic', 'human body', 'biology', 'care'],
    business: ['business', 'management', 'market', 'finance', 'economics', 'strategy', 'leadership', 'startup', 'company'],
    creativity: ['design', 'creative', 'art', 'visual', 'music', 'interface', 'ux', 'ui', 'product design'],
    people: ['people', 'community', 'social', 'helping', 'empathy', 'behavior', 'psychology', 'communication', 'education'],
    research: ['research', 'analysis', 'data', 'scientific', 'evidence', 'patterns', 'reports', 'statistics'],
    teamwork: ['team', 'collaborative', 'group', 'stakeholder', 'leadership', 'shared'],
    independent_work: ['independent', 'autonomy', 'deep focus', 'solitary', 'self directed'],
    hands_on: ['build', 'prototype', 'practical', 'fixing', 'tangible', 'device'],
    problem_solving: ['problem', 'solution', 'debugging', 'logic', 'reasoning', 'complex systems'],
    structure: ['structured', 'guidelines', 'clear path', 'organized', 'measurable', 'process', 'planning'],
    ambiguity: ['ambiguity', 'open ended', 'uncertain', 'without a clear', 'adapt', 'explore'],
    entrepreneurship: ['venture', 'startup', 'opportunity', 'innovation', 'business idea']
  };

  const tags = [];

  for (const [tag, keywords] of Object.entries(themeMap)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      tags.push(tag);
    }
  }

  return tags.length ? tags : ['general'];
}

function buildQuestionProfile(question) {
  const questionText = String(question.questionText || '').trim();
  const options = Array.isArray(question.options) ? question.options : [];

  return {
    ...question,
    similarityKey: buildSimilarityKey(questionText),
    intentTag: detectIntentTag(questionText),
    themeTags: extractThemeTags(questionText, options)
  };
}

function countOverlap(listA = [], listB = []) {
  const setB = new Set(listB);
  return listA.filter((item) => setB.has(item)).length;
}

const LIKERT_OPTIONS = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
const ALLOWED_QUESTION_TYPES = new Set(['multiple-choice', 'likert', 'preference', 'scenario']);

function hasBalancedCategoryCount(questions = [], targetPerCategory = 5) {
  const counts = countQuestionsByCategory(questions);
  return ['Interests', 'Skills', 'Work Style', 'Future Goals'].every(
    (category) => counts[category] === targetPerCategory
  );
}

function isLogicalQuestionSet(questions = [], totalTarget = 20) {
  if (!Array.isArray(questions) || questions.length !== totalTarget) return false;
  if (!questions.every(validateQuestion)) return false;
  if (!hasBalancedCategoryCount(questions, totalTarget / 4)) return false;
  return hasQuestionTypeDiversity(questions);
}

function normalizeQuestionTypeForStorage(type = '') {
  const value = String(type || '').trim().toLowerCase();
  if (ALLOWED_QUESTION_TYPES.has(value)) return value;
  return 'multiple-choice';
}

function isLikertStyleOptions(options = []) {
  return options.length === 5 && options.every((option, index) =>
    String(option.optionText || '').trim().toLowerCase() === LIKERT_OPTIONS[index].toLowerCase()
  );
}

function looksLikeQuestion(text = '') {
  return /^(what|which|how|when|where|if|imagine|suppose|you are|your team|a project|in a group)/i.test(String(text).trim());
}

function looksLikeStatement(text = '') {
  const value = String(text).trim();
  if (!value) return false;
  if (looksLikeQuestion(value)) return false;
  return /^(i|my|working|learning|solving|helping|building|designing|leading|analyzing|understanding)/i.test(value);
}

function hasEnoughMajorSpread(options = [], minimum = 3) {
  return new Set(options.map((option) => String(option.targetMajor || '').trim()).filter(Boolean)).size >= minimum;
}

function validateQuestion(question) {
  if (!question) return false;

  const questionText = String(question.questionText || '').trim();
  const questionType = normalizeQuestionTypeForStorage(question.questionType || 'multiple-choice');

  if (!questionText || questionText.length < 18 || questionText.length > 180) return false;
  if (!Array.isArray(question.options)) return false;

  const options = question.options;
  const baseOptionsValid = options.every(
    (option) =>
      option &&
      String(option.optionText || '').trim() &&
      option.targetMajor &&
      !Number.isNaN(Number(option.score))
  );

  if (!baseOptionsValid) return false;

  if (questionType === 'likert') {
    if (!looksLikeStatement(questionText)) return false;
    if (!isLikertStyleOptions(options)) return false;
    return hasEnoughMajorSpread(options, 4);
  }

  if (options.length !== 4) return false;
  if (isLikertStyleOptions(options)) return false;
  if (!hasEnoughMajorSpread(options, 4)) return false;

  if (questionType === 'scenario') {
    return /^(imagine|suppose|you are|your team|a project|in a group|during|if)/i.test(questionText);
  }

  if (questionType === 'preference') {
    return /prefer|rather|choose|appeals|sounds|best/i.test(questionText);
  }

  return looksLikeQuestion(questionText);
}

function hasQuestionTypeDiversity(questions = []) {
  const typeCounts = questions.reduce((acc, question) => {
    const type = normalizeQuestionTypeForStorage(question.questionType || 'multiple-choice');
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const presentTypes = Object.values(typeCounts).filter((count) => count > 0).length;
  return presentTypes >= 3 && (typeCounts['multiple-choice'] || 0) >= 4 && (typeCounts.likert || 0) >= 3;
}

function countQuestionsByType(questions = []) {
  return questions.reduce((acc, question) => {
    const type = normalizeQuestionTypeForStorage(question.questionType || 'multiple-choice');
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
}

function questionTypeMinimum(type = '') {
  const normalized = normalizeQuestionTypeForStorage(type);
  if (normalized === 'multiple-choice') return 4;
  if (normalized === 'likert') return 3;
  return 0;
}

function canReplaceQuestionForTypeRepair(question, typeCounts = {}) {
  const type = normalizeQuestionTypeForStorage(question.questionType || 'multiple-choice');
  const minimum = questionTypeMinimum(type);
  return (typeCounts[type] || 0) > minimum;
}

function getTypeDiversityRepairTargets(questions = []) {
  const typeCounts = countQuestionsByType(questions);
  const targets = [];

  if ((typeCounts['multiple-choice'] || 0) < 4) {
    targets.push('multiple-choice');
  }

  if ((typeCounts.likert || 0) < 3) {
    targets.push('likert');
  }

  const presentTypes = Object.entries(typeCounts)
    .filter(([, count]) => count > 0)
    .map(([type]) => type);

  if (presentTypes.length < 3) {
    for (const type of ['scenario', 'preference', 'multiple-choice', 'likert']) {
      if (!presentTypes.includes(type) && !targets.includes(type)) {
        targets.push(type);
        break;
      }
    }
  }

  return targets;
}

function repairQuestionTypeDiversity(selectedQuestions = [], candidatePool = [], topMajors = [], history = {}, answerSignals = {}, totalTarget = 20) {
  let result = orderPreparedQuestions(selectedQuestions).slice(0, totalTarget);
  let guard = 0;

  while (!hasQuestionTypeDiversity(result) && guard < 12) {
    guard += 1;
    const typeCounts = countQuestionsByType(result);
    const [neededType] = getTypeDiversityRepairTargets(result);
    if (!neededType) break;

    let bestSwap = null;

    for (let index = 0; index < result.length; index += 1) {
      const currentQuestion = result[index];
      if (!canReplaceQuestionForTypeRepair(currentQuestion, typeCounts)) continue;

      const withoutCurrent = result.filter((_, itemIndex) => itemIndex !== index);
      const usedKeys = new Set(withoutCurrent.map((question) => question.similarityKey));
      const category = normalizeCategory(currentQuestion.category);

      const replacementCandidates = candidatePool.filter((candidate) => {
        const candidateType = normalizeQuestionTypeForStorage(candidate.questionType || 'multiple-choice');
        return candidateType === neededType &&
          normalizeCategory(candidate.category) === category &&
          !usedKeys.has(candidate.similarityKey) &&
          validateQuestion(candidate) &&
          isSemanticallyDistinctFromSelected(candidate, withoutCurrent);
      });

      const replacement = chooseBestCandidate(replacementCandidates, topMajors, history, answerSignals, withoutCurrent);
      if (!replacement) continue;

      const score = scoreQuestionCandidate(replacement, topMajors, history, answerSignals, withoutCurrent);
      if (!bestSwap || score > bestSwap.score) {
        bestSwap = { index, replacement, score };
      }
    }

    if (!bestSwap) break;

    result[bestSwap.index] = {
      ...bestSwap.replacement,
      source: bestSwap.replacement.source || 'hybrid-openai-local-prepared'
    };
    result = orderPreparedQuestions(result).map((question, index) => ({
      ...question,
      questionOrder: index + 1
    }));
  }

  return result;
}

function hasNoDuplicateQuestionKeys(questions = []) {
  const keys = questions.map((question) => question.similarityKey || buildSimilarityKey(question.questionText));
  return keys.length === new Set(keys).size;
}

function hasNoInternalSemanticOverlap(questions = []) {
  for (let i = 0; i < questions.length; i += 1) {
    for (let j = i + 1; j < questions.length; j += 1) {
      const firstText = questions[i]?.questionText || '';
      const secondText = questions[j]?.questionText || '';
      const firstKey = questions[i]?.similarityKey || buildSimilarityKey(firstText);
      const secondKey = questions[j]?.similarityKey || buildSimilarityKey(secondText);

      if (!firstKey || !secondKey) return false;
      if (firstKey === secondKey) return false;
      if (firstKey.includes(secondKey) || secondKey.includes(firstKey)) return false;
      if (tokenOverlapRatio(firstText, secondText) >= 0.78) return false;
    }
  }
  return true;
}

function isSemanticallyDistinctFromSelected(candidate, selectedQuestions = []) {
  const candidateText = candidate?.questionText || '';
  const candidateKey = candidate?.similarityKey || buildSimilarityKey(candidateText);

  if (!candidateKey) return false;

  return (Array.isArray(selectedQuestions) ? selectedQuestions : []).every((selected) => {
    const selectedText = selected?.questionText || '';
    const selectedKey = selected?.similarityKey || buildSimilarityKey(selectedText);

    if (!selectedKey) return true;
    if (selectedKey === candidateKey) return false;
    if (selectedKey.includes(candidateKey) || candidateKey.includes(selectedKey)) return false;
    return tokenOverlapRatio(candidateText, selectedText) < 0.78;
  });
}

function hasNoHistoryOverlap(questions = [], history = {}) {
  const historyKeys = history?.similarityKeys || new Set();
  return questions.every((question) => {
    const key = question.similarityKey || buildSimilarityKey(question.questionText);
    return key && !historyKeys.has(key);
  });
}

function isReadyForNextSession(questions = [], history = {}, totalTarget = 20) {
  return (
    isLogicalQuestionSet(questions, totalTarget) &&
    hasNoDuplicateQuestionKeys(questions) &&
    hasNoInternalSemanticOverlap(questions) &&
    hasNoHistoryOverlap(questions, history) &&
    hasNoSemanticHistoryOverlap(questions, history)
  );
}

function getPreparedValidationReport(questions = [], history = {}, totalTarget = 20) {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const errors = [];
  const categoryCounts = countQuestionsByCategory(safeQuestions);
  const typeCounts = safeQuestions.reduce((acc, question) => {
    const type = normalizeQuestionTypeForStorage(question.questionType || 'multiple-choice');
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  if (!Array.isArray(questions)) errors.push('questions is not an array');
  if (safeQuestions.length !== totalTarget) errors.push(`expected ${totalTarget} questions, got ${safeQuestions.length}`);
  if (!safeQuestions.every(validateQuestion)) errors.push('one or more questions failed validateQuestion');
  if (!hasBalancedCategoryCount(safeQuestions, totalTarget / 4)) {
    errors.push(`category balance failed: ${JSON.stringify(categoryCounts)}`);
  }
  if (!hasQuestionTypeDiversity(safeQuestions)) {
    errors.push(`question type diversity failed: ${JSON.stringify(typeCounts)}`);
  }
  if (!hasNoDuplicateQuestionKeys(safeQuestions)) errors.push('duplicate question keys found');
  if (!hasNoInternalSemanticOverlap(safeQuestions)) errors.push('internal semantic overlap found');
  if (!hasNoHistoryOverlap(safeQuestions, history)) errors.push('exact history overlap found');
  if (!hasNoSemanticHistoryOverlap(safeQuestions, history)) errors.push('semantic history overlap found');

  return {
    ok: errors.length === 0,
    errors,
    count: safeQuestions.length,
    categoryCounts,
    typeCounts
  };
}

function logPreparedValidationFailure(userId, stage, questions = [], history = {}, extra = {}) {
  const report = getPreparedValidationReport(questions, history, 20);
  console.warn(
    `[questions] Prepared next-session set rejected for user ${userId} at ${stage}:`,
    JSON.stringify({ ...extra, ...report })
  );
}

async function getQuestionsPayload(res) {
  const questions = await all(
    `
      SELECT id, question_text, category, question_type, question_order
      FROM questions
      ORDER BY question_order ASC, id ASC
    `
  );

  const options = await all(
    `
      SELECT id, question_id, option_text, score, target_major, option_order
      FROM question_options
      ORDER BY question_id ASC, option_order ASC, id ASC
    `
  );

  const optionsByQuestionId = groupOptionsByQuestionId(options);

  const formattedQuestions = questions.map((question) => ({
    id: question.id,
    questionText: question.question_text,
    category: question.category,
    questionType: question.question_type || 'multiple-choice',
    questionOrder: question.question_order,
    options: optionsByQuestionId[question.id] || []
  }));

  return res.json({
    success: true,
    count: formattedQuestions.length,
    data: formattedQuestions
  });
}

async function createAssessmentSession(userId, strongestMajorSignals = []) {
  await assertUserExists(userId, 'createAssessmentSession');

  const result = await run(
    `
      INSERT INTO assessment_sessions (user_id, status, strongest_major_signals)
      VALUES (?, 'active', ?)
    `,
    [Number(userId), JSON.stringify(strongestMajorSignals)]
  );

  return result.lastID;
}


async function getReusableActiveQuestionSession(userId, maxAgeSeconds = 12) {
  const numericUserId = Number(userId);
  if (!numericUserId || Number.isNaN(numericUserId)) return null;

  // Reuse is ONLY for near-simultaneous duplicate frontend calls
  // (React StrictMode / double request / immediate refresh).
  // Do not reuse a 45-minute "active" session: assessment_sessions are not
  // marked completed anywhere in the current backend, so a long reuse window
  // blocks prepared-next-session questions forever and makes the app look like
  // it always falls back to local.
  const seconds = Math.max(3, Math.min(Number(maxAgeSeconds) || 12, 30));
  const session = await get(
    `
      SELECT id, strongest_major_signals
      FROM assessment_sessions
      WHERE user_id = ?
        AND status = 'active'
        AND created_at >= datetime('now', '-' || ? || ' seconds')
      ORDER BY id DESC
      LIMIT 1
    `,
    [numericUserId, seconds]
  );

  if (!session?.id) return null;

  const questions = await all(
    `
      SELECT id, question_text_snapshot, category, question_type, question_order
      FROM session_questions
      WHERE session_id = ?
      ORDER BY question_order ASC, id ASC
    `,
    [session.id]
  );

  if (!Array.isArray(questions) || questions.length !== 20) return null;

  const options = await all(
    `
      SELECT
        sq.id AS question_id,
        sqo.id,
        sqo.option_text,
        sqo.score,
        sqo.target_major,
        sqo.option_order
      FROM session_question_options sqo
      INNER JOIN session_questions sq ON sq.id = sqo.session_question_id
      WHERE sq.session_id = ?
      ORDER BY sq.question_order ASC, sqo.option_order ASC, sqo.id ASC
    `,
    [session.id]
  );

  const optionsByQuestionId = groupOptionsByQuestionId(options);

  return {
    sessionId: session.id,
    mode: 'active-session-reuse',
    questions: questions.map((question, index) => ({
      id: question.id,
      questionText: question.question_text_snapshot,
      category: normalizeCategory(question.category),
      questionType: question.question_type || 'multiple-choice',
      questionOrder: question.question_order || index + 1,
      options: optionsByQuestionId[question.id] || []
    }))
  };
}


async function ensurePreparedQuestionsTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS generated_question_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      questions_json TEXT NOT NULL,
      status TEXT DEFAULT 'ready',
      source TEXT DEFAULT 'openai-prepared',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME
    )
  `);

  // If a server restart happened after a prepared set was claimed but before it
  // was marked as used/invalid, release old reservations. This prevents a user
  // from losing a valid prepared set forever.
  await run(
    `
      UPDATE generated_question_sets
      SET status = 'ready', used_at = NULL
      WHERE status = 'reserved'
        AND used_at IS NOT NULL
        AND used_at < datetime('now', '-30 seconds')
    `
  );
}

async function getReadyPreparedQuestionSet(userId) {
  await ensurePreparedQuestionsTable();

  const row = await get(
    `
      SELECT id, questions_json, source
      FROM generated_question_sets
      WHERE user_id = ? AND status = 'ready'
      ORDER BY
        CASE
          WHEN source LIKE 'instant-local%' THEN 1
          ELSE 0
        END ASC,
        created_at DESC,
        id DESC
      LIMIT 1
    `,
    [Number(userId)]
  );

  if (!row?.questions_json) return null;

  let questions = [];

  try {
    const parsed = JSON.parse(row.questions_json);
    questions = Array.isArray(parsed?.questions) ? parsed.questions : parsed;
    if (!Array.isArray(questions)) throw new Error('Prepared question set is not an array');
  } catch (error) {
    await run(
      `UPDATE generated_question_sets SET status = 'invalid', used_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [row.id]
    );
    return null;
  }

  // Do NOT reserve here. A previous version changed status ready -> reserved
  // before the questionnaire session was successfully created. If the frontend
  // timed out or the DB was briefly busy, the prepared set was no longer READY,
  // so refresh fell back to local questions. The per-user lock already prevents
  // normal duplicate consumption, so keep the set READY until it is successfully
  // saved into assessment_sessions/session_questions, then mark it used.
  return {
    id: row.id,
    source: row.source || 'openai-prepared',
    questions
  };
}

async function markPreparedQuestionSetUsed(setId) {
  if (!setId) return;
  await ensurePreparedQuestionsTable();
  await run(
    `
      UPDATE generated_question_sets
      SET status = 'used', used_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'ready'
    `,
    [Number(setId)]
  );
}

function isSafePreparedQuestionSet(questions = [], totalTarget = 20) {
  return (
    isLogicalQuestionSet(questions, totalTarget) &&
    hasNoDuplicateQuestionKeys(questions) &&
    hasNoInternalSemanticOverlap(questions)
  );
}

function isHybridPreparedSource(source = '') {
  return String(source || '').includes('hybrid') || String(source || '').includes('local');
}

async function savePreparedQuestionSet(userId, questions, source = 'openai-prepared', historySnapshot = null, options = {}) {
  await ensurePreparedQuestionsTable();
  if (!(await userExists(userId))) {
    console.warn(`[questions] Skipping prepared set save: user ${userId} no longer exists.`);
    return false;
  }

  // Important: use the same history snapshot that was used when the questions
  // were generated/selected. Do NOT re-read history here; the user may have
  // started another local session while OpenAI was still preparing the next set.
  const history = historySnapshot || await getUserQuestionHistory(userId);
  const allowLocalHistoryFallback = Boolean(options.allowLocalHistoryFallback || isHybridPreparedSource(source));

  const validQuestions = (Array.isArray(questions) ? questions : [])
    .map((question, index) =>
      buildQuestionProfile({
        ...question,
        category: normalizeCategory(question.category),
        questionType: normalizeQuestionTypeForStorage(question.questionType || 'multiple-choice'),
        questionOrder: index + 1,
        source: question.source || source
      })
    )
    .filter(validateQuestion);

  const selectedQuestions = orderPreparedQuestions(validQuestions);
  const isFullyFresh = isReadyForNextSession(selectedQuestions, history, 20);
  const isSafeHybrid = allowLocalHistoryFallback && isSafePreparedQuestionSet(selectedQuestions, 20);

  if (!isFullyFresh && !isSafeHybrid) {
    logPreparedValidationFailure(userId, 'savePreparedQuestionSet', selectedQuestions, history, {
      incomingCount: Array.isArray(questions) ? questions.length : 0,
      validAfterFilteringCount: validQuestions.length,
      allowLocalHistoryFallback
    });
    return false;
  }

  if (!isFullyFresh && isSafeHybrid) {
    console.warn(
      `[questions] Saving hybrid prepared set for user ${userId}: local fallback completed the set; some local questions may be least-recently-used repeats.`
    );
  }

  await run(
    `
      INSERT INTO generated_question_sets (user_id, questions_json, status, source)
      VALUES (?, ?, 'ready', ?)
    `,
    [Number(userId), JSON.stringify({ questions: selectedQuestions }), source]
  );

  if (!String(source || '').startsWith('instant-local')) {
    await run(
      `
        UPDATE generated_question_sets
        SET status = 'expired'
        WHERE user_id = ?
          AND status = 'ready'
          AND source LIKE 'instant-local%'
      `,
      [Number(userId)]
    );
  }

  await run(
    `
      UPDATE generated_question_sets
      SET status = 'expired'
      WHERE user_id = ?
        AND status = 'ready'
        AND id NOT IN (
          SELECT id FROM generated_question_sets
          WHERE user_id = ? AND status = 'ready'
          ORDER BY
            CASE
              WHEN source LIKE 'instant-local%' THEN 1
              ELSE 0
            END ASC,
            created_at DESC,
            id DESC
          LIMIT 2
        )
    `,
    [Number(userId), Number(userId)]
  );

  return true;
}

async function getUserQuestionHistory(userId) {
  const rows = await all(
    `
      SELECT
        sq.question_id,
        sq.question_text_snapshot,
        sq.category,
        sq.similarity_key,
        sq.created_at
      FROM session_questions sq
      INNER JOIN assessment_sessions s ON s.id = sq.session_id
      WHERE s.user_id = ?
      ORDER BY sq.created_at DESC, sq.id DESC
    `,
    [Number(userId)]
  );

  const exactQuestionIds = new Set();
  const similarityKeys = new Set();
  const intentCounts = {};
  const themeCounts = {};

  rows.forEach((row) => {
    if (row.question_id) exactQuestionIds.add(Number(row.question_id));
    if (row.similarity_key) similarityKeys.add(row.similarity_key);

    const profile = buildQuestionProfile({
      questionText: row.question_text_snapshot,
      category: row.category,
      options: []
    });

    intentCounts[profile.intentTag] = (intentCounts[profile.intentTag] || 0) + 1;

    profile.themeTags.forEach((tag) => {
      themeCounts[tag] = (themeCounts[tag] || 0) + 1;
    });
  });

  return {
    rows,
    exactQuestionIds,
    similarityKeys,
    intentCounts,
    themeCounts
  };
}

async function getLatestTopMajors(userId) {
  const latestResult = await get(
    `
      SELECT top_majors
      FROM results
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [Number(userId)]
  );

  if (!latestResult?.top_majors) return [];

  try {
    const parsed = JSON.parse(latestResult.top_majors);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function getLatestAnswerSignals(userId) {
  const latestResult = await get(
    `
      SELECT answers
      FROM results
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [Number(userId)]
  );

  if (!latestResult?.answers) {
    return {
      strongestSignals: [],
      signalScores: {},
      majorScores: {}
    };
  }

  try {
    const parsed = JSON.parse(latestResult.answers);
    return parsed?.answerSignals || {
      strongestSignals: [],
      signalScores: {},
      majorScores: {}
    };
  } catch (error) {
    return {
      strongestSignals: [],
      signalScores: {},
      majorScores: {}
    };
  }
}

function mapSignalToThemes(signalName = '') {
  const mapping = {
    analytical: ['problem_solving', 'research', 'technology'],
    people_oriented: ['people', 'teamwork', 'health'],
    creativity: ['creativity', 'hands_on'],
    technical: ['technology', 'problem_solving', 'hands_on'],
    leadership: ['business', 'teamwork', 'structure'],
    business: ['business', 'structure', 'entrepreneurship'],
    research: ['research', 'problem_solving'],
    health: ['health', 'people'],
    communication: ['people', 'teamwork'],
    structure: ['structure', 'business'],
    ambiguity_tolerance: ['ambiguity', 'research', 'entrepreneurship'],
    hands_on: ['hands_on', 'technology', 'creativity']
  };

  return mapping[signalName] || [];
}

function getStrongSignalThemes(answerSignals = {}) {
  const strongestSignals = Array.isArray(answerSignals?.strongestSignals)
    ? answerSignals.strongestSignals
    : [];

  const themes = strongestSignals.flatMap((item) => mapSignalToThemes(item.signal));
  return [...new Set(themes)];
}

function getWeakSignalThemes(answerSignals = {}) {
  const scores = answerSignals?.signalScores || {};
  const weakSignals = Object.entries(scores)
    .filter(([, value]) => Number(value || 0) === 0)
    .map(([signal]) => signal);

  return [...new Set(weakSignals.flatMap((signal) => mapSignalToThemes(signal)))];
}

function scoreQuestionCandidate(question, topMajors = [], history = {}, answerSignals = {}, selectedQuestions = []) {
  const strongMajors = topMajors.slice(0, 3).map((item) => item.major);
  const selectedThemeTags = selectedQuestions.flatMap((item) => item.themeTags || []);
  const selectedIntentTags = selectedQuestions.map((item) => item.intentTag);

  const strongSignalThemes = getStrongSignalThemes(answerSignals);
  const weakSignalThemes = getWeakSignalThemes(answerSignals);

  const signalMatches = (question.options || []).filter((option) =>
    strongMajors.includes(option.targetMajor)
  ).length;

  const historyThemePenalty = (question.themeTags || []).reduce(
    (sum, tag) => sum + (history.themeCounts?.[tag] || 0),
    0
  );

  const historyIntentPenalty = history.intentCounts?.[question.intentTag] || 0;
  const selectedThemePenalty = countOverlap(question.themeTags || [], selectedThemeTags);
  const selectedIntentPenalty = selectedIntentTags.includes(question.intentTag) ? 1 : 0;

  const strongSignalBonus = countOverlap(question.themeTags || [], strongSignalThemes);
  const weakSignalCoverageBonus = countOverlap(question.themeTags || [], weakSignalThemes);

  const uniqueMajorBonus = new Set((question.options || []).map((option) => option.targetMajor)).size;

  return (
    signalMatches * 5 +
    strongSignalBonus * 4 +
    weakSignalCoverageBonus * 2 +
    uniqueMajorBonus * 0.5 -
    historyThemePenalty * 2 -
    historyIntentPenalty * 1.5 -
    selectedThemePenalty * 3 -
    selectedIntentPenalty * 1
  );
}

function prioritizeQuestionsBySignals(questions, topMajors = [], history = {}, answerSignals = {}, selectedQuestions = []) {
  return [...questions].sort((a, b) => {
    const aScore = scoreQuestionCandidate(a, topMajors, history, answerSignals, selectedQuestions);
    const bScore = scoreQuestionCandidate(b, topMajors, history, answerSignals, selectedQuestions);
    return bScore - aScore;
  });
}

function buildDynamicCandidates(dynamicQuestions, history, mode = 'strict') {
  let candidates = (Array.isArray(dynamicQuestions) ? dynamicQuestions : [])
    .map((question, index) =>
      buildQuestionProfile({
        id: null,
        questionText: String(question.questionText || '').trim(),
        category: normalizeCategory(question.category),
        questionType: question.questionType || 'multiple-choice',
        questionOrder: index + 1,
        options: (question.options || []).map((option, optionIndex) => ({
          id: null,
          optionText: option.optionText,
          score: Number(option.score || 0),
          targetMajor: option.targetMajor,
          optionOrder: option.optionOrder || optionIndex + 1
        })),
        source: 'openai'
      })
    )
    .filter((question) => validateQuestion(question))
    .filter((question) => !isTooSimilarToPreviousQuestions(question.questionText, history));

  if (mode === 'strict') {
    candidates = candidates.filter((question) => {
      const historyThemeOverlap = countOverlap(
        question.themeTags || [],
        Object.keys(history.themeCounts || {})
      );
      return historyThemeOverlap < 3;
    });
  } else if (mode === 'relaxed') {
    // Relaxed mode is used after the local history grows. Do not filter by
    // theme overlap here; after 2+ sessions every broad theme is usually present
    // in history, which would zero out otherwise valid candidates.
    candidates = candidates.filter((question) =>
      validateQuestion(question) && !isTooSimilarToPreviousQuestions(question.questionText, history)
    );
  }

  return candidates;
}

function pickBalancedQuestions(questionPool, targetPerCategory = 2) {
  const categories = ['Interests', 'Skills', 'Work Style', 'Future Goals'];
  const selected = [];
  const usedSimilarityKeys = new Set();

  for (const category of categories) {
    const categoryQuestions = questionPool.filter(
      (question) =>
        normalizeCategory(question.category) === category &&
        !usedSimilarityKeys.has(question.similarityKey)
    );

    for (const question of categoryQuestions.slice(0, targetPerCategory)) {
      selected.push(question);
      usedSimilarityKeys.add(question.similarityKey);
    }
  }

  return selected.map((question, index) => ({
    ...question,
    questionOrder: index + 1
  }));
}

function countQuestionsByCategory(questions) {
  const counts = {
    Interests: 0,
    Skills: 0,
    'Work Style': 0,
    'Future Goals': 0
  };

  for (const question of questions) {
    const category = normalizeCategory(question.category);
    if (counts[category] !== undefined) {
      counts[category] += 1;
    }
  }

  return counts;
}

function chooseBestCandidate(candidates, topMajors, history, answerSignals, selectedQuestions) {
  if (!candidates.length) return null;

  return [...candidates].sort(
    (a, b) =>
      scoreQuestionCandidate(b, topMajors, history, answerSignals, selectedQuestions) -
      scoreQuestionCandidate(a, topMajors, history, answerSignals, selectedQuestions)
  )[0];
}

function fillMissingCategories(selectedQuestions, candidatePool, topMajors, history, answerSignals, targetPerCategory = 5, totalTarget = 20) {
  const counts = countQuestionsByCategory(selectedQuestions);
  const usedKeys = new Set(selectedQuestions.map((question) => question.similarityKey));
  const categories = ['Interests', 'Skills', 'Work Style', 'Future Goals'];

  const result = [...selectedQuestions];

  for (const category of categories) {
    while (counts[category] < targetPerCategory && result.length < totalTarget) {
      const categoryCandidates = candidatePool.filter(
        (question) =>
          normalizeCategory(question.category) === category &&
          !usedKeys.has(question.similarityKey) &&
          isSemanticallyDistinctFromSelected(question, result)
      );

      const bestCandidate = chooseBestCandidate(categoryCandidates, topMajors, history, answerSignals, result);
      if (!bestCandidate) break;

      result.push({
        ...bestCandidate,
        questionOrder: result.length + 1
      });

      usedKeys.add(bestCandidate.similarityKey);
      counts[category] += 1;
    }
  }

  return result;
}

function fillRemainingQuestions(selectedQuestions, candidatePool, topMajors, history, answerSignals, totalTarget = 20) {
  const usedKeys = new Set(selectedQuestions.map((question) => question.similarityKey));
  const result = [...selectedQuestions];

  while (result.length < totalTarget) {
    const remainingCandidates = candidatePool.filter(
      (candidate) =>
        !usedKeys.has(candidate.similarityKey) &&
        isSemanticallyDistinctFromSelected(candidate, result)
    );

    const bestCandidate = chooseBestCandidate(remainingCandidates, topMajors, history, answerSignals, result);
    if (!bestCandidate) break;

    result.push({
      ...bestCandidate,
      questionOrder: result.length + 1
    });

    usedKeys.add(bestCandidate.similarityKey);
  }

  return result;
}

function emergencyFillToTarget(selectedQuestions, candidatePool, totalTarget = 20) {
  const usedKeys = new Set(selectedQuestions.map((question) => question.similarityKey));
  const result = [...selectedQuestions];

  for (const candidate of candidatePool) {
    if (result.length >= totalTarget) break;
    if (usedKeys.has(candidate.similarityKey)) continue;
    if (!isSemanticallyDistinctFromSelected(candidate, result)) continue;

    result.push({
      ...candidate,
      questionOrder: result.length + 1
    });

    usedKeys.add(candidate.similarityKey);
  }

  return result;
}

async function getStaticQuestionPool() {
  const questions = await all(
    `
      SELECT id, question_text, category, question_type, question_order
      FROM questions
      ORDER BY question_order ASC, id ASC
    `
  );

  const options = await all(
    `
      SELECT id, question_id, option_text, score, target_major, option_order
      FROM question_options
      ORDER BY question_id ASC, option_order ASC, id ASC
    `
  );

  const optionsByQuestionId = groupOptionsByQuestionId(options);

  return questions.map((question) =>
    buildQuestionProfile({
      id: question.id,
      questionText: question.question_text,
      category: normalizeCategory(question.category),
      questionType: question.question_type || 'multiple-choice',
      questionOrder: question.question_order,
      options: optionsByQuestionId[question.id] || [],
      source: 'db'
    })
  );
}

async function saveSessionQuestions(sessionId, selectedQuestions) {
  const savedMap = {};

  for (let index = 0; index < selectedQuestions.length; index += 1) {
    const question = selectedQuestions[index];

    const sessionQuestionResult = await run(
      `
        INSERT INTO session_questions (
          session_id,
          question_id,
          question_text_snapshot,
          category,
          question_type,
          question_order,
          source,
          similarity_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(sessionId),
        question.id || null,
        question.questionText,
        normalizeCategory(question.category),
        question.questionType || 'multiple-choice',
        index + 1,
        question.source || 'db',
        question.similarityKey || buildSimilarityKey(question.questionText)
      ]
    );

    savedMap[index + 1] = {
      sessionQuestionId: sessionQuestionResult.lastID,
      options: []
    };

    for (let optionIndex = 0; optionIndex < question.options.length; optionIndex += 1) {
      const option = question.options[optionIndex];

      const sessionOptionResult = await run(
        `
          INSERT INTO session_question_options (
            session_question_id,
            option_id,
            option_text,
            score,
            target_major,
            option_order
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          sessionQuestionResult.lastID,
          option.id || null,
          option.optionText,
          Number(option.score || 0),
          option.targetMajor,
          option.optionOrder || optionIndex + 1
        ]
      );

      savedMap[index + 1].options.push({
        sessionOptionId: sessionOptionResult.lastID
      });
    }
  }

  return savedMap;
}

function formatSelectedQuestions(selectedQuestions, savedSessionQuestionsMap = {}) {
  return selectedQuestions.map((question, index) => {
    const savedQuestion = savedSessionQuestionsMap[index + 1];

    return {
      id: savedQuestion?.sessionQuestionId || question.id || null,
      questionText: question.questionText,
      category: normalizeCategory(question.category),
      questionType: question.questionType || 'multiple-choice',
      questionOrder: index + 1,
      options: (question.options || []).map((option, optionIndex) => {
        const savedOption = savedQuestion?.options?.[optionIndex];

        return {
          id: savedOption?.sessionOptionId || option.id || null,
          optionText: option.optionText,
          score: option.score,
          targetMajor: option.targetMajor,
          optionOrder: option.optionOrder || optionIndex + 1
        };
      })
    };
  });
}

async function buildAdaptiveQuestionSet(userId) {
  const history = await getUserQuestionHistory(userId);
  const topMajors = await getLatestTopMajors(userId);
  const answerSignals = await getLatestAnswerSignals(userId);
  const totalTarget = 20;

  let selectedQuestions = [];
  let dynamicQuestions = [];

  // One OpenAI call per questionnaire session. The old version could call OpenAI
  // twice, which made the page feel slow and doubled cost/latency.
  try {
    dynamicQuestions = await generateDynamicQuestions({
      previousQuestionTexts: history.rows.map((row) => row.question_text_snapshot).filter(Boolean).slice(0, 60),
      previousSimilarityKeys: Array.from(history.similarityKeys).slice(0, 80),
      topMajors: topMajors.slice(0, 3),
      answerSignals
    });
  } catch (error) {
    console.warn('OpenAI question generation failed, using local fallback:', error.message);
    dynamicQuestions = [];
  }

  const strictDynamicCandidates = prioritizeQuestionsBySignals(
    buildDynamicCandidates(dynamicQuestions, history, 'strict'),
    topMajors,
    history,
    answerSignals,
    []
  );

  selectedQuestions = fillMissingCategories(
    selectedQuestions,
    strictDynamicCandidates,
    topMajors,
    history,
    answerSignals,
    5,
    totalTarget
  );

  selectedQuestions = fillRemainingQuestions(
    selectedQuestions,
    strictDynamicCandidates,
    topMajors,
    history,
    answerSignals,
    totalTarget
  );

  // If strict filtering removes too much, reuse the same OpenAI result in relaxed
  // mode instead of making another network call.
  if (selectedQuestions.length < totalTarget) {
    const relaxedDynamicCandidates = prioritizeQuestionsBySignals(
      buildDynamicCandidates(dynamicQuestions, history, 'relaxed'),
      topMajors,
      history,
      answerSignals,
      selectedQuestions
    ).filter(
      (candidate) =>
        !selectedQuestions.some(
          (selected) => selected.similarityKey === candidate.similarityKey
        )
    );

    selectedQuestions = fillMissingCategories(
      selectedQuestions,
      relaxedDynamicCandidates,
      topMajors,
      history,
      answerSignals,
      5,
      totalTarget
    );

    selectedQuestions = fillRemainingQuestions(
      selectedQuestions,
      relaxedDynamicCandidates,
      topMajors,
      history,
      answerSignals,
      totalTarget
    );
  }

  // Database questions are a fast fallback to guarantee the page opens even if
  // OpenAI is slow, unavailable, or returns too few valid questions.
  if (selectedQuestions.length < totalTarget) {
    const staticPool = prioritizeQuestionsBySignals(
      await getStaticQuestionPool(),
      topMajors,
      history,
      answerSignals,
      selectedQuestions
    ).filter(
      (candidate) =>
        !history.exactQuestionIds.has(Number(candidate.id)) &&
        !isTooSimilarToPreviousQuestions(candidate.questionText, history) &&
        !selectedQuestions.some((selected) => selected.similarityKey === candidate.similarityKey)
    );

    selectedQuestions = fillMissingCategories(
      selectedQuestions,
      staticPool,
      topMajors,
      history,
      answerSignals,
      5,
      totalTarget
    );

    selectedQuestions = fillRemainingQuestions(
      selectedQuestions,
      staticPool,
      topMajors,
      history,
      answerSignals,
      totalTarget
    );
  }

  if (selectedQuestions.length < totalTarget) {
    const fallbackPool = (FALLBACK_QUESTIONS || [])
      .map((question, index) =>
        buildQuestionProfile({
          id: null,
          questionText: question.questionText,
          category: normalizeCategory(question.category),
          questionType: question.questionType || 'multiple-choice',
          questionOrder: index + 1,
          options: question.options || [],
          source: 'fallback'
        })
      )
      .filter(validateQuestion)
      .filter(
        (candidate) =>
          !selectedQuestions.some((selected) => selected.similarityKey === candidate.similarityKey)
      );

    selectedQuestions = emergencyFillToTarget(selectedQuestions, fallbackPool, totalTarget);
  }

  selectedQuestions = selectedQuestions.slice(0, totalTarget).map((question, index) => ({
    ...question,
    questionOrder: index + 1
  }));

  const strongestMajorSignals = {
    topMajors: topMajors.slice(0, 3),
    answerSignals
  };

  const sessionId = await createAssessmentSession(userId, strongestMajorSignals);
  const savedSessionQuestionsMap = await saveSessionQuestions(sessionId, selectedQuestions);

  return {
    sessionId,
    questions: formatSelectedQuestions(selectedQuestions, savedSessionQuestionsMap)
  };
}

const DIVERSE_FAST_QUESTION_BANK = [
  {
    questionText: 'Which subject area sounds most worth exploring for a full semester?',
    category: 'Interests',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Software, algorithms, and digital systems', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'Human health, biology, and patient care', score: 2, targetMajor: 'Medicine' },
      { optionText: 'Markets, management, and business growth', score: 2, targetMajor: 'Business Administration' },
      { optionText: 'Visual communication, products, and user experience', score: 2, targetMajor: 'UI/UX Design' }
    ]
  },
  {
    questionText: 'Imagine your university offers a weekend workshop. Which one would you join first?',
    category: 'Interests',
    questionType: 'scenario',
    options: [
      { optionText: 'Build a simple mobile application', score: 2, targetMajor: 'Software Engineering' },
      { optionText: 'Practice basic medical case analysis', score: 2, targetMajor: 'Medicine' },
      { optionText: 'Create a startup pitch for investors', score: 2, targetMajor: 'Entrepreneurship' },
      { optionText: 'Design a prototype for a student service', score: 2, targetMajor: 'Product Design' }
    ]
  },
  {
    questionText: 'What kind of content would you choose to watch when you want to learn something new?',
    category: 'Interests',
    questionType: 'preference',
    options: [
      { optionText: 'Technology tutorials and coding examples', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'Psychology, behavior, and mental health topics', score: 2, targetMajor: 'Psychology' },
      { optionText: 'Finance, economics, and business analysis', score: 2, targetMajor: 'Economics' },
      { optionText: 'Design process, branding, and creative work', score: 2, targetMajor: 'Fine Arts' }
    ]
  },
  {
    questionText: 'I enjoy understanding how complex systems work behind the scenes.',
    category: 'Interests',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Communications' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Marketing' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Agree', score: 3, targetMajor: 'Software Engineering' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Computer Science' }
    ]
  },
  {
    questionText: 'Which problem would naturally make you curious enough to investigate it?',
    category: 'Interests',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Why an application crashes or behaves incorrectly', score: 2, targetMajor: 'Software Engineering' },
      { optionText: 'Why a patient or community faces a health risk', score: 2, targetMajor: 'Biology' },
      { optionText: 'Why a product is losing customers', score: 2, targetMajor: 'Marketing' },
      { optionText: 'Why users find a website confusing', score: 2, targetMajor: 'UI/UX Design' }
    ]
  },
  {
    questionText: 'Which skill feels strongest or easiest for you right now?',
    category: 'Skills',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Breaking problems into logical steps', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'Understanding people and emotions', score: 2, targetMajor: 'Psychology' },
      { optionText: 'Comparing numbers, costs, and benefits', score: 2, targetMajor: 'Accounting' },
      { optionText: 'Creating clear visual layouts', score: 2, targetMajor: 'Product Design' }
    ]
  },
  {
    questionText: 'Suppose a group project is stuck. Which task would you handle best?',
    category: 'Skills',
    questionType: 'scenario',
    options: [
      { optionText: 'Find the technical error and test a solution', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Interview people to understand the real need', score: 2, targetMajor: 'Psychology' },
      { optionText: 'Organize the plan, timeline, and responsibilities', score: 2, targetMajor: 'Business Management' },
      { optionText: 'Redesign the presentation or prototype', score: 2, targetMajor: 'UI/UX Design' }
    ]
  },
  {
    questionText: 'Which type of challenge would you rather practice more often?',
    category: 'Skills',
    questionType: 'preference',
    options: [
      { optionText: 'Solving logic and programming challenges', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'Analyzing health or science case studies', score: 2, targetMajor: 'Research Sciences' },
      { optionText: 'Building persuasive messages and campaigns', score: 2, targetMajor: 'Marketing' },
      { optionText: 'Making prototypes easier and more attractive', score: 2, targetMajor: 'Product Design' }
    ]
  },
  {
    questionText: 'I can stay focused when a task requires careful analysis.',
    category: 'Skills',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Fine Arts' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Communications' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Business Administration' },
      { optionText: 'Agree', score: 3, targetMajor: 'Data Science' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Engineering' }
    ]
  },
  {
    questionText: 'Which school assignment would you probably complete with the best quality?',
    category: 'Skills',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'A technical explanation with diagrams and steps', score: 2, targetMajor: 'Engineering' },
      { optionText: 'A report about human behavior or social needs', score: 2, targetMajor: 'Psychology' },
      { optionText: 'A budget, market, or business analysis', score: 2, targetMajor: 'Economics' },
      { optionText: 'A visual poster, interface, or media concept', score: 2, targetMajor: 'Communications' }
    ]
  },
  {
    questionText: 'Which working environment would fit you best?',
    category: 'Work Style',
    questionType: 'preference',
    options: [
      { optionText: 'A quiet place for deep technical focus', score: 2, targetMajor: 'Software Engineering' },
      { optionText: 'A people-centered place with direct interaction', score: 2, targetMajor: 'Psychology' },
      { optionText: 'A structured office with clear business goals', score: 2, targetMajor: 'Business Administration' },
      { optionText: 'A creative studio where ideas change quickly', score: 2, targetMajor: 'UI/UX Design' }
    ]
  },
  {
    questionText: 'Your team has one week to finish a project. What role would you take?',
    category: 'Work Style',
    questionType: 'scenario',
    options: [
      { optionText: 'Build the technical part and test it', score: 2, targetMajor: 'Software Engineering' },
      { optionText: 'Collect evidence and check accuracy', score: 2, targetMajor: 'Research Sciences' },
      { optionText: 'Coordinate people and track progress', score: 2, targetMajor: 'Business Management' },
      { optionText: 'Prepare the visuals and user experience', score: 2, targetMajor: 'Product Design' }
    ]
  },
  {
    questionText: 'I prefer clear goals, organized steps, and measurable progress.',
    category: 'Work Style',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Fine Arts' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Communications' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Marketing' },
      { optionText: 'Agree', score: 3, targetMajor: 'Business Management' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Accounting' }
    ]
  },
  {
    questionText: 'How would you prefer to start an unfamiliar assignment?',
    category: 'Work Style',
    questionType: 'preference',
    options: [
      { optionText: 'Research examples and understand the logic first', score: 2, targetMajor: 'Data Science' },
      { optionText: 'Talk to people and understand their needs first', score: 2, targetMajor: 'Psychology' },
      { optionText: 'Create a plan, deadline, and task list first', score: 2, targetMajor: 'Business Management' },
      { optionText: 'Sketch ideas and test visual directions first', score: 2, targetMajor: 'Product Design' }
    ]
  },
  {
    questionText: 'In a group discussion, which contribution would come most naturally to you?',
    category: 'Work Style',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Pointing out technical risks and solutions', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Making sure everyone feels heard', score: 2, targetMajor: 'Social Work' },
      { optionText: 'Connecting the idea to business value', score: 2, targetMajor: 'Entrepreneurship' },
      { optionText: 'Improving how the idea is presented', score: 2, targetMajor: 'Communications' }
    ]
  },
  {
    questionText: 'What kind of future career impact sounds best to you?',
    category: 'Future Goals',
    questionType: 'preference',
    options: [
      { optionText: 'Creating technology that many people use', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'Improving health, safety, or wellbeing', score: 2, targetMajor: 'Medicine' },
      { optionText: 'Growing companies and leading teams', score: 2, targetMajor: 'Business Administration' },
      { optionText: 'Designing experiences that feel clear and useful', score: 2, targetMajor: 'UI/UX Design' }
    ]
  },
  {
    questionText: 'Imagine yourself five years after graduation. Which achievement would satisfy you most?',
    category: 'Future Goals',
    questionType: 'scenario',
    options: [
      { optionText: 'You built a reliable product or system', score: 2, targetMajor: 'Software Engineering' },
      { optionText: 'You helped people solve serious life or health problems', score: 2, targetMajor: 'Medicine' },
      { optionText: 'You helped a business expand successfully', score: 2, targetMajor: 'Marketing' },
      { optionText: 'You created a strong design portfolio', score: 2, targetMajor: 'Product Design' }
    ]
  },
  {
    questionText: 'I want a career where continuous learning is part of the job.',
    category: 'Future Goals',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Accounting' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Business Administration' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Economics' },
      { optionText: 'Agree', score: 3, targetMajor: 'Data Science' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Computer Science' }
    ]
  },
  {
    questionText: 'Which long-term path would you choose if all options were available?',
    category: 'Future Goals',
    questionType: 'preference',
    options: [
      { optionText: 'Become a specialist in a technical field', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Work directly with people and support their needs', score: 2, targetMajor: 'Psychology' },
      { optionText: 'Manage projects, teams, or business operations', score: 2, targetMajor: 'Business Management' },
      { optionText: 'Build a creative career around design or media', score: 2, targetMajor: 'Fine Arts' }
    ]
  },
  {
    questionText: 'If you had to pick a final university project, which one sounds strongest?',
    category: 'Future Goals',
    questionType: 'scenario',
    options: [
      { optionText: 'An AI tool that solves a student problem', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'A public health awareness solution', score: 2, targetMajor: 'Medicine' },
      { optionText: 'A business plan for a real startup idea', score: 2, targetMajor: 'Entrepreneurship' },
      { optionText: 'A complete prototype for a digital product', score: 2, targetMajor: 'UI/UX Design' }
    ]
  }
];

const FAST_LOCAL_QUESTION_BANK = [
  {
    "questionText": "Which university topic would make you read extra material without being asked?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of documentary would you choose during a free evening?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which student club activity would attract your attention first?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What problem in society would you like to understand more deeply?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which magazine section would you open before the others?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What type of public lecture sounds most worth attending?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which project theme would keep your curiosity active for weeks?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What subject would you enjoy discussing with a teacher after class?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which online course title would you save for later study?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What type of competition would you be excited to join?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which research topic would you search for on your own?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What campus exhibition would you spend the most time exploring?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which field would you follow even without an exam grade?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of real-world issue makes you ask many questions?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which elective course sounds most enjoyable for one semester?",
    "category": "Interests",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine your university offers one special lab visit. Which visit would you select?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose you can interview one professional for a class project. Who would interest you most?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If you had a free weekend for learning, which activity would you start?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a career fair, which booth would you visit first?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine a teacher lets you choose a final report topic. Which direction fits you?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose your friend asks for a podcast recommendation. Which theme would you suggest?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If a museum had four new sections, which section would you explore first?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a school innovation day, which demonstration would pull you in?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine you could subscribe to one expert newsletter. Which one would you choose?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose a scholarship required a personal interest essay. Which topic would feel natural?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If you joined a summer academy, which track would you prefer to attend?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a group brainstorming session, which idea would excite you most?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine you could shadow someone at work for one day. Which area sounds best?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose your class opens a debate topic list. Which topic would you pick?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If you were choosing a YouTube learning playlist, which playlist would you start?",
    "category": "Interests",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which learning theme sounds best for your personal curiosity?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which topic would you rather explore in your own time?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which option appeals most when you think about future study?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What subject would you prefer to learn through projects?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which field would you choose for a long independent presentation?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which theme sounds most exciting for a university assignment?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which area would you rather discuss with classmates?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Programming tools, apps, and digital systems",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Health, biology, and patient wellbeing",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Markets, companies, and business strategy",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Visual design, products, and user experience",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which direction best matches what you enjoy reading about?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Artificial intelligence and smart technology",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Human behavior and mental health topics",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Money, finance, and economic decisions",
        "score": 2,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Media, branding, and creative storytelling",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which activity would you choose if grades did not matter?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Robotics, devices, and engineering systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Labs, experiments, and scientific discovery",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Startups, leadership, and new ventures",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Architecture, spaces, and visual concepts",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which topic sounds like something you could follow for years?",
    "category": "Interests",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Cybersecurity, networks, and safe software",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Community service and social support",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Accounting, budgets, and financial reports",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Illustration, animation, and digital art",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I enjoy discovering how new ideas can solve everyday problems.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I am curious about subjects that connect theory with real life.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I like learning topics that explain why people or systems behave differently.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I enjoy exploring fields that combine knowledge with practical impact.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I am motivated by subjects that keep changing and improving.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I like asking questions that lead to deeper investigation.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I enjoy comparing different explanations before choosing one.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I am interested in topics that can help communities or users.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I like learning when examples show clear real-world value.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I enjoy subjects that allow both creativity and structured thinking.",
    "category": "Interests",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Computer Science"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which task do you usually complete with the most confidence?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What type of assignment would show your strengths clearly?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which classroom responsibility would classmates trust you with?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of challenge feels easiest for you to improve?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which problem-solving activity matches your current ability best?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What school task would you finish with the least stress?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which skill would you use first when a project becomes difficult?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of feedback do people often ask you to provide?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which practical exercise would help you demonstrate your talent?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What type of mistake are you most likely to notice quickly?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which group role depends most on your strongest skill?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What activity would you practice even if it took extra effort?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which exam question style usually feels most comfortable?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of project evidence would you collect best?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which ability would you like to turn into a career skill?",
    "category": "Skills",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine a team project is falling behind schedule. Which task would you handle?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose a classmate cannot understand a topic. How would you help best?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If a project has many confusing details, which action would you take first?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a presentation deadline, which responsibility would fit your strengths?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine your teacher asks for a quick solution plan. What would you contribute?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose your group receives critical feedback. Which fix would you lead?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If you had to learn a new tool quickly, which approach would you use?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a research assignment, which part would you manage most effectively?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine a prototype fails during testing. Which response would suit you?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose your team needs evidence for a decision. What would you do?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If a client changes requirements, which skill would help you adapt?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a workshop, which hands-on task would you volunteer for?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine an exam includes an unfamiliar case. How would you attack it?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose a student club needs support. Which contribution would be strongest?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If your group needs a final review, which area would you check first?",
    "category": "Skills",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which ability would you prefer to develop through daily practice?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which challenge would you rather solve when working alone?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which skill area sounds best for a training workshop?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What task would you choose to prove your readiness?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which strength would you prefer to use in a team?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which practical exercise sounds most useful for your growth?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which ability would you rather improve before university graduation?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Breaking a complex problem into logical steps",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Understanding people and responding with empathy",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Comparing numbers, costs, and evidence",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Creating clear layouts and visual explanations",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which skill best matches how you solve problems now?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Debugging errors and testing solutions",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Observing details in health or science cases",
        "score": 2,
        "targetMajor": "Biology"
      },
      {
        "optionText": "Planning timelines, roles, and priorities",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Writing persuasive messages for an audience",
        "score": 2,
        "targetMajor": "Marketing"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What type of work would you choose to build a portfolio?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Using data to find patterns and predictions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Explaining ideas patiently to different people",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Negotiating decisions and organizing resources",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Sketching concepts and improving prototypes",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which capability sounds most valuable for your future major?",
    "category": "Skills",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Building practical tools with careful accuracy",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Researching causes and checking reliable sources",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Presenting ideas clearly in speech or media",
        "score": 2,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Designing creative work with strong detail",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I can stay patient when a problem requires several steps.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I learn faster when I can test an idea in practice.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I notice details that other people may miss.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I can organize information before making a decision.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I explain complex ideas better after breaking them into parts.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I stay focused when feedback requires me to improve my work.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I can compare options carefully before choosing a solution.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I am comfortable learning tools that require practice and repetition.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I can turn unclear instructions into a workable plan.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I improve most when I receive specific evidence about my mistakes.",
    "category": "Skills",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Communications"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which work setting would help you perform at your best?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of daily routine would keep you productive?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which project structure would reduce stress for you?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What type of teammate role fits your natural style?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which environment would help you focus for several hours?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What meeting format would make you contribute more clearly?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which deadline style would help you stay organized?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of workplace culture sounds comfortable for you?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which collaboration method would you use most effectively?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What type of workspace would make your ideas stronger?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which planning method would you naturally follow?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of supervisor feedback would motivate you most?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which team rhythm would match your working habits?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What task schedule would help you avoid confusion?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which work condition would make you feel most confident?",
    "category": "Work Style",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine your team has one week to complete a serious assignment. What role fits you?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose a project meeting becomes disorganized. How would you respond?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If a deadline suddenly moves earlier, which action would you take first?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a long task, how would you keep progress under control?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine two teammates disagree about the next step. What would you do?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose your group receives too many ideas. Which method would you use?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If you are assigned a difficult independent task, how would you start?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a busy week, which work habit would protect your performance?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine a client asks for changes after the first draft. How would you work?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose your team needs someone to present progress. Which role would you take?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If a tool or process stops working, how would you adjust your plan?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During an open-ended project, which structure would you create first?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine your group has mixed skill levels. How would you support progress?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose a task requires both accuracy and speed. What would you prioritize?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If your workplace changes direction, which response would fit your style?",
    "category": "Work Style",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which working style would you prefer for a semester project?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which team role would you rather take when pressure increases?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which schedule sounds best for keeping your motivation stable?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of collaboration would you choose for complex work?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which feedback method would you prefer from an instructor?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which work rhythm best matches your energy during the day?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which planning approach would you rather use for a big assignment?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Quiet technical focus with clear problem solving",
        "score": 2,
        "targetMajor": "Software Engineering"
      },
      {
        "optionText": "Direct interaction with people and their needs",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Structured planning with measurable targets",
        "score": 2,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Creative brainstorming with visual experiments",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which responsibility sounds most comfortable in a group?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Independent analysis and testing before decisions",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Team discussions that include emotions and context",
        "score": 2,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Organized meetings, deadlines, and responsibilities",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Fast design iterations and feedback cycles",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which workplace style appeals most when thinking about your future?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Precise procedures, tools, and technical standards",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Careful observation and evidence collection",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Campaign planning and communication with clients",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Studio-style work with concepts and visuals",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which task environment would you choose for your strongest performance?",
    "category": "Work Style",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Secure systems, documentation, and risk control",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Helping environments with personal support",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Financial tracking and accurate reporting",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Public-facing content and media production",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I work better when goals and expectations are clear.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I can stay productive when a project changes direction.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I prefer checking progress before moving to the next step.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I communicate better when the team has a clear structure.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I like balancing independent focus with useful team feedback.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I stay calmer when I can organize tasks before starting.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I work well when people share responsibilities fairly.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I can adapt when a plan needs to be revised quickly.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I prefer environments where quality matters more than speed alone.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I like work that gives me room to think before responding.",
    "category": "Work Style",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Fine Arts"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Social Work"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Marketing"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Business Management"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Accounting"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which career outcome would make you feel most proud?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What long-term contribution sounds meaningful to you?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which achievement would you like to show after graduation?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What type of professional identity would fit you best?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which future responsibility sounds worth preparing for?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What impact would you like your work to have?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which career path would motivate you during difficult courses?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of problem would you like your profession to solve?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which future workplace result would satisfy you most?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What achievement would make your university years feel useful?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which career story would you like to tell in ten years?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What kind of expert would you like others to see you as?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which long-term mission would keep you learning?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What future project would you be excited to lead?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which professional goal sounds closest to your ambition?",
    "category": "Future Goals",
    "questionType": "multiple-choice",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine you are five years after graduation. Which success feels most valuable?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose you receive a chance to lead one major project. Which project would you choose?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If you could build your first professional portfolio, what would it show?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a job interview, which achievement would you want to describe?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine your work can help one group of people. Who would you focus on?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose a company offers you four growth paths. Which path fits you?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If you started a final-year graduation project, which direction would you take?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During your first job, which responsibility would make you feel motivated?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine you can solve one important future problem. Which one would you select?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose you are choosing between internships. Which opportunity sounds best?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If your career required continuous learning, which area would you accept?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "During a professional conference, which talk would you be proud to give?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Imagine your name appears on a successful project. What kind of project is it?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Suppose you mentor younger students later. Which advice area fits you?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "If you could specialize deeply in one direction, which direction would you choose?",
    "category": "Future Goals",
    "questionType": "scenario",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which future goal would you prefer to work toward every year?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which career impact sounds best for your personality?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which long-term path would you rather build step by step?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "What professional role would you choose if all options were open?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which achievement appeals most when imagining your future?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which mission would you prefer your career to support?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which future skill set sounds best for your life plans?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Build reliable technology used by many people",
        "score": 2,
        "targetMajor": "Computer Science"
      },
      {
        "optionText": "Improve health, safety, and quality of life",
        "score": 2,
        "targetMajor": "Medicine"
      },
      {
        "optionText": "Lead organizations and grow business value",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Create useful digital products and experiences",
        "score": 2,
        "targetMajor": "UI/UX Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which workplace outcome would you rather be known for?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Become an expert in AI, data, or automation",
        "score": 2,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Support mental wellbeing and human development",
        "score": 2,
        "targetMajor": "Psychology"
      },
      {
        "optionText": "Manage investments, budgets, or economic plans",
        "score": 2,
        "targetMajor": "Finance"
      },
      {
        "optionText": "Shape brands, stories, and public messages",
        "score": 2,
        "targetMajor": "Communications"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which professional challenge would you choose to master?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Design machines, infrastructure, or practical systems",
        "score": 2,
        "targetMajor": "Engineering"
      },
      {
        "optionText": "Contribute to science through research and discovery",
        "score": 2,
        "targetMajor": "Research Sciences"
      },
      {
        "optionText": "Launch a startup or improve a market solution",
        "score": 2,
        "targetMajor": "Entrepreneurship"
      },
      {
        "optionText": "Develop a strong creative portfolio",
        "score": 2,
        "targetMajor": "Fine Arts"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "Which career direction best matches your motivation after graduation?",
    "category": "Future Goals",
    "questionType": "preference",
    "options": [
      {
        "optionText": "Protect digital information and reduce security risks",
        "score": 2,
        "targetMajor": "Cybersecurity"
      },
      {
        "optionText": "Teach, guide, or support learners effectively",
        "score": 2,
        "targetMajor": "Education"
      },
      {
        "optionText": "Create accurate reports for financial decisions",
        "score": 2,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Design physical or digital products people enjoy",
        "score": 2,
        "targetMajor": "Product Design"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I want a career that keeps me learning new things.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I am motivated by work that creates visible value for others.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I prefer a future path with room for growth and specialization.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I want my studies to connect clearly with real career options.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I am willing to practice difficult skills for a meaningful goal.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I like imagining how today’s choices affect my future opportunities.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I want a profession where my strengths can become useful expertise.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I am motivated by projects that could continue improving over time.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I prefer a career path where effort can build a strong portfolio.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  },
  {
    "questionText": "I want my future work to match both ability and personal interest.",
    "category": "Future Goals",
    "questionType": "likert",
    "options": [
      {
        "optionText": "Strongly Disagree",
        "score": 0,
        "targetMajor": "Accounting"
      },
      {
        "optionText": "Disagree",
        "score": 1,
        "targetMajor": "Economics"
      },
      {
        "optionText": "Neutral",
        "score": 2,
        "targetMajor": "Business Administration"
      },
      {
        "optionText": "Agree",
        "score": 3,
        "targetMajor": "Data Science"
      },
      {
        "optionText": "Strongly Agree",
        "score": 4,
        "targetMajor": "Software Engineering"
      }
    ],
    "source": "fast-local-220-bank"
  }
];

function variantQuestionText(questionText = '', variantIndex = 0) {
  const clean = String(questionText).trim().replace(/s+/g, ' ');
  const lower = clean.charAt(0).toLowerCase() + clean.slice(1);

  const variants = [
    clean,
    `For this new attempt, which option best fits you: ${lower}`,
    `Right now, choose the answer that feels most accurate: ${lower}`,
    `Thinking about your future major, ${lower}`,
    `In a real study or career situation, ${lower}`
  ];

  return variants[Math.abs(Number(variantIndex || 0)) % variants.length];
}

function sessionSeed(userId) {
  return Number(Date.now()) + Number(userId || 0) * 997;
}

function seededShuffle(items, seedValue = Date.now()) {
  const array = [...items];
  let seed = Number(seedValue) || Date.now();

  function random() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

function buildExpandedFastPool(baseQuestions = [], history = {}, seedValue = Date.now()) {
  const seen = new Set();
  const expanded = [];

  seededShuffle(baseQuestions, seedValue).forEach((baseQuestion, index) => {
    const profile = buildQuestionProfile({
      ...baseQuestion,
      questionText: String(baseQuestion.questionText || '').trim(),
      questionOrder: index + 1,
      source: baseQuestion.source || 'fast-local'
    });

    if (!validateQuestion(profile)) return;
    if (seen.has(profile.similarityKey)) return;

    seen.add(profile.similarityKey);
    expanded.push(profile);
  });

  const neverAsked = expanded.filter((candidate) => !isTooSimilarToPreviousQuestions(candidate.questionText, history));
  return neverAsked.length >= 20 ? neverAsked : expanded;
}



function getHistoryUsageIndex(history = {}) {
  const usage = new Map();
  const rows = Array.isArray(history.rows) ? history.rows : [];

  // rows are ordered newest first. A lower index means more recent.
  rows.forEach((row, index) => {
    const key = row.similarity_key || buildSimilarityKey(row.question_text_snapshot || '');
    if (key && !usage.has(key)) usage.set(key, index);
  });

  return usage;
}

function pickBalancedNonRepeatingQuestions(candidatePool = [], history = {}, seedValue = Date.now(), targetPerCategory = 5) {
  const categories = ['Interests', 'Skills', 'Work Style', 'Future Goals'];
  const historyKeys = history.similarityKeys || new Set();
  const usageIndex = getHistoryUsageIndex(history);
  const attemptNumber = Math.floor((Array.isArray(history.rows) ? history.rows.length : 0) / 20);
  const selected = [];
  const usedKeys = new Set();

  const normalizedPool = seededShuffle(candidatePool, seedValue)
    .map((question, index) => buildQuestionProfile({
      ...question,
      category: normalizeCategory(question.category),
      questionType: normalizeQuestionTypeForStorage(question.questionType || 'multiple-choice'),
      questionOrder: index + 1,
      source: question.source || 'fast-local'
    }))
    .filter(validateQuestion);

  for (const category of categories) {
    const categoryPool = normalizedPool.filter((question) => normalizeCategory(question.category) === category);
    const neverAsked = categoryPool.filter((question) => !historyKeys.has(question.similarityKey) && !isTooSimilarToPreviousQuestions(question.questionText, history));

    // If there are enough unseen questions in this category, use only unseen.
    // If the user has exhausted that category, rotate through older seen questions first.
    let sourcePool = neverAsked.length >= targetPerCategory
      ? neverAsked
      : [
          ...neverAsked,
          ...categoryPool
            .filter((question) => !neverAsked.some((item) => item.similarityKey === question.similarityKey))
            .sort((a, b) => (usageIndex.get(b.similarityKey) ?? -1) - (usageIndex.get(a.similarityKey) ?? -1))
        ];

    // Rotate the start point each attempt so even after exhausting the pool the same 20 do not appear together.
    if (sourcePool.length > targetPerCategory) {
      const offset = (attemptNumber * targetPerCategory) % sourcePool.length;
      sourcePool = [...sourcePool.slice(offset), ...sourcePool.slice(0, offset)];
    }

    for (const question of sourcePool) {
      if (selected.length >= categories.length * targetPerCategory) break;
      if (usedKeys.has(question.similarityKey)) continue;
      const categorySelected = selected.filter((item) => normalizeCategory(item.category) === category).length;
      if (categorySelected >= targetPerCategory) break;

      selected.push({
        ...question,
        questionOrder: selected.length + 1,
        source: question.source || 'fast-local-rotating'
      });
      usedKeys.add(question.similarityKey);
    }
  }

  return selected.slice(0, categories.length * targetPerCategory).map((question, index) => ({
    ...question,
    questionOrder: index + 1
  }));
}

function normalizePreparedQuestions(rawQuestions = []) {
  return rawQuestions
    .map((question, index) =>
      buildQuestionProfile({
        id: null,
        questionText: String(question.questionText || '').trim(),
        category: normalizeCategory(question.category),
        questionType: normalizeQuestionTypeForStorage(question.questionType || 'multiple-choice'),
        questionOrder: index + 1,
        options: (question.options || []).map((option, optionIndex) => ({
          id: null,
          optionText: String(option.optionText || '').trim(),
          score: Number(option.score ?? optionIndex),
          targetMajor: String(option.targetMajor || '').trim(),
          optionOrder: Number(option.optionOrder || optionIndex + 1)
        })),
        source: question.source || 'openai-prepared'
      })
    )
    .filter(validateQuestion);
}

function orderPreparedQuestions(questions = []) {
  const categories = ['Interests', 'Skills', 'Work Style', 'Future Goals'];
  const targetPerCategory = 5;
  const result = [];
  const usedKeys = new Set();

  for (const category of categories) {
    const items = questions.filter(
      (question) => normalizeCategory(question.category) === category && !usedKeys.has(question.similarityKey)
    );

    const preferredTypeOrder = ['multiple-choice', 'scenario', 'preference', 'likert'];
    const categorySelection = [];

    for (const type of preferredTypeOrder) {
      const candidate = items.find(
        (question) =>
          normalizeQuestionTypeForStorage(question.questionType) === type &&
          !usedKeys.has(question.similarityKey) &&
          !categorySelection.some((selected) => selected.similarityKey === question.similarityKey) &&
          isSemanticallyDistinctFromSelected(question, result.concat(categorySelection))
      );

      if (candidate && categorySelection.length < targetPerCategory) {
        categorySelection.push(candidate);
        usedKeys.add(candidate.similarityKey);
      }
    }

    for (const question of items) {
      if (categorySelection.length >= targetPerCategory) break;
      if (usedKeys.has(question.similarityKey)) continue;
      if (!isSemanticallyDistinctFromSelected(question, result.concat(categorySelection))) continue;
      categorySelection.push(question);
      usedKeys.add(question.similarityKey);
    }

    result.push(...categorySelection.slice(0, targetPerCategory));
  }

  return result.slice(0, 20).map((question, index) => ({
    ...question,
    questionOrder: index + 1
  }));
}

function mergeUniqueQuestionCandidates(candidateGroups = []) {
  const usedKeys = new Set();
  const merged = [];

  for (const group of candidateGroups) {
    for (const question of Array.isArray(group) ? group : []) {
      const key = question.similarityKey || buildSimilarityKey(question.questionText);
      if (!key || usedKeys.has(key)) continue;
      merged.push({
        ...question,
        similarityKey: key
      });
      usedKeys.add(key);
    }
  }

  return merged;
}

async function buildLocalPreparedSupplementPool(userId, history = {}) {
  const seed = sessionSeed(userId) + 701;
  const staticPool = await getStaticQuestionPool().catch(() => []);
  const rawLocalPool = [
    ...(DIVERSE_FAST_QUESTION_BANK || []),
    ...(FAST_LOCAL_QUESTION_BANK || []),
    ...(staticPool || []),
    ...(FALLBACK_QUESTIONS || [])
  ];

  const seenKeys = new Set();
  const normalizedPool = seededShuffle(rawLocalPool, seed)
    .map((question, index) =>
      buildQuestionProfile({
        ...question,
        id: question.id || null,
        questionText: String(question.questionText || question.question_text || '').trim(),
        category: normalizeCategory(question.category),
        questionType: normalizeQuestionTypeForStorage(question.questionType || question.question_type || 'multiple-choice'),
        questionOrder: index + 1,
        options: question.options || [],
        source: question.source || 'local-prepared-supplement'
      })
    )
    .filter(validateQuestion)
    .filter((question) => {
      const key = question.similarityKey || buildSimilarityKey(question.questionText);
      if (!key || seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

  const historyKeys = history.similarityKeys || new Set();
  const usageIndex = getHistoryUsageIndex(history);

  const fresh = normalizedPool.filter(
    (question) => !historyKeys.has(question.similarityKey) && !isTooSimilarToPreviousQuestions(question.questionText, history)
  );

  const lru = normalizedPool
    .filter((question) => !fresh.some((freshQuestion) => freshQuestion.similarityKey === question.similarityKey))
    // rows are newest first, so a larger index is older and safer to reuse.
    .sort((a, b) => (usageIndex.get(b.similarityKey) ?? -1) - (usageIndex.get(a.similarityKey) ?? -1));

  return [...fresh, ...lru];
}

async function completePreparedSetWithLocalFallback({
  userId,
  selectedQuestions = [],
  history = {},
  topMajors = [],
  answerSignals = {},
  totalTarget = 20
}) {
  const targetPerCategory = totalTarget / 4;
  const baseSelected = orderPreparedQuestions(
    mergeUniqueQuestionCandidates([selectedQuestions])
      .map((question, index) => ({
        ...question,
        questionOrder: index + 1,
        source: question.source || 'openai-prepared'
      }))
  );

  if (isSafePreparedQuestionSet(baseSelected, totalTarget)) {
    return baseSelected;
  }

  const localSupplementPool = await buildLocalPreparedSupplementPool(userId, history);
  const prioritizedSupplementPool = prioritizeQuestionsBySignals(
    mergeUniqueQuestionCandidates([localSupplementPool]),
    topMajors,
    history,
    answerSignals,
    baseSelected
  );

  let repaired = fillMissingCategories(
    baseSelected,
    prioritizedSupplementPool,
    topMajors,
    history,
    answerSignals,
    targetPerCategory,
    totalTarget
  );

  repaired = fillRemainingQuestions(
    repaired,
    prioritizedSupplementPool,
    topMajors,
    history,
    answerSignals,
    totalTarget
  );

  if (repaired.length < totalTarget) {
    repaired = emergencyFillToTarget(repaired, prioritizedSupplementPool, totalTarget);
  }

  repaired = repairQuestionTypeDiversity(
    repaired,
    prioritizedSupplementPool,
    topMajors,
    history,
    answerSignals,
    totalTarget
  );

  return orderPreparedQuestions(repaired).slice(0, totalTarget).map((question, index) => ({
    ...question,
    questionOrder: index + 1,
    source: question.source || 'hybrid-openai-local-prepared'
  }));
}

function hasLocalPreparedSupplement(questions = []) {
  return (Array.isArray(questions) ? questions : []).some((question) =>
    String(question.source || '').includes('local') ||
    String(question.source || '').includes('fast') ||
    String(question.source || '').includes('fallback') ||
    String(question.source || '').includes('db')
  );
}

async function hasAnyReadyPreparedSet(userId) {
  await ensurePreparedQuestionsTable();
  const existing = await get(
    `SELECT id, source FROM generated_question_sets WHERE user_id = ? AND status = 'ready' LIMIT 1`,
    [Number(userId)]
  );
  return existing || null;
}

async function ensureImmediateLocalPreparedSet(userId) {
  const numericUserId = Number(userId);
  if (!numericUserId || Number.isNaN(numericUserId)) return false;
  if (!(await userExists(numericUserId))) return false;

  await ensurePreparedQuestionsTable();

  const existingReady = await hasAnyReadyPreparedSet(numericUserId);
  if (existingReady?.id) return true;

  const history = await getUserQuestionHistory(numericUserId);
  const topMajors = await getLatestTopMajors(numericUserId);
  const answerSignals = await getLatestAnswerSignals(numericUserId);

  const selectedQuestions = await completePreparedSetWithLocalFallback({
    userId: numericUserId,
    selectedQuestions: [],
    history,
    topMajors,
    answerSignals,
    totalTarget: 20
  });

  if (!isSafePreparedQuestionSet(selectedQuestions, 20)) {
    console.warn(`[questions] Could not create instant local prepared set for user ${numericUserId}; GET /api/questions will still use direct local fallback.`);
    return false;
  }

  const saved = await savePreparedQuestionSet(
    numericUserId,
    selectedQuestions.map((question) => ({
      ...question,
      source: 'instant-local-prepared'
    })),
    'instant-local-prepared',
    history,
    { allowLocalHistoryFallback: true }
  );

  if (saved) {
    console.log(`[questions] Instant local prepared set is ready for user ${numericUserId}; AI can upgrade it in the background.`);
  }

  return Boolean(saved);
}

function selectPreparedQuestionsFromCandidates(candidates, topMajors, history, answerSignals, totalTarget = 20) {
  const prioritizedCandidates = prioritizeQuestionsBySignals(
    mergeUniqueQuestionCandidates([candidates]),
    topMajors,
    history,
    answerSignals,
    []
  );

  let selectedQuestions = fillMissingCategories(
    [],
    prioritizedCandidates,
    topMajors,
    history,
    answerSignals,
    totalTarget / 4,
    totalTarget
  );

  selectedQuestions = fillRemainingQuestions(
    selectedQuestions,
    prioritizedCandidates,
    topMajors,
    history,
    answerSignals,
    totalTarget
  );

  return orderPreparedQuestions(selectedQuestions).slice(0, totalTarget).map((question, index) => ({
    ...question,
    questionOrder: index + 1,
    source: 'openai-prepared'
  }));
}

function buildPreparedCandidatePool(dynamicQuestions, history, topMajors, answerSignals) {
  const strictCandidates = buildDynamicCandidates(dynamicQuestions, history, 'strict');
  const relaxedCandidates = buildDynamicCandidates(dynamicQuestions, history, 'relaxed');

  return prioritizeQuestionsBySignals(
    mergeUniqueQuestionCandidates([strictCandidates, relaxedCandidates])
      .filter((question) => !isTooSimilarToPreviousQuestions(question.questionText, history)),
    topMajors,
    history,
    answerSignals,
    []
  );
}

async function buildPreparedQuestionSet(userId, preparedSet) {
  // A prepared set was already validated when it was saved. GET /api/questions
  // must stay fast. Do not re-check against the newest history and do not repair
  // it with OpenAI or heavy history queries here; that was the cause of the 2nd
  // or 3rd attempt timing out in the frontend.
  const selectedQuestions = orderPreparedQuestions(normalizePreparedQuestions(preparedSet.questions))
    .slice(0, 20)
    .map((question, index) => ({
      ...question,
      questionOrder: index + 1,
      source: question.source || preparedSet.source || 'prepared-next-session'
    }));

  if (!isSafePreparedQuestionSet(selectedQuestions, 20)) {
    console.warn(
      `[questions] Prepared set ${preparedSet.id} for user ${userId} is invalid at fast consumption; marking invalid and falling back to local.`
    );
    await run(
      `UPDATE generated_question_sets SET status = 'invalid', used_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [preparedSet.id]
    );
    return null;
  }

  const strongestMajorSignals = {
    mode: 'prepared-next-session',
    preparedSetId: preparedSet.id,
    source: preparedSet.source || 'openai-prepared',
    fastConsumed: true
  };

  const sessionId = await createAssessmentSession(userId, strongestMajorSignals);
  const savedSessionQuestionsMap = await saveSessionQuestions(sessionId, selectedQuestions);

  // Only now mark the set used. If creating/saving the session fails, the set
  // remains READY and a refresh can try again instead of falling back to local.
  await markPreparedQuestionSetUsed(preparedSet.id);

  console.log(`[questions] Loaded READY prepared set ${preparedSet.id} for user ${userId} as prepared-next-session.`);

  return {
    sessionId,
    mode: 'prepared-next-session',
    questions: formatSelectedQuestions(selectedQuestions, savedSessionQuestionsMap)
  };
}

const pendingNextQuestionJobs = new Map();

async function prepareNextSessionQuestionSet(userId) {
  const numericUserId = Number(userId);
  if (!numericUserId || Number.isNaN(numericUserId)) return false;

  if (!process.env.OPENAI_API_KEY) {
    console.warn(`[questions] Skipping next-session preparation for user ${numericUserId}: OPENAI_API_KEY is not configured`);
    return false;
  }

  await ensurePreparedQuestionsTable();

  const existingReady = await get(
    `SELECT id, source FROM generated_question_sets WHERE user_id = ? AND status = 'ready' LIMIT 1`,
    [numericUserId]
  );

  if (existingReady?.id && !String(existingReady.source || '').startsWith('instant-local')) {
    console.log(`[questions] Skipping next-session AI preparation for user ${numericUserId}: READY prepared set already exists (${existingReady.id})`);
    return true;
  }

  // Freeze history at the moment generation starts. The user may open another
  // local session while OpenAI is still generating; saving must validate against
  // this snapshot, not against a newer history that OpenAI could not know about.
  const history = await getUserQuestionHistory(numericUserId);
  const topMajors = await getLatestTopMajors(numericUserId);
  const answerSignals = await getLatestAnswerSignals(numericUserId);
  const totalTarget = 20;

  const baseGenerationContext = {
    previousQuestionTexts: history.rows.map((row) => row.question_text_snapshot).filter(Boolean).slice(0, 120),
    previousSimilarityKeys: Array.from(history.similarityKeys).slice(0, 140),
    topMajors: topMajors.slice(0, 3),
    answerSignals,
    nextSessionPreparation: true,
    // Keep the background job fast. We no longer need 40+ questions because
    // the route repairs missing categories/types with the local bank.
    candidateCount: 20
  };

  const dynamicQuestions = await generateDynamicQuestions(baseGenerationContext);
  let candidates = buildPreparedCandidatePool(dynamicQuestions, history, topMajors, answerSignals);

  let selectedQuestions = selectPreparedQuestionsFromCandidates(
    candidates,
    topMajors,
    history,
    answerSignals,
    totalTarget
  );

  selectedQuestions = await completePreparedSetWithLocalFallback({
    userId: numericUserId,
    selectedQuestions,
    history,
    topMajors,
    answerSignals,
    totalTarget
  });

  if (!isSafePreparedQuestionSet(selectedQuestions, totalTarget)) {
    console.warn(
      `[questions] First prepared candidate set incomplete for user ${numericUserId}; retrying with a larger relaxed candidate pool.`,
      JSON.stringify({
        rawGeneratedCount: Array.isArray(dynamicQuestions) ? dynamicQuestions.length : 0,
        validCandidateCount: candidates.length,
        selectedCount: selectedQuestions.length,
        categoryCounts: countQuestionsByCategory(selectedQuestions)
      })
    );

    const retryDynamicQuestions = await generateDynamicQuestions({
      ...baseGenerationContext,
      relaxed: true,
      candidateCount: 20
    });

    const retryCandidates = buildPreparedCandidatePool(retryDynamicQuestions, history, topMajors, answerSignals);
    candidates = mergeUniqueQuestionCandidates([candidates, retryCandidates]);

    selectedQuestions = selectPreparedQuestionsFromCandidates(
      candidates,
      topMajors,
      history,
      answerSignals,
      totalTarget
    );

    selectedQuestions = await completePreparedSetWithLocalFallback({
      userId: numericUserId,
      selectedQuestions,
      history,
      topMajors,
      answerSignals,
      totalTarget
    });
  }

  if (!isSafePreparedQuestionSet(selectedQuestions, totalTarget)) {
    logPreparedValidationFailure(numericUserId, 'final-hybrid-candidate-selection', selectedQuestions, history, {
      mergedCandidateCount: candidates.length
    });
    return false;
  }

  const fullyFresh = isReadyForNextSession(selectedQuestions, history, totalTarget);
  const source = fullyFresh && !hasLocalPreparedSupplement(selectedQuestions)
    ? 'openai-prepared'
    : 'hybrid-openai-local-prepared';

  const saved = await savePreparedQuestionSet(
    numericUserId,
    selectedQuestions,
    source,
    history,
    { allowLocalHistoryFallback: source !== 'openai-prepared' }
  );

  if (saved) {
    console.log(`[questions] Prepared next-session ${source} question set for user ${numericUserId}`);
  }

  return Boolean(saved);
}

function prepareNextSessionQuestionsInBackground(userId) {
  const numericUserId = Number(userId);
  if (!numericUserId || Number.isNaN(numericUserId)) return null;

  // Always create a local READY backup first. This is what makes attempt 3, 4,
  // 5, ... reliable even when OpenAI is slow or already running for this user.
  // It is intentionally independent from OPENAI_API_KEY.
  const instantLocalJob = ensureImmediateLocalPreparedSet(numericUserId).catch((error) => {
    console.warn(`[questions] Failed to create instant local prepared set for user ${numericUserId}:`, error.message);
    return false;
  });

  if (!process.env.OPENAI_API_KEY) return instantLocalJob;

  if (pendingNextQuestionJobs.has(numericUserId)) {
    console.log(`[questions] AI next-session preparation already running for user ${numericUserId}; instant local backup is still ensured.`);
    return instantLocalJob;
  }

  const job = instantLocalJob
    .then(() => prepareNextSessionQuestionSet(numericUserId))
    .catch((error) => {
      console.warn(`[questions] Failed to prepare AI next-session questions for user ${numericUserId}:`, error.message);
      return false;
    })
    .finally(() => {
      pendingNextQuestionJobs.delete(numericUserId);
    });

  pendingNextQuestionJobs.set(numericUserId, job);
  return job;
}

async function buildFastAdaptiveQuestionSet(userId) {
  const history = await getUserQuestionHistory(userId);
  const topMajors = await getLatestTopMajors(userId);
  const answerSignals = await getLatestAnswerSignals(userId);
  const totalTarget = 20;
  const seed = sessionSeed(userId);

  const staticPool = await getStaticQuestionPool();
  const curatedFastPool = ([...(DIVERSE_FAST_QUESTION_BANK || []), ...(FAST_LOCAL_QUESTION_BANK || [])])
    .map((question, index) =>
      buildQuestionProfile({
        id: null,
        questionText: question.questionText,
        category: normalizeCategory(question.category),
        questionType: question.questionType || 'multiple-choice',
        questionOrder: index + 1,
        options: question.options || [],
        source: 'fast-local'
      })
    )
    .filter(validateQuestion);

  const fallbackPool = (FALLBACK_QUESTIONS || [])
    .map((question, index) =>
      buildQuestionProfile({
        id: null,
        questionText: question.questionText,
        category: normalizeCategory(question.category),
        questionType: question.questionType || 'multiple-choice',
        questionOrder: index + 1,
        options: question.options || [],
        source: 'fallback'
      })
    )
    .filter(validateQuestion);

  // Use the curated local bank first so the questionnaire opens instantly and
  // every question matches its answer choices. Database/fallback questions are
  // only backup sources.
  const mergedPool = curatedFastPool.length >= 20
    ? curatedFastPool
    : [...curatedFastPool, ...staticPool, ...fallbackPool];
  // Rotation-first selection: because the local bank has 55 questions per category in total (220 local questions),
  // many attempts can show fresh or least-recently-used questions without repeating the same set.
  // After the bank is exhausted, it rotates through the oldest questions instead of
  // returning the exact same 20 every session.
  const expandedPool = buildExpandedFastPool(mergedPool, history, seed);
  let selectedQuestions = pickBalancedNonRepeatingQuestions(expandedPool, history, seed + 17, 5);

  if (selectedQuestions.length < totalTarget || !hasQuestionTypeDiversity(selectedQuestions)) {
    const prioritizedPool = prioritizeQuestionsBySignals(
      seededShuffle(expandedPool, seed + 31),
      topMajors,
      history,
      answerSignals,
      []
    );

    selectedQuestions = fillMissingCategories(
      selectedQuestions,
      prioritizedPool,
      topMajors,
      history,
      answerSignals,
      5,
      totalTarget
    );

    selectedQuestions = fillRemainingQuestions(
      selectedQuestions,
      prioritizedPool,
      topMajors,
      history,
      answerSignals,
      totalTarget
    );

    if (selectedQuestions.length < totalTarget) {
      selectedQuestions = emergencyFillToTarget(selectedQuestions, prioritizedPool, totalTarget);
    }
  }

  selectedQuestions = selectedQuestions.slice(0, totalTarget).map((question, index) => ({
    ...question,
    questionOrder: index + 1,
    source: question.source || 'fast-adaptive'
  }));

  if (!isLogicalQuestionSet(selectedQuestions, totalTarget) || !hasNoDuplicateQuestionKeys(selectedQuestions) || !hasNoInternalSemanticOverlap(selectedQuestions)) {
    const safeDiversePool = buildExpandedFastPool(DIVERSE_FAST_QUESTION_BANK, history, seed + 101);
    const safeSelection = pickBalancedNonRepeatingQuestions(safeDiversePool, history, seed + 101, 5);

    if (isLogicalQuestionSet(safeSelection, totalTarget) && hasNoDuplicateQuestionKeys(safeSelection) && hasNoInternalSemanticOverlap(safeSelection)) {
      selectedQuestions = safeSelection.map((question, index) => ({
        ...question,
        questionOrder: index + 1,
        source: 'fast-local-validated'
      }));
    }
  }

  if (!isLogicalQuestionSet(selectedQuestions, totalTarget) || !hasNoDuplicateQuestionKeys(selectedQuestions) || !hasNoInternalSemanticOverlap(selectedQuestions)) {
    throw new Error('Question logic validation failed before creating the session');
  }

  // Do not crash the questionnaire when the local bank is exhausted.
  // Non-repeat is guaranteed for the normal flow by using prepared/OpenAI sets.
  // If OpenAI is missing, slow, or rejected, we still return a logical 20-question
  // session using least-recently-used local questions instead of a 500 error.
  const hasHistoryOverlap = history.rows.length > 0 && !hasNoSemanticHistoryOverlap(selectedQuestions, history);
  if (hasHistoryOverlap) {
    console.warn(
      process.env.OPENAI_API_KEY
        ? `[questions] Local fresh pool exhausted for user ${userId}; returning least-recently-used validated local questions because no READY prepared set was available for this request yet.`
        : `[questions] Local fresh pool exhausted for user ${userId}; returning least-recently-used validated local questions. Configure OPENAI_API_KEY to get fully fresh next-session questions.`
    );
  }

  const strongestMajorSignals = {
    topMajors: topMajors.slice(0, 3),
    answerSignals,
    mode: 'fast-adaptive-local'
  };

  const sessionId = await createAssessmentSession(userId, strongestMajorSignals);
  const savedSessionQuestionsMap = await saveSessionQuestions(sessionId, selectedQuestions);

  return {
    sessionId,
    mode: 'fast-adaptive',
    questions: formatSelectedQuestions(selectedQuestions, savedSessionQuestionsMap)
  };
}


// Server-side per-user lock: React StrictMode, double-clicks, or two open tabs can
// send two questionnaire requests at almost the same time. Without this lock, both
// requests may read the same history before either one saves its questions, so they
// can create identical sessions. The lock serializes question-session creation per
// user, making the second request see the first request in history and avoid repeats.
const userQuestionLocks = new Map();

async function withUserQuestionLock(userId, task) {
  const numericUserId = Number(userId);
  const previous = userQuestionLocks.get(numericUserId) || Promise.resolve();

  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  const chained = previous.then(() => current, () => current);
  userQuestionLocks.set(numericUserId, chained);

  try {
    await previous.catch(() => null);
    return await task();
  } finally {
    release();
    if (userQuestionLocks.get(numericUserId) === chained) {
      userQuestionLocks.delete(numericUserId);
    }
  }
}


// Fire-and-forget endpoint used by the frontend after a questionnaire session loads.
// It starts preparing the next 20-question AI set while the user is answering the
// current quiz, so the next attempt can open quickly without repeating questions.
router.post('/prepare-next', authenticateToken, async (req, res) => {
  try {
    const numericUserId = Number(req.user.id);
    const requestedUserId = req.body?.userId || req.query.userId;

    if (requestedUserId && Number(requestedUserId) !== numericUserId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: userId does not match the authenticated user'
      });
    }

    if (!numericUserId || Number.isNaN(numericUserId)) {
      return res.status(401).json({
        success: false,
        message: 'Please log in again before preparing questions'
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(200).json({
        success: true,
        status: 'skipped',
        reason: 'OPENAI_API_KEY is not configured'
      });
    }

    const job = prepareNextSessionQuestionsInBackground(numericUserId);

    return res.status(202).json({
      success: true,
      status: job ? 'preparing' : 'already-pending-or-skipped',
      message: 'Next-session question preparation started in the background'
    });
  } catch (error) {
    console.warn('[questions] prepare-next endpoint failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to start next-session question preparation'
    });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const shouldRefresh = req.query.refresh === '1';
    const numericUserId = Number(req.user.id);
    const requestedUserId = req.query.userId ? Number(req.query.userId) : numericUserId;

    if (!numericUserId || Number.isNaN(numericUserId)) {
      return res.status(401).json({
        success: false,
        message: 'Please log in again before loading questions'
      });
    }

    if (req.query.userId && requestedUserId !== numericUserId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: userId does not match the authenticated user'
      });
    }

    if (numericUserId) {

      const adaptiveSet = await withUserQuestionLock(numericUserId, async () => {
        let lockedAdaptiveSet = null;

        if (req.query.mode === 'ai' && req.query.dev === '1') {
          // Manual admin/dev mode only. The normal questionnaire flow never waits
          // for OpenAI on page load. Add ?mode=ai&dev=1 only when you really
          // want to test direct OpenAI generation.
          lockedAdaptiveSet = await buildAdaptiveQuestionSet(numericUserId);
        } else {
          // 0) Consume a READY prepared set first. This is the main fix.
          // The previous version checked active-session reuse first, but sessions
          // are never marked completed in this backend. That made the app keep
          // returning local questions for up to 45 minutes even after OpenAI had
          // successfully prepared a set.
          const preparedSet = await getReadyPreparedQuestionSet(numericUserId);
          if (preparedSet) {
            lockedAdaptiveSet = await buildPreparedQuestionSet(numericUserId, preparedSet);
          }

          // 1) Only reuse an active session for near-simultaneous duplicate calls.
          // This prevents React StrictMode from creating two sessions, but it will
          // not block a real next attempt from using prepared-next-session.
          if (!lockedAdaptiveSet) {
            lockedAdaptiveSet = await getReusableActiveQuestionSession(numericUserId, 12);
          }

          // 2) If no prepared set is ready yet, open instantly from local/LRU.
          // This request must never wait for OpenAI.
          if (!lockedAdaptiveSet) {
            lockedAdaptiveSet = await buildFastAdaptiveQuestionSet(numericUserId);
          }

          // Do not start the background OpenAI job inside the locked critical
          // path. It is triggered after res.json() so the questionnaire appears
          // immediately even if OpenAI is slow.
        }

        if (
          !isLogicalQuestionSet(lockedAdaptiveSet.questions, 20) ||
          !hasNoDuplicateQuestionKeys(lockedAdaptiveSet.questions) ||
          !hasNoInternalSemanticOverlap(lockedAdaptiveSet.questions)
        ) {
          throw new Error('Final question validation failed: duplicate or invalid questions detected');
        }

        return lockedAdaptiveSet;
      });

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      const responsePayload = {
        success: true,
        count: adaptiveSet.questions.length,
        sessionId: adaptiveSet.sessionId,
        mode: adaptiveSet.mode || (req.query.mode === 'ai' && req.query.dev === '1' ? 'openai-dev' : 'fast-adaptive'),
        data: adaptiveSet.questions
      };

      res.json(responsePayload);

      // Start preparing the next session only after the current questions were
      // sent to the frontend. This prevents page-load delays and protects the
      // questionnaire from OpenAI latency/timeouts.
      if (!(req.query.mode === 'ai' && req.query.dev === '1')) {
        setImmediate(() => {
          prepareNextSessionQuestionsInBackground(numericUserId);
        });
      }

      return;
    }

    if (shouldRefresh) {
      const dynamicQuestions = await generateDynamicQuestions();

      await run('DELETE FROM question_options');
      await run('DELETE FROM questions');
      await run('DELETE FROM sqlite_sequence WHERE name="question_options"');
      await run('DELETE FROM sqlite_sequence WHERE name="questions"');

      for (let index = 0; index < dynamicQuestions.length; index += 1) {
        const question = dynamicQuestions[index];
        const questionResult = await run(
          `
            INSERT INTO questions (question_text, category, question_type, question_order)
            VALUES (?, ?, ?, ?)
          `,
          [
            question.questionText,
            question.category,
            question.questionType,
            question.questionOrder || index + 1
          ]
        );

        for (let optionIndex = 0; optionIndex < question.options.length; optionIndex += 1) {
          const option = question.options[optionIndex];
          await run(
            `
              INSERT INTO question_options (
                question_id,
                option_text,
                score,
                target_major,
                option_order
              ) VALUES (?, ?, ?, ?, ?)
            `,
            [
              questionResult.lastID,
              option.optionText,
              option.score,
              option.targetMajor,
              option.optionOrder || optionIndex + 1
            ]
          );
        }
      }
    }

    return getQuestionsPayload(res);
  } catch (error) {
    console.error('Failed to load questions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load questions'
    });
  }
});

router.post('/refresh', authenticateToken, adminOnly, async (req, res) => {
  try {
    const dynamicQuestions = await generateDynamicQuestions();

    await run('DELETE FROM question_options');
    await run('DELETE FROM questions');
    await run('DELETE FROM sqlite_sequence WHERE name="question_options"');
    await run('DELETE FROM sqlite_sequence WHERE name="questions"');

    for (let index = 0; index < dynamicQuestions.length; index += 1) {
      const question = dynamicQuestions[index];
      const questionResult = await run(
        `
          INSERT INTO questions (question_text, category, question_type, question_order)
          VALUES (?, ?, ?, ?)
        `,
        [
          question.questionText,
          question.category,
          question.questionType,
          question.questionOrder || index + 1
        ]
      );

      for (let optionIndex = 0; optionIndex < question.options.length; optionIndex += 1) {
        const option = question.options[optionIndex];
        await run(
          `
            INSERT INTO question_options (
              question_id,
              option_text,
              score,
              target_major,
              option_order
            ) VALUES (?, ?, ?, ?, ?)
          `,
          [
            questionResult.lastID,
            option.optionText,
            option.score,
            option.targetMajor,
            option.optionOrder || optionIndex + 1
          ]
        );
      }
    }

    return getQuestionsPayload(res);
  } catch (error) {
    console.error('Failed to regenerate questions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to regenerate questions'
    });
  }
});

module.exports = router;