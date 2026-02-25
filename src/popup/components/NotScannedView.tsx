import { useState } from 'preact/hooks';

interface NotScannedViewProps {
  domain: string;
  onScan: () => Promise<void>;
}

export function NotScannedView({ domain, onScan }: NotScannedViewProps) {
  const [loading, setLoading] = useState(false);

  async function handleScan() {
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
        <div class="not-scanned-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="4 3" />
            <path d="M12 8v4M12 16h.01" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </div>
        <div class="not-scanned-title">Not yet scanned</div>
        <div class="not-scanned-text">
          {domain ? (
            <>{domain} hasn't been scanned yet</>
          ) : (
            <>This page can't be scanned</>
          )}
        </div>
        {domain && (
          <button class="btn btn-primary btn-full" onClick={handleScan} disabled={loading}>
            {loading ? 'Starting scan...' : 'Scan this site'}
          </button>
        )}
      </div>
    </div>
  );
}
