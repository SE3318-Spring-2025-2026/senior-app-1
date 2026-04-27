/**
 * Issue #248 — Committee Grading Picker UI (f8)
 *
 * Import path: adjust if your PR uses a different file name.
 * Requires: React Router + CommitteeGradingPage (e.g. PR #269).
 *
 * Frontend devDependencies (if not already in package.json):
 *   jest, babel-jest, @vitejs/plugin-react, jest-environment-jsdom,
 *   @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, identity-obj-proxy
 * Script: "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"
 *   (or align with your existing Jest config.)
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CommitteeGradingPage from '../../CommitteeGradingPage.jsx';

const criteriaFixture = [
  {
    id: 'c-bin',
    question: 'Binary gate',
    criterionType: 'BINARY',
    maxPoints: 10,
    weight: 0.25,
  },
  {
    id: 'c-soft',
    question: 'Soft quality',
    criterionType: 'SOFT',
    maxPoints: 40,
    weight: 0.75,
  },
];

function renderAt(submissionId = 'sub-test-1') {
  return render(
    <MemoryRouter initialEntries={[`/professors/committee-review/${submissionId}`]}>
      <Routes>
        <Route path="/professors/committee-review/:submissionId" element={<CommitteeGradingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CommitteeGradingPage (issue #248)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    window.localStorage.clear();
  });

  beforeEach(() => {
    window.localStorage.setItem('authToken', 'fake-professor-jwt');
    window.localStorage.setItem('professorToken', 'fake-professor-jwt');
  });

  test('renders BINARY as toggle and SOFT as numeric input with max bound', async () => {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('/committee/rubric-criteria')) {
        return {
          ok: true,
          json: async () => ({ data: criteriaFixture }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    renderAt();

    await waitFor(() => {
      expect(screen.getByText(/binary gate/i)).toBeInTheDocument();
      expect(screen.getByText(/soft quality/i)).toBeInTheDocument();
    });

    const spinbuttons = screen.getAllByRole('spinbutton');
    expect(spinbuttons.length).toBeGreaterThanOrEqual(1);
    const numberInput = spinbuttons[0];
    await userEvent.clear(numberInput);
    await userEvent.type(numberInput, '999');
    expect(Number(numberInput.value)).toBeLessThanOrEqual(40);
  });

  test('submit sends scores array and comments to review endpoint', async () => {
    const posts = [];

    global.fetch = jest.fn(async (url, options = {}) => {
      const u = String(url);
      if (u.includes('/committee/rubric-criteria')) {
        return { ok: true, json: async () => ({ data: criteriaFixture }) };
      }
      if (u.includes('/committee/submissions/') && (u.endsWith('/review') || u.endsWith('/grade'))) {
        posts.push({ url: u, body: options.body });
        return {
          ok: true,
          json: async () => ({ finalScore: 72, message: 'ok' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    renderAt('sub-payload-1');

    await waitFor(() => expect(screen.getByText(/soft quality/i)).toBeInTheDocument());

    const submit = screen.getByRole('button', { name: /submit review/i });
    await userEvent.click(submit);

    await waitFor(() => expect(posts.length).toBeGreaterThanOrEqual(1));
    const parsed = JSON.parse(posts[0].body);
    expect(Array.isArray(parsed.scores)).toBe(true);
    expect(parsed.scores.length).toBeGreaterThanOrEqual(1);
    expect(typeof parsed.comments).toBe('string');
  });
});
