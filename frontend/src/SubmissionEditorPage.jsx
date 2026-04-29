import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import apiClient from './services/apiClient';

const DELIVERABLE_TYPES = ['PROPOSAL', 'SOW'];

const STATUS_COLORS = {
  DRAFT: 'var(--muted)',
  SUBMITTED: '#4caf8a',
  UNDER_REVIEW: '#f0a500',
  APPROVED: '#4caf8a',
  REJECTED: 'var(--error-ink)',
  GRADED: '#7c6af7',
};

const EMPTY_FORM = { type: DELIVERABLE_TYPES[0], sprintNumber: '', images: '', content: '' };

export default function SubmissionEditorPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupLoading, setGroupLoading] = useState(true);
  const [groupError, setGroupError] = useState(null);

  const [submissions, setSubmissions] = useState([]);
  const [activeSubmissionId, setActiveSubmissionId] = useState(null);

  const loadSubmissions = useCallback((gid) => {
    if (!gid) return;
    apiClient.get(`/v1/groups/${gid}/deliverables`)
      .then(({ data }) => {
        const list = Array.isArray(data?.data) ? data.data : [];
        setSubmissions(list);
      })
      .catch(() => setSubmissions([]));
  }, []);

  // Load groups on mount
  useEffect(() => {
    apiClient.get('/v1/groups')
      .then(({ data }) => {
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        if (list.length === 0) {
          setGroupError('You are not in a group yet. Join or create a group from Manage Group first.');
        } else {
          setGroups(list);
          const first = list[0];
          const id = String(first.groupId ?? first.id);
          setGroupId(id);
          setGroupName(first.groupName ?? first.name ?? id);
          loadSubmissions(id);
        }
      })
      .catch(() => setGroupError('Failed to load your groups. Please try again.'))
      .finally(() => setGroupLoading(false));
  }, [loadSubmissions]);

  function handleGroupChange(e) {
    const newId = e.target.value;
    const g = groups.find((x) => String(x.groupId ?? x.id) === newId);
    setGroupId(newId);
    setGroupName(g?.groupName ?? g?.name ?? newId);
    setForm(EMPTY_FORM);
    setActiveSubmissionId(null);
    setSubmissions([]);
    setError(null);
    setSuccess(false);
    loadSubmissions(newId);
  }

  function loadIntoEditor(sub) {
    setForm({
      type: sub.type,
      sprintNumber: sub.sprintNumber != null ? String(sub.sprintNumber) : '',
      images: Array.isArray(sub.images) ? sub.images.join(', ') : (sub.images ?? ''),
      content: sub.content ?? '',
    });
    setActiveSubmissionId(sub.id);
    setError(null);
    setSuccess(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const payload = {
      type: form.type,
      images: form.images.split(',').map((url) => url.trim()).filter(Boolean),
      content: form.content,
      ...(form.sprintNumber !== '' && { sprintNumber: Number(form.sprintNumber) }),
    };
    try {
      await apiClient.post(`/v1/groups/${groupId}/deliverables`, payload);
      setSuccess(true);
      loadSubmissions(groupId);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to submit. Please try again.');
    }
  }

  function handleNew() {
    setForm(EMPTY_FORM);
    setActiveSubmissionId(null);
    setError(null);
    setSuccess(false);
  }

  const contentReady = form.content.trim().length >= 10;
  const isSubmitDisabled = !groupId || groups.length === 0 || !contentReady;

  if (groupLoading) {
    return (
      <main className="page">
        <p style={{ color: 'var(--muted)' }}>Loading your group…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Team Leader · Submission</p>
        <h1>Proposal &amp; SoW Editor</h1>
        <p className="subtitle">
          Write your submission in Markdown. The preview updates live on the right.
        </p>
      </section>

      {groupError && (
        <div className="field-error" style={{ marginBottom: '24px' }}>
          <p>{groupError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="single-panel">

        {/* Group row */}
        <div className="form" style={{ display: 'grid', gridTemplateColumns: groups.length > 1 ? '1fr 1fr' : '1fr', gap: '16px', marginBottom: 0 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Group</span>
            {groups.length > 1 ? (
              <select value={groupId} onChange={handleGroupChange}>
                {groups.map((g) => {
                  const id = String(g.groupId ?? g.id);
                  return <option key={id} value={id}>{g.groupName ?? g.name ?? id}</option>;
                })}
              </select>
            ) : (
              <input type="text" value={groupName} readOnly style={{ opacity: 0.7 }} />
            )}
          </label>
        </div>

        {/* Type + Sprint + Images */}
        <div className="form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '16px' }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Deliverable Type <span style={{ color: 'var(--error-ink)' }}>*</span></span>
            <select name="type" value={form.type} onChange={handleChange}>
              {DELIVERABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="field" style={{ marginBottom: 0 }}>
            <span>Sprint Number</span>
            <input
              type="number"
              name="sprintNumber"
              value={form.sprintNumber}
              onChange={handleChange}
              placeholder="e.g. 1"
              min="1"
              step="1"
            />
          </label>

          <label className="field" style={{ marginBottom: 0 }}>
            <span>Image URLs <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional — comma-separated)</span></span>
            <input
              type="text"
              name="images"
              value={form.images}
              onChange={handleChange}
              placeholder="https://example.com/img1.png, https://example.com/img2.png"
            />
          </label>
        </div>

        {/* Split editor */}
        <div className="form" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '28rem' }}>

            <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'rgba(0,0,0,0.18)' }}>
                <span style={{ fontSize: '0.76rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Write — Markdown</span>
                <span style={{ fontSize: '0.76rem', color: contentReady ? 'var(--muted)' : 'var(--error-ink)' }}>
                  {form.content.length} chars{!contentReady && form.content.length > 0 ? ' (min 10)' : ''}
                </span>
              </div>
              <textarea
                name="content"
                value={form.content}
                onChange={handleChange}
                placeholder={'## Summary\n\nDescribe your proposal here...\n\n- Item one\n- Item two\n\n**Bold**, _italic_, and `code` are supported.'}
                required
                style={{ flex: 1, resize: 'none', border: 'none', borderRadius: 0, background: 'transparent', padding: '16px', fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--ink)', outline: 'none', boxShadow: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'rgba(0,0,0,0.18)' }}>
                <span style={{ fontSize: '0.76rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Preview</span>
              </div>
              <div style={{ padding: '16px', flex: 1, overflowY: 'auto', color: 'var(--ink)', fontSize: '0.95rem', lineHeight: 1.7 }}>
                {form.content.trim() ? (
                  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{form.content}</ReactMarkdown>
                ) : (
                  <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                    Start writing on the left to see a live preview here.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && <div className="field-error"><p>{error}</p></div>}
        {success && <div className="group-callout group-callout-success">Submission saved successfully.</div>}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={handleNew}
            style={{ width: 'auto', minWidth: '120px', background: 'rgba(65,79,102,0.4)', boxShadow: 'none' }}
          >
            New
          </button>
          <button type="submit" disabled={isSubmitDisabled} style={{ width: 'auto', minWidth: '160px' }}>
            {activeSubmissionId ? 'Update Submission' : 'Submit'}
          </button>
        </div>

      </form>

      {/* Existing submissions list */}
      {submissions.length > 0 && (
        <section style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', color: 'var(--ink)' }}>
            My Submissions
          </h2>
          <div style={{ display: 'grid', gap: '12px' }}>
            {submissions.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => loadIntoEditor(sub)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '12px',
                  alignItems: 'start',
                  textAlign: 'left',
                  background: activeSubmissionId === sub.id ? 'rgba(124,106,247,0.12)' : 'var(--card)',
                  border: activeSubmissionId === sub.id ? '1px solid #7c6af7' : '1px solid var(--line)',
                  borderRadius: '10px',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  width: '100%',
                  boxShadow: 'none',
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>{sub.type}</strong>
                    {sub.sprintNumber != null && (
                      <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Sprint {sub.sprintNumber}</span>
                    )}
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: STATUS_COLORS[sub.status] ?? 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {sub.status}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>v{sub.version}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {sub.content?.trim().slice(0, 200) || '—'}
                  </p>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {new Date(sub.updatedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
