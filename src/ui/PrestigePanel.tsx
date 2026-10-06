import { useState } from 'react';
import { PERMANENT_UPGRADES, permanentCost } from '../game/data/upgrades';
import { formatCash } from '../game/format';
import { prestigePreview } from '../game/prestige';
import { store } from '../game/store';
import type { GameState } from '../game/types';

export function PrestigePanel({ state, onClose }: { state: GameState; onClose: () => void }) {
  const preview = prestigePreview(state);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="prestige-heading">
      <div className="modal">
        <div className="panel__head">
          <h2 id="prestige-heading">Prestige — file your Blueprints</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <dl className="stat-grid">
          <div>
            <dt>Blueprints owned (spendable now)</dt>
            <dd>{preview.owned}</dd>
          </div>
          <div>
            <dt>Blueprints if you prestige now</dt>
            <dd>{preview.pendingAward} (not yet spendable)</dd>
          </div>
          <div>
            <dt>Milestone</dt>
            <dd>
              {formatCash(state.runWinnings)} / {formatCash(preview.requirement)} gross winnings
            </dd>
          </div>
          <div>
            <dt>Prestiges completed</dt>
            <dd>{state.prestigeCount}</dd>
          </div>
        </dl>

        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(preview.progress * 100)}>
          <span style={{ width: `${preview.progress * 100}%` }} />
        </div>

        <div className="two-col">
          <div>
            <h3>This resets</h3>
            <ul className="rules">
              {preview.resets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>This persists</h3>
            <ul className="rules">
              {preview.keeps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {confirming ? (
          <div className="risk-warning" role="alert">
            <p>
              Prestige now and receive <strong>{preview.pendingAward} Blueprints</strong>? Your
              current cards and run upgrades will be lost.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  store.prestige();
                  setConfirming(false);
                }}
              >
                Yes, prestige
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={!preview.available}
            onClick={() => setConfirming(true)}
          >
            {preview.available
              ? `Prestige for ${preview.pendingAward} Blueprints`
              : `Reach ${formatCash(preview.requirement)} gross winnings to prestige`}
          </button>
        )}

        <h3>Permanent upgrades</h3>
        <p className="muted small">
          Blueprints can only be spent here, on the prestige screen. Permanent upgrades survive
          every reset.
        </p>
        <ul className="upgrade-list">
          {PERMANENT_UPGRADES.map((def) => {
            const level = state.permanent[def.id] ?? 0;
            const maxed = level >= def.maxLevel;
            const cost = permanentCost(def, level);
            return (
              <li key={def.id}>
                <div className="upgrade-row">
                  <div>
                    <strong>
                      {def.name}{' '}
                      <span className="muted small">
                        Lv {level}/{def.maxLevel}
                      </span>
                    </strong>
                    <p className="muted small">{def.description}</p>
                    <p className="small">{maxed ? 'Fully upgraded.' : def.effect(level)}</p>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={maxed || state.blueprints < cost}
                    onClick={() => store.buyPermanent(def.id)}
                  >
                    {maxed ? 'Max' : `${cost} BP`}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
