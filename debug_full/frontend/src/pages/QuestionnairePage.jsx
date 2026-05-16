import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { fetchQuestions, submitUserAnswers } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const STORAGE_KEY = 'mm_quiz_progress';

const CATEGORY_KEY_MAP = {
  'Interests':     'quiz.category_interests',
  'Skills':        'quiz.category_skills',
  'Work Style':    'quiz.category_work_style',
  'Future Goals':  'quiz.category_future_goals',
};

function loadFreshQuestionSession(userId, options = {}) {
  // The API client de-dupes only duplicate dev/StrictMode requests for a few
  // seconds. Normal retakes still request a fresh questionnaire session.
  return fetchQuestions(userId, options);
}

function QuestionnairePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [questions, setQuestions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [answersMap, setAnswersMap] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!user?.id) return undefined;

    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const loadQuestions = async () => {
      try {
        setIsLoading(true);
        setError('');

        const response = await loadFreshQuestionSession(user.id, { force: reloadKey > 0 });
        if (cancelled || requestIdRef.current !== requestId) return;

        const questionList = response?.data || [];
        setSessionId(response?.sessionId || null);

        if (!Array.isArray(questionList) || questionList.length === 0) {
          throw new Error('No questions found');
        }

        setQuestions(questionList);
        setAnswersMap({});
        setCurrentIndex(0);
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        if (cancelled || requestIdRef.current !== requestId) return;
        const message = err.message || t('errors.load_failed');
        setQuestions([]);
        setSessionId(null);
        setError(message);
        showToast(message, 'error');
      } finally {
        if (!cancelled && requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    };

    loadQuestions();

    return () => {
      cancelled = true;
    };
  }, [reloadKey, showToast, t, user?.id]);

  useEffect(() => {
    if (questions.length > 0) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ answers: answersMap, index: currentIndex }));
    }
  }, [answersMap, currentIndex, questions.length]);

  const currentQuestion = questions[currentIndex];
  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return Math.round(((currentIndex + 1) / questions.length) * 100);
  }, [currentIndex, questions.length]);

  const currentAnswer = currentQuestion ? answersMap[currentQuestion.id] : null;
  const isLastQuestion = currentIndex === questions.length - 1;
  const isFirstQuestion = currentIndex === 0;

  const handleSelectOption = (questionId, optionId) => {
    setAnswersMap((prev) => ({ ...prev, [questionId]: optionId }));
    setError('');
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    if (!currentAnswer) {
      const message = t('quiz.select_answer');
      setError(message);
      showToast(message, 'error');
      return;
    }
    setError('');
    if (!isLastQuestion) setCurrentIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    setError('');
    if (!isFirstQuestion) setCurrentIndex((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      const message = t('errors.user_missing');
      setError(message);
      showToast(message, 'error');
      return;
    }
    const unanswered = questions.filter((q) => !answersMap[q.id]);
    if (unanswered.length > 0) {
      const message = t('quiz.answer_all');
      setError(message);
      showToast(message, 'error');
      return;
    }
    const formattedAnswers = questions.map((q) => ({
      questionId: q.id,
      optionId: answersMap[q.id]
    }));
    try {
      setIsSubmitting(true);
      setError('');
      await submitUserAnswers({ userId: user.id, sessionId, answers: formattedAnswers });
      sessionStorage.removeItem(STORAGE_KEY);
      showToast(t('quiz.submit_success'), 'success');
      navigate('/results');
    } catch (err) {
      const message = err.message || t('errors.submit_failed');
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="quiz-page-v2">
        <div className="quiz-shell-v2" style={{ alignItems: 'center', paddingTop: 80 }}>
          <div className="loading-spinner" />
          <p style={{ color: 'var(--muted)' }}>{t('quiz.loading')}</p>
        </div>
      </div>
    );
  }

  if (error && !questions.length) {
    return (
      <div className="quiz-page-v2">
        <div className="quiz-shell-v2">
          <p className="form-error" style={{ textAlign: 'center', padding: 20 }}>{error}</p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              {t('common.retry', { defaultValue: 'Try again' })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="quiz-page-v2">
        <div className="quiz-shell-v2">
          <p style={{ color: 'var(--muted)', textAlign: 'center' }}>{t('quiz.no_questions')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-page-v2">
      <div className="quiz-shell-v2">
        {/* Header */}
        <div className="quiz-header-v2 anim-fade-in">
          <h1>{t('quiz.title')}</h1>
          <div className="quiz-progress-v2">
            <div className="quiz-progress-v2-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="quiz-meta-row">
            <span>{t('quiz.question_of', { current: currentIndex + 1, total: questions.length })}</span>
            <span>{t('quiz.percent_completed', { percent: progress })}</span>
          </div>
        </div>

        {/* Question card */}
        <div className="quiz-card-v2 anim-fade-up delay-100" key={currentIndex}>
          {currentQuestion.category && (
            <span className="quiz-category-badge">
              {t(CATEGORY_KEY_MAP[currentQuestion.category] || 'quiz.category_interests', currentQuestion.category)}
            </span>
          )}

          <p className="quiz-question-text">{currentQuestion.questionText}</p>

          <div className="quiz-options">
            {currentQuestion.options?.map((option) => {
              const isSelected = currentAnswer === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`quiz-option-btn${isSelected ? ' selected' : ''}`}
                  onClick={() => handleSelectOption(currentQuestion.id, option.id)}
                >
                  <span className="quiz-option-indicator" />
                  <span>{option.optionText}</span>
                </button>
              );
            })}
          </div>

          {error && <p className="form-error" style={{ marginTop: 4 }}>{error}</p>}

          <div className="quiz-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleBack}
              disabled={isFirstQuestion || isSubmitting}
            >
              <ChevronLeft size={16} />
              {t('quiz.back')}
            </button>

            {!isLastQuestion ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNext}
                disabled={isSubmitting}
              >
                {t('quiz.next')}
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-glow"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? t('quiz.submitting') : t('quiz.submit')}
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuestionnairePage;
