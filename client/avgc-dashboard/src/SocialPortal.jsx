import { useCallback, useEffect, useMemo, useState } from 'react';
import { GamingArena } from '@/features/social-games/GamingArena';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];
const LEGACY_STORAGE_KEY = 'avgc-social-posts';

const ARTWORK_CATEGORIES = ['Illustration', 'Photography', '3D Render', 'Design', 'Painting'];

const CHANNEL_META = {
  artwork: { label: 'Artwork Room', feedTitle: 'Gallery', tag: '// Artwork Room', btnHover: 'hover:bg-teal-700' },
  board: { label: 'The Board', feedTitle: 'Feed', tag: '// The Board', btnHover: 'hover:bg-indigo-600' },
  gaming: { label: 'Gaming Arena', feedTitle: 'Arena', tag: '// Gaming Arena', btnHover: 'hover:bg-violet-700' },
};

function channelLabel(channel) {
  return CHANNEL_META[channel]?.label || channel;
}

function burstEmoji(emoji, origin) {
  const ox = origin?.x ?? window.innerWidth / 2;
  const oy = origin?.y ?? window.innerHeight / 2;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:99998;overflow:hidden;';
  document.body.appendChild(layer);

  const particles = Array.from({ length: 18 }, () => ({
    x: ox,
    y: oy,
    vx: (Math.random() - 0.5) * 16,
    vy: (Math.random() - 0.5) * 16 - 8,
    size: 24 + Math.random() * 32,
    rot: Math.random() * 360,
    vr: (Math.random() - 0.5) * 10,
    life: 1,
    decay: 0.018 + Math.random() * 0.014,
  }));

  const nodes = particles.map((p) => {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;font-size:${p.size}px;line-height:1;will-change:transform,opacity;filter:none;`;
    layer.appendChild(span);
    return { el: span, p };
  });

  let frame = 0;
  const tick = () => {
    let alive = 0;
    nodes.forEach(({ el, p }) => {
      if (p.life <= 0) return;
      alive += 1;
      p.vy += 0.32;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= p.decay;
      el.style.transform = `translate(${p.x - ox}px, ${p.y - oy}px) rotate(${p.rot}deg) scale(${0.5 + p.life * 0.7})`;
      el.style.opacity = String(Math.max(0, p.life));
    });
    frame += 1;
    if (alive > 0 && frame < 130) {
      requestAnimationFrame(tick);
    } else {
      layer.remove();
    }
  };
  requestAnimationFrame(tick);
}

function authHeaders(json = false) {
  const headers = {};
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function parseApiResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

async function fetchSocialPosts() {
  const res = await fetch('/api/social-posts', { headers: authHeaders() });
  const data = await parseApiResponse(res);
  return { posts: data.posts || [], isAdmin: Boolean(data.isAdmin) };
}

async function createSocialPost(payload) {
  const form = new FormData();
  form.append('channel', payload.channel);
  form.append('title', payload.title || '');
  form.append('caption', payload.caption || '');
  form.append('category', payload.category || '');
  if (payload.file) form.append('media', payload.file);
  const res = await fetch('/api/social-posts', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const data = await parseApiResponse(res);
  return data.post;
}

async function patchSocialPost(id, body) {
  const res = await fetch(`/api/social-posts/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  const data = await parseApiResponse(res);
  return data.post;
}

async function postReaction(id, emoji) {
  const res = await fetch(`/api/social-posts/${id}/reactions`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ emoji }),
  });
  const data = await parseApiResponse(res);
  return data.post;
}

async function postComment(id, text) {
  const res = await fetch(`/api/social-posts/${id}/comments`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ text }),
  });
  const data = await parseApiResponse(res);
  return data.post;
}

function mergePost(posts, updated) {
  if (!updated) return posts;
  const idx = posts.findIndex((p) => p.id === updated.id);
  if (idx === -1) return [updated, ...posts];
  const next = [...posts];
  next[idx] = updated;
  return next;
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function GrayscaleMedia({ src, alt, className = '', onClick, clickable = false }) {
  if (!src) return null;
  const img = (
    <img
      src={src}
      alt={alt || ''}
      className={`grayscale transition-[filter] duration-400 ease-in-out hover:grayscale-0 ${className} ${
        clickable ? 'cursor-zoom-in' : ''
      }`}
    />
  );
  if (!clickable || !onClick) return img;
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full border-0 bg-transparent p-0 text-left"
      aria-label="View full image"
    >
      {img}
    </button>
  );
}

function MediaLightbox({ post, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!post?.mediaUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/92 p-4 md:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Post media viewer"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
        aria-label="Close"
      >
        ✕
      </button>
      <div
        className="flex max-h-full w-full max-w-5xl flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {post.mediaType === 'video' ? (
          <video
            src={post.mediaUrl}
            controls
            autoPlay
            className="max-h-[78vh] w-full rounded-lg object-contain"
          />
        ) : (
          <img
            src={post.mediaUrl}
            alt={post.title || post.caption || 'Post image'}
            className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain"
          />
        )}
        <div className="mt-4 max-w-2xl text-center text-white">
          <p className="font-semibold">{post.author}</p>
          {post.title && <p className="mt-1 text-lg font-serif">{post.title}</p>}
          {post.caption && <p className="mt-2 text-sm text-white/80">{post.caption}</p>}
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, size = 'md' }) {
  const sz = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <div
      className={`${sz} flex shrink-0 items-center justify-center rounded-full bg-stone-300 font-semibold text-stone-700 grayscale transition-[filter] duration-400 ease-in-out hover:grayscale-0`}
    >
      {initials(name)}
    </div>
  );
}

function ReactionBar({ post, onToggle }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {REACTIONS.map((emoji) => {
        const count = post.reactions[emoji] || 0;
        const active = post.userReactions[emoji];
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => onToggle(post.id, emoji, e)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors duration-200 ${
              active
                ? 'border-teal-600 bg-teal-50 text-teal-800'
                : 'border-stone-200 bg-white text-stone-600 hover:border-teal-400'
            }`}
          >
            <span className="text-lg leading-none" style={{ filter: 'none' }}>
              {emoji}
            </span>
            {count > 0 ? <span className="text-xs font-semibold tabular-nums">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function CommentSection({ post, onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  return (
    <div className="mt-3 border-t border-stone-200 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-stone-500 grayscale transition-[filter] duration-400 hover:grayscale-0 hover:text-teal-700"
      >
        {open ? 'Hide' : 'Show'} comments ({post.comments.length})
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {post.comments.map((c) => (
            <div key={c.id} className="flex gap-2 text-sm">
              <Avatar name={c.author} size="sm" />
              <div>
                <span className="font-semibold text-stone-800">{c.author}</span>
                <p className="text-stone-600">{c.text}</p>
                <span className="text-xs text-stone-400">{timeAgo(c.at)}</span>
              </div>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              onAdd(post.id, text.trim());
              setText('');
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a comment…"
              className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-stone-800 px-3 py-2 text-sm font-medium text-white grayscale transition-[filter] duration-400 hover:grayscale-0 hover:bg-teal-700"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function NewPostModal({ channel, author, onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState(ARTWORK_CATEGORIES[0]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');

  const isArtwork = channel === 'artwork';
  const channelName = channelLabel(channel);

  function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isArtwork && !file) return;
    await onSubmit({
      channel,
      author,
      title: isArtwork ? title.trim() : '',
      caption: caption.trim(),
      category: isArtwork ? category : '',
      file,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#f9f9f7] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">
            New post — {channelName}
          </h2>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isArtwork && (
            <label className="block text-sm font-medium text-stone-700">
              Title
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
              />
            </label>
          )}
          <label className="block text-sm font-medium text-stone-700">
            Caption
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
            />
          </label>
          {isArtwork && (
            <label className="block text-sm font-medium text-stone-700">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
              >
                {ARTWORK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm font-medium text-stone-700">
            {isArtwork ? 'Artwork file (required)' : 'Media (optional)'}
            <input
              type="file"
              accept="image/*,video/*"
              required={isArtwork}
              onChange={onFileChange}
              className="mt-1 block w-full text-sm"
            />
          </label>
          {preview && (
            <div className="overflow-hidden rounded-xl border border-stone-200">
              {file?.type?.startsWith('video/') ? (
                <video src={preview} controls className="max-h-48 w-full grayscale hover:grayscale-0 transition-[filter] duration-400" />
              ) : (
                <GrayscaleMedia src={preview} alt="Preview" className="max-h-48 w-full object-cover" />
              )}
            </div>
          )}
          <p className="text-xs text-stone-500">Submissions require admin approval before publishing.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-stone-200 px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white grayscale transition-[filter] duration-400 hover:grayscale-0"
            >
              Submit for approval
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChannelLanding({ onEnter }) {
  const cards = [
    {
      id: 'artwork',
      name: 'Artwork Room',
      emoji: '🎨',
      desc: 'Curated gallery for illustrations, photography, and design.',
      image: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80',
      serif: true,
      badgeClass: 'bg-red-500',
    },
    {
      id: 'board',
      name: 'The Board',
      emoji: '📌',
      desc: 'Announcements, celebrations, memes — your mini company Instagram.',
      image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80',
      serif: false,
      badgeClass: 'bg-red-500',
    },
    {
      id: 'gaming',
      name: 'Gaming Arena',
      emoji: '🎮',
      desc: 'Clips, highlights, and wins — share your best gaming moments.',
      image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80',
      serif: false,
      badgeClass: 'bg-violet-600',
    },
  ];

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col justify-center overflow-hidden px-4 py-4">
      <p className="font-mono text-xs uppercase tracking-widest text-stone-400">// 01 — Active channels</p>
      <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">
        STEP INTO A ROOM.
      </h1>
      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, index) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onEnter(card.id)}
            className="group overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition hover:shadow-md"
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={card.image}
                alt=""
                className="h-full w-full object-cover grayscale transition-[filter] duration-400 ease-in-out group-hover:grayscale-0"
              />
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 font-mono text-xs text-stone-700">
                №{String(index + 1).padStart(2, '0')}
              </span>
              <span
                className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs font-bold text-white ${card.badgeClass}`}
              >
                {card.name}
              </span>
            </div>
            <div className="p-5">
              <h2 className={`text-xl font-bold uppercase text-stone-900 ${card.serif ? 'font-serif' : 'font-sans'}`}>
                <span style={{ filter: 'none' }}>{card.emoji}</span> {card.name}
              </h2>
              <p className="mt-1 font-mono text-sm text-stone-500">{card.desc}</p>
              <span className="mt-4 inline-block font-mono text-sm text-teal-700 group-hover:text-indigo-600">
                Enter room →
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ArtworkCard({ post, onToggleReaction, onAddComment, onOpenMedia }) {
  return (
    <article className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <GrayscaleMedia
        src={post.mediaUrl}
        alt={post.title}
        className="w-full object-cover"
        clickable
        onClick={() => onOpenMedia?.(post)}
      />
      <div className="p-4">
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
          {post.category}
        </span>
        <h3 className="mt-2 font-serif text-lg font-bold text-stone-900">{post.title}</h3>
        <p className="text-sm text-stone-500">by {post.author}</p>
        {post.caption && <p className="mt-2 text-sm text-stone-600">{post.caption}</p>}
        <p className="mt-1 text-xs text-stone-400">{timeAgo(post.createdAt)}</p>
        <div className="mt-3">
          <ReactionBar post={post} onToggle={onToggleReaction} />
          <CommentSection post={post} onAdd={onAddComment} />
        </div>
      </div>
    </article>
  );
}

function BoardCard({ post, onToggleReaction, onAddComment, onOpenMedia }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <Avatar name={post.author} />
        <div>
          <p className="font-semibold text-stone-900">{post.author}</p>
          <p className="text-xs text-stone-400">{timeAgo(post.createdAt)}</p>
        </div>
      </div>
      {post.mediaUrl && (
        <GrayscaleMedia
          src={post.mediaUrl}
          alt=""
          className="w-full max-h-80 object-cover"
          clickable
          onClick={() => onOpenMedia?.(post)}
        />
      )}
      <div className="p-4 pt-2">
        {post.caption && <p className="font-sans text-stone-800">{post.caption}</p>}
        <div className="mt-3">
          <ReactionBar post={post} onToggle={onToggleReaction} />
          <CommentSection post={post} onAdd={onAddComment} />
        </div>
      </div>
    </article>
  );
}

export default function SocialPortal({ currentUserName = 'You', isAdminUser = false }) {
  const [screen, setScreen] = useState('landing');
  const [channel, setChannel] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [lightboxPost, setLightboxPost] = useState(null);

  const currentAuthor = currentUserName;

  const refreshPosts = useCallback(async () => {
    try {
      const { posts: next } = await fetchSocialPosts();
      setPosts(next);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Could not load posts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    refreshPosts();
  }, [refreshPosts]);

  useEffect(() => {
    if (screen === 'landing') return undefined;
    const ms = isAdminUser && screen === 'admin' ? 3000 : 5000;
    const id = window.setInterval(() => {
      refreshPosts();
    }, ms);
    return () => window.clearInterval(id);
  }, [screen, isAdminUser, refreshPosts]);

  useEffect(() => {
    if (!isAdminUser && screen === 'admin') {
      setScreen('landing');
    }
  }, [isAdminUser, screen]);

  const pending = useMemo(() => posts.filter((p) => p.status === 'pending'), [posts]);
  const myPosts = useMemo(
    () => posts.filter((p) => p.author === currentAuthor),
    [posts, currentAuthor]
  );
  const approvedArtwork = useMemo(
    () => posts.filter((p) => p.channel === 'artwork' && p.status === 'approved'),
    [posts]
  );
  const approvedBoard = useMemo(
    () => posts.filter((p) => p.channel === 'board' && p.status === 'approved'),
    [posts]
  );
  const approvedGaming = useMemo(
    () => posts.filter((p) => p.channel === 'gaming' && p.status === 'approved'),
    [posts]
  );

  const enterChannel = useCallback((ch) => {
    setChannel(ch);
    setScreen('feed');
  }, []);

  const toggleReaction = useCallback(
    async (postId, emoji, event) => {
      const existing = posts.find((p) => p.id === postId);
      const wasActive = Boolean(existing?.userReactions?.[emoji]);
      try {
        const updated = await postReaction(postId, emoji);
        setPosts((prev) => mergePost(prev, updated));
        if (!wasActive) {
          burstEmoji(emoji, { x: event?.clientX, y: event?.clientY });
        }
      } catch (err) {
        setLoadError(err.message || 'Could not update reaction');
      }
    },
    [posts]
  );

  const addComment = useCallback(async (postId, text) => {
    try {
      const updated = await postComment(postId, text);
      setPosts((prev) => mergePost(prev, updated));
    } catch (err) {
      setLoadError(err.message || 'Could not add comment');
    }
  }, []);

  const submitPost = useCallback(async (payload) => {
    setSubmitting(true);
    try {
      const created = await createSocialPost(payload);
      setPosts((prev) => mergePost(prev, created));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Could not submit post');
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const approvePost = useCallback(async (id) => {
    try {
      const updated = await patchSocialPost(id, { action: 'approve' });
      setPosts((prev) => mergePost(prev, updated));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Could not approve post');
    }
  }, []);

  const rejectPost = useCallback(async (id, reason) => {
    try {
      const updated = await patchSocialPost(id, { action: 'reject', reason });
      setPosts((prev) => mergePost(prev, updated));
      setRejectId(null);
      setRejectReason('');
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Could not reject post');
    }
  }, []);

  const openMedia = useCallback((post) => {
    if (post?.mediaUrl && post.mediaType !== 'text') setLightboxPost(post);
  }, []);

  return (
    <div className="avgc-social-portal flex h-full min-h-0 flex-col overflow-hidden bg-[#ebebec] font-sans text-[#000000]">
      <header className="z-40 shrink-0 border-b border-stone-200 bg-[#f9f9f7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setScreen('landing');
              setChannel(null);
            }}
            className="font-serif text-lg font-bold text-stone-900 grayscale transition-[filter] duration-400 hover:grayscale-0 hover:text-teal-700"
          >
            AVGC Social
          </button>

          <nav className="flex flex-wrap items-center gap-1 rounded-full border border-stone-200 bg-white p-1">
            {[
              { id: 'artwork', label: 'Artwork Room' },
              { id: 'board', label: 'The Board' },
              { id: 'gaming', label: 'Gaming Arena' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => enterChannel(tab.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium grayscale transition-all duration-400 hover:grayscale-0 ${
                  channel === tab.id && screen === 'feed'
                    ? 'bg-teal-600 text-white grayscale-0'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setScreen('my-posts')}
              className={`text-sm font-medium grayscale transition-[filter] duration-400 hover:grayscale-0 ${
                screen === 'my-posts' ? 'text-indigo-600' : 'text-stone-600'
              }`}
            >
              My Posts
            </button>
            {isAdminUser && (
              <button
                type="button"
                onClick={() => setScreen('admin')}
                className={`relative text-sm font-medium grayscale transition-[filter] duration-400 hover:grayscale-0 ${
                  screen === 'admin' ? 'text-indigo-600' : 'text-stone-600'
                }`}
              >
                Admin Panel
                {pending.length > 0 && (
                  <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {pending.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      <main
        className={`mx-auto w-full max-w-6xl flex-1 min-h-0 px-4 ${
          screen === 'landing' ? 'overflow-hidden py-2' : 'overflow-y-auto pb-16 pt-6'
        }`}
      >
        {loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}
        {loading && screen !== 'landing' && (
          <p className="mb-4 text-sm text-stone-500">Loading posts…</p>
        )}
        {screen === 'landing' && <ChannelLanding onEnter={enterChannel} />}

        {screen === 'feed' && channel === 'artwork' && (
          <div>
            <div className="mb-6 flex items-end justify-between">
              <div>
                <p className="font-mono text-xs text-stone-400">// Artwork Room</p>
                <h2 className="font-serif text-3xl font-bold text-stone-900">Gallery</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white grayscale transition-[filter] duration-400 hover:grayscale-0 hover:bg-teal-700"
              >
                + New Post
              </button>
            </div>
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
              {approvedArtwork.map((post) => (
                <ArtworkCard
                  key={post.id}
                  post={post}
                  onToggleReaction={toggleReaction}
                  onAddComment={addComment}
                  onOpenMedia={openMedia}
                />
              ))}
            </div>
          </div>
        )}

        {screen === 'feed' && channel === 'board' && (
          <div>
            <div className="mb-6 flex items-end justify-between">
              <div>
                <p className="font-mono text-xs text-stone-400">{CHANNEL_META.board.tag}</p>
                <h2 className="font-sans text-3xl font-bold text-stone-900">{CHANNEL_META.board.feedTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white grayscale transition-[filter] duration-400 hover:grayscale-0 hover:bg-indigo-600"
              >
                + New Post
              </button>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {approvedBoard.map((post) => (
                <BoardCard
                  key={post.id}
                  post={post}
                  onToggleReaction={toggleReaction}
                  onAddComment={addComment}
                  onOpenMedia={openMedia}
                />
              ))}
            </div>
          </div>
        )}

        {screen === 'feed' && channel === 'gaming' && (
          <div>
            <div className="mb-4">
              <p className="font-mono text-xs text-stone-400">{CHANNEL_META.gaming.tag}</p>
              <h2 className="font-sans text-3xl font-black text-stone-900">Gaming Arena</h2>
            </div>
            <GamingArena
              isAdminUser={isAdminUser}
              feedSlot={
                <div>
                  <div className="mb-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setModalOpen(true)}
                      className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                    >
                      + New Post
                    </button>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    {approvedGaming.length === 0 && (
                      <p className="text-stone-500 md:col-span-2">No gaming posts yet. Share a clip from the Feed tab.</p>
                    )}
                    {approvedGaming.map((post) => (
                      <BoardCard
                        key={post.id}
                        post={post}
                        onToggleReaction={toggleReaction}
                        onAddComment={addComment}
                        onOpenMedia={openMedia}
                      />
                    ))}
                  </div>
                </div>
              }
            />
          </div>
        )}

        {screen === 'my-posts' && (
          <div>
            <h2 className="font-sans text-2xl font-bold">My Posts</h2>
            <p className="mt-1 text-sm text-stone-500">Track submissions and approval status.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {myPosts.length === 0 && (
                <p className="text-stone-500">You have not submitted any posts yet.</p>
              )}
              {myPosts.map((post) => (
                <article key={post.id} className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono uppercase text-stone-400">
                      {channelLabel(post.channel)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        post.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : post.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {post.status === 'pending'
                        ? 'Pending Approval'
                        : post.status === 'approved'
                          ? 'Published'
                          : 'Rejected'}
                    </span>
                  </div>
                  {post.title && <h3 className="mt-2 font-semibold">{post.title}</h3>}
                  {post.caption && <p className="text-sm text-stone-600">{post.caption}</p>}
                  {post.mediaUrl && (
                    <GrayscaleMedia
                      src={post.mediaUrl}
                      alt=""
                      className="mt-3 max-h-40 w-full rounded-lg object-cover"
                      clickable
                      onClick={() => openMedia(post)}
                    />
                  )}
                  {post.rejectReason && (
                    <p className="mt-2 text-xs text-red-600">Reason: {post.rejectReason}</p>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}

        {screen === 'admin' && isAdminUser && (
          <div>
            <h2 className="font-sans text-2xl font-bold">Admin — Pending queue</h2>
            <p className="mt-1 text-sm text-stone-500">{pending.length} post(s) awaiting review.</p>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {pending.length === 0 && <p className="text-stone-500 lg:col-span-2">No pending submissions.</p>}
              {pending.map((post) => (
                <article
                  key={post.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
                >
                  {post.mediaUrl && (
                    <div className="border-b border-stone-100 bg-stone-50 p-4">
                      <GrayscaleMedia
                        src={post.mediaUrl}
                        alt={post.title || 'Pending post preview'}
                        className="mx-auto max-h-72 w-full max-w-full rounded-lg object-contain"
                        clickable
                        onClick={() => openMedia(post)}
                      />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                        {channelLabel(post.channel)}
                      </span>
                      <span className="text-xs text-stone-400">{timeAgo(post.createdAt)}</span>
                    </div>
                    {post.title && <h3 className="mt-3 text-lg font-semibold text-stone-900">{post.title}</h3>}
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
                      {post.caption || '—'}
                    </p>
                    <p className="mt-2 text-sm font-medium text-stone-500">by {post.author}</p>
                    {post.category && (
                      <span className="mt-2 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                        {post.category}
                      </span>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => approvePost(post.id)}
                        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white grayscale transition-[filter] duration-400 hover:grayscale-0"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectId(post.id)}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </main>

      {modalOpen && channel && (
        <NewPostModal
          channel={channel}
          author={currentAuthor}
          onClose={() => setModalOpen(false)}
          onSubmit={submitPost}
        />
      )}

      {lightboxPost && <MediaLightbox post={lightboxPost} onClose={() => setLightboxPost(null)} />}

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h3 className="font-bold">Reject post</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Optional reason for rejection…"
              rows={3}
              className="mt-3 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectId(null)} className="rounded-lg border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => rejectPost(rejectId, rejectReason.trim())}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
