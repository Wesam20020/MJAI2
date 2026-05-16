const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { FALLBACK_QUESTIONS } = require('../services/openaiService');

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

async function ensureResultsColumns() {
  const columns = await new Promise((resolve, reject) => {
    db.all('PRAGMA table_info(results)', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map((row) => row.name));
    });
  });

  const requiredColumns = {
    major_description: 'TEXT',
    study_plan: 'TEXT',
    subject_explanations: 'TEXT',
    career_paths: 'TEXT',
    top_majors: 'TEXT'
  };

  for (const [name, type] of Object.entries(requiredColumns)) {
    if (!columns.includes(name)) {
      await run(`ALTER TABLE results ADD COLUMN ${name} ${type}`);
    }
  }
}

async function ensureQuestionsColumns() {
  const columns = await new Promise((resolve, reject) => {
    db.all('PRAGMA table_info(questions)', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map((row) => row.name));
    });
  });

  if (!columns.includes('question_type')) {
    await run(`ALTER TABLE questions ADD COLUMN question_type TEXT DEFAULT 'multiple-choice'`);
  }
}

async function seedFallbackQuestionsIfEmpty() {
  const row = await get('SELECT COUNT(*) as count FROM questions');
  if (row.count >= 20) return;

  await run('DELETE FROM question_options');
  await run('DELETE FROM questions');
  await run('DELETE FROM sqlite_sequence WHERE name="question_options"');
  await run('DELETE FROM sqlite_sequence WHERE name="questions"');

  for (let i = 0; i < FALLBACK_QUESTIONS.length; i += 1) {
    const question = FALLBACK_QUESTIONS[i];
    const questionResult = await run(
      'INSERT INTO questions (question_text, category, question_type, question_order) VALUES (?, ?, ?, ?)',
      [question.questionText, question.category, question.questionType, i + 1]
    );

    for (let optionIndex = 0; optionIndex < question.options.length; optionIndex += 1) {
      const option = question.options[optionIndex];
      await run(
        `INSERT INTO question_options (question_id, option_text, score, target_major, option_order)
         VALUES (?, ?, ?, ?, ?)`,
        [questionResult.lastID, option.optionText, option.score, option.targetMajor, optionIndex + 1]
      );
    }
  }
}

const MAJORS_SEED = [
  { name: 'Computer Science', description: 'Study of computation, algorithms, data structures, and software development.', difficulty: 'Hard', salary: '$85,000 – $150,000', skills: ['Programming', 'Problem Solving', 'Data Structures', 'Algorithms', 'Software Design'], subjects: ['Calculus', 'Discrete Mathematics', 'Data Structures', 'Operating Systems', 'Database Systems'] },
  { name: 'Medicine', description: 'Study of the human body, diseases, diagnosis, and treatment of patients.', difficulty: 'Very Hard', salary: '$150,000 – $300,000', skills: ['Clinical Diagnosis', 'Patient Care', 'Research', 'Communication', 'Critical Thinking'], subjects: ['Anatomy', 'Physiology', 'Biochemistry', 'Pharmacology', 'Pathology'] },
  { name: 'Business Administration', description: 'Principles of managing and operating businesses, covering finance, marketing, and strategy.', difficulty: 'Medium', salary: '$55,000 – $120,000', skills: ['Leadership', 'Finance', 'Marketing', 'Strategic Planning', 'Communication'], subjects: ['Accounting', 'Economics', 'Marketing', 'Management', 'Business Law'] },
  { name: 'Civil Engineering', description: 'Design and construction of infrastructure including roads, bridges, and buildings.', difficulty: 'Hard', salary: '$65,000 – $120,000', skills: ['Structural Analysis', 'CAD', 'Project Management', 'Mathematics', 'Problem Solving'], subjects: ['Statics', 'Fluid Mechanics', 'Structural Engineering', 'Geotechnics', 'Construction Management'] },
  { name: 'Mechanical Engineering', description: 'Design and analysis of mechanical systems and devices.', difficulty: 'Hard', salary: '$70,000 – $125,000', skills: ['CAD/CAM', 'Thermodynamics', 'Mechanics', 'Manufacturing', 'Problem Solving'], subjects: ['Thermodynamics', 'Mechanics of Materials', 'Machine Design', 'Fluid Dynamics', 'Manufacturing Processes'] },
  { name: 'Electrical Engineering', description: 'Study of electrical systems, electronics, and electromagnetism.', difficulty: 'Hard', salary: '$75,000 – $130,000', skills: ['Circuit Design', 'Electronics', 'Signal Processing', 'Mathematics', 'Programming'], subjects: ['Circuit Analysis', 'Electromagnetics', 'Digital Electronics', 'Control Systems', 'Power Systems'] },
  { name: 'Law', description: 'Study of legal systems, regulations, and justice to represent and advise clients.', difficulty: 'Hard', salary: '$60,000 – $180,000', skills: ['Legal Research', 'Argumentation', 'Critical Thinking', 'Writing', 'Negotiation'], subjects: ['Constitutional Law', 'Contract Law', 'Criminal Law', 'Civil Procedure', 'Legal Research'] },
  { name: 'Architecture', description: 'Design of buildings and spaces combining art, engineering, and environmental considerations.', difficulty: 'Hard', salary: '$55,000 – $110,000', skills: ['Design', 'CAD', 'Creativity', 'Technical Drawing', 'Project Management'], subjects: ['Architectural Design', 'Structural Systems', 'Building Technology', 'Urban Planning', 'Architectural History'] },
  { name: 'Psychology', description: 'Scientific study of the mind and behavior to understand and support mental health.', difficulty: 'Medium', salary: '$45,000 – $100,000', skills: ['Empathy', 'Research', 'Counseling', 'Communication', 'Critical Analysis'], subjects: ['General Psychology', 'Research Methods', 'Abnormal Psychology', 'Developmental Psychology', 'Cognitive Science'] },
  { name: 'Education', description: 'Study of teaching methodologies, curriculum development, and educational psychology.', difficulty: 'Medium', salary: '$40,000 – $75,000', skills: ['Teaching', 'Communication', 'Curriculum Design', 'Patience', 'Leadership'], subjects: ['Educational Psychology', 'Curriculum Development', 'Teaching Methods', 'Classroom Management', 'Assessment'] },
  { name: 'Pharmacy', description: 'Study of drugs, medications, and pharmaceutical care for patient health.', difficulty: 'Hard', salary: '$90,000 – $130,000', skills: ['Pharmacology', 'Chemistry', 'Patient Counseling', 'Attention to Detail', 'Research'], subjects: ['Medicinal Chemistry', 'Pharmacology', 'Pharmaceutics', 'Clinical Pharmacy', 'Pharmacotherapy'] },
  { name: 'Nursing', description: 'Healthcare profession focused on the care of individuals and families.', difficulty: 'Hard', salary: '$55,000 – $100,000', skills: ['Patient Care', 'Clinical Skills', 'Communication', 'Critical Thinking', 'Compassion'], subjects: ['Anatomy', 'Physiology', 'Nursing Theory', 'Clinical Practice', 'Medical-Surgical Nursing'] },
  { name: 'Economics', description: 'Study of production, distribution, and consumption of goods and services.', difficulty: 'Medium', salary: '$55,000 – $120,000', skills: ['Data Analysis', 'Research', 'Mathematics', 'Critical Thinking', 'Policy Analysis'], subjects: ['Microeconomics', 'Macroeconomics', 'Econometrics', 'Economic Theory', 'International Economics'] },
  { name: 'Marketing', description: 'Study of promoting products and services to target audiences through various channels.', difficulty: 'Medium', salary: '$45,000 – $110,000', skills: ['Market Research', 'Digital Marketing', 'Creativity', 'Communication', 'Analytics'], subjects: ['Marketing Principles', 'Consumer Behavior', 'Digital Marketing', 'Brand Management', 'Market Research'] },
  { name: 'Accounting', description: 'Recording, classifying, and summarizing financial transactions for businesses.', difficulty: 'Medium', salary: '$50,000 – $110,000', skills: ['Financial Reporting', 'Attention to Detail', 'Mathematics', 'Tax Knowledge', 'Auditing'], subjects: ['Financial Accounting', 'Managerial Accounting', 'Taxation', 'Auditing', 'Cost Accounting'] },
  { name: 'Data Science', description: 'Extraction of insights from complex datasets using statistics, programming, and machine learning.', difficulty: 'Hard', salary: '$90,000 – $160,000', skills: ['Machine Learning', 'Python/R', 'Statistics', 'Data Visualization', 'SQL'], subjects: ['Statistics', 'Machine Learning', 'Data Mining', 'Big Data', 'Deep Learning'] },
  { name: 'Graphic Design', description: 'Visual communication through the creation of images, typography, and layouts.', difficulty: 'Medium', salary: '$40,000 – $90,000', skills: ['Creativity', 'Adobe Suite', 'Typography', 'Color Theory', 'UI/UX'], subjects: ['Design Principles', 'Typography', 'Digital Illustration', 'Branding', 'UI/UX Design'] },
  { name: 'Journalism', description: 'Investigation and reporting of news and information to the public.', difficulty: 'Medium', salary: '$35,000 – $85,000', skills: ['Writing', 'Research', 'Communication', 'Critical Thinking', 'Media Production'], subjects: ['News Writing', 'Media Law', 'Broadcast Journalism', 'Digital Media', 'Investigative Reporting'] },
  { name: 'Political Science', description: 'Study of political systems, governance, public policy, and international relations.', difficulty: 'Medium', salary: '$45,000 – $100,000', skills: ['Policy Analysis', 'Research', 'Writing', 'Critical Thinking', 'Communication'], subjects: ['Political Theory', 'Comparative Politics', 'International Relations', 'Public Policy', 'Research Methods'] },
  { name: 'Environmental Science', description: 'Study of the environment and solutions to environmental problems.', difficulty: 'Medium', salary: '$45,000 – $95,000', skills: ['Field Research', 'Data Analysis', 'GIS', 'Environmental Policy', 'Biology'], subjects: ['Ecology', 'Environmental Chemistry', 'GIS', 'Environmental Policy', 'Conservation Biology'] },
  { name: 'Mathematics', description: 'Study of abstract structures, patterns, quantities, and logical reasoning.', difficulty: 'Hard', salary: '$55,000 – $130,000', skills: ['Abstract Reasoning', 'Problem Solving', 'Statistics', 'Programming', 'Logic'], subjects: ['Calculus', 'Linear Algebra', 'Abstract Algebra', 'Real Analysis', 'Probability Theory'] }
];

async function seedMajorsIfEmpty() {
  const row = await get('SELECT COUNT(*) as count FROM majors');
  if (row.count > 0) return;

  for (const major of MAJORS_SEED) {
    await run(
      'INSERT INTO majors (name, description, difficulty, salary, skills, subjects) VALUES (?, ?, ?, ?, ?, ?)',
      [major.name, major.description, major.difficulty, major.salary, JSON.stringify(major.skills), JSON.stringify(major.subjects)]
    );
  }
}

async function ensureUsersColumns() {
  const columns = await new Promise((resolve, reject) => {
    db.all('PRAGMA table_info(users)', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map((row) => row.name));
    });
  });

  if (!columns.includes('profile_image')) {
    await run(`ALTER TABLE users ADD COLUMN profile_image TEXT DEFAULT ''`);
  }
}


async function ensureSessionQuestionColumns() {
  const columns = await new Promise((resolve, reject) => {
    db.all('PRAGMA table_info(session_questions)', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map((row) => row.name));
    });
  });

  if (!columns.includes('similarity_key')) {
    await run('ALTER TABLE session_questions ADD COLUMN similarity_key TEXT');
  }
}

async function seedAdminIfNone() {
  const existing = await get('SELECT id FROM users WHERE is_admin = 1 LIMIT 1');
  if (existing) return;

  const passwordHash = await bcrypt.hash('Admin123!', 12);
  await run(
    'INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, 1)',
    ['Admin', 'admin@majormatch.ai', passwordHash]
  );
  console.log('Admin user created: admin@majormatch.ai / Admin123!');
}

async function initDb() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  await new Promise((resolve, reject) => {
    db.exec(schemaSql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  await ensureUsersColumns();
  await ensureQuestionsColumns();
  await ensureResultsColumns();
  await ensureSessionQuestionColumns();
  await seedFallbackQuestionsIfEmpty();
  await seedMajorsIfEmpty();
  await seedAdminIfNone();

  console.log('Database initialized successfully');
}

module.exports = initDb;
