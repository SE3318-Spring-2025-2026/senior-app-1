/**
 * Issue #226 — Grading Weights Assignment UI (f3)
 *
 * Adjust import path to the real component added in issue #227.
 *
 * See issue248 test header for Jest / Testing Library dependencies.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CoordinatorWeightsPage from '../../CoordinatorWeightsPage.jsx';

describe('CoordinatorWeightsPage (issue #226)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    window.localStorage.clear();
  });

  beforeEach(() => {
    window.localStorage.setItem('authToken', 'fake-coordinator-jwt');
    window.localStorage.setItem('coordinatorToken', 'fake-coordinator-jwt');
  });

  test('rejects negative and over-100 percentages before calling API', async () => {
    global.fetch = jest.fn();

    render(
      <MemoryRouter>
        <CoordinatorWeightsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const bySpin = screen.queryAllByRole('spinbutton');
      const byLabel = screen.queryAllByLabelText(/weight|percentage|%/i);
      expect(bySpin.length + byLabel.length).toBeGreaterThan(0);
    });
    const pctInputs = screen.queryAllByRole('spinbutton').length
      ? screen.queryAllByRole('spinbutton')
      : screen.queryAllByLabelText(/weight|percentage|%/i);

    const first = pctInputs[0];
    await userEvent.clear(first);
    await userEvent.type(first, '-5');
    await userEvent.tab();

    await userEvent.clear(first);
    await userEvent.type(first, '150');

    const save = screen.queryByRole('button', { name: /save|submit|update/i });
    if (save) await userEvent.click(save);

    const putCalls = global.fetch.mock.calls.filter(
      ([url, opts]) => String(url).includes('/coordinator/weights') && opts?.method === 'PUT',
    );
    expect(putCalls.length).toBe(0);
  });

  test('PUT payload contains sprint weight structure', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url, options = {}) => {
      const u = String(url);
      if (u.includes('/coordinator/weights') && options.method === 'PUT') {
        calls.push(JSON.parse(options.body || '{}'));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <CoordinatorWeightsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const bySpin = screen.queryAllByRole('spinbutton');
      const byLabel = screen.queryAllByLabelText(/weight|percentage|%/i);
      expect(bySpin.length + byLabel.length).toBeGreaterThan(0);
    });
    const pctInputs = screen.queryAllByRole('spinbutton').length
      ? screen.queryAllByRole('spinbutton')
      : screen.queryAllByLabelText(/weight|percentage|%/i);
    for (const input of pctInputs) {
      await userEvent.clear(input);
      await userEvent.type(input, '50');
    }

    const save = await screen.findByRole('button', { name: /save|submit|update/i });
    await userEvent.click(save);

    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    const body = calls[0];
    expect(
      Array.isArray(body.sprintWeights) ||
        Array.isArray(body.weights) ||
        typeof body.deliverableType === 'string',
    ).toBe(true);
  });
});
