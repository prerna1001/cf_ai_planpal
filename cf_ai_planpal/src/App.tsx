/**
 * App.tsx — PlanPal UI
 *
 * Layout overview
 * - Sidebar: lightweight chat history stored in localStorage
 * - Main area: chat messages (user, thinking, assistant)
 * - Reminders drawer: add/edit upcoming reminders and view recent notifications
 *
 * Key behaviors
 * - Voice input via Web Speech API (Chrome/Edge)
 * - Markdown rendering of assistant/user messages with react-markdown
 * - Graceful loading/thinking indicator while the backend works
 */
import { useState, useEffect, useRef } from 'react';
import './App.css';
import { FaBars, FaBell, FaTimes, FaMicrophone, FaStop, FaPaperPlane, FaTrash } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import { IoMdCheckmark } from 'react-icons/io';
import { MdWavingHand } from 'react-icons/md';

interface Message {
  role: 'user' | 'assistant' | 'thinking';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  preview: string;
}

// Generate a unique session ID for this browser session
const generateSessionId = () => {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Save session to localStorage
const saveSessionToHistory = (sessionId: string, messages: Message[]) => {
  if (messages.length === 0) return;
  
  const sessions = JSON.parse(localStorage.getItem('chatSessions') || '[]') as ChatSession[];
  const firstUserMessage = messages.find(m => m.role === 'user')?.content || 'New Chat';
  const preview = firstUserMessage.substring(0, 50) + (firstUserMessage.length > 50 ? '...' : '');
  
  const existingIndex = sessions.findIndex(s => s.id === sessionId);
  const session: ChatSession = {
    id: sessionId,
    title: preview,
    timestamp: Date.now(),
    preview: preview
  };
  
  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.unshift(session);
  }
  
  // Keep only last 20 sessions
  localStorage.setItem('chatSessions', JSON.stringify(sessions.slice(0, 20)));
};

// Get all sessions from localStorage
const getSessions = (): ChatSession[] => {
  return JSON.parse(localStorage.getItem('chatSessions') || '[]') as ChatSession[];
};

function App() {
  // API base: configurable via Vite env for production, falls back to local dev
  const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8787';
  const DRAWER_WIDTH = 360; // fixed drawer width; resizer removed
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  // Global client id (persists across chats)
  const [clientId] = useState(() => {
    let id = localStorage.getItem('planpalUserId');
    if (!id) {
      id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('planpalUserId', id);
    }
    return id;
  });
  // Reminders UI state
  const [reminderText, setReminderText] = useState('');
  const [reminderAt, setReminderAt] = useState(''); // datetime-local value
  const [upcomingReminders, setUpcomingReminders] = useState<Array<{id: string; at: number; text: string}>>([]);
  const [reminderSubmitting, setReminderSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editAt, setEditAt] = useState(''); // datetime-local value
  const [showReminders, setShowReminders] = useState(false);
  const [dueNotifs, setDueNotifs] = useState<Array<{id: string; at: number; text: string}>>([]);
  const [popupReminder, setPopupReminder] = useState<{id: string; at: number; text: string} | null>(null);
  // Drawer sizing (fixed; resizer removed)
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  const isMobile = viewportWidth <= 600;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Initialize voice recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setVoiceSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Load sessions on mount
  useEffect(() => {
    setSessions(getSessions());
    // Request notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Save session when messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveSessionToHistory(sessionId, messages.filter(m => m.role !== 'thinking'));
      setSessions(getSessions());
    }
  }, [messages, sessionId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load upcoming reminders whenever client changes (global reminders)
  useEffect(() => {
    const loadReminders = async () => {
      try {
        const res = await fetch(`${API_BASE}/reminders?user=${encodeURIComponent(clientId)}`);
        const data = await res.json();
        if (Array.isArray(data.reminders)) setUpcomingReminders(data.reminders);
      } catch (e) {
        console.error('Failed to load reminders', e);
      }
    };
    loadReminders();
  }, [clientId]);

  // Smart reminder checking: only check when a reminder is actually due
  // Instead of polling every 10s, we schedule a check for the next reminder time
  useEffect(() => {
    if (upcomingReminders.length === 0) {
      return;
    }

    // Find the next reminder that will be due
    const now = Date.now();
    const nextReminder = upcomingReminders
      .filter(r => r.at > now)
      .sort((a, b) => a.at - b.at)[0];

    if (!nextReminder) {
      return;
    }

    // Calculate how long until the next reminder
    const msUntilDue = nextReminder.at - now;
    
    // Add a small buffer (5 seconds) to ensure we don't miss it
    const checkDelay = Math.max(0, msUntilDue - 5000);

    console.log(`Next reminder in ${Math.round(msUntilDue / 1000)}s, checking in ${Math.round(checkDelay / 1000)}s`);

    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/reminders/due?user=${encodeURIComponent(clientId)}&ack=true`);
        const data = await res.json();
        if (Array.isArray(data.due) && data.due.length > 0) {
          setDueNotifs(prev => [...prev, ...data.due]);
          
          // Show browser notification for each due reminder
          data.due.forEach((r: { id: string; text: string; at: number }) => {
            // Request notification permission if needed
            if ('Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification('PlanPal Reminder', {
                  body: r.text,
                  tag: r.id,
                  requireInteraction: true,
                });
              } else if (Notification.permission === 'default') {
                Notification.requestPermission().then(permission => {
                  if (permission === 'granted') {
                    new Notification('PlanPal Reminder', {
                      body: r.text,
                      tag: r.id,
                      requireInteraction: true,
                    });
                  }
                });
              }
            }
            
            // Show visual popup for the first reminder
            if (!popupReminder) {
              setPopupReminder(r);
            }
          });
          
          // Refresh upcoming list after due items are removed
          const res2 = await fetch(`${API_BASE}/reminders?user=${encodeURIComponent(clientId)}`);
          const data2 = await res2.json();
          if (Array.isArray(data2.reminders)) setUpcomingReminders(data2.reminders);
        }
      } catch (e) {
        // silent
      }
    }, checkDelay);

    return () => clearTimeout(timeoutId);
  }, [clientId, upcomingReminders]); // Re-run when reminders change

  // Resizer removed; drawer has fixed width via CSS/DRAWER_WIDTH

  // Track viewport width for responsive behavior
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Toggle voice input
  const toggleVoiceInput = () => {
    if (!voiceSupported || !recognitionRef.current) {
      alert('Voice input is not supported in your browser. Please try Chrome or Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Error starting voice recognition:', error);
        setIsListening(false);
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    // Add user message to state
    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    
    const userInput = input;
    setInput('');
    setLoading(true);

    // Add "thinking" indicator
    const thinkingMessage: Message = { role: 'thinking', content: 'Thinking...' };
    setMessages(prev => [...prev, thinkingMessage]);

    try {
      // Send sessionId to Agent for native conversation history management
      // Agent will persist conversation context automatically via Cloudflare
      const response = await fetch(`${API_BASE}/agents-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: userInput,
          sessionId: sessionId, // Cloudflare Agents manages history for this session
          user: sessionId, // Use sessionId as user identifier for reminders
        }),
      });

      const data = await response.json();
      console.log('Response from backend:', data);

      // Remove "thinking" message and add actual response
      setMessages(prev => {
        const withoutThinking = prev.filter(msg => msg.role !== 'thinking');
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.response?.response || data.response || 'No response received',
        };
        return [...withoutThinking, assistantMessage];
      });
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => {
        const withoutThinking = prev.filter(msg => msg.role !== 'thinking');
        return [...withoutThinking, {
          role: 'assistant',
          content: 'Error: Failed to get response',
        }];
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderText.trim() || !reminderAt) return;
    setReminderSubmitting(true);
    try {
      // Convert datetime-local to ISO string or timestamp
      const whenMs = new Date(reminderAt).getTime();
      const res = await fetch(`${API_BASE}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: clientId, text: reminderText.trim(), at: whenMs }),
      });
      const data = await res.json();
      if (data?.ok && data.reminder) {
        setUpcomingReminders(prev => {
          const next = [...prev, data.reminder as {id: string; at: number; text: string}];
          return next.sort((a, b) => a.at - b.at);
        });
        setReminderText('');
        setReminderAt('');
      } else {
        alert(data?.error || 'Failed to add reminder');
      }
    } catch (e) {
      console.error('Failed to add reminder', e);
      alert('Failed to add reminder');
    } finally {
      setReminderSubmitting(false);
    }
  };

  const startEditReminder = (r: { id: string; at: number; text: string }) => {
    setEditingId(r.id);
    setEditText(r.text);
    // Convert ms to datetime-local string
    const d = new Date(r.at);
    const pad = (n: number) => `${n}`.padStart(2, '0');
    const dtLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setEditAt(dtLocal);
  };

  const cancelEditReminder = () => {
    setEditingId(null);
    setEditText('');
    setEditAt('');
  };

  const saveEditReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    try {
      const whenMs = new Date(editAt).getTime();
      const res = await fetch(`${API_BASE}/reminders/${encodeURIComponent(editingId)}?user=${encodeURIComponent(clientId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editText, at: whenMs }),
      });
      const data = await res.json();
      if (data?.ok && data.reminder) {
        setUpcomingReminders(prev => {
          const next = prev.map(r => r.id === editingId ? data.reminder as {id: string; at: number; text: string} : r);
          return next.sort((a, b) => a.at - b.at);
        });
        cancelEditReminder();
      } else {
        alert(data?.error || 'Failed to update reminder');
      }
    } catch (e) {
      console.error('Failed to update reminder', e);
      alert('Failed to update reminder');
    }
  };

  const deleteReminder = async (id: string) => {
    if (!window.confirm('Delete this reminder?')) return;
    try {
      const res = await fetch(`${API_BASE}/reminders/${encodeURIComponent(id)}?user=${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data?.ok) {
        setUpcomingReminders(prev => prev.filter(r => r.id !== id));
        if (editingId === id) cancelEditReminder();
      } else {
        alert(data?.error || 'Failed to delete reminder');
      }
    } catch (e) {
      console.error('Failed to delete reminder', e);
      alert('Failed to delete reminder');
    }
  };

  // Format message content to preserve newlines and structure
  // Removed formatMessage; now using react-markdown for robust output

  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to start a new chat? This will clear the current conversation.')) {
      setMessages([]);
      setSessionId(generateSessionId());
    }
  };

  const loadSession = async (session: ChatSession) => {
    try {
      setLoading(true);
  const response = await fetch(`${API_BASE}/memory/${session.id}`);
      const data = await response.json();
      
      if (data.memory && Array.isArray(data.memory)) {
        setMessages(data.memory);
        setSessionId(session.id);
        setShowSidebar(false);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      alert('Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this chat history?')) {
      const sessions = getSessions().filter(s => s.id !== sessionId);
      localStorage.setItem('chatSessions', JSON.stringify(sessions));
      setSessions(sessions);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="App">
      {/* Sidebar Toggle Button (shown only when sidebar is closed) */}
      {!showSidebar && (
        <button 
          className="sidebar-toggle" 
          onClick={() => setShowSidebar(true)}
          title="Chat History"
        >
          <FaBars />
        </button>
      )}

  {/* Sidebar */}
      <div className={`sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Chat History</h3>
          <button onClick={() => setShowSidebar(false)} className="close-sidebar"><FaTimes /></button>
        </div>
        <div className="sessions-list">
          {sessions.length === 0 ? (
            <p className="no-sessions">No previous chats</p>
          ) : (
            sessions.map(session => (
              <div 
                key={session.id} 
                className={`session-item ${session.id === sessionId ? 'active' : ''}`}
                onClick={() => loadSession(session)}
              >
                <div className="session-title">{session.title}</div>
                <div className="session-meta">
                  <span className="session-time">{formatTimestamp(session.timestamp)}</span>
                  <button 
                    className="delete-session"
                    onClick={(e) => deleteSession(session.id, e)}
                    title="Delete chat"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Reminders Drawer Toggle (shown only when drawer is closed) */}
      {!showReminders && (
        <button
          className={`reminders-toggle`}
          onClick={() => setShowReminders(true)}
          title="Reminders"
        >
          <FaBell />
          {dueNotifs.length > 0 && <span className="reminder-badge">{dueNotifs.length}</span>}
        </button>
      )}

      {/* Reminder Popup Modal */}
      {popupReminder && (
        <div className="reminder-popup-overlay" onClick={() => setPopupReminder(null)}>
          <div className="reminder-popup" onClick={(e) => e.stopPropagation()}>
            <div className="reminder-popup-header">
              <span className="reminder-popup-icon"><FaBell /></span>
              <h3>Reminder!</h3>
              <button className="close-popup" onClick={() => setPopupReminder(null)}><FaTimes /></button>
            </div>
            <div className="reminder-popup-body">
              <p className="reminder-popup-time">{new Date(popupReminder.at).toLocaleString()}</p>
              <p className="reminder-popup-text">{popupReminder.text}</p>
            </div>
            <div className="reminder-popup-footer">
              <button className="popup-btn-primary" onClick={() => setPopupReminder(null)}>
                <IoMdCheckmark /> Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminders Drawer */}
      <div className={`reminders-drawer ${showReminders ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Reminders</h3>
          <button onClick={() => setShowReminders(false)} className="close-sidebar"><FaTimes /></button>
        </div>
        <div className="reminders-content">
          <form className="reminder-form" onSubmit={handleAddReminder}>
            <textarea
              className="reminder-text"
              placeholder="Reminder text (e.g., Check flights)"
              value={reminderText}
              onChange={(e) => setReminderText(e.target.value)}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = `${t.scrollHeight}px`;
              }}
              rows={2}
              disabled={reminderSubmitting}
            />
            <input
              type="datetime-local"
              className="reminder-when"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
              disabled={reminderSubmitting}
            />
            <button type="submit" disabled={reminderSubmitting || !reminderText.trim() || !reminderAt}>
              {reminderSubmitting ? 'Adding…' : 'Add'}
            </button>
          </form>

          {upcomingReminders.length > 0 && (
            <div className="upcoming-reminders">
              <div className="upcoming-title">Upcoming</div>
              <ul>
                {upcomingReminders.map(r => (
                  <li key={r.id}>
                    {editingId === r.id ? (
                      <form className="reminder-edit-form" onSubmit={saveEditReminder}>
                        <input
                          type="datetime-local"
                          className="reminder-when"
                          value={editAt}
                          onChange={(e) => setEditAt(e.target.value)}
                          required
                        />
                        <textarea
                          className="reminder-text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onInput={(e) => {
                            const t = e.currentTarget;
                            t.style.height = 'auto';
                            t.style.height = `${t.scrollHeight}px`;
                          }}
                          rows={2}
                          required
                        />
                        <button type="submit">Save</button>
                        <button type="button" onClick={cancelEditReminder}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span className="reminder-time">{new Date(r.at).toLocaleString()}</span>
                        <span className="reminder-text-item">{r.text}</span>
                        <span className="reminder-actions">
                          <button type="button" className="small" onClick={() => startEditReminder(r)}>Edit</button>
                          <button type="button" className="small danger" onClick={() => deleteReminder(r.id)}>Delete</button>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dueNotifs.length > 0 && (
            <div className="due-reminders">
              <div className="upcoming-title">
                Recent notifications
                <button 
                  type="button" 
                  className="small" 
                  onClick={() => setDueNotifs([])}
                  style={{ marginLeft: '8px' }}
                >
                  Clear All
                </button>
              </div>
              <ul>
                {dueNotifs.slice(-10).reverse().map(r => (
                  <li key={`${r.id}-${r.at}`}>
                    <span className="reminder-time">{new Date(r.at).toLocaleString()}</span>
                    <span className="reminder-text-item">{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div 
        className="main-content"
        style={{ 
          marginRight: showReminders && !isMobile ? `calc(${DRAWER_WIDTH}px + (100vw - 100%) / 2)` : 'auto',
          marginLeft: showReminders && !isMobile ? 'auto' : 'auto'
        }}
      >
        <div className="header">
          <h1>PlanPal - Your Planning Assistant</h1>
          <button 
            className="clear-chat-btn" 
            onClick={handleClearChat}
            disabled={loading || messages.length === 0}
            title="Start a new chat session"
          >
            New Chat
          </button>
        </div>
        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2><MdWavingHand /> Welcome to PlanPal!</h2>
              <p>I can help you plan anything - trips, weddings, events, shopping lists, and more!</p>
              <p className="welcome-subtitle">What would you like to plan today?</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              <strong>{msg.role === 'user' ? 'You:' : msg.role === 'thinking' ? '' : 'PlanPal:'}</strong>
              <div className="message-content">
                {msg.role === 'thinking' ? (
                  <div className="thinking-indicator">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="thinking-text">Thinking...</span>
                  </div>
                ) : (
                  <ReactMarkdown
                    components={{
                      p: ({node, ...props}) => <p className="planpal-paragraph" {...props} />,
                      h1: ({node, ...props}) => <h1 className="planpal-heading planpal-h1" {...props} />,
                      h2: ({node, ...props}) => <h2 className="planpal-heading planpal-h2" {...props} />,
                      h3: ({node, ...props}) => <h3 className="planpal-heading planpal-h3" {...props} />,
                      ul: ({node, ...props}) => <ul className="planpal-list" {...props} />,
                      ol: ({node, ...props}) => <ol className="planpal-list planpal-list-ol" {...props} />,
                      li: ({node, ...props}) => <li className="planpal-list-item" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="planpal-blockquote" {...props} />,
                      strong: ({node, ...props}) => <strong className="planpal-bold" {...props} />,
                      em: ({node, ...props}) => <em className="planpal-italic" {...props} />,
                      code: ({node, ...props}) => <code className="planpal-code" {...props} />,
                      a: ({node, ...props}) => <a className="planpal-link" {...props} />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSendMessage}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? "Listening..." : "Ask PlanPal something..."}
            disabled={loading}
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={`voice-btn ${isListening ? 'listening' : ''}`}
              title={isListening ? "Stop listening" : "Voice input"}
              disabled={loading}
            >
              {isListening ? <FaStop /> : <FaMicrophone />}
            </button>
          )}
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? 'Thinking...' : <><FaPaperPlane /> Send</>}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;