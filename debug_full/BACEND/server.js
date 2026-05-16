const express = require('express');
const cors = require('cors');
require('dotenv').config();

const initDb = require('./config/initDb');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const questionRoutes = require('./routes/questionRoutes');
const resultRoutes = require('./routes/resultRoutes');
const profileRoutes = require('./routes/profileRoutes');
const adminRoutes = require('./routes/adminRoutes');
const coursesRoutes = require('./routes/coursesRoutes');
const chatRoutes = require('./routes/chatRoutes');
const majorRoutes = require('./routes/majorRoutes');
const { notFoundHandler } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .concat(['http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177']);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  }
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/majors', majorRoutes);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Major Recommendation System API',
    endpoints: {
      health: '/api/health',
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      questions: 'GET /api/questions',
      submitAnswers: 'POST /api/results/submit-answers',
      latestResult: 'GET /api/results/latest?userId=1',
      history: 'GET /api/results/history?userId=1',
      profile: 'GET /api/profile/me',
      updateProfile: 'PUT /api/profile/me',
      adminDashboard: 'GET /api/admin/dashboard',
      adminUsersExport: 'GET /api/admin/users/export',
      courseMajors: 'GET /api/courses/majors',
      courseContent: 'GET /api/courses?major=Computer%20Science',
      courseContentByParam: 'GET /api/courses/selected/Computer%20Science',
      chat: 'POST /api/chat'
    }
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });