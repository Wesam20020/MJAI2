import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ExternalLink, Loader2, PlayCircle, Route, Sparkles } from 'lucide-react';
import { fetchCourseContent, fetchCourseMajors } from '../api/apiClient';

function getMajorName(item) {
  if (!item) return '';
  return typeof item === 'string' ? item : item.major || item.name || '';
}

function youtubeUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export default function CoursesPage() {
  const [majorsSummary, setMajorsSummary] = useState(null);
  const [selectedMajor, setSelectedMajor] = useState('');
  const [courseData, setCourseData] = useState(null);
  const [loadingMajors, setLoadingMajors] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState('');

  const topMajors = useMemo(() => {
    return majorsSummary?.topThreeMajors?.map(getMajorName).filter(Boolean) || [];
  }, [majorsSummary]);

  useEffect(() => {
    let active = true;

    async function loadMajors() {
      try {
        setLoadingMajors(true);
        setError('');
        const response = await fetchCourseMajors();
        if (!active) return;
        const data = response?.data || {};
        setMajorsSummary(data);
        const firstMajor = getMajorName(data.topThreeMajors?.[0]) || data.latestRecommendedMajor || '';
        setSelectedMajor(firstMajor);
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Failed to load your recommended majors. Please complete the assessment first.');
      } finally {
        if (active) setLoadingMajors(false);
      }
    }

    loadMajors();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedMajor) return;
    let active = true;

    async function loadCourseContent() {
      try {
        setLoadingContent(true);
        setError('');
        const response = await fetchCourseContent(selectedMajor);
        if (!active) return;
        setCourseData(response?.data || null);
      } catch (err) {
        if (!active) return;
        setCourseData(null);
        setError(err.message || 'Failed to load course content.');
      } finally {
        if (active) setLoadingContent(false);
      }
    }

    loadCourseContent();
    return () => { active = false; };
  }, [selectedMajor]);

  const content = courseData?.courseContent;

  return (
    <section className="courses-page page-shell">
      <div className="courses-hero glass-panel">
        <div>
          <p className="eyebrow"><Sparkles size={16} /> Personalized learning path</p>
          <h1>Courses for Your Top Majors</h1>
          <p>
            Choose one of your Top 3 recommended majors and get a focused learning path,
            suggested course topics, YouTube search links, free resources, and beginner project ideas.
          </p>
        </div>
        <div className="courses-hero-icon">
          <BookOpen size={42} />
        </div>
      </div>

      {loadingMajors && (
        <div className="courses-state glass-panel">
          <Loader2 className="spin" size={22} /> Loading your majors...
        </div>
      )}

      {!loadingMajors && error && !content && (
        <div className="courses-state courses-error glass-panel">{error}</div>
      )}

      {!loadingMajors && topMajors.length > 0 && (
        <div className="courses-tabs glass-panel-soft">
          {topMajors.map((major) => (
            <button
              key={major}
              type="button"
              className={major === selectedMajor ? 'course-tab active' : 'course-tab'}
              onClick={() => setSelectedMajor(major)}
            >
              {major}
            </button>
          ))}
        </div>
      )}

      {loadingContent && (
        <div className="courses-state glass-panel">
          <Loader2 className="spin" size={22} /> Preparing course content for {selectedMajor}...
        </div>
      )}

      {!loadingContent && content && (
        <div className="courses-grid">
          <article className="course-card course-card-large glass-panel">
            <p className="eyebrow"><Route size={16} /> Roadmap</p>
            <h2>{content.title || `${selectedMajor} Learning Path`}</h2>
            <p>{content.overview}</p>
            <ol className="course-roadmap">
              {(content.roadmap || []).map((step, index) => (
                <li key={`${step}-${index}`}>{step}</li>
              ))}
            </ol>
          </article>

          <article className="course-card glass-panel">
            <p className="eyebrow"><BookOpen size={16} /> Starter courses</p>
            <div className="course-list">
              {(content.starterCourses || []).map((course, index) => (
                <div className="course-list-item" key={`${course.title}-${index}`}>
                  <h3>{course.title}</h3>
                  <p>{course.description}</p>
                  <a href={youtubeUrl(course.keywords || course.title)} target="_blank" rel="noreferrer">
                    Search on YouTube <ExternalLink size={14} />
                  </a>
                </div>
              ))}
            </div>
          </article>

          <article className="course-card glass-panel">
            <p className="eyebrow"><PlayCircle size={16} /> YouTube search links</p>
            <div className="course-link-list">
              {(content.youtubeSearchQueries || []).map((query, index) => (
                <a href={youtubeUrl(query)} target="_blank" rel="noreferrer" key={`${query}-${index}`}>
                  {query} <ExternalLink size={14} />
                </a>
              ))}
            </div>
          </article>

          <article className="course-card glass-panel">
            <p className="eyebrow"><ExternalLink size={16} /> Free resources</p>
            <div className="course-link-list">
              {(content.freeResources || []).map((resource, index) => (
                <a href={resource.url} target="_blank" rel="noreferrer" key={`${resource.name}-${index}`}>
                  {resource.name} <ExternalLink size={14} />
                </a>
              ))}
            </div>
          </article>

          <article className="course-card course-card-large glass-panel">
            <p className="eyebrow"><Sparkles size={16} /> Beginner project ideas</p>
            <ul className="course-projects">
              {(content.projectIdeas || []).map((idea, index) => (
                <li key={`${idea}-${index}`}>{idea}</li>
              ))}
            </ul>
          </article>
        </div>
      )}
    </section>
  );
}
