import { useState } from 'preact/hooks';

interface FailedScanViewProps {
  domain: string;
  scanId: string;
  onScan: () => Promise<void>;
  onViewScan: () => void;
}

export function FailedScanView({ domain, scanId, onScan, onViewScan }: FailedScanViewProps) {
  const [loading, setLoading] = useState(false);

  async function handleRetry() {
    setLoading(true);
    try {
      await onScan();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="content">
      <div class="not-scanned">
        <div class="failed-scan-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="1.5" />
            <path d="M12 8v5" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="12" cy="16" r="0.75" fill="#ef4444" />
          </svg>
        </div>
        <div class="not-scanned-title">Scan failed</div>
        <div class="not-scanned-text">
          The last scan of {domain} failed
        </div>
        <button class="btn btn-primary btn-full" onClick={handleRetry} disabled={loading}>
          {loading ? 'Starting scan...' : 'Retry scan'}
        </button>
        {scanId && (
          <button class="external-link" onClick={onViewScan}>
            View scan on SiteRay
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
