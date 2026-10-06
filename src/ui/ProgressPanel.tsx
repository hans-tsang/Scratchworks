import { collectionProgress, nextGoal } from '../game/goals';
import { formatCash, formatDuration } from '../game/format';
import { PRESTIGE_REQUIREMENT } from '../game/data/upgrades';
import { store } from '../game/store';
import type { GameState } from '../game/types';

export function ProgressPanel({
  state,
  onOpenPrestige,
}: {
  state: GameState;
  onOpenPrestige: () => void;
}) {
  const goal = nextGoal(state);
  const collections = collectionProgress(state);

  const runGoal = () => {
    if (!goal.action) return;
    switch (goal.action.kind) {
      case 'upgrade':
        store.upgrade(goal.action.id);
        break;
      case 'ticketLevel':
        store.ticketLevel(goal.action.id);
        break;
      case 'job':
        store.job();
        break;
      case 'buy':
        store.buy(goal.action.id);
        break;
      case 'prestige':
        onOpenPrestige();
        break;
    }
  };

  return (
    <section className="panel" aria-labelledby="progress-heading">
      <div className="panel__head">
        <h2 id="progress-heading">Next goal</h2>
      </div>

      <div className="goal">
        <strong>{goal.title}</strong>
        <p className="small">{goal.detail}</p>
        {goal.progress !== undefined && (
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(goal.progress * 100)}>
            <span style={{ width: `${Math.min(100, goal.progress * 100)}%` }} />
          </div>
        )}
        {goal.action && (
          <button type="button" className="primary" onClick={runGoal}>
            {goal.action.label}
          </button>
        )}
      </div>

      <h3>Collections</h3>
      <ul className="collection-progress">
        {collections.map(({ collection, unlocked, progress }) => (
          <li key={collection.id}>
            <div className="collection-progress__head">
              <span style={{ color: collection.accent }}>{collection.name}</span>
              <span className="muted small">
                {unlocked
                  ? 'unlocked'
                  : `${formatCash(collection.unlockWinnings)} winnings or ${collection.unlockCards} cards`}
              </span>
            </div>
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${progress * 100}%`, background: collection.accent }} />
            </div>
          </li>
        ))}
      </ul>

      <h3>Run statistics</h3>
      <dl className="stat-grid">
        <div>
          <dt>Cash on hand</dt>
          <dd>{formatCash(state.cash)}</dd>
        </div>
        <div>
          <dt>Gross winnings this run</dt>
          <dd>{formatCash(state.runWinnings)}</dd>
        </div>
        <div>
          <dt>All-time gross winnings</dt>
          <dd>{formatCash(state.totalWinnings)}</dd>
        </div>
        <div>
          <dt>Cards completed (run / all time)</dt>
          <dd>
            {state.runCards} / {state.totalCards}
          </dd>
        </div>
        <div>
          <dt>Prestige milestone</dt>
          <dd>
            {formatCash(state.runWinnings)} / {formatCash(PRESTIGE_REQUIREMENT)}
          </dd>
        </div>
        <div>
          <dt>Time played</dt>
          <dd>{formatDuration(state.playTimeMs)}</dd>
        </div>
      </dl>

      <h3>Recent activity</h3>
      <ul className="feed">
        {state.feed.slice(0, 8).map((entry) => (
          <li key={entry.id} className={entry.tone}>
            {entry.text}
          </li>
        ))}
        {state.feed.length === 0 && <li className="muted">Nothing yet.</li>}
      </ul>
    </section>
  );
}
