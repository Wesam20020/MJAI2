import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './routes/ProtectedRoute';
import AdminRoute from './routes/AdminRoute';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import QuestionnairePage from './pages/QuestionnairePage';
import ResultsPage from './pages/ResultsPage';
import ChatPage from './pages/ChatPage';
import HistoryPage from './pages/HistoryPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import EditProfilePage from './pages/EditProfilePage';
import ComparePage from './pages/ComparePage';
import CoursesPage from './pages/CoursesPage';
import AboutPage from './pages/AboutPage';
import FAQPage from './pages/FAQPage';
import ContactPage from './pages/ContactPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminQuestionsPage from './pages/AdminQuestionsPage';
import AdminAnalyticsPage from './pages/AdminAnalyticsPage';
import AdminActivityPage from './pages/AdminActivityPage';
import ResultDetailsPage from './pages/ResultDetailsPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="faq" element={<FAQPage />} />
        <Route path="contact" element={<ContactPage />} />

        <Route
          path="questionnaire"
          element={
            <ProtectedRoute>
              <QuestionnairePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="results"
          element={
            <ProtectedRoute>
              <ResultsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="profile/edit"
          element={
            <ProtectedRoute>
              <EditProfilePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="compare"
          element={
            <ProtectedRoute>
              <ComparePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="courses"
          element={
            <ProtectedRoute>
              <CoursesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="results/:resultId"
          element={
            <ProtectedRoute>
              <ResultDetailsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />

        <Route
          path="admin/users"
          element={
            <AdminRoute>
              <AdminUsersPage />
            </AdminRoute>
          }
        />

        <Route
          path="admin/questions"
          element={
            <AdminRoute>
              <AdminQuestionsPage />
            </AdminRoute>
          }
        />

        <Route
          path="admin/analytics"
          element={
            <AdminRoute>
              <AdminAnalyticsPage />
            </AdminRoute>
          }
        />

        <Route
          path="admin/activity"
          element={
            <AdminRoute>
              <AdminActivityPage />
            </AdminRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
