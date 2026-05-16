import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SendHorizontal, Sparkles, RefreshCw, Bot, User, Loader2 } from 'lucide-react';
import { sendChatMessage } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const QUICK_PROMPT_KEYS = ['quick_1', 'quick_2', 'quick_3', 'quick_4', 'quick_5'];

function ChatBubble({ message, index }) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';

  return (
    <div
      className={`chat-msg-row ${isUser ? 'chat-msg-row--user' : 'chat-msg-row--ai'}`}
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      {!isUser && (
        <div className="chat-avatar chat-avatar--ai">
          <Bot size={15} />
        </div>
      )}
      <div className={`chat-bubble-new ${isUser ? 'chat-bubble-new--user' : 'chat-bubble-new--ai'}`}>
        <div className="chat-bubble-label">
          {isUser ? t('chat.you') : t('chat.ai_name')}
        </div>
        <p className="chat-bubble-text">
          {message.content || t('chat.greeting')}
        </p>
        {message.timestamp && (
          <span className="chat-bubble-time">{message.timestamp}</span>
        )}
      </div>
      {isUser && (
        <div className="chat-avatar chat-avatar--user">
          <User size={15} />
        </div>
      )}
    </div>
  );
}

function TypingBubble() {
  const { t } = useTranslation();
  return (
    <div className="chat-msg-row chat-msg-row--ai">
      <div className="chat-avatar chat-avatar--ai">
        <Bot size={15} />
      </div>
      <div className="chat-bubble-new chat-bubble-new--ai chat-bubble-new--typing">
        <div className="chat-bubble-label">{t('chat.ai_name')}</div>
        <div className="typing-dots-new">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

function ChatPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', content: null, timestamp: null }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isSending, scrollToBottom]);

  const getTimestamp = () =>
    new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());

  const sendMessage = async (messageText) => {
    const trimmed = messageText.trim();
    if (!trimmed || isSending) return;

    if (!user?.id) {
      const msg = t('errors.user_missing');
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setError('');
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: trimmed,
      timestamp: getTimestamp()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const history = messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await sendChatMessage({
        userId: user.id,
        message: trimmed,
        language: i18n.language,
        history
      });
      const reply = response?.data?.reply || t('errors.send_failed');

      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', content: reply, timestamp: getTimestamp() }
      ]);
    } catch (err) {
      const msg = err.message || t('errors.send_failed');
      setError(msg);
      showToast(msg, 'error');
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input);
    }
  };

  const handleTextareaInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const clearChat = () => {
    setMessages([{ id: 1, role: 'assistant', content: null, timestamp: null }]);
    setError('');
  };

  return (
    <section className="page-section chat-page-new">
      <div className="chat-layout">

        <div className="chat-sidebar glass-panel">
          <div className="chat-sidebar-header">
            <div className="feature-icon">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="chat-sidebar-title">{t('chat.title')}</h2>
              <p className="chat-sidebar-sub">{t('chat.subtitle')}</p>
            </div>
          </div>

          <div className="chat-prompts-section">
            <p className="chat-prompts-label">{t('chat.quick_title')}</p>
            <div className="chat-prompts-list">
              {QUICK_PROMPT_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="chat-prompt-chip"
                  onClick={() => sendMessage(t(`chat.${key}`))}
                  disabled={isSending}
                >
                  {t(`chat.${key}`)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="chat-clear-btn"
            onClick={clearChat}
          >
            <RefreshCw size={14} />
            <span>{t('chat.new_chat')}</span>
          </button>
        </div>

        <div className="chat-main glass-panel">
          <div className="chat-messages-wrap" role="log" aria-live="polite">
            {messages.map((msg, index) => (
              <ChatBubble key={msg.id} message={msg} index={index} />
            ))}
            {isSending && <TypingBubble />}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-composer">
            {error && <p className="chat-error-text">{error}</p>}
            <form className="chat-form-new" onSubmit={handleSubmit}>
              <div className="chat-input-wrap">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaInput}
                  onKeyDown={handleKeyDown}
                  placeholder={t('chat.placeholder')}
                  rows={1}
                  className="chat-textarea"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  className="chat-send-btn"
                  disabled={isSending || !input.trim()}
                  aria-label={t('chat.send')}
                >
                  {isSending ? <Loader2 size={18} className="spin" /> : <SendHorizontal size={18} />}
                </button>
              </div>
              <p className="chat-hint">{t('chat.enter_hint')}</p>
            </form>
          </div>
        </div>

      </div>
    </section>
  );
}

export default ChatPage;
