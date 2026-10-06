import { useState } from 'react';
import { COLLECTIONS, ticketsInCollection } from '../game/data/tickets';
import { formatCash, formatPercent, formatSignedCash } from '../game/format';
import { isLuckCapped, symbolProbabilities } from '../game/luck';
import { analyzeTicket } from '../game/payout';
import { canBuy } from '../game/economy';
import { store } from '../game/store';
import {
  globalLuck,
  isCollectionUnlocked,
  queueCapacity,
  queueUsed,
  ticketLevelMultiplier,
} from '../game/state';
import type { GameState, TicketDef } from '../game/types';

function TicketDetails({ state, ticket }: { state: GameState; ticket: TicketDef }) {
  const luck = globalLuck(state);
  const probs = symbolProbabilities(ticket, luck);
  const analysis = analyzeTicket(ticket, luck, ticketLevelMultiplier(state, ticket.id));
  const capped = isLuckCapped(luck, ticket);

  return (
    <div className="ticket-details">
      <ul className="rules">
        {ticket.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      <table className="odds">
        <caption>
          Effective symbol odds at luck {Math.min(luck, ticket.luckCap)} (cap {ticket.luckCap})
        </caption>
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">Chance per space</th>
            <th scope="col">Effect</th>
          </tr>
        </thead>
        <tbody>
          {ticket.symbols.map((symbol, index) => (
            <tr key={symbol.id}>
              <th scope="row">
                <span aria-hidden="true">{symbol.glyph}</span> {symbol.label}
                {symbol.jackpot && <span className="tag tag--jackpot">jackpot</span>}
              </th>
              <td>{formatPercent(probs[index], 2)}</td>
              <td className="muted">{symbol.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="stat-grid">
        <div>
          <dt>Expected gross return</dt>
          <dd>{formatCash(analysis.expectedGross)}</dd>
        </div>
        <div>
          <dt>Expected profit per card</dt>
          <dd className={analysis.expectedNet < 0 ? 'bad' : 'good'}>
            {formatSignedCash(analysis.expectedNet)}
          </dd>
        </div>
        <div>
          <dt>Return on cost</dt>
          <dd>{(analysis.returnRatio * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Chance of a losing card</dt>
          <dd className={analysis.probabilityLoss > 0 ? 'bad' : ''}>
            {formatPercent(analysis.probabilityLoss, 2)}
          </dd>
        </div>
        <div>
          <dt>Chance of ¤0</dt>
          <dd>{formatPercent(analysis.probabilityZero, 2)}</dd>
        </div>
        <div>
          <dt>Worst / best card</dt>
          <dd>
            {formatCash(analysis.minPayout)} / {formatCash(analysis.maxPayout)}
          </dd>
        </div>
      </dl>
      <p className="muted small">
        These figures are exact, not sampled: every payout rule depends only on how many of each
        symbol appear, so the full distribution is enumerated.
        {capped
          ? ' Extra global luck gives this ticket no further benefit — its luck cap is reached.'
          : ''}
        {ticket.risky
          ? ' Reaching the luck cap does NOT make this ticket safe; it can still produce negative cards.'
          : ''}
      </p>
    </div>
  );
}

export function ShopPanel({ state }: { state: GameState }) {
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [pendingBig, setPendingBig] = useState<string | null>(null);

  const attemptBuy = (ticket: TicketDef) => {
    if (
      state.settings.bigSpendWarning &&
      state.cash > 0 &&
      ticket.cost > state.cash * 0.25 &&
      pendingBig !== ticket.id
    ) {
      setPendingBig(ticket.id);
      return;
    }
    setPendingBig(null);
    store.buy(ticket.id);
  };

  return (
    <section className="panel" aria-labelledby="shop-heading">
      <div className="panel__head">
        <h2 id="shop-heading">Ticket shop</h2>
        <p className="muted small">
          Bench {queueUsed(state)}/{queueCapacity(state)} slots used
        </p>
      </div>

      {COLLECTIONS.map((collection) => {
        const unlocked = isCollectionUnlocked(state, collection.id);
        return (
          <div key={collection.id} className={`collection ${unlocked ? '' : 'is-locked'}`}>
            <h3 style={{ borderColor: collection.accent }}>
              {collection.name}
              {!unlocked && <span className="tag">locked</span>}
            </h3>
            <p className="muted small">{collection.tagline}</p>
            {!unlocked ? (
              <p className="muted small">
                Unlocks at {formatCash(collection.unlockWinnings)} gross winnings this run (now{' '}
                {formatCash(state.runWinnings)}) or {collection.unlockCards} completed cards (now{' '}
                {state.runCards}).
              </p>
            ) : (
              <ul className="ticket-list">
                {ticketsInCollection(collection.id).map((ticket) => {
                  const check = canBuy(state, ticket.id);
                  const selected = state.selectedTicketId === ticket.id;
                  const open = openTicket === ticket.id;
                  return (
                    <li key={ticket.id} className={selected ? 'is-selected' : ''}>
                      <div className="ticket-row">
                        <button
                          type="button"
                          className="ticket-name"
                          aria-pressed={selected}
                          onClick={() => store.select(ticket.id)}
                          title="Select this ticket for the auto-buyer"
                        >
                          {ticket.name}
                          {ticket.risky && <span className="tag tag--risk">risk</span>}
                          {selected && <span className="tag tag--selected">auto-buy</span>}
                        </button>
                        <span className="price">{formatCash(ticket.cost)}</span>
                        <button
                          type="button"
                          className="primary"
                          disabled={!check.ok}
                          onClick={() => attemptBuy(ticket)}
                        >
                          Buy
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          aria-expanded={open}
                          onClick={() => setOpenTicket(open ? null : ticket.id)}
                        >
                          {open ? 'Hide rules' : 'Rules & odds'}
                        </button>
                      </div>
                      {!check.ok && (
                        <p className="muted small">
                          {check.reason === 'queue-full'
                            ? 'The bench is full — claim or discard a card first.'
                            : 'Not enough credits.'}
                        </p>
                      )}
                      {pendingBig === ticket.id && (
                        <div className="risk-warning" role="alert">
                          <p>
                            {formatCash(ticket.cost)} is more than a quarter of your{' '}
                            {formatCash(state.cash)}. Buy anyway?
                          </p>
                          <div className="button-row">
                            <button type="button" className="primary" onClick={() => attemptBuy(ticket)}>
                              Yes, buy it
                            </button>
                            <button type="button" onClick={() => setPendingBig(null)}>
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => {
                                store.updateSettings({ bigSpendWarning: false });
                                setPendingBig(null);
                              }}
                            >
                              Stop warning me
                            </button>
                          </div>
                        </div>
                      )}
                      {open && <TicketDetails state={state} ticket={ticket} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
