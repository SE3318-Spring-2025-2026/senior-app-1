import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

const EMPTY_FORM = {
  title: '',
  sprintNumber: '',
  imageUrls: '',
  content: '',
};

export default function SubmissionEditor() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submittedPayload, setSubmittedPayload] = useState(null);
  const [activeTab, setActiveTab] = useState('write'); // 'write' | 'preview' (mobile)

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (submittedPayload) setSubmittedPayload(null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      title: form.title.trim(),
      sprintNumber: Number(form.sprintNumber),
      imageUrls: form.imageUrls.trim(),
      content: form.content,
    };
    setSubmittedPayload(payload);
    console.log('[SubmissionEditor] payload:', payload);
  }

  const isSubmitDisabled =
    !form.title.trim() || !form.sprintNumber || !form.content.trim();

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Page header */}
        <div className="mb-6">
          <span className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            Team Leader · Epic 2 · F5
          </span>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">
            Proposal &amp; SoW Submission Editor
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Write your submission in Markdown and preview it live before submitting.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* ── Top metadata row ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

            {/* Title */}
            <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Sprint 1 Proposal"
                required
                className="w-full text-gray-900 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
              />
            </div>

            {/* Sprint Number */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Sprint Number <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="sprintNumber"
                value={form.sprintNumber}
                onChange={handleChange}
                placeholder="e.g. 1"
                min="1"
                step="1"
                required
                className="w-full text-gray-900 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
              />
            </div>
          </div>

          {/* Image URLs */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Image URLs{' '}
              <span className="text-gray-400 font-normal normal-case">(optional — comma-separated)</span>
            </label>
            <input
              type="text"
              name="imageUrls"
              value={form.imageUrls}
              onChange={handleChange}
              placeholder="https://example.com/img1.png, https://example.com/img2.png"
              className="w-full text-gray-900 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            />
          </div>

          {/* ── Editor + Preview ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4">

            {/* Tab bar (visible on small screens to switch panes) */}
            <div className="flex border-b border-gray-200 md:hidden">
              {['write', 'preview'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Split panes (always side-by-side on md+) */}
            <div className="md:grid md:grid-cols-2 md:divide-x md:divide-gray-200">

              {/* Write pane */}
              <div className={`${activeTab === 'preview' ? 'hidden md:block' : ''}`}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Write — Markdown
                  </span>
                  <span className="text-xs text-gray-400">{form.content.length} chars</span>
                </div>
                <textarea
                  name="content"
                  value={form.content}
                  onChange={handleChange}
                  placeholder={`## Summary\n\nDescribe your proposal here...\n\n- Item one\n- Item two\n\n**Bold**, _italic_, and \`code\` are all supported.`}
                  required
                  rows={18}
                  className="w-full p-4 text-sm font-mono text-gray-800 resize-none focus:outline-none focus:ring-0 border-none"
                />
              </div>

              {/* Preview pane */}
              <div className={`${activeTab === 'write' ? 'hidden md:block' : ''}`}>
                <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Preview
                  </span>
                </div>
                <div className="p-4 min-h-[18rem] text-sm text-gray-800 overflow-auto prose prose-sm max-w-none">
                  {form.content.trim() ? (
                    <ReactMarkdown>{form.content}</ReactMarkdown>
                  ) : (
                    <p className="text-gray-400 italic">
                      Start writing on the left to see a live preview here.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Actions ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => { setForm(EMPTY_FORM); setSubmittedPayload(null); }}
              className="px-5 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Submit
            </button>
          </div>
        </form>

        {/* ── Payload preview ───────────────────────────────────────── */}
        {submittedPayload && (
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-green-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border-b border-green-200">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              <span className="text-sm font-semibold text-green-800">
                Submission payload — ready to send
              </span>
            </div>
            <pre className="p-4 text-xs text-gray-800 overflow-x-auto bg-gray-900 text-green-400">
              {JSON.stringify(submittedPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
