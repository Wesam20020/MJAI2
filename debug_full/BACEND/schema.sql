CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_text TEXT NOT NULL,
  category TEXT,
  question_type TEXT DEFAULT 'multiple-choice',
  question_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  option_text TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  target_major TEXT NOT NULL,
  option_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  answers TEXT NOT NULL,
  recommended_major TEXT NOT NULL,
  explanation TEXT,
  major_description TEXT,
  study_plan TEXT,
  subject_explanations TEXT,
  career_paths TEXT,
  top_majors TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS assessment_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  strongest_major_signals TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  question_id INTEGER,
  question_text_snapshot TEXT NOT NULL,
  category TEXT,
  question_type TEXT DEFAULT 'multiple-choice',
  question_order INTEGER DEFAULT 0,
  source TEXT DEFAULT 'db',
  similarity_key TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES assessment_sessions(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS session_question_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_question_id INTEGER NOT NULL,
  option_id INTEGER,
  option_text TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  target_major TEXT NOT NULL,
  option_order INTEGER DEFAULT 0,
  FOREIGN KEY (session_question_id) REFERENCES session_questions(id),
  FOREIGN KEY (option_id) REFERENCES question_options(id)
);

CREATE TABLE IF NOT EXISTS majors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  difficulty TEXT,
  salary TEXT,
  skills TEXT DEFAULT '[]',
  subjects TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  education_level TEXT DEFAULT '',
  school_or_university TEXT DEFAULT '',
  gpa TEXT DEFAULT '',
  favorite_subjects TEXT DEFAULT '[]',
  weak_subjects TEXT DEFAULT '[]',
  preferred_study_style TEXT DEFAULT '',
  academic_interests TEXT DEFAULT '[]',
  career_interests TEXT DEFAULT '[]',
  preferred_study_destination TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS courses_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  major TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS generated_question_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  questions_json TEXT NOT NULL,
  status TEXT DEFAULT 'ready',
  source TEXT DEFAULT 'openai-prepared',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
