import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Trash2,
  X,
  CloudCheck,
  Cpu,
  MessageSquare,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context';
import { syncCopilotSessionToFirestore } from '../../lib/firebase';

export type GeminiModelTier = 'gemini-3.1-flash-lite' | 'gemini-3.8-flash' | 'gemini-4-argon';

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
  timestamp: string;
}

const MODEL_OPTIONS: Array<{
  id: GeminiModelTier;
  label: string;
  badge: string;
  description: string;
}> = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Fast · Flash Lite',
    badge: 'gemini-3.1-flash-lite',
    description: 'Low-latency lookups and quick domain metric summaries.',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Balanced · Flash 3.8',
    badge: 'gemini-3.8-flash',
    description: 'General multi-turn cohort analysis and intervention planning.',
  },
  {
    id: 'gemini-4-argon',
    label: 'Complex · Gemini 4 Argon',
    badge: 'gemini-4-argon',
    description: 'Deep multi-domain reasoning and strategic cohort diagnostics.',
  },
];

const STARTER_PROMPTS = [
  'Which high-risk students currently need an academic or attendance check-in?',
  'Design a 4-week non-punitive support plan for a student with 72% attendance and 1 backlog.',
  'How do the 7 EduNexus domains combine into the Holistic Student Success Score?',
];

export const GeminiCopilotDrawer: React.FC = () => {
  const { isFirebaseSynced } = useAuth();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<GeminiModelTier>('gemini-3.8-flash');
  const [sessionId] = useState<string>(() => `copilot-${Date.now()}`);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Hello! I am the **EduNexus AI Multi-Turn Analytics Copilot**. Ask me about cohort attendance trends, 7-domain risk drivers, or human-reviewed intervention strategies.',
      modelUsed: 'gemini-3.8-flash',
      timestamp: new Date().toISOString(),
    },
  ]);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && threadEndRef.current && typeof threadEndRef.current.scrollIntoView === 'function') {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length, isOpen]);

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;

    const userMsg: CopilotMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await api<{
        reply: string;
        model_used: string;
        requested_model: string;
        timestamp: string;
      }>('/api/v1/ai/copilot', {
        method: 'POST',
        body: {
          model: selectedModel,
          prompt: trimmed,
          messages: nextHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        bypassCache: true,
      });

      const assistantMsg: CopilotMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        modelUsed: response.model_used || selectedModel,
        timestamp: response.timestamp || new Date().toISOString(),
      };

      const updatedThread = [...nextHistory, assistantMsg];
      setMessages(updatedThread);

      // Sync session metadata to Firestore if signed in with Google
      if (isFirebaseSynced) {
        void syncCopilotSessionToFirestore({
          sessionId,
          title: trimmed.slice(0, 120),
          modelTier: selectedModel,
          lastMessagePreview: response.reply.slice(0, 480),
          messageCount: updatedThread.length,
        }).catch(() => {
          // Non-blocking cloud sync
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to reach Gemini Copilot endpoint.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: 'welcome-msg',
        role: 'assistant',
        content:
          'Conversation cleared. Choose a Gemini model tier above and ask a multi-turn question about your student cohort.',
        modelUsed: selectedModel,
        timestamp: new Date().toISOString(),
      },
    ]);
    setError(null);
  };

  return (
    <>
      {/* Floating Copilot Launcher Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open Gemini AI Analytics Copilot"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 border border-zinc-700 dark:border-[#3f3f46] bg-zinc-900 dark:bg-[#f4f4f5] hover:bg-zinc-800 dark:hover:bg-[#e4e4e7] px-4 py-2.5 text-xs font-semibold text-white dark:text-[#09090b] shadow-lg transition-all whitespace-nowrap shrink-0"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span>Gemini AI Copilot</span>
        </button>
      )}

      {/* Slide-Over Multi-Turn Chat Drawer */}
      {isOpen && (
        <aside
          aria-label="Gemini AI Analytics Copilot Drawer"
          className="drawer-slide-in fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215] text-slate-900 dark:text-[#f4f4f5] shadow-2xl"
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#27272a] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center bg-zinc-900 dark:bg-[#f4f4f5] text-white dark:text-[#09090b]">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-[#f4f4f5]">
                    Gemini AI Analytics Copilot
                  </h2>
                  {isFirebaseSynced && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 dark:text-[#d4d4d8]">
                      <CloudCheck className="h-3 w-3" />
                      <span>Cloud Synced</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#a1a1aa]">
                  Multi-turn 7-domain cohort advisor · AI recommends, humans decide
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleReset}
                title="Clear conversation thread"
                className="p-1.5 text-slate-500 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5]"
                aria-label="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-500 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5]"
                aria-label="Close Gemini Copilot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Model Tier Selector */}
          <div className="border-b border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] px-4 py-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-[#a1a1aa] mb-1.5">
              <span className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-slate-800 dark:text-[#f4f4f5]" />
                <span>Select Gemini Model Tier</span>
              </span>
              <span className="font-mono text-[10px]">{selectedModel}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedModel(opt.id)}
                  className={`border px-2 py-1.5 text-left text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                    selectedModel === opt.id
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-[#f4f4f5] dark:bg-[#f4f4f5] dark:text-[#09090b] font-semibold'
                      : 'border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215] text-slate-700 dark:text-[#d4d4d8]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Message Thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] border px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-[#f4f4f5] dark:bg-[#f4f4f5] dark:text-[#09090b]'
                      : 'border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] text-slate-800 dark:text-[#f4f4f5]'
                  }`}
                >
                  {msg.content}
                </div>
                <span className="mt-1 text-[10px] font-mono text-slate-400 dark:text-[#a1a1aa]">
                  {msg.role === 'user' ? 'You' : `Copilot (${msg.modelUsed || selectedModel})`}
                </span>
              </div>
            ))}

            {loading && (
              <div className="border border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#18181c] px-3.5 py-2.5 text-xs text-slate-500 dark:text-[#a1a1aa]">
                Generating multi-turn cohort analysis with <code>{selectedModel}</code>…
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="border border-rose-300 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
              >
                {error}
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          {/* Starter Prompts */}
          <div className="border-t border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#18181c] px-4 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] mb-1.5 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              <span>Suggested Cohort Prompts</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={loading}
                  onClick={() => void sendPrompt(prompt)}
                  className="border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121215] px-2 py-1 text-left text-[11px] text-slate-700 dark:text-[#d4d4d8] hover:border-zinc-500 dark:hover:border-[#e4e4e7]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendPrompt(input);
            }}
            className="border-t border-slate-200 dark:border-[#27272a] p-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a follow-up about students, risks, or interventions…"
              className="flex-1 border border-slate-300 dark:border-[#27272a] bg-white dark:bg-[#18181c] px-3 py-2 text-xs text-slate-900 dark:text-[#f4f4f5] focus:border-zinc-900 dark:focus:border-[#e4e4e7] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-1.5 bg-zinc-900 dark:bg-[#f4f4f5] hover:bg-zinc-800 dark:hover:bg-[#e4e4e7] px-3.5 py-2 text-xs font-semibold text-white dark:text-[#09090b] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </form>
        </aside>
      )}
    </>
  );
};
