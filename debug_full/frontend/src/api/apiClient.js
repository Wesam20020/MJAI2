const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');

const QUESTION_REQUEST_DEDUPE_MS = 3500;
const QUESTION_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_QUESTION_REQUEST_TIMEOUT_MS || 18000);
const DEFAULT_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS || 15000);
const AUTH_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_AUTH_REQUEST_TIMEOUT_MS || 10000);
const SUBMIT_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_SUBMIT_REQUEST_TIMEOUT_MS || 20000);

let pendingQuestionsRequest = null;
let lastQuestionsRequest = null;

function makeTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId)
  };
}


async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const timeout = makeTimeoutController(timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || timeout.signal
    });

    return response;
  } finally {
    timeout.clear();
  }
}


function getAuthHeaders() {
  const token = localStorage.getItem('token');

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function handleResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401) {
      // Clear stale auth immediately. This fixes the common case where the
      // backend database was reset but the browser still has an old token/user
      // id in localStorage, which previously caused FOREIGN KEY errors.
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    const message = data?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function normalizeNetworkError(error) {
  if (error?.name === 'AbortError') {
    return new Error('The request took too long. Please make sure the backend is returning local questions immediately and try again.');
  }

  if (error instanceof TypeError) {
    return new Error('Unable to connect to the server. Please make sure the backend is running on port 5000.');
  }

  return error;
}

export async function registerUser(payload) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, AUTH_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function loginUser(payload) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, AUTH_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchQuestions(userId, { force = false } = {}) {
  const requestKey = String(userId || 'guest');
  const now = Date.now();

  // React.StrictMode in development can mount the questionnaire twice. Without
  // de-duping, the frontend may create two sessions and may trigger duplicate
  // OpenAI preparation jobs. Reuse the same in-flight request for a few seconds.
  if (!force && pendingQuestionsRequest?.key === requestKey) {
    return pendingQuestionsRequest.promise;
  }

  if (
    !force &&
    lastQuestionsRequest?.key === requestKey &&
    now - lastQuestionsRequest.timestamp < QUESTION_REQUEST_DEDUPE_MS
  ) {
    return lastQuestionsRequest.data;
  }

  const timeout = makeTimeoutController(QUESTION_REQUEST_TIMEOUT_MS);

  const promise = (async () => {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', String(userId));
      params.set('_session', String(Date.now()));
      const query = params.toString();

      const response = await fetch(`${API_BASE_URL}/questions${query ? `?${query}` : ''}`, {
        method: 'GET',
        headers: {
          ...getAuthHeaders(),
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        },
        cache: 'no-store',
        signal: timeout.signal
      });

      const data = await handleResponse(response);
      lastQuestionsRequest = { key: requestKey, data, timestamp: Date.now() };
      return data;
    } catch (error) {
      throw normalizeNetworkError(error);
    } finally {
      timeout.clear();
      if (pendingQuestionsRequest?.key === requestKey) {
        pendingQuestionsRequest = null;
      }
    }
  })();

  pendingQuestionsRequest = { key: requestKey, promise };
  return promise;
}

export async function startPreparingNextQuestions(userId) {
  if (!userId) return null;

  // The backend now prepares next-session questions automatically after
  // GET /questions sends the current local/prepared set. Keeping this disabled
  // prevents duplicate OpenAI jobs and SQLite contention from the frontend.
  if (import.meta.env.VITE_ENABLE_FRONTEND_PREPARE !== 'true') {
    return { skipped: true, reason: 'backend-auto-prepares-next-session' };
  }

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/questions/prepare-next`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId })
    }, DEFAULT_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    // This request is only an optimization. The questionnaire should not fail if
    // OpenAI is slow, offline, or missing a key.
    console.warn('Next-question preparation skipped:', error.message || error);
    return null;
  }
}

export async function submitUserAnswers(payload) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/results/submit-answers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    }, SUBMIT_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchLatestResult(userId) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/results/latest?userId=${userId}`, {
      method: 'GET',
      headers: getAuthHeaders()
    }, DEFAULT_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchUserHistory(userId) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/results/history?userId=${userId}`, {
      method: 'GET',
      headers: getAuthHeaders()
    }, DEFAULT_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchResultDetails(resultId) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/results/${resultId}`, {
      method: 'GET',
      headers: getAuthHeaders()
    }, DEFAULT_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function sendChatMessage({ userId, message, language = 'en', history = [] }) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, message, language, history })
    }, DEFAULT_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function checkHealth() {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {
      method: 'GET'
    }, DEFAULT_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

async function apiRequest(path, options = {}) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers || {}) }
    }, options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);

    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchAdminDashboard({ page = 1, pageSize = 8, search = '' } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search: search || ''
  });

  return apiRequest(`/admin/dashboard?${params.toString()}`);
}

export function getAdminUsersExportUrl(search = '') {
  const params = new URLSearchParams();
  if (search) params.set('search', search);

  const query = params.toString();
  return `${API_BASE_URL}/admin/users/export${query ? `?${query}` : ''}`;
}

export async function deleteAdminUser(userId) {
  return apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
}

export async function toggleAdminUser(userId, isAdmin) {
  return apiRequest(`/admin/users/${userId}/admin`, {
    method: 'PATCH',
    body: JSON.stringify({ isAdmin })
  });
}

export async function fetchAdminQuestions() {
  return apiRequest('/admin/questions');
}

export async function createAdminQuestion(payload) {
  return apiRequest('/admin/questions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateAdminQuestion(id, payload) {
  return apiRequest(`/admin/questions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteAdminQuestion(id) {
  return apiRequest(`/admin/questions/${id}`, { method: 'DELETE' });
}

export async function fetchMajors() {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/majors`, {
      method: 'GET',
      headers: getAuthHeaders()
    }, DEFAULT_REQUEST_TIMEOUT_MS);
    return await handleResponse(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function compareMajors({ ids, names } = {}) {
  const params = new URLSearchParams();
  if (ids) params.set('ids', ids.join(','));
  else if (names) params.set('names', names.join(','));
  return apiRequest(`/majors/compare?${params.toString()}`);
}

export async function fetchProfile() {
  return apiRequest('/profile/me');
}

export async function updateProfile(payload) {
  return apiRequest('/profile/me', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function uploadProfileImage(base64Image) {
  return apiRequest('/profile/me/image', {
    method: 'POST',
    body: JSON.stringify({ image: base64Image })
  });
}

export async function deleteProfileImage() {
  return apiRequest('/profile/me/image', { method: 'DELETE' });
}
export async function fetchCourseMajors() {
  return apiRequest('/courses/majors');
}

export async function fetchCourseContent(major) {
  const params = new URLSearchParams({ major });
  return apiRequest(`/courses?${params.toString()}`);
}
