import { useEffect, useState } from 'react';
import { CURRENCY_NAME, formatCash, formatDuration } from './game/format';
import { store, useGame } from './game/store';
import { AutomationPanel } from './ui/AutomationPanel';
import { PrestigePanel } from './ui/PrestigePanel';
import { ProgressPanel } from './ui/ProgressPanel';
import { ScratchArea } from './ui/ScratchArea';
import { SettingsPanel } from './ui/SettingsPanel';
import { ShopPanel } from './ui/ShopPanel';
import { UpgradePanel } from './ui/UpgradePanel';

type Tab = 'shop' | 'upgrades' | 'automation' | 'progress' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'shop', label: 'Shop' },
  { id: 'upgrades', label: 'Upgrades' },
  { id: 'automation', label: 'Automation' },
  { id: 'progress', label: 'Progress' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const state = useGame();
  const [tab, setTab] = useState<Tab>('shop');
  const [showPrestige, setShowPrestige] = useState(false);

  useEffect(() => {
    store.start();
    const onHide = () => store.save();
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      store.stop();
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = state.settings.reducedMotion ? 'true' : 'false';
  }, [state.settings.reducedMotion]);

  const offline = store.offlineReport;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <div>
            <h1>Scratchworks</h1>
            <p className="muted small">A workshop of fictional {CURRENCY_NAME}</p>
          </div>
        </div>
        <dl className="topbar__stats">
          <div>
            <dt>Cash</dt>
            <dd>{formatCash(state.cash)}</dd>
          </div>
          <div>
            <dt>Run winnings</dt>
            <dd>{formatCash(state.runWinnings)}</dd>
          </div>
          <div>
            <dt>Blueprints</dt>
            <dd>{state.blueprints}</dd>
          </div>
        </dl>
        <button type="button" className="primary" onClick={() => setShowPrestige(true)}>
          Prestige
        </button>
      </header>

      {store.notice && (
        <div className="banner" role="status">
          <span>{store.notice}</span>
          <button type="button" className="ghost" onClick={() => store.dismissNotice()}>
            Dismiss
          </button>
        </div>
      )}

      {!state.settings.onboardingDismissed && (
        <div className="banner banner--intro" role="note">
          <div>
            <strong>Welcome to the bench.</strong> Buy a ticket, scratch it with the mouse or your
            finger (or press <em>Reveal card</em>), then claim the winnings. Every price and every
            probability is shown before you buy. Nothing here involves real money.
          </div>
          <button
            type="button"
            className="ghost"
            onClick={() => store.updateSettings({ onboardingDismissed: true })}
          >
            Got it
          </button>
        </div>
      )}

      {offline && (
        <div className="banner banner--offline" role="status">
          <span>
            Welcome back. The workshop ran for {formatDuration(offline.creditedMs)} (capped at two
            hours): {offline.cardsBought} cards bought, {offline.cardsClaimed} claimed,{' '}
            {formatCash(offline.cashGained)} net.
          </span>
          <button type="button" className="ghost" onClick={() => store.dismissOffline()}>
            Dismiss
          </button>
        </div>
      )}

      <main className="layout">
        <div className="layout__left desktop-only">
          <ShopPanel state={state} />
        </div>

        <div className="layout__center">
          <ScratchArea state={state} />
          <div className="mobile-only">
            <nav className="tabs" aria-label="Workshop sections">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={tab === item.id ? 'is-active' : ''}
                  aria-current={tab === item.id}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            {tab === 'shop' && <ShopPanel state={state} />}
            {tab === 'upgrades' && <UpgradePanel state={state} />}
            {tab === 'automation' && <AutomationPanel state={state} />}
            {tab === 'progress' && (
              <ProgressPanel state={state} onOpenPrestige={() => setShowPrestige(true)} />
            )}
            {tab === 'settings' && <SettingsPanel state={state} />}
          </div>
        </div>

        <div className="layout__right desktop-only">
          <ProgressPanel state={state} onOpenPrestige={() => setShowPrestige(true)} />
          <AutomationPanel state={state} />
          <UpgradePanel state={state} />
          <SettingsPanel state={state} />
        </div>
      </main>

      {showPrestige && <PrestigePanel state={state} onClose={() => setShowPrestige(false)} />}
    </div>
  );
}
