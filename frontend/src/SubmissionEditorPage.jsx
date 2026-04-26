import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import apiClient from './services/apiClient';

const DELIVERABLE_TYPES = ['PROPOSAL', 'SOW'];

const EMPTY_FORM = {
  title: '',
  deliverableType: DELIVERABLE_TYPES[0],
  sprintNumber: '',
  images: '',
  content: '',
};

export default function SubmissionEditorPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('write');

  const [groupId, setGroupId] = useState(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [groupError, setGroupError] = useState(null);

  useEffect(() => {
    apiClient.get('/v1/groups/my-groups')
      .then(({ data }) => {
        const first = Array.isArray(data) ? data[0] : null;
        if (!first) {
          setGroupError('No group found. You must be a team leader with an active group to submit.');
        } else {
          setGroupId(first.id ?? first.groupId);
        }
      })
      .catch(() => setGroupError('Failed to load your group. Please try again.'))
      .finally(() => setGroupLoading(false));
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const payload = {
      title: form.title.trim(),
      deliverableType: form.deliverableType,
      sprintNumber: Number(form.sprintNumber),
      images: form.images.split(',').map((url) => url.trim()).filter(Boolean),
      content: form.content,
    };
    try {
      await apiClient.post(`/v1/groups/${groupId}/deliverables`, payload);
      navigate('/students/groups/manage');
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to submit. Please try again.');
    }
  }

  function handleClear() {
    setForm(EMPTY_FORM);
    setError(null);
  }

  const sprintNum = Number(form.sprintNumber);
  const isSubmitDisabled =
    !groupId ||
    !form.title.trim() ||
    form.sprintNumber === '' ||
    sprintNum < 1 ||
    !form.content.trim();

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
          Write your submission in Markdown and preview it live before submitting.
        </p>
      </section>

      {groupError && (
        <div className="field-error" style={{ marginBottom: '24px' }}>
          <p>{groupError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="single-panel">

        {/* Metadata row */}
        <div className="form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="field">
              <span>Title <span style={{ color: 'var(--error-ink)' }}>*</span></span>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Sprint 1 Proposal"
                required
              />
            </label>
          </div>

          <div>
            <label className="field">
              <span>Sprint Number <span style={{ color: 'var(--error-ink)' }}>*</span></span>
              <input
                type="number"
                name="sprintNumber"
                value={form.sprintNumber}
                onChange={handleChange}
                placeholder="e.g. 1"
                min="1"
                step="1"
                required
              />
            </label>
          </div>

          <div>
            <label className="field">
              <span>Deliverable Type <span style={{ color: 'var(--error-ink)' }}>*</span></span>
              <select name="deliverableType" value={form.deliverableType} onChange={handleChange} required>
                {DELIVERABLE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label className="field">
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
        </div>

        {/* Split editor + preview */}
        <div className="form" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Mobile tab bar */}
          <div className="auth-mode-switch" style={{ margin: '0', borderRadius: 0, borderBottom: '1px solid var(--line)' }}>
            {['write', 'preview'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`auth-switch${activeTab === tab ? ' auth-switch-active' : ''}`}
                style={{ borderRadius: 0, textTransform: 'capitalize' }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

            {/* Write pane */}
            <div style={{ display: activeTab === 'preview' ? 'none' : 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'rgba(0,0,0,0.18)' }}>
                <span style={{ fontSize: '0.76rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Write — Markdown</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{form.content.length} chars</span>
              </div>
              <textarea
                name="content"
                value={form.content}
                onChange={handleChange}
                placeholder={'## Summary\n\nDescribe your proposal here...\n\n- Item one\n- Item two\n\n**Bold**, _italic_, and `code` are supported.'}
                required
                rows={18}
                style={{ flex: 1, resize: 'none', border: 'none', borderRadius: 0, background: 'transparent', padding: '16px', fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--ink)', outline: 'none', boxShadow: 'none' }}
              />
            </div>

            {/* Preview pane */}
            <div style={{ display: activeTab === 'write' ? 'none' : 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'rgba(0,0,0,0.18)' }}>
                <span style={{ fontSize: '0.76rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Preview</span>
              </div>
              <div style={{ padding: '16px', minHeight: '18rem', overflowY: 'auto', color: 'var(--ink)', fontSize: '0.95rem', lineHeight: 1.7 }}>
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

        {error && (
          <div className="field-error">
            <p>{error}</p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={handleClear}
            style={{ width: 'auto', minWidth: '120px', background: 'rgba(65,79,102,0.4)', boxShadow: 'none' }}
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            style={{ width: 'auto', minWidth: '140px' }}
          >
            Submit
          </button>
        </div>

      </form>
    </main>
  );
}
