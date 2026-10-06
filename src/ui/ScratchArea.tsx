import { useState } from 'react';
import { getTicket } from '../game/data/tickets';
import { REVEAL_THRESHOLD, cappedLoss } from '../game/economy';
import { formatCash, formatSignedCash } from '../game/format';
import { store } from '../game/store';
import type { Card, GameState, TicketDef } from '../game/types';
import { ScratchCanvas } from './ScratchCanvas';

function CardFace({ ticket, card, revealed }: { ticket: TicketDef; card: Card; revealed: boolean }) {
  const symbols = card.cells.map((id) => ticket.symbols.find((s) => s.id === id)!);
  return (
    <div className={`card-face card-face--${ticket.kind}`}>
      {symbols.map((symbol, index) => (
        <div
          key={index}
          className={`cell cell--${symbol.role}`}
          title={revealed ? `${symbol.label}: ${symbol.description}` : undefined}
        >
          <span className="cell__glyph" aria-hidden="true">
            {symbol.glyph}
          </span>
          <span className="cell__label">{symbol.label}</span>
        </div>
      ))}
    </div>
  );
}

function PayoutSummary({ card, ticket }: { card: Card; ticket: TicketDef }) {
  const net = card.payout - card.cost;
  return (
    <dl className="payout-summary">
      <div>
        <dt>Gross winnings</dt>
        <dd className={card.payout < 0 ? 'bad' : card.payout > 0 ? 'good' : ''}>
          {formatCash(card.payout)}
        </dd>
      </div>
      <div>
        <dt>Ticket cost</dt>
        <dd>{formatCash(card.cost)}</dd>
      </div>
      <div>
        <dt>Profit after cost</dt>
        <dd className={net < 0 ? 'bad' : net > 0 ? 'good' : ''}>{formatSignedCash(net)}</dd>
      </div>
      <div>
        <dt>Ticket</dt>
        <dd>{ticket.name}</dd>
      </div>
    </dl>
  );
}

export function ScratchArea({ state }: { state: GameState }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [confirmNegative, setConfirmNegative] = useState(false);

  // The state object is mutated in place, so this is recomputed every render
  // rather than memoised on an array identity that never changes.
  const queue = state.cards.filter(
    (c) => c.status === 'unrevealed' || c.status === 'revealed' || c.status === 'held',
  );

  const card = queue.find((c) => c.id === focusId) ?? queue[0];
  const ticket = card ? getTicket(card.ticketId) : undefined;
  const revealed = !!card && card.status !== 'unrevealed';

  if (!card || !ticket) {
    return (
      <section className="panel scratch-area" aria-labelledby="scratch-heading">
        <h2 id="scratch-heading">Workbench</h2>
        <div className="empty-bench">
          <p>No cards on the bench. Buy a ticket from the shop to start scratching.</p>
        </div>
      </section>
    );
  }

  const loss = card.payout < 0 ? cappedLoss(state, card.payout) : 0;

  return (
    <section className="panel scratch-area" aria-labelledby="scratch-heading">
      <div className="panel__head">
        <h2 id="scratch-heading">
          {ticket.name}
          {ticket.risky && <span className="tag tag--risk">High risk</span>}
        </h2>
        <p className="muted">
          Card {queue.indexOf(card) + 1} of {queue.length} on the bench
        </p>
      </div>

      <div className="scratch-stage">
        <CardFace ticket={ticket} card={card} revealed={revealed} />
        <ScratchCanvas
          cardId={card.id}
          progress={card.progress}
          revealed={revealed}
          reducedMotion={state.settings.reducedMotion}
          label={ticket.name}
          onScratch={(delta) => store.scratch(card.id, delta)}
        />
      </div>

      <div className="progress-row">
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(card.progress * 100)} aria-label="Scratch progress">
          <span style={{ width: `${Math.min(100, card.progress * 100)}%` }} />
        </div>
        <span className="muted">
          {revealed
            ? 'Fully revealed'
            : `${Math.round(card.progress * 100)}% — auto-reveals at ${Math.round(REVEAL_THRESHOLD * 100)}%`}
        </span>
      </div>

      {revealed ? (
        <>
          <PayoutSummary card={card} ticket={ticket} />
          {card.payout < 0 && (
            <div className="risk-warning" role="alert">
              <p>
                <strong>This card is worth {formatCash(card.payout)}.</strong> Claiming it will
                deduct {formatCash(loss)} (capped at your current cash, so your balance cannot go
                below ¤0). Discarding costs nothing extra, but the {formatCash(card.cost)} ticket
                price is not refunded.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={confirmNegative}
                  onChange={(e) => setConfirmNegative(e.target.checked)}
                />
                I understand and still want to claim this negative card
              </label>
            </div>
          )}
          <div className="button-row">
            <button
              type="button"
              className="primary"
              disabled={card.payout < 0 && !confirmNegative}
              onClick={() => {
                store.claim(card.id, confirmNegative);
                setConfirmNegative(false);
                setFocusId(null);
              }}
            >
              Claim {formatCash(card.payout)}
            </button>
            <button
              type="button"
              onClick={() => {
                store.discard(card.id);
                setConfirmNegative(false);
                setFocusId(null);
              }}
            >
              Discard card
            </button>
          </div>
        </>
      ) : (
        <div className="button-row">
          <button type="button" className="primary" onClick={() => store.reveal(card.id)}>
            Reveal card
          </button>
          <p className="muted small">
            Revealing with this button gives exactly the same result as scratching by hand.
          </p>
        </div>
      )}

      {queue.length > 1 && (
        <div className="queue-strip" role="list" aria-label="Cards on the bench">
          {queue.map((item) => {
            const itemTicket = getTicket(item.ticketId);
            return (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`queue-chip ${item.id === card.id ? 'is-active' : ''} ${item.status === 'held' ? 'is-held' : ''}`}
                onClick={() => {
                  setFocusId(item.id);
                  setConfirmNegative(false);
                }}
              >
                <span>{itemTicket.name}</span>
                <span className="muted small">
                  {item.status === 'unrevealed'
                    ? `${Math.round(item.progress * 100)}%`
                    : item.status === 'held'
                      ? 'needs review'
                      : formatCash(item.payout)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
