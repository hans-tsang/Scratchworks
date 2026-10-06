import { RUN_UPGRADES, TICKET_LEVEL_MAX, ticketLevelCost, ticketLevelRequirement, upgradeCost } from '../game/data/upgrades';
import { formatCash } from '../game/format';
import { store } from '../game/store';
import { availableTickets, jobPayout, jobReady, ticketLevel } from '../game/state';
import type { GameState } from '../game/types';

export function UpgradePanel({ state }: { state: GameState }) {
  return (
    <section className="panel" aria-labelledby="upgrades-heading">
      <div className="panel__head">
        <h2 id="upgrades-heading">Workshop upgrades</h2>
        <p className="muted small">Bought with Workshop Credits. Reset when you prestige.</p>
      </div>

      <div className="job-box">
        <div>
          <strong>Workshop job</strong>
          <p className="muted small">
            Always available recovery income of {formatCash(jobPayout(state))}. It never costs
            anything and can never produce a loss.
          </p>
        </div>
        <button type="button" className="primary" disabled={!jobReady(state)} onClick={() => store.job()}>
          {jobReady(state) ? `Work (+${formatCash(jobPayout(state))})` : `${(state.jobCooldownMs / 1000).toFixed(1)}s`}
        </button>
      </div>

      <ul className="upgrade-list">
        {RUN_UPGRADES.map((def) => {
          const level = state.upgrades[def.id] ?? 0;
          const maxed = level >= def.maxLevel;
          const cost = upgradeCost(def, level);
          return (
            <li key={def.id}>
              <div className="upgrade-row">
                <div>
                  <strong>
                    {def.name} <span className="muted small">Lv {level}</span>
                  </strong>
                  <p className="muted small">{def.description}</p>
                  <p className="small">{maxed ? 'Fully upgraded.' : def.effect(level)}</p>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={maxed || state.cash < cost}
                  onClick={() => store.upgrade(def.id)}
                >
                  {maxed ? 'Max' : formatCash(cost)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <h3>Ticket levels</h3>
      <p className="muted small">
        Each level adds +6% to that ticket's positive payouts. Levels unlock by completing cards of
        that ticket.
      </p>
      <ul className="upgrade-list">
        {availableTickets(state).map((ticket) => {
          const level = ticketLevel(state, ticket.id);
          const completed = state.ticketCards[ticket.id] ?? 0;
          const required = ticketLevelRequirement(level);
          const cost = ticketLevelCost(ticket.cost, level);
          const maxed = level >= TICKET_LEVEL_MAX;
          const ready = completed >= required;
          return (
            <li key={ticket.id}>
              <div className="upgrade-row">
                <div>
                  <strong>
                    {ticket.name} <span className="muted small">Lv {level}</span>
                  </strong>
                  <p className="muted small">
                    {maxed
                      ? 'Maximum level reached.'
                      : `Requires ${required} completed cards (you have ${completed}).`}
                  </p>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={maxed || !ready || state.cash < cost}
                  onClick={() => store.ticketLevel(ticket.id)}
                >
                  {maxed ? 'Max' : formatCash(cost)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
