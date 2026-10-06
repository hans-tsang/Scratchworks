import { useRef, useState } from 'react';
import { store } from '../game/store';
import type { GameState } from '../game/types';

export function SettingsPanel({ state }: { state: GameState }) {
  const [exported, setExported] = useState('');
  const [importText, setImportText] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const exportRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <section className="panel" aria-labelledby="settings-heading">
      <div className="panel__head">
        <h2 id="settings-heading">Settings &amp; save</h2>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={state.settings.reducedMotion}
          onChange={(e) => store.updateSettings({ reducedMotion: e.target.checked })}
        />
        Reduce motion and animation
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={state.settings.muted}
          onChange={(e) => store.updateSettings({ muted: e.target.checked })}
        />
        Mute feedback sounds
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={state.settings.bigSpendWarning}
          onChange={(e) => store.updateSettings({ bigSpendWarning: e.target.checked })}
        />
        Warn before a purchase costs more than 25% of my cash
      </label>

      <h3>Save management</h3>
      <div className="button-row">
        <button
          type="button"
          onClick={() => {
            setExported(store.exportSave());
            window.setTimeout(() => exportRef.current?.focus(), 0);
          }}
        >
          Export save
        </button>
        <button type="button" onClick={() => store.save()}>
          Save now
        </button>
      </div>
      {exported && (
        <textarea
          ref={exportRef}
          className="save-box"
          readOnly
          value={exported}
          aria-label="Exported save data"
          rows={4}
        />
      )}

      <label htmlFor="import-box" className="small">
        Paste a save to import
      </label>
      <textarea
        id="import-box"
        className="save-box"
        rows={3}
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
      />
      <div className="button-row">
        <button
          type="button"
          disabled={!importText.trim()}
          onClick={() => {
            if (store.importSave(importText)) setImportText('');
          }}
        >
          Import save
        </button>
      </div>

      <h3>Reset</h3>
      {confirmReset ? (
        <div className="risk-warning" role="alert">
          <p>This deletes everything, including Blueprints and permanent upgrades.</p>
          <div className="button-row">
            <button
              type="button"
              className="primary"
              onClick={() => {
                store.resetSave();
                setConfirmReset(false);
              }}
            >
              Yes, erase my workshop
            </button>
            <button type="button" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmReset(true)}>
          Reset save
        </button>
      )}

      <p className="muted small">
        Scratchworks is a toy about fictional Workshop Credits. There is no real money, no deposits,
        no cash-outs, no ads and nothing to buy.
      </p>
    </section>
  );
}
