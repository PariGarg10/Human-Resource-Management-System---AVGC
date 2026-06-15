import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api, readEmployee } from '@/lib/api';

type ChatMessage = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  at: string;
};

const SUGGESTED_PROMPTS = [
  'Hi! I just joined — where do I start?',
  'How do I apply for leave?',
  'Where can I see my attendance?',
  'How many leave days do I get?',
];

const WELCOME_TEXT =
  "Hey! I'm **Maya** from AVGC HR. I can help with **company policies** and **using this portal** — onboarding, leave, attendance, performance reviews, and more. Ask anything or tell me what you're trying to do.";

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function historyForApi(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'bot')
    .map((m) => ({
      role: m.role === 'bot' ? 'assistant' : 'user',
      content: m.text,
    }));
}

export function FloatingPolicyChatbot({ initialOpen = false }: { initialOpen?: boolean }) {
  const sessionId = useMemo(() => uuid(), []);
  const firstName = useMemo(() => {
    const emp = readEmployee();
    const name = emp?.name?.trim().split(/\s+/)[0];
    return name || '';
  }, []);
  const [open, setOpen] = useState(initialOpen);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [welcomed, setWelcomed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (!open || welcomed || messages.length > 0) return;
    const now = new Date().toISOString();
    const greeting =
      firstName && WELCOME_TEXT.includes('Hey!')
        ? WELCOME_TEXT.replace('Hey!', `Hey ${firstName}!`)
        : WELCOME_TEXT;
    setMessages([
      {
        id: `welcome-${now}`,
        role: 'bot',
        text: greeting,
        at: now,
      },
    ]);
    setWelcomed(true);
  }, [open, welcomed, messages.length, firstName]);

  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || typing) return;

      const priorMessages = messages.filter((m) => !m.id.startsWith('welcome-'));
      const now = new Date().toISOString();
      const userMsg: ChatMessage = {
        id: `u-${now}`,
        role: 'user',
        text: message,
        at: now,
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput('');
      setTyping(true);
      requestAnimationFrame(scrollToBottom);

      const minTypingMs = 450 + Math.min(message.length * 8, 900);
      const started = Date.now();

      try {
        const data = await api<{ answer: string }>('/api/policies/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            sessionId,
            history: historyForApi(priorMessages),
          }),
        });
        const elapsed = Date.now() - started;
        if (elapsed < minTypingMs) {
          await new Promise((r) => setTimeout(r, minTypingMs - elapsed));
        }
        const botMsg: ChatMessage = {
          id: `b-${Date.now()}`,
          role: 'bot',
          text: data.answer || 'Hmm, I drew a blank on that one. Try asking in a different way?',
          at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } catch (e) {
        const botMsg: ChatMessage = {
          id: `b-err-${Date.now()}`,
          role: 'bot',
          text: e instanceof Error ? e.message : "I couldn't reach the server — give it another try in a moment.",
          at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } finally {
        setTyping(false);
        requestAnimationFrame(scrollToBottom);
      }
    },
    [messages, scrollToBottom, sessionId, typing]
  );

  const send = useCallback(() => {
    sendMessage(input).catch(() => undefined);
  }, [input, sendMessage]);

  const showSuggestions = messages.length <= 1 && !typing;

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="policy-chat-fab"
          aria-label="Chat with Maya, HR policy assistant"
          onClick={() => setOpen(true)}
        >
          <MessageCircle size={24} strokeWidth={2} />
        </button>
      ) : null}

      {open ? (
        <div className="policy-chat-panel" role="dialog" aria-label="Maya — HR policy assistant">
          <div className="policy-chat-header">
            <div className="policy-chat-header-meta">
              <span className="policy-chat-avatar" aria-hidden="true">
                M
              </span>
              <div>
                <h3>Maya</h3>
                <span className="policy-chat-status">HR policy assistant · online</span>
              </div>
            </div>
            <button
              type="button"
              className="manager-modal-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <p className="policy-chat-disclaimer">
            Answers are based on AVGC policy documents. For personal cases, contact HR.
          </p>
          <div className="policy-chat-messages" ref={listRef}>
            {messages.map((m) => (
              <div key={m.id} className={`policy-chat-msg policy-chat-msg--${m.role}`}>
                {m.role === 'bot' ? <ReactMarkdown>{m.text}</ReactMarkdown> : m.text}
                <time dateTime={m.at}>{formatTime(m.at)}</time>
              </div>
            ))}
            {showSuggestions ? (
              <div className="policy-chat-suggestions" aria-label="Suggested messages">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="policy-chat-suggestion"
                    onClick={() => sendMessage(prompt).catch(() => undefined)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
            {typing ? (
              <div className="policy-chat-typing" aria-label="Maya is typing">
                <span className="policy-chat-typing-label">Maya is typing</span>
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>
          <form
            className="policy-chat-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Say hi, ask anything, or share what's on your mind…"
              disabled={typing}
              aria-label="Message to Maya"
            />
            <button type="submit" disabled={typing || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
