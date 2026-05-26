import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { StatusBadge } from '@/components/ui/StatusBadge';

type ConcernMessage = {
  id: number;
  authorId: number;
  authorName?: string;
  body: string;
  attachmentUrl?: string | null;
  createdAt: string;
};

type Concern = {
  id: number;
  raisedBy: number;
  raisedTo: number;
  subject: string;
  description: string;
  priority: string;
  status: string;
  response?: string | null;
  attachmentUrl?: string | null;
  responseAttachmentUrl?: string | null;
  canReply?: boolean;
  messages?: ConcernMessage[];
  createdAt: string;
  respondedAt?: string | null;
  raisedByName?: string;
  raisedToName?: string;
};

function ConcernCard({
  concern,
  mode,
  onResponded,
}: {
  concern: Concern;
  mode: 'my' | 'inbox';
  onResponded?: () => void;
}) {
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isInbox = mode === 'inbox';
  const canReply = Boolean(concern.canReply);
  const messages =
    concern.messages?.length
      ? concern.messages
      : concern.response
        ? [{ id: 0, authorId: 0, authorName: 'Latest', body: concern.response, createdAt: concern.respondedAt || concern.createdAt }]
        : [];

  async function respond(close = false) {
    if (!reply.trim()) {
      toast('Reply is required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set('response', reply.trim());
      body.set('close', close ? 'true' : 'false');
      await api(`/api/concerns/${concern.id}/respond`, {
        method: 'PATCH',
        body,
      });
      toast(close ? 'Request closed' : 'Reply sent', 'success');
      setReply('');
      onResponded?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not respond', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{concern.subject}</h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            {mode === 'inbox' ? `Raised by ${concern.raisedByName || 'Employee'}` : `Raised to ${concern.raisedToName || 'Recipient'}`} · {concern.priority}
          </p>
        </div>
        <StatusBadge status={concern.status} />
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{concern.description}</p>
      {concern.attachmentUrl && (
        <a
          href={concern.attachmentUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-sm font-semibold text-[#ed1d24] hover:underline"
        >
          View attachment
        </a>
      )}
      {messages.length > 0 && (
        <div className="mt-4 space-y-2">
          {messages.map((message) => (
            <div key={message.id} className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-950">
              <p className="font-semibold">{message.authorName || 'Reply'}</p>
              <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
              {message.attachmentUrl && (
                <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-[#ed1d24] hover:underline">
                  View attachment
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Raised {new Date(concern.createdAt).toLocaleString()}
        {concern.respondedAt ? ` · Last reply ${new Date(concern.respondedAt).toLocaleString()}` : ''}
      </p>

      {concern.status !== 'Closed' && !canReply && (
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">Waiting for the other party to reply.</p>
      )}

      {canReply && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Write your reply..."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => respond(false)}
              className="rounded-xl bg-avgc-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Send reply
            </button>
            {isInbox && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => respond(true)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                Reply &amp; close
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

export function RaiseConcernPanel() {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [raisedTo, setRaisedTo] = useState('admin');
  const [priority, setPriority] = useState('Medium');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set('subject', subject);
      body.set('description', description);
      body.set('raisedTo', raisedTo);
      body.set('priority', priority);
      if (attachment) body.set('attachment', attachment);

      await api('/api/concern', { method: 'POST', body });
      toast('Concern raised successfully', 'success');
      setSubject('');
      setDescription('');
      setRaisedTo('admin');
      setPriority('Medium');
      setAttachment(null);
      window.dispatchEvent(new CustomEvent('avgc-refresh-concerns'));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not raise concern', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Raise a concern</h2>
      <p className="mt-1 text-sm text-slate-600">Send a workplace, IT, or HR concern to the right owner.</p>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Subject
          <input
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Raised To
          <select
            value={raisedTo}
            onChange={(e) => setRaisedTo(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="it_head">IT Head</option>
            <option value="my_manager">My Manager</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          >
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Attachment optional
          <input
            type="file"
            onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="sm:col-span-2 text-sm font-medium text-slate-700">
          Description
          <textarea
            required
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-avgc-brand px-6 py-3 text-sm font-semibold text-white sm:col-span-2 disabled:opacity-60"
        >
          {submitting ? 'Submitting...' : 'Submit concern'}
        </button>
      </form>
    </div>
  );
}

export function MyConcernsPanel() {
  const [rows, setRows] = useState<Concern[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ concerns: Concern[] }>('/api/concerns/my');
      setRows(data.concerns || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load concerns', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
    const fn = () => load().catch(() => {});
    window.addEventListener('avgc-refresh-concerns', fn);
    return () => window.removeEventListener('avgc-refresh-concerns', fn);
  }, [load]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">My concerns</h2>
      {loading && <EmptyState text="Loading concerns..." />}
      {!loading && rows.length === 0 && <EmptyState text="No concerns raised yet." />}
      {!loading &&
        rows.map((concern) => (
          <ConcernCard key={concern.id} concern={concern} mode="my" onResponded={() => load().catch(() => {})} />
        ))}
    </div>
  );
}

export function ConcernsInboxPanel() {
  const [rows, setRows] = useState<Concern[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ concerns: Concern[] }>('/api/concerns/inbox');
      setRows(data.concerns || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load inbox', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
    const fn = () => load().catch(() => {});
    window.addEventListener('avgc-refresh-concerns', fn);
    return () => window.removeEventListener('avgc-refresh-concerns', fn);
  }, [load]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Concerns inbox</h2>
      {loading && <EmptyState text="Loading inbox..." />}
      {!loading && rows.length === 0 && <EmptyState text="No concerns assigned to you." />}
      {!loading &&
        rows.map((concern) => (
          <ConcernCard key={concern.id} concern={concern} mode="inbox" onResponded={() => load().catch(() => {})} />
        ))}
    </div>
  );
}
