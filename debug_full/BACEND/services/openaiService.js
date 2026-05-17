// OpenAI-backed AI service for MajorMatch AI.
// Uses native fetch (Node 18+) so no extra npm package is required.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const AI_READY = Boolean(OPENAI_API_KEY);
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 180000);
const RECOMMENDATION_TIMEOUT_MS = Number(process.env.RECOMMENDATION_TIMEOUT_MS || 30000);
const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS || 30000);
const COURSE_CONTENT_TIMEOUT_MS = Number(process.env.COURSE_CONTENT_TIMEOUT_MS || 30000);
const RECOMMENDATION_MAX_TOKENS = Number(process.env.RECOMMENDATION_MAX_TOKENS || 750);
const CHAT_MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS || 420);
const COURSE_CONTENT_MAX_TOKENS = Number(process.env.COURSE_CONTENT_MAX_TOKENS || 850);

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function safeTimeoutMs(value, fallback) {
  return Math.max(1000, positiveNumber(value, fallback));
}

console.log(`[openaiService] loaded | model: ${OPENAI_MODEL} | ai: ${AI_READY ? 'ready' : 'NO KEY'}`);

function cleanJsonText(text = '') {
  return String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

async function callOpenAI(prompt, { temperature = 0.4, json = false, maxTokens = null, timeoutMs = null } = {}) {
  if (!AI_READY) return null;

  const effectiveTimeoutMs = safeTimeoutMs(timeoutMs || OPENAI_TIMEOUT_MS, OPENAI_TIMEOUT_MS);
  const effectiveMaxTokens = maxTokens ? positiveNumber(maxTokens, null) : null;

  const body = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: json
          ? 'You are a precise academic advisor. Return compact valid JSON only. Do not include markdown or extra text.'
          : 'You are a warm, concise, practical academic advisor for university students.'
      },
      { role: 'user', content: prompt }
    ],
    temperature
  };

  if (effectiveMaxTokens) {
    body.max_tokens = effectiveMaxTokens;
  }

  if (json) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data?.choices?.[0]?.message?.content?.trim() || '';
}

const FALLBACK_QUESTIONS = [
  {
    questionText: 'Which activity sounds most enjoyable to you?',
    category: 'Interests',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Building apps or solving technical problems', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'Helping patients and learning about the human body', score: 2, targetMajor: 'Medicine' },
      { optionText: 'Planning teams and improving business performance', score: 2, targetMajor: 'Business Administration' },
      { optionText: 'Creating visuals, illustrations, or digital concepts', score: 2, targetMajor: 'UI/UX Design' }
    ]
  },
  {
    questionText: 'Which school subject usually feels strongest for you?',
    category: 'Skills',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Mathematics and logical reasoning', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Biology and life sciences', score: 2, targetMajor: 'Medicine' },
      { optionText: 'Economics and business studies', score: 2, targetMajor: 'Economics' },
      { optionText: 'Art, media, or design', score: 2, targetMajor: 'Fine Arts' }
    ]
  },
  {
    questionText: 'How do you prefer to solve a problem?',
    category: 'Work Style',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'By analyzing data and testing solutions', score: 2, targetMajor: 'Data Science' },
      { optionText: 'By discussing it with people and understanding emotions', score: 2, targetMajor: 'Psychology' },
      { optionText: 'By organizing tasks and assigning roles', score: 2, targetMajor: 'Business Management' },
      { optionText: 'By creating a new visual or creative concept', score: 2, targetMajor: 'Product Design' }
    ]
  },
  {
    questionText: 'I enjoy understanding how systems, machines, or software work.',
    category: 'Interests',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Fine Arts' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Communications' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Agree', score: 3, targetMajor: 'Computer Science' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Software Engineering' }
    ]
  },
  {
    questionText: 'Which future sounds more exciting to you?',
    category: 'Future Goals',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Launching a startup or building products', score: 2, targetMajor: 'Entrepreneurship' },
      { optionText: 'Working in hospitals or health care', score: 2, targetMajor: 'Medicine' },
      { optionText: 'Leading a company or department', score: 2, targetMajor: 'Business Administration' },
      { optionText: 'Working in research labs or analytics teams', score: 2, targetMajor: 'Research Sciences' }
    ]
  },
  {
    questionText: 'I feel comfortable spending long periods focused on one hard task.',
    category: 'Skills',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Marketing' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Communications' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Agree', score: 3, targetMajor: 'Data Science' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Computer Science' }
    ]
  },
  {
    questionText: 'Which environment would you rather work in?',
    category: 'Work Style',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'A software company or tech lab', score: 2, targetMajor: 'Software Engineering' },
      { optionText: 'A hospital or clinic', score: 2, targetMajor: 'Medicine' },
      { optionText: 'A business office or strategy team', score: 2, targetMajor: 'Business Management' },
      { optionText: 'A creative studio or design agency', score: 2, targetMajor: 'UI/UX Design' }
    ]
  },
  {
    questionText: 'What kind of outcome makes you feel proudest?',
    category: 'Future Goals',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Building a useful tool or system', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'Improving someone’s health or wellbeing', score: 2, targetMajor: 'Psychology' },
      { optionText: 'Growing a brand or business result', score: 2, targetMajor: 'Marketing' },
      { optionText: 'Designing something beautiful and effective', score: 2, targetMajor: 'Product Design' }
    ]
  },
  {
    questionText: 'I naturally notice patterns in numbers, charts, or reports.',
    category: 'Skills',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Fine Arts' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Communications' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Accounting' },
      { optionText: 'Agree', score: 3, targetMajor: 'Economics' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Data Science' }
    ]
  },
  {
    questionText: 'Which role would you choose in a group project?',
    category: 'Work Style',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Technical builder or coder', score: 2, targetMajor: 'Software Engineering' },
      { optionText: 'Researcher and evidence checker', score: 2, targetMajor: 'Research Sciences' },
      { optionText: 'Presenter and communicator', score: 2, targetMajor: 'Communications' },
      { optionText: 'Organizer and team coordinator', score: 2, targetMajor: 'Business Management' }
    ]
  },
  {
    questionText: 'I enjoy learning how the human body and health systems work.',
    category: 'Interests',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Economics' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Computer Science' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Psychology' },
      { optionText: 'Agree', score: 3, targetMajor: 'Biology' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Medicine' }
    ]
  },
  {
    questionText: 'Which statement sounds most like you?',
    category: 'Skills',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'I like designing user experiences and interfaces', score: 2, targetMajor: 'UI/UX Design' },
      { optionText: 'I like developing business ideas and strategies', score: 2, targetMajor: 'Entrepreneurship' },
      { optionText: 'I like understanding behavior and helping people', score: 2, targetMajor: 'Psychology' },
      { optionText: 'I like engineering practical and efficient solutions', score: 2, targetMajor: 'Engineering' }
    ]
  },
  {
    questionText: 'How do you prefer to make decisions?',
    category: 'Work Style',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Using evidence and technical logic', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Using empathy and human needs', score: 2, targetMajor: 'Social Work' },
      { optionText: 'Using market insight and business value', score: 2, targetMajor: 'Business Administration' },
      { optionText: 'Using creativity and user perspective', score: 2, targetMajor: 'Product Design' }
    ]
  },
  {
    questionText: 'I would enjoy a career where I constantly learn new technologies or methods.',
    category: 'Future Goals',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Education' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Accounting' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Data Science' },
      { optionText: 'Agree', score: 3, targetMajor: 'Software Engineering' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Computer Science' }
    ]
  },
  {
    questionText: 'Which topics would you like to discuss most?',
    category: 'Interests',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Technology, apps, and innovation', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'Business, markets, and investment', score: 2, targetMajor: 'Economics' },
      { optionText: 'Mental health and human behavior', score: 2, targetMajor: 'Psychology' },
      { optionText: 'Art, design, and creative concepts', score: 2, targetMajor: 'Fine Arts' }
    ]
  },
  {
    questionText: 'Which kind of challenge do you prefer?',
    category: 'Skills',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Debugging a system or solving a logic issue', score: 2, targetMajor: 'Software Engineering' },
      { optionText: 'Improving a team process or plan', score: 2, targetMajor: 'Business Management' },
      { optionText: 'Creating a campaign or message for people', score: 2, targetMajor: 'Marketing' },
      { optionText: 'Studying a scientific problem deeply', score: 2, targetMajor: 'Research Sciences' }
    ]
  },
  {
    questionText: 'I like roles where my work has a clear social or human impact.',
    category: 'Future Goals',
    questionType: 'likert',
    options: [
      { optionText: 'Strongly Disagree', score: 0, targetMajor: 'Accounting' },
      { optionText: 'Disagree', score: 1, targetMajor: 'Engineering' },
      { optionText: 'Neutral', score: 2, targetMajor: 'Psychology' },
      { optionText: 'Agree', score: 3, targetMajor: 'Education' },
      { optionText: 'Strongly Agree', score: 4, targetMajor: 'Social Work' }
    ]
  },
  {
    questionText: 'Which tools sound most exciting to learn?',
    category: 'Interests',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Programming languages and developer tools', score: 2, targetMajor: 'Computer Science' },
      { optionText: 'Design software and prototyping tools', score: 2, targetMajor: 'UI/UX Design' },
      { optionText: 'Financial models and analytics tools', score: 2, targetMajor: 'Accounting' },
      { optionText: 'Lab equipment and scientific methods', score: 2, targetMajor: 'Biology' }
    ]
  },
  {
    questionText: 'What kind of work pace suits you best?',
    category: 'Work Style',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Fast-paced problem solving under pressure', score: 2, targetMajor: 'Emergency Medicine' },
      { optionText: 'Structured project cycles and planning', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Flexible creative work with iteration', score: 2, targetMajor: 'Product Design' },
      { optionText: 'Research-heavy work with deep focus', score: 2, targetMajor: 'Research Sciences' }
    ]
  },
  {
    questionText: 'Which long-term goal appeals to you most?',
    category: 'Future Goals',
    questionType: 'multiple-choice',
    options: [
      { optionText: 'Become a highly skilled technical expert', score: 2, targetMajor: 'Engineering' },
      { optionText: 'Build a company or create opportunities', score: 2, targetMajor: 'Entrepreneurship' },
      { optionText: 'Support people directly and improve lives', score: 2, targetMajor: 'Medicine' },
      { optionText: 'Shape ideas, media, or product experiences', score: 2, targetMajor: 'Communications' }
    ]
  }
];

const ALLOWED_MAJORS = [
  'Computer Science', 'Medicine', 'Business Administration', 'Fine Arts', 'Engineering',
  'UI/UX Design', 'Communications', 'Product Design', 'Business Management', 'Economics',
  'Marketing', 'Biology', 'Data Science', 'Research Sciences', 'Education', 'Psychology',
  'Social Work', 'Software Engineering', 'Emergency Medicine', 'Accounting', 'Entrepreneurship'
];

function chunkIntoSections(questions) {
  const categories = ['Interests', 'Skills', 'Work Style', 'Future Goals'];

  return questions.map((question, index) => {
    // Keep the model category when it is valid. If a category is missing, assign
    // a balanced fallback category. The modulo keeps this safe even when the
    // next-session candidate pool asks for 40+ questions instead of only 20.
    const fallbackCategory = categories[Math.floor((index % 20) / 5)] || 'Interests';

    return {
      ...question,
      category: question.category || fallbackCategory,
      questionOrder: index + 1,
      options: (question.options || []).map((option, optionIndex) => ({
        optionText: option.optionText,
        score: Number(option.score ?? 0),
        targetMajor: option.targetMajor || 'Computer Science',
        optionOrder: option.optionOrder || optionIndex + 1
      }))
    };
  });
}

function normalizeQuestionType(type = '') {
  const value = String(type).trim().toLowerCase();
  if (value === 'likert') return 'likert';
  if (value === 'preference') return 'preference';
  if (value === 'scenario') return 'scenario';
  return 'multiple-choice';
}

function buildQuestionSimilarityKey(questionText = '') {
  return String(questionText)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAllowedMajor(major = '') {
  return ALLOWED_MAJORS.includes(String(major).trim());
}

function hasDuplicateMajorDominance(options = []) {
  const majors = options.map((option) => option.targetMajor).filter(Boolean);
  const uniqueMajors = new Set(majors);
  return uniqueMajors.size < 3;
}

function normalizeLikertOptions(targetMajors = []) {
  const uniqueMajors = [...new Set(targetMajors.filter(isAllowedMajor))];

  const fallbackMajors = ['Engineering', 'Communications', 'Psychology', 'Biology', 'Medicine'];

  for (const major of fallbackMajors) {
    if (uniqueMajors.length >= 5) break;
    if (!uniqueMajors.includes(major)) uniqueMajors.push(major);
  }

  while (uniqueMajors.length < 5) {
    uniqueMajors.push('Computer Science');
  }

  return [
    { optionText: 'Strongly Disagree', score: 0, targetMajor: uniqueMajors[0] },
    { optionText: 'Disagree', score: 1, targetMajor: uniqueMajors[1] },
    { optionText: 'Neutral', score: 2, targetMajor: uniqueMajors[2] },
    { optionText: 'Agree', score: 3, targetMajor: uniqueMajors[3] },
    { optionText: 'Strongly Agree', score: 4, targetMajor: uniqueMajors[4] }
  ];
}

function detectGenericQuestion(questionText = '') {
  const text = buildQuestionSimilarityKey(questionText);

  const weakPatterns = [
    'what do you think about',
    'how do you feel about success',
    'what is your dream',
    'what matters most to you',
    'what kind of person are you',
    'what do you value most'
  ];

  return weakPatterns.some((pattern) => text.includes(pattern));
}

function isDiscriminativeQuestion(question) {
  const options = question.options || [];
  const majors = options.map((option) => option.targetMajor).filter(Boolean);
  const uniqueMajors = new Set(majors);

  if (question.questionType === 'likert') {
    return uniqueMajors.size >= 4;
  }

  return uniqueMajors.size >= 4;
}

function hasEnoughVariety(questions) {
  const seenTexts = new Set();
  const categoryCounts = {
    Interests: 0,
    Skills: 0,
    'Work Style': 0,
    'Future Goals': 0
  };

  for (const question of questions) {
    const key = buildQuestionSimilarityKey(question.questionText);
    if (seenTexts.has(key)) {
      return false;
    }
    seenTexts.add(key);

    if (categoryCounts[question.category] !== undefined) {
      categoryCounts[question.category] += 1;
    }
  }

  const typeCounts = questions.reduce((acc, question) => {
    const type = normalizeQuestionType(question.questionType);
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const presentTypes = Object.values(typeCounts).filter((count) => count > 0).length;

  return Object.values(categoryCounts).every((count) => count >= 4) &&
    presentTypes >= 3 &&
    (typeCounts['multiple-choice'] || 0) >= 4 &&
    (typeCounts.likert || 0) >= 3;
}

function isQuestionTooSimilar(questionText, existingKeys) {
  const key = buildQuestionSimilarityKey(questionText);
  return existingKeys.has(key);
}

function sanitizeQuestionsPayload(payload, { maxQuestions = 20, minimumQuestions = 16, requireVariety = true } = {}) {
  const questions = Array.isArray(payload?.questions) ? payload.questions : [];
  const usedSimilarityKeys = new Set();

  const normalized = questions
    .map((question, questionIndex) => {
      const questionText = String(question.questionText || question.question || '').trim();
      const category = String(question.category || '').trim();
      const questionType = normalizeQuestionType(question.questionType || question.type);
      const similarityKey = buildQuestionSimilarityKey(questionText);

      if (!questionText || questionText.length < 20) return null;
      if (detectGenericQuestion(questionText)) return null;
      if (isQuestionTooSimilar(questionText, usedSimilarityKeys)) return null;

      let options = Array.isArray(question.options)
        ? question.options
            .map((option, optionIndex) => ({
              optionText: String(option.optionText || option.text || '').trim(),
              score: Number(option.score ?? 0),
              targetMajor: String(option.targetMajor || '').trim(),
              optionOrder: Number(option.optionOrder || optionIndex + 1)
            }))
            .filter((option) => option.optionText && isAllowedMajor(option.targetMajor))
        : [];

      if (questionType === 'likert') {
        const existingMajors = options.map((option) => option.targetMajor).filter(Boolean);
        options = normalizeLikertOptions(existingMajors).map((option, optionIndex) => ({
          ...option,
          optionOrder: optionIndex + 1
        }));
      } else {
        options = options.slice(0, 4);
      }

      const requiredOptionCount = questionType === 'likert' ? 5 : 4;
      if (options.length !== requiredOptionCount) return null;
      if (hasDuplicateMajorDominance(options)) return null;

      const normalizedQuestion = {
        questionText,
        category,
        questionType,
        questionOrder: questionIndex + 1,
        options
      };

      if (!isDiscriminativeQuestion(normalizedQuestion)) return null;

      usedSimilarityKeys.add(similarityKey);
      return normalizedQuestion;
    })
    .filter(Boolean)
    .slice(0, maxQuestions);

  const chunked = chunkIntoSections(normalized);

  if (chunked.length < minimumQuestions) {
    return null;
  }

  if (requireVariety && !hasEnoughVariety(chunked)) {
    return null;
  }

  return chunked;
}

async function tryGenerateDynamicQuestions(prompt, temperature = 0.35, sanitizeOptions = {}) {
  const text = await callOpenAI(prompt, { temperature, json: true });
  const cleaned = cleanJsonText(text);

  if (!cleaned) return null;

  const parsed = JSON.parse(cleaned);
  return sanitizeQuestionsPayload(parsed, sanitizeOptions);
}

async function generateDynamicQuestions(context = {}) {
  if (!AI_READY) {
    return chunkIntoSections(FALLBACK_QUESTIONS);
  }

  const previousQuestions = Array.isArray(context.previousQuestionTexts)
    ? context.previousQuestionTexts.slice(0, 30).map((item) => String(item).trim()).filter(Boolean)
    : [];
  const previousKeys = Array.isArray(context.previousSimilarityKeys)
    ? context.previousSimilarityKeys.slice(0, 40).map((item) => String(item).trim()).filter(Boolean)
    : [];
  const topMajorNames = Array.isArray(context.topMajors)
    ? context.topMajors.map((item) => item.major || item).filter(Boolean).slice(0, 3)
    : [];
  const signalNames = Array.isArray(context.answerSignals?.strongestSignals)
    ? context.answerSignals.strongestSignals.map((item) => item.signal).filter(Boolean).slice(0, 6)
    : [];

  const requestedCandidateCount = Number(context.candidateCount || 20);
  const candidateCount = [20, 24, 32, 40, 48].includes(requestedCandidateCount) ? requestedCandidateCount : 20;
  const questionsPerCategory = candidateCount / 4;
  // For next-session preparation, return every valid OpenAI candidate even if
  // the set is not complete/balanced. The route will repair category gaps with
  // local fallback instead of discarding the whole AI result.
  const minimumQuestions = context.nextSessionPreparation ? 1 : 16;
  const typeMixText = candidateCount === 20
    ? '6 multiple-choice, 5 scenario, 5 preference, 4 likert'
    : `${Math.round(candidateCount * 0.30)} multiple-choice, ${Math.round(candidateCount * 0.25)} scenario, ${Math.round(candidateCount * 0.25)} preference, ${candidateCount - Math.round(candidateCount * 0.30) - Math.round(candidateCount * 0.25) - Math.round(candidateCount * 0.25)} likert`;

  const sanitizeOptions = {
    maxQuestions: candidateCount,
    minimumQuestions,
    requireVariety: !context.nextSessionPreparation
  };

  const adaptiveGuidance = [
    previousQuestions.length
      ? `Previously asked questions to avoid repeating exactly or semantically:\n- ${previousQuestions.join('\n- ')}`
      : '',
    previousKeys.length
      ? `Avoid these previous question themes/keys where possible: ${previousKeys.join(', ')}`
      : '',
    topMajorNames.length
      ? `The student's latest strongest major signals are: ${topMajorNames.join(', ')}. Include a few deeper differentiating questions around these areas, but keep category balance.`
      : '',
    signalNames.length
      ? `Observed answer style signals: ${signalNames.join(', ')}. Use these only to make the next session more adaptive, not biased.`
      : '',
    context.nextSessionPreparation
      ? 'This set is being prepared for the student\'s NEXT session. It MUST NOT repeat any question from the current or previous sessions. Use clearly new scenarios, new wording, and new answer choices.'
      : '',
    context.relaxed
      ? 'This is a relaxed retry: freshness and validity are more important than perfectly avoiding every old theme.'
      : 'This is a strict fresh session: prioritize new wording and new angles.'
  ].filter(Boolean).join('\n\n');

  const primaryPrompt = `
Generate exactly ${candidateCount} smart, varied, and discriminative candidate questions for a university major recommendation assessment.

${adaptiveGuidance}

Strict rules:
- Use exactly these 4 categories only: Interests, Skills, Work Style, Future Goals.
- Generate exactly ${questionsPerCategory} questions per category.
- Category balance is mandatory. Do not overproduce one category while underproducing another.
- Use a diverse mix of questionType values: multiple-choice, scenario, preference, and likert.
- Required type mix across the ${candidateCount} questions: ${typeMixText}.
- For multiple-choice, scenario, and preference questions: provide exactly 4 options.
- For likert questions: the questionText must be a clear personal statement, not a question.
- For likert questions: provide exactly 5 options using this exact order:
  Strongly Disagree, Disagree, Neutral, Agree, Strongly Agree
- For scenario questions: questionText must describe a realistic short situation and options must be possible actions.
- For preference questions: questionText must ask the student to choose what they prefer, would rather do, or find more appealing.
- Every option must include: optionText, score, targetMajor.
- targetMajor must be one of these only:
  Computer Science, Medicine, Business Administration, Fine Arts, Engineering,
  UI/UX Design, Communications, Product Design, Business Management, Economics,
  Marketing, Biology, Data Science, Research Sciences, Education, Psychology,
  Social Work, Software Engineering, Emergency Medicine, Accounting, Entrepreneurship.
- Avoid vague, generic, or repetitive questions.
- Do not repeat any provided previous question exactly or semantically.
- Do not use vague stems like "Thinking about your future major..." without a complete natural question.
- Every non-likert question must read naturally with its answer choices.
- Do not use Agree/Disagree choices for non-likert questions.
- Do not write a likert question as "How interested are you...?"; write it as a statement like "I enjoy...".
- Each API call must produce a fresh set for a new session; do not reuse common template questions when avoid/history context is provided.
- Make questions student-friendly and realistic.
- Questions must help distinguish between similar majors, not just confirm one major.
- For likert questions, do NOT assign all 5 options to the same major.
- For likert questions, use a diverse spread of majors across the 5 options.
- For multiple-choice questions, make all 4 options meaningfully different.
- Return valid JSON only.
- Do not include markdown or code fences.

JSON shape:
{
  "questions": [
    {
      "questionText": "...",
      "category": "Interests",
      "questionType": "multiple-choice",
      "options": [
        { "optionText": "...", "score": 2, "targetMajor": "Computer Science" }
      ]
    }
  ]
}
`;

  const retryPrompt = `
Generate exactly ${candidateCount} high-quality, discriminative candidate questions for a university major recommendation system.

Important corrections:
- Reject generic self-reflection wording.
- Avoid repeating the same theme.
- Likert questions must NOT map all choices to one major.
- Each question should help differentiate between majors that could otherwise seem similar.
- Ensure strong variety in themes, wording, and major targets.
- Keep the same JSON format as requested before.
- Keep exactly ${questionsPerCategory} questions per category.
- Category balance is mandatory; include enough Skills and Work Style questions.
- Use diverse questionType values: multiple-choice, scenario, preference, and likert.
- Non-likert questions must have 4 meaningful answer options, not Agree/Disagree labels.
- Likert questions must be personal statements, not question sentences.
- Return valid JSON only with no markdown.
`;

  try {
    const firstAttempt = await tryGenerateDynamicQuestions(primaryPrompt, 0.35, sanitizeOptions);
    if (firstAttempt) return firstAttempt;

    const secondAttempt = await tryGenerateDynamicQuestions(retryPrompt, 0.45, sanitizeOptions);
    if (secondAttempt) return secondAttempt;

    return chunkIntoSections(FALLBACK_QUESTIONS);
  } catch (error) {
    console.error('OpenAI questions generation failed:', error.message);
    return chunkIntoSections(FALLBACK_QUESTIONS);
  }
}

function buildAnswerSummary(answerDetails) {
  return (Array.isArray(answerDetails) ? answerDetails : []).slice(0, 20).map((item, index) => ({
    n: index + 1,
    category: String(item.category || '').slice(0, 40),
    question: String(item.questionText || '').slice(0, 120),
    selected: (item.selectedOptions || []).slice(0, 2).map((option) => String(option.optionText || '').slice(0, 90))
  }));
}

function compactJson(value, maxLength = 3000) {
  const text = JSON.stringify(value || []);
  return text.length > maxLength ? text.slice(0, maxLength) + '...TRUNCATED' : text;
}

function sanitizeRecommendationPayload(payload, fallbackMajor, fallbackExplanation, topMajors) {
  const recommendedMajor = String(payload?.recommendedMajor || fallbackMajor || 'Computer Science').trim();
  const explanation = String(payload?.explanation || fallbackExplanation).trim();
  const majorDescription = String(
    payload?.majorDescription ||
      'This field matches your answers by aligning with your strengths, interests, and future goals.'
  ).trim();

  const studyPlan = Array.isArray(payload?.studyPlan)
    ? payload.studyPlan.map((item) => String(item).trim()).filter(Boolean)
    : [
        'Year 1: Build a strong foundation in the basics of the field.',
        'Year 2: Explore core technical and theoretical subjects.',
        'Year 3: Focus on specialization, projects, and practical experience.',
        'Year 4: Complete advanced electives, internships, and capstone work.'
      ];

  const subjectDescriptions = Array.isArray(payload?.subjectDescriptions)
    ? payload.subjectDescriptions.map((item) => String(item).trim()).filter(Boolean)
    : [
        'Core theory courses build your academic foundation.',
        'Practical subjects help you apply knowledge in real scenarios.',
        'Project-based modules develop teamwork and problem-solving skills.'
      ];

  const careerPaths = Array.isArray(payload?.careerPaths)
    ? payload.careerPaths.map((item) => String(item).trim()).filter(Boolean)
    : topMajors.map((item) => item.major).slice(0, 3);

  return {
    recommendedMajor,
    explanation,
    majorDescription,
    studyPlan,
    subjectDescriptions,
    careerPaths
  };
}

async function generateRecommendationDetails(recommendedMajor, topMajors, answerDetails) {
  const fallbackExplanation = `Based on your answers, ${recommendedMajor} appears to be the strongest fit for your interests, skills, work style, and long-term goals.`;

  if (!AI_READY) {
    return sanitizeRecommendationPayload({}, recommendedMajor, fallbackExplanation, topMajors);
  }

  const prompt = `
You are an academic advisor. Return compact valid JSON only.
Primary recommended major: ${recommendedMajor}
Top majors: ${compactJson((topMajors || []).slice(0, 3), 1200)}
Answer summary: ${compactJson(buildAnswerSummary(answerDetails), 2600)}

Return exactly this JSON shape:
{
  "recommendedMajor": "${recommendedMajor}",
  "explanation": "2 concise sentences explaining the fit",
  "majorDescription": "2 concise sentences about the major",
  "studyPlan": ["Year 1: ...", "Year 2: ...", "Year 3: ...", "Year 4: ..."],
  "subjectDescriptions": ["subject area 1", "subject area 2", "subject area 3"],
  "careerPaths": ["Job title 1", "Job title 2", "Job title 3"]
}
Rules: concise only, no paragraphs longer than 25 words, no markdown.
`;

  try {
    const text = await callOpenAI(prompt, {
      temperature: 0.25,
      json: true,
      maxTokens: RECOMMENDATION_MAX_TOKENS,
      timeoutMs: RECOMMENDATION_TIMEOUT_MS
    });
    const cleaned = cleanJsonText(text);

    if (!cleaned) {
      return sanitizeRecommendationPayload({}, recommendedMajor, fallbackExplanation, topMajors);
    }

    const parsed = JSON.parse(cleaned);
    return sanitizeRecommendationPayload(parsed, recommendedMajor, fallbackExplanation, topMajors);
  } catch (error) {
    console.error('OpenAI recommendation generation failed:', error.message);
    return sanitizeRecommendationPayload({}, recommendedMajor, fallbackExplanation, topMajors);
  }
}

const LANGUAGE_NAMES = {
  en: 'English',
  ar: 'Arabic',
  es: 'Spanish',
  fr: 'French'
};

// Intent-aware fallbacks so offline responses are still contextually useful
const SMART_FALLBACKS = {
  greeting: {
    en: () => `Hey! Great to have you here. I'm ready to answer any questions about your major, courses, or career paths — just ask!`,
    ar: () => `أهلاً! يسعدني وجودك هنا. أنا جاهز للإجابة على أسئلتك حول تخصصك أو المواد أو المسار المهني.`,
    es: () => `¡Hola! Me alegra que estés aquí. Estoy listo para responder cualquier pregunta sobre tu carrera, materias o futuro profesional.`,
    fr: () => `Salut ! Ravi de vous voir ici. Je suis prêt à répondre à toutes vos questions sur votre filière, vos cours ou votre avenir.`,
  },
  emotional_fear: {
    en: () => `Feeling nervous is completely normal — almost every student feels that way at the start. You've already taken the first step by figuring out your direction, and that matters a lot. Take it one day at a time.`,
    ar: () => `الشعور بالقلق أمر طبيعي تماماً — كل طالب تقريباً يمر بذلك في البداية. لقد خطوت أول خطوة باختيار مسارك، وهذا يعني الكثير. خذها يوماً بيوم.`,
    es: () => `Sentir nervios es completamente normal — casi todo estudiante lo siente al comenzar. Ya diste el primer paso al encontrar tu dirección, y eso importa mucho. Tómalo un día a la vez.`,
    fr: () => `Ressentir de la nervosité est tout à fait normal — presque tous les étudiants le vivent au début. Vous avez déjà franchi le premier pas en trouvant votre orientation, et c'est énorme. Prenez-le un jour à la fois.`,
  },
  emotional_lost: {
    en: (major) => `Feeling lost is part of the process — it means you're thinking seriously about your future. For ${major}, a good starting point is reading about what professionals in this field actually do day-to-day. That usually makes everything clearer.`,
    ar: (major) => `الشعور بالضياع جزء طبيعي من الرحلة — يعني أنك تفكر جدياً في مستقبلك. بالنسبة لـ${major}، نقطة بداية جيدة هي قراءة ما يفعله المحترفون في هذا المجال يومياً. هذا عادةً يوضح الصورة كثيراً.`,
    es: (major) => `Sentirse perdido es parte del proceso — significa que estás pensando seriamente en tu futuro. Para ${major}, un buen punto de partida es leer sobre lo que hacen los profesionales en este campo día a día.`,
    fr: (major) => `Se sentir perdu fait partie du processus — cela signifie que vous réfléchissez sérieusement à votre avenir. Pour ${major}, un bon point de départ est de lire ce que font les professionnels dans ce domaine au quotidien.`,
  },
  difficulty: {
    en: (major) => `${major} has challenging moments, but it's very manageable if you stay consistent. Most students find the first year hardest because everything is new — after that, things start to click and build on each other.`,
    ar: (major) => `${major} يحتوي على تحديات، لكنه قابل للإتقان إذا واظبت. يجد معظم الطلاب السنة الأولى الأصعب لأن كل شيء جديد — بعد ذلك تبدأ الأمور تتضح وتتراكم.`,
    es: (major) => `${major} tiene momentos desafiantes, pero es muy manejable si eres constante. La mayoría de los estudiantes encuentran el primer año el más difícil — después de eso, las cosas empiezan a encajar.`,
    fr: (major) => `${major} comporte des moments difficiles, mais c'est très gérable si vous êtes régulier. La plupart des étudiants trouvent la première année la plus difficile — après, les choses commencent à s'assembler.`,
  },
  career: {
    en: (major) => `Graduates in ${major} go into a wide range of roles. Common paths include working in tech companies, startups, consulting firms, government agencies, or even starting your own venture. The field opens more doors than most people expect.`,
    ar: (major) => `خريجو ${major} يدخلون مجالات واسعة. المسارات الشائعة تشمل العمل في شركات التقنية، الشركات الناشئة، الاستشارات، الجهات الحكومية، أو حتى بدء مشروعك الخاص.`,
    es: (major) => `Los graduados en ${major} acceden a una amplia gama de roles. Los caminos comunes incluyen trabajar en empresas tecnológicas, startups, consultoría, organismos gubernamentales o incluso emprender.`,
    fr: (major) => `Les diplômés en ${major} accèdent à un large éventail de rôles. Les parcours courants incluent les entreprises tech, les startups, le conseil, les organismes publics, ou même créer sa propre entreprise.`,
  },
  courses: {
    en: (major) => `In ${major}, you'll study a mix of foundational theory and practical application. Expect core modules in the fundamentals of the field, research methods, specialized technical skills, and project-based learning in your later years.`,
    ar: (major) => `في ${major}، ستدرس مزيجاً من النظرية الأساسية والتطبيق العملي. توقع مقررات أساسية في مبادئ المجال، مناهج البحث، المهارات التقنية المتخصصة، والتعلم القائم على المشاريع في سنواتك الأخيرة.`,
    es: (major) => `En ${major}, estudiarás una combinación de teoría fundamental y aplicación práctica. Espera módulos básicos en los fundamentos del campo, métodos de investigación, habilidades técnicas especializadas y aprendizaje por proyectos.`,
    fr: (major) => `En ${major}, vous étudierez un mélange de théorie fondamentale et d'application pratique. Attendez-vous à des modules sur les fondements du domaine, les méthodes de recherche, les compétences techniques spécialisées et l'apprentissage par projets.`,
  },
  fit: {
    en: (major) => `Based on how the assessment matched your answers, ${major} aligns well with your natural strengths and interests. The best way to confirm it's right for you is to look up what a typical week looks like for a student in this program — it usually removes all doubt.`,
    ar: (major) => `بناءً على كيفية تطابق التقييم مع إجاباتك، يتوافق ${major} بشكل جيد مع نقاط قوتك واهتماماتك الطبيعية. أفضل طريقة للتأكد هي البحث عن شكل الأسبوع العادي لطالب في هذا البرنامج.`,
    es: (major) => `Según cómo la evaluación coincidió con tus respuestas, ${major} se alinea bien con tus fortalezas e intereses naturales. La mejor manera de confirmarlo es buscar cómo es una semana típica para un estudiante en este programa.`,
    fr: (major) => `D'après la façon dont l'évaluation a correspondu à vos réponses, ${major} s'aligne bien avec vos forces et intérêts naturels. La meilleure façon de le confirmer est de chercher à quoi ressemble une semaine typique pour un étudiant dans ce programme.`,
  },
  advice: {
    en: (major) => `Three things that genuinely help in ${major}: (1) don't wait until exams to review material — stay current weekly; (2) find one senior student to ask questions, they'll save you months of confusion; (3) do at least one small personal project outside class as early as possible.`,
    ar: (major) => `ثلاثة أشياء تساعد فعلاً في ${major}: (1) لا تنتظر حتى الامتحانات لمراجعة المادة — راجع أسبوعياً؛ (2) ابحث عن طالب متقدم لطرح الأسئلة عليه؛ (3) قم بمشروع شخصي صغير خارج الفصل في أقرب وقت ممكن.`,
    es: (major) => `Tres cosas que realmente ayudan en ${major}: (1) no esperes hasta los exámenes para revisar el material — mantente al día semanalmente; (2) encuentra un estudiante mayor para hacer preguntas; (3) haz al menos un pequeño proyecto personal fuera de clase lo antes posible.`,
    fr: (major) => `Trois choses qui aident vraiment en ${major} : (1) ne pas attendre les examens pour réviser — rester à jour chaque semaine ; (2) trouver un étudiant avancé à qui poser des questions ; (3) faire au moins un petit projet personnel en dehors des cours le plus tôt possible.`,
  },
  general: {
    en: (major) => `That's a great question. ${major} is a broad and rewarding field — feel free to ask me anything more specific about courses, career options, difficulty, or how to prepare, and I'll give you a detailed answer.`,
    ar: (major) => `سؤال رائع. ${major} مجال واسع ومجزٍ — لا تتردد في سؤالي عن أي شيء أكثر تحديداً حول المقررات أو الخيارات المهنية أو الصعوبة أو كيفية التحضير.`,
    es: (major) => `Buena pregunta. ${major} es un campo amplio y gratificante — no dudes en preguntarme algo más específico sobre materias, opciones de carrera, dificultad o cómo prepararte.`,
    fr: (major) => `Bonne question. ${major} est un domaine vaste et enrichissant — n'hésitez pas à me poser des questions plus précises sur les cours, les débouchés, la difficulté ou comment vous préparer.`,
  },
};

function getSmartFallback(intent, language, major) {
  const intentMap = SMART_FALLBACKS[intent] || SMART_FALLBACKS.general;
  const langFn = intentMap[language] || intentMap.en;
  return langFn(major);
}

/* ─────────────────────────────────────────────────────────
   Intent detection — multilingual (EN + AR + ES + FR)
   ───────────────────────────────────────────────────────── */
function detectMessageIntent(message) {
  const t = message.toLowerCase().trim();

  // Greetings — EN/AR/ES/FR
  if (/^(hi|hey|hello|good morning|good evening|yo\b|sup\b|greetings)/.test(t)) return 'greeting';
  if (/^(hola|buenos días|buenas|buenas tardes|buenas noches|saludos)/.test(t)) return 'greeting';
  if (/^(salut|bonjour|bonsoir|coucou|allô)/.test(t)) return 'greeting';
  if (/^(مرحبا|أهلا|أهلًا|هلا|السلام عليكم|صباح الخير|مساء الخير|هي|هاي)/.test(t)) return 'greeting';

  // Fear / anxiety — EN/AR/ES/FR
  if (/(scared|afraid|nervous|anxious|worried|fear|terrified|overwhelm|stress|panic)/.test(t)) return 'emotional_fear';
  if (/(خائف|قلق|خوف|توتر|مرعوب|قلقان|خايف|مضغوط)/.test(t)) return 'emotional_fear';
  if (/(miedo|asustado|nervioso|ansioso|preocupado|abrumado|pánico|temor)/.test(t)) return 'emotional_fear';
  if (/(peur|effrayé|angoissé|anxieux|stressé|terrifié|inquiet)/.test(t)) return 'emotional_fear';

  // Lost / confused — EN/AR/ES/FR
  if (/(lost|confused|don.t know|unsure|uncertain|no idea|clueless|overwhelmed|where do i start)/.test(t)) return 'emotional_lost';
  if (/(ضايع|مش عارف|تائه|محتار|مش فاهم|ما أعرف|وين أبدأ|من وين أبدأ)/.test(t)) return 'emotional_lost';
  if (/(perdido|confundido|no sé|no entiendo|no tengo idea|por dónde empezar)/.test(t)) return 'emotional_lost';
  if (/(perdu|confus|je ne sais pas|je ne comprends pas|par où commencer)/.test(t)) return 'emotional_lost';

  // Difficulty — EN/AR/ES/FR
  if (/(hard|difficult|tough|challenging|complex|not easy|really hard|too hard|is it hard|struggle)/.test(t)) return 'difficulty';
  if (/(صعب|صعبة|يصعب|صعوبة|كيف صعوبته|هل صعب|معقد)/.test(t)) return 'difficulty';
  if (/(difícil|duro|complicado|complejo|es difícil|qué tan difícil)/.test(t)) return 'difficulty';
  if (/(difficile|dur|complexe|compliqué|c.est difficile|est-ce difficile)/.test(t)) return 'difficulty';

  // Careers / jobs — EN/AR/ES/FR
  if (/(job|career|work|salary|employ|profession|future|income|hire|occupation|field|industry|graduate)/.test(t)) return 'career';
  if (/(وظيفة|وظائف|مهنة|عمل|راتب|مستقبل|توظيف|مجال|صناعة)/.test(t)) return 'career';
  if (/(trabajo|empleo|carrera|salario|profesión|futuro|campo|industria|contratar)/.test(t)) return 'career';
  if (/(travail|emploi|carrière|salaire|profession|avenir|secteur|industrie|embauche)/.test(t)) return 'career';

  // Courses / subjects — EN/AR/ES/FR
  if (/(course|subject|topic|module|curriculum|class|lesson|study|learn|syllabus|what do i study|what will i learn)/.test(t)) return 'courses';
  if (/(مادة|مواد|مقرر|مقررات|درس|دراسة|أتعلم|كورس|منهج|ماذا أدرس)/.test(t)) return 'courses';
  if (/(materia|asignatura|curso|clase|estudiar|aprender|qué estudio|plan de estudios)/.test(t)) return 'courses';
  if (/(matière|cours|classe|leçon|étudier|apprendre|programme|que vais-je étudier)/.test(t)) return 'courses';

  // Fit / match — EN/AR/ES/FR
  if (/(fit|suit|right for me|meant for|is this for me|should i|will i like|am i right|match|compatible)/.test(t)) return 'fit';
  if (/(مناسب|يناسبني|مناسبة|هل يناسبني|هل هو لي|هل أنا مناسب)/.test(t)) return 'fit';
  if (/(adecuado|sirvo|es para mí|me conviene|me gusta|compatible|encaja)/.test(t)) return 'fit';
  if (/(convient|approprié|c.est pour moi|me convient|compatible|me correspond)/.test(t)) return 'fit';

  // Advice / tips — EN/AR/ES/FR
  if (/(tip|advice|recommend|suggest|how to|where to start|what should i do|guidance|help me|prepare|get ready)/.test(t)) return 'advice';
  if (/(نصيحة|نصائح|كيف أبدأ|ماذا أفعل|ساعدني|استعداد|أستعد)/.test(t)) return 'advice';
  if (/(consejo|consejq|sugerencia|cómo empezar|qué hacer|ayúdame|prepararme)/.test(t)) return 'advice';
  if (/(conseil|suggestion|comment commencer|que faire|aidez-moi|préparer|guide)/.test(t)) return 'advice';

  return 'general';
}

/* ─────────────────────────────────────────────────────────
   Main chat reply generator — with conversation history
   ───────────────────────────────────────────────────────── */
async function generateChatReply(recommendedMajor, explanation, userMessage, language = 'en', history = []) {
  const langName = LANGUAGE_NAMES[language] || 'English';
  const intent = detectMessageIntent(userMessage);
  // Smart fallback varies by what the student actually asked
  const fallbackReply = getSmartFallback(intent, language, recommendedMajor);

  if (!AI_READY) {
    console.warn('[openaiService] No API key — using smart fallback');
    return fallbackReply;
  }

  const intentGuide = {
    greeting:        `The student is greeting you. Reply warmly and briefly. Do NOT immediately launch into a lecture about their major — just welcome them and invite questions.`,
    emotional_fear:  `The student feels scared or anxious. Lead with genuine human empathy first. Then gently reassure them. Keep it warm and personal. Do NOT list bullet points.`,
    emotional_lost:  `The student feels lost or confused. Acknowledge that feeling warmly, then offer 2-3 clear concrete starting steps for ${recommendedMajor}. Keep it human.`,
    difficulty:      `The student asks how hard ${recommendedMajor} is. Give an honest, balanced answer: acknowledge real challenges, then explain what makes it manageable and rewarding.`,
    career:          `The student wants to know about careers. Give 3-4 specific real job titles or paths for ${recommendedMajor} graduates, with one sentence of context per role.`,
    courses:         `The student wants to know what subjects to study. Give 3-4 core subject areas in ${recommendedMajor}, briefly describing what each one builds.`,
    fit:             `The student wonders if this major is right for them. Use the explanation context to reinforce why it fits. Be warm and confident, not generic.`,
    advice:          `The student wants practical advice. Give 3 actionable, specific tips for succeeding in ${recommendedMajor} as a beginner student.`,
    general:         `Answer the student's specific question directly. Only mention ${recommendedMajor} if it's genuinely relevant. Do NOT force the major into every sentence.`
  };

  // Build conversation history block (last 6 exchanges max)
  let historyBlock = '';
  if (Array.isArray(history) && history.length > 0) {
    const recent = history.slice(-3);
    historyBlock = '\nCONVERSATION HISTORY (most recent last):\n' +
      recent.map(m => `${m.role === 'user' ? 'Student' : 'You'}: ${String(m.content || '').slice(0, 220)}`).join('\n') +
      '\n';
  }

  const prompt = `You are MAJORMATCH AI — a warm, intelligent, human-sounding academic advisor for university students.

STUDENT'S RECOMMENDED MAJOR: ${recommendedMajor}
WHY IT FITS THEM: ${String(explanation || '').slice(0, 500)}
${historyBlock}
STUDENT'S NEW MESSAGE: "${String(userMessage || '').slice(0, 500)}"

DETECTED INTENT: ${intent}
WHAT TO DO: ${intentGuide[intent] || intentGuide.general}

ABSOLUTE RULES — follow every single one:
1. Respond ONLY in ${langName}. Every single word must be in ${langName}. Zero exceptions.
2. Respond to WHAT THE STUDENT ACTUALLY ASKED. Do not ignore the question.
3. Keep it 2-4 short sentences unless listing items (then 3 items max).
4. Sound like a warm mentor, not a textbook. Use natural conversational tone.
5. NEVER start with "Of course", "Certainly", "Sure", "Absolutely", "Great question", "As your advisor", "Since your recommended major is", "Your recommended major is", or "As a [major] student". Begin differently every time.
6. NEVER repeat a response you already gave in the conversation history.
7. Only reference ${recommendedMajor} when directly relevant to the question.
8. If the student is emotional, be human first — lead with empathy, advice second.
9. For greetings: just greet back warmly in 1-2 sentences. Do not lecture.

Your reply:`;

  try {
    const rawText = await callOpenAI(prompt, { temperature: 0.55, maxTokens: CHAT_MAX_TOKENS, timeoutMs: CHAT_TIMEOUT_MS });
    if (rawText) {
      return rawText.replace(/\n{3,}/g, '\n\n').trim();
    }
  } catch (error) {
    console.error('[OpenAI] chat generation failed:', String(error.message || '').slice(0, 180));
  }


  console.warn('[OpenAI] unavailable — using smart fallback for intent:', intent);
  return fallbackReply;
}

function sanitizeCoursePayload(payload, major) {
  const fallback = {
    title: `${major} Learning Path`,
    overview: `A practical beginner-friendly course path for ${major}.`,
    starterCourses: [
      { title: `Introduction to ${major}`, description: 'Learn the basic vocabulary, concepts, and real-world uses.', keywords: `${major} basics for beginners` },
      { title: 'Core Foundations', description: 'Build the technical and theoretical base needed for future courses.', keywords: `${major} core foundations course` },
      { title: 'Practical Projects', description: 'Apply what you learn through small projects and portfolio work.', keywords: `${major} beginner projects` }
    ],
    roadmap: [
      'Month 1: Learn the foundations and key terminology.',
      'Month 2: Practice with guided exercises and short assignments.',
      'Month 3: Build a small project and document what you learned.',
      'Month 4: Explore specializations and prepare a portfolio or study plan.'
    ],
    youtubeSearchQueries: [
      `${major} full course for beginners`,
      `${major} study plan`,
      `${major} roadmap for students`
    ],
    freeResources: [
      { name: 'YouTube beginner courses', url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${major} full course for beginners`) },
      { name: 'Coursera search', url: 'https://www.coursera.org/search?query=' + encodeURIComponent(major) },
      { name: 'edX search', url: 'https://www.edx.org/search?q=' + encodeURIComponent(major) }
    ],
    projectIdeas: [
      `Create a beginner portfolio project related to ${major}.`,
      `Summarize three real career paths in ${major}.`,
      `Build a weekly study tracker for ${major}.`
    ]
  };

  const starterCourses = Array.isArray(payload?.starterCourses) ? payload.starterCourses : fallback.starterCourses;
  const freeResources = Array.isArray(payload?.freeResources) ? payload.freeResources : fallback.freeResources;

  return {
    title: String(payload?.title || fallback.title).trim(),
    overview: String(payload?.overview || fallback.overview).trim(),
    starterCourses: starterCourses.slice(0, 6).map((item, index) => ({
      title: String(item?.title || fallback.starterCourses[index % fallback.starterCourses.length].title).trim(),
      description: String(item?.description || fallback.starterCourses[index % fallback.starterCourses.length].description).trim(),
      keywords: String(item?.keywords || `${major} course`).trim()
    })),
    roadmap: (Array.isArray(payload?.roadmap) ? payload.roadmap : fallback.roadmap).slice(0, 6).map(String),
    youtubeSearchQueries: (Array.isArray(payload?.youtubeSearchQueries) ? payload.youtubeSearchQueries : fallback.youtubeSearchQueries).slice(0, 6).map(String),
    freeResources: freeResources.slice(0, 6).map((item, index) => ({
      name: String(item?.name || fallback.freeResources[index % fallback.freeResources.length].name).trim(),
      url: String(item?.url || fallback.freeResources[index % fallback.freeResources.length].url).trim()
    })),
    projectIdeas: (Array.isArray(payload?.projectIdeas) ? payload.projectIdeas : fallback.projectIdeas).slice(0, 6).map(String)
  };
}

async function generateCourseContentForMajor(major, topMajors = []) {
  const safeMajor = String(major || 'Computer Science').trim();

  if (!AI_READY) {
    return sanitizeCoursePayload({}, safeMajor);
  }

  const prompt = `
Create compact course-preparation JSON for this selected university major: ${safeMajor}.
Top 3 context: ${compactJson((topMajors || []).slice(0, 3), 1000)}

Return valid JSON only in this exact shape:
{
  "title": "${safeMajor} Learning Path",
  "overview": "one short paragraph",
  "starterCourses": [
    { "title": "", "description": "", "keywords": "" }
  ],
  "roadmap": ["", "", "", ""],
  "youtubeSearchQueries": ["", "", ""],
  "freeResources": [
    { "name": "Coursera search", "url": "https://www.coursera.org/search" },
    { "name": "edX search", "url": "https://www.edx.org/search" },
    { "name": "Khan Academy", "url": "https://www.khanacademy.org/" }
  ],
  "projectIdeas": ["", "", ""]
}
Rules: 4 starterCourses max, 4 roadmap steps max, 3 projectIdeas max, short descriptions only, no markdown.
`;

  try {
    const text = await callOpenAI(prompt, {
      temperature: 0.3,
      json: true,
      maxTokens: COURSE_CONTENT_MAX_TOKENS,
      timeoutMs: COURSE_CONTENT_TIMEOUT_MS
    });
    const parsed = JSON.parse(cleanJsonText(text));
    return sanitizeCoursePayload(parsed, safeMajor);
  } catch (error) {
    console.error('OpenAI course content generation failed:', error.message);
    return sanitizeCoursePayload({}, safeMajor);
  }
}

module.exports = {
  FALLBACK_QUESTIONS,
  generateDynamicQuestions,
  generateRecommendationDetails,
  generateChatReply,
  generateCourseContentForMajor,
  detectMessageIntent
};