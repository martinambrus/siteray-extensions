import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import type { ScanSummary, RescanEligibility } from '../../common/types';

interface ScoreViewProps {
  scan: ScanSummary;
  domain: string;
  onRescan: () => Promise<void>;
  onViewReport: () => void;
}

export function ScoreView({ scan, domain, onRescan, onViewReport }: ScoreViewProps) {
  const [rescanEligibility, setRescanEligibility] = useState<RescanEligibility | null>(null);
  const [rescanLoading, setRescanLoading] = useState(false);

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        console.log('[SiteRay] ScoreView checkRescan: scanId=', scan.id);
        const result = await browser.runtime.sendMessage({
          type: 'CHECK_RESCAN',
          scanId: scan.id,
        }) as RescanEligibility;
        console.log('[SiteRay] ScoreView checkRescan result:', JSON.stringify(result));
        if (!stale) setRescanEligibility(result);
      } catch {
        // Leave rescanEligibility as null
      }
    })();
    return () => { stale = true; };
  }, [scan.id]);

  async function handleRescan() {
    setRescanLoading(true);
    try {
      await onRescan();
    } finally {
      setRescanLoading(false);
    }
  }

  function formatTimeRemaining(dateStr: string): string {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff <= 0) return 'now';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  }

  const riskClass = scan.riskLevel || 'green';
  const rescanDisabled = rescanEligibility != null && !rescanEligibility.eligible;
  const showRescanCooldown = rescanDisabled && rescanEligibility?.nextAvailableAt;
  const showLastScanned = scan.stale && !rescanDisabled && scan.completedAt;

  return (
    <div class="content">
      <div class="score-section">
        <div class="score-left">
          <div class={`score-circle ${riskClass}`}>
            {scan.trustScore ?? '?'}
          </div>
          {scan.riskLevel && (
            <div class={`risk-label ${scan.riskLevel}`}>
              {scan.riskLevel === 'green' ? 'Trusted' : scan.riskLevel === 'yellow' ? 'Use Caution' : 'High Risk'}
            </div>
          )}
        </div>
        <div class="score-info">
          <div class="score-domain">
            {scan.faviconUrl && (
              <img
                src={scan.faviconUrl}
                alt=""
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            {domain}
          </div>
          {scan.websiteType && (
            <div class="score-type">{scan.websiteType}</div>
          )}
        </div>
      </div>

      {scan.verdict && (
        <div class="score-verdict">{scan.verdict}</div>
      )}

      <div class="actions-row">
        <button
          class="btn btn-secondary"
          onClick={handleRescan}
          disabled={rescanLoading || rescanDisabled}
        >
          {rescanLoading ? 'Starting...' : showLastScanned ? `Re-scan (last scanned ${formatDate(scan.completedAt!)})` : 'Re-scan'}
        </button>
      </div>
      {showRescanCooldown && (
        <div class="rescan-tooltip">Re-scan available in {formatTimeRemaining(rescanEligibility!.nextAvailableAt!)}</div>
      )}
      <button class="external-link" onClick={onViewReport}>
        View full report
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </button>
    </div>
  );
}
