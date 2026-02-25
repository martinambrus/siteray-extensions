import type { RunningScan } from '../../common/types';

interface ProgressViewProps {
  domain: string;
  runningScan: RunningScan | null;
  onViewScan: () => void;
}

export function ProgressView({ domain, runningScan, onViewScan }: ProgressViewProps) {
  const statusText = runningScan?.status === 'running' ? 'Scanning...' : 'Queued...';

  return (
    <div class="content">
      <div class="progress-section">
        <div class="spinner" />
        <div class="not-scanned-title">{statusText}</div>
        <div class="progress-text">
          Analyzing {domain}
        </div>
        {runningScan?.status === 'queued' && (
          <div class="progress-text" style={{ marginTop: '4px' }}>
            Waiting in queue
          </div>
        )}
        <button class="external-link" onClick={onViewScan}>
          View scan on SiteRay
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
