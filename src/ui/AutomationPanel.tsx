import { AUTOMATION_STATUS_TEXT, autoBuyQueueLimit, scratcherRate } from '../game/automation';
import { buyerInterval, collectorInterval, scratcherCapacity } from '../game/data/upgrades';
import { getTicket } from '../game/data/tickets';
import { formatCash } from '../game/format';
import { store } from '../game/store';
import { queueCapacity, queueUsed } from '../game/state';
import type { AutomationId, GameState } from '../game/types';

const DEVICES: { id: AutomationId; name: string; blurb: string }[] = [
  {
    id: 'buyer',
    name: 'Auto-Buyer',
    blurb: 'Buys the selected ticket on a timer, respecting your cash reserve and queue limit.',
  },
  {
    id: 'scratcher',
    name: 'Scratcher Drum',
    blurb: 'Scratches queued cards using the same reveal model as manual play.',
  },
  {
    id: 'collector',
    name: 'Collector',
    blurb: 'Claims revealed cards. Negative cards are held for review unless you say otherwise.',
  },
];

function deviceDetail(state: GameState, id: AutomationId): string {
  const level = state.upgrades[id] ?? 0;
  if (level <= 0) return 'Not built yet — buy it in the upgrade panel.';
  if (id === 'buyer') return `One card every ${(buyerInterval(level) / 1000).toFixed(2)}s`;
  if (id === 'scratcher')
    return `${scratcherRate(state).toFixed(2)} cards/s · ${scratcherCapacity(level)} at a time`;
  return `One card every ${(collectorInterval(level) / 1000).toFixed(2)}s`;
}

export function AutomationPanel({ state }: { state: GameState }) {
  const held = state.cards.filter((c) => c.status === 'held');
  const selected = getTicket(state.selectedTicketId);

  return (
    <section className="panel" aria-labelledby="automation-heading">
      <div className="panel__head">
        <h2 id="automation-heading">Automation</h2>
        <p className="muted small">
          Bench {queueUsed(state)}/{queueCapacity(state)} · auto-buy stops at{' '}
          {autoBuyQueueLimit(state)} cards
        </p>
      </div>

      <ul className="device-list">
        {DEVICES.map((device) => {
          const level = state.upgrades[device.id] ?? 0;
          const automation = state.automation[device.id];
          const locked = level <= 0;
          return (
            <li key={device.id}>
              <div className="device-row">
                <div>
                  <strong>
                    {device.name} <span className="muted small">Lv {level}</span>
                  </strong>
                  <p className="muted small">{device.blurb}</p>
                  <p className="small">{deviceDetail(state, device.id)}</p>
                  <p className={`status status--${automation.status}`}>
                    {AUTOMATION_STATUS_TEXT[automation.status]}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={locked}
                  aria-pressed={automation.enabled}
                  className={automation.enabled ? 'primary' : ''}
                  onClick={() => store.toggleAutomation(device.id)}
                >
                  {locked ? 'Locked' : automation.enabled ? 'On' : 'Off'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <h3>Auto-buy settings</h3>
      <p className="muted small">
        The Auto-Buyer buys <strong>{selected.name}</strong> ({formatCash(selected.cost)}). Change
        the selection in the ticket shop.
      </p>
      <div className="field">
        <label htmlFor="reserve">Cash reserve (never spent by automation)</label>
        <input
          id="reserve"
          type="number"
          min={0}
          step={1}
          value={state.settings.reserveCash}
          onChange={(e) =>
            store.updateSettings({ reserveCash: Math.max(0, Number(e.target.value) || 0) })
          }
        />
      </div>
      <div className="field">
        <label htmlFor="queue-limit">Auto-buy queue limit</label>
        <input
          id="queue-limit"
          type="number"
          min={1}
          max={queueCapacity(state)}
          step={1}
          value={state.settings.autoBuyQueueLimit}
          onChange={(e) =>
            store.updateSettings({
              autoBuyQueueLimit: Math.max(1, Math.floor(Number(e.target.value) || 1)),
            })
          }
        />
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={state.settings.autoClaimRisky}
          onChange={(e) => store.updateSettings({ autoClaimRisky: e.target.checked })}
        />
        Let the Collector claim negative cards automatically (off by default)
      </label>

      {held.length > 0 && (
        <div className="risk-warning" role="status">
          <p>
            <strong>{held.length} card(s) held for review.</strong> The Collector will not claim a
            negative card without your decision. Open the bench to claim or discard them.
          </p>
        </div>
      )}
    </section>
  );
}
