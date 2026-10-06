// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../../App';
import { store } from '../../game/store';

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  const created = createRoot(host);
  root = created;
  act(() => created.render(<App />));
  return host;
}

describe('App smoke test', () => {
  it('mounts without throwing and shows the core panels', () => {
    const el = render();
    const text = el.textContent ?? '';
    expect(text).toContain('Scratchworks');
    expect(text).toContain('Cash');
    expect(text).toContain('Blueprints');
    expect(el.querySelector('.scratch-stage, .empty-bench')).toBeTruthy();
  });

  it('can buy, reveal and claim a card entirely through the UI', () => {
    const el = render();
    const cashBefore = store.state.cash;
    const buy = [...el.querySelectorAll('button')].find((b) =>
      /^Buy/.test(b.textContent ?? ''),
    );
    expect(buy).toBeTruthy();
    act(() => buy!.click());
    expect(store.state.cards.length).toBe(1);
    expect(store.state.cash).toBeLessThan(cashBefore);

    const reveal = [...el.querySelectorAll('button')].find((b) =>
      /Reveal card/i.test(b.textContent ?? ''),
    );
    expect(reveal).toBeTruthy();
    act(() => reveal!.click());
    expect(store.state.cards[0].status).toBe('revealed');

    const resolve = [...el.querySelectorAll('button')].find((b) =>
      /Claim|Discard/i.test(b.textContent ?? ''),
    );
    expect(resolve).toBeTruthy();
    act(() => resolve!.click());
    expect(['claimed', 'discarded', 'held']).toContain(store.state.cards[0].status);
  });

  it('renders accessible buttons for every action', () => {
    const el = render();
    const buttons = el.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(5);
    for (const button of buttons) {
      const label = (button.textContent ?? '') + (button.getAttribute('aria-label') ?? '');
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});
