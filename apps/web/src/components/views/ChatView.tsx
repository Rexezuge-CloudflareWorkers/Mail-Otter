import { useRef, useEffect, useState } from 'react';
import { Send, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import type { ConnectedApplication } from '../../../components/types';
import type { ChatMessage, ChatSource } from '../../services/chatService';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select } from '../ui/Input';
import { FilterBar } from '../shared/FilterBar';
import { cn } from '../../lib/utils';

function appName(applicationId: string, applications: ConnectedApplication[]): string {
  return applications.find((a) => a.applicationId === applicationId)?.displayName ?? applicationId;
}

function SourcesToggle({ sources, applications }: { sources: ChatSource[]; applications: ConnectedApplication[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {sources.length} Source{sources.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1">
          {sources.map((s) => (
            <div key={s.vectorId} className="text-xs text-[var(--color-text-muted)] pl-4 border-l border-[var(--color-border)]">
              <span className="font-medium text-[var(--color-text-secondary)]">{s.title}</span>
              {' · '}
              {s.sender}
              {s.applicationId && (
                <span className="ml-1">
                  · <span className="italic">{appName(s.applicationId, applications)}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  sources,
  applications,
}: {
  message: ChatMessage;
  sources?: ChatSource[];
  applications: ConnectedApplication[];
}) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%]', isUser ? 'items-end' : 'items-start', 'flex flex-col')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words',
            isUser
              ? 'bg-[var(--color-accent)] text-[#0d1008] rounded-br-sm'
              : 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] rounded-bl-sm',
          )}
        >
          {message.content}
        </div>
        {!isUser && sources && sources.length > 0 && (
          <SourcesToggle sources={sources} applications={applications} />
        )}
      </div>
    </div>
  );
}

export function ChatView({
  applications,
  applicationId,
  setApplicationId,
  messages,
  sources,
  loading,
  onSend,
  onClear,
}: {
  applications: ConnectedApplication[];
  applicationId: string;
  setApplicationId: (id: string) => void;
  messages: ChatMessage[];
  sources: ChatSource[];
  loading: boolean;
  onSend: (query: string) => void;
  onClear: () => void;
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput('');
    onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-6 animate-fade-in-up">
      <FilterBar>
        <Select
          value={applicationId}
          onChange={(e) => setApplicationId(e.target.value)}
          className="min-w-[180px]"
        >
          <option value="">All Mailboxes</option>
          {applications.map((a) => (
            <option key={a.applicationId} value={a.applicationId}>
              {a.displayName}
            </option>
          ))}
        </Select>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={messages.length === 0}
          className="ml-auto"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear Chat
        </Button>
      </FilterBar>

      <Card className="flex flex-col p-0 overflow-hidden min-h-[500px]">
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 max-h-[60vh]">
          {messages.length === 0 && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 gap-3">
              <p className="text-[var(--color-text-secondary)] text-sm font-medium">
                Ask Anything About Your Emails
              </p>
              <p className="text-[var(--color-text-muted)] text-xs max-w-xs">
                Try: "What packages am I expecting?" or "Summarize my invoice emails this month"
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
            return (
              <MessageBubble
                key={i}
                message={msg}
                sources={isLastAssistant ? sources : undefined}
                applications={applications}
              />
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[var(--color-surface-3)] rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-text-muted)]" />
                <span className="text-sm text-[var(--color-text-muted)]">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-[var(--color-border)] p-4 flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your emails… (Enter to send, Shift+Enter for new line)"
            rows={2}
            disabled={loading}
            className={cn(
              'flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]',
              'px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-50',
            )}
          />
          <Button
            variant="primary"
            size="md"
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            <Send className="h-4 w-4" />
            Ask
          </Button>
        </div>
      </Card>
    </div>
  );
}
