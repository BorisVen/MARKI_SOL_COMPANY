import { useCallback, useEffect, useState } from 'react';
import {
  apiAddComment,
  apiCreatePost,
  apiDeletePost,
  apiGetPosts,
  apiLikePost,
  type Post,
} from '../api';
import { useAuth } from '../auth';
import { Icon } from '../icons';

export default function FeedPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [posting, setPosting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPosts(await apiGetPosts());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createPost = async () => {
    if (!newText.trim()) return;
    setPosting(true);
    try {
      await apiCreatePost({ text: newText.trim() });
      setNewText('');
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'Post failed');
    } finally {
      setPosting(false);
    }
  };

  const like = async (id: string) => {
    try { await apiLikePost(id); await reload(); } catch {}
  };

  const remove = async (id: string) => {
    if (!confirm('Удалить пост?')) return;
    try { await apiDeletePost(id); await reload(); } catch (e: any) { alert(e?.message ?? 'Failed'); }
  };

  const comment = async (id: string, text: string) => {
    if (!text.trim()) return;
    try { await apiAddComment(id, text.trim()); await reload(); } catch (e: any) { alert(e?.message ?? 'Failed'); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Лента</h2>
          <p>Посты сообщества и обновления компаний.</p>
        </div>
        <button className="btn" onClick={reload}><Icon.Refresh /> Обновить</button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="field" style={{ marginBottom: 10 }}>
          <textarea
            placeholder="Что нового?"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            style={{ minHeight: 60 }}
          />
        </div>
        <button className="btn btn-primary" onClick={createPost} disabled={posting || !newText.trim()}>
          {posting ? 'Публикация…' : 'Опубликовать'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="spinner">Загрузка…</div>
      ) : posts.length === 0 ? (
        <div className="empty">Пока пусто.</div>
      ) : (
        posts.map(p => (
          <PostCard
            key={p.id}
            post={p}
            currentUid={user?.uid}
            onLike={() => like(p.id)}
            onDelete={() => remove(p.id)}
            onComment={(text) => comment(p.id, text)}
          />
        ))
      )}
    </div>
  );
}

function PostCard({
  post,
  currentUid,
  onLike,
  onDelete,
  onComment,
}: {
  post: Post;
  currentUid?: string;
  onLike: () => void;
  onDelete: () => void;
  onComment: (text: string) => void;
}) {
  const [commentText, setCommentText] = useState('');
  const isMine = post.userId === currentUid;
  const liked = (post.likedBy || []).includes(currentUid || '');

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 14 }}>{post.authorName || 'User'}</h3>
          <div className="sub" style={{ fontSize: 11 }}>
            {new Date(post.createdAt).toLocaleString()}
          </div>
        </div>
        {isMine && (
          <button className="btn btn-danger" onClick={onDelete}><Icon.Trash /></button>
        )}
      </div>

      {post.text && <p style={{ marginTop: 10, fontSize: 14 }}>{post.text}</p>}

      {post.nftImage && (
        <img src={post.nftImage} alt={post.nftTitle ?? ''}
          style={{ width: '100%', maxHeight: 380, objectFit: 'cover', borderRadius: 10, marginTop: 12 }} />
      )}

      {post.forSale && (
        <div style={{ marginTop: 10 }}>
          <span className="badge badge-success">on sale · {post.price} {post.currency}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'center' }}>
        <button
          className="btn"
          onClick={onLike}
          style={liked ? { color: 'var(--primary)', borderColor: 'var(--primary)' } : undefined}
        >
          ❤ {post.likes ?? 0}
        </button>
        <span className="sub">{post.comments?.length ?? 0} comments</span>
      </div>

      {post.comments && post.comments.length > 0 && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
          {post.comments.slice(-3).map(c => (
            <div key={c.id} style={{ fontSize: 13, padding: '4px 0' }}>{c.text}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          placeholder="Написать комментарий…"
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          style={{ flex: 1, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}
        />
        <button
          className="btn btn-primary"
          disabled={!commentText.trim()}
          onClick={() => { onComment(commentText); setCommentText(''); }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
