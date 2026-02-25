import { useState, useEffect, useRef } from 'preact/hooks';
import browser from 'webextension-polyfill';
import type { RunningScan, ScanProgressData } from '../../common/types';
import { CONFIG } from '../../common/config';

interface ProgressViewProps {
  domain: string;
  runningScan: RunningScan | null;
  onViewScan: () => void;
}

export function ProgressView({ domain, runningScan, onViewScan }: ProgressViewProps) {
  const [progress, setProgress] = useState<ScanProgressData | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!runningScan?.scanId) return;

    // Reset state on scanId change
    setProgress(null);
    setSseConnected(false);

    const abortController = new AbortController();
    abortRef.current = abortController;

    async function connect() {
      try {
        const resp = await browser.runtime.sendMessage({
          type: 'GET_STREAM_TOKEN',
          scanId: runningScan!.scanId,
        }) as { success: boolean; token?: string; streamToken?: string };

        const token = resp.token || resp.streamToken;
        if (abortController.signal.aborted || !resp.success || !token) return;

        const url = `${CONFIG.API_BASE_URL}/api/scans/${runningScan!.scanId}/progress?token=${token}`;

        // Use fetch instead of EventSource — EventSource doesn't respect
        // extension host permissions and gets blocked by CORS.
        const response = await fetch(url, {
          signal: abortController.signal,
          headers: { 'Accept': 'text/event-stream' },
        });

        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        let currentData = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done || abortController.signal.aborted) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames from buffer
          const lines = buffer.split('\n');
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, '');
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6);
            } else if (line === '' && currentData) {
              // End of SSE frame — process it
              handleSSEEvent(currentEvent, currentData);
              currentEvent = '';
              currentData = '';
            }
          }
        }
      } catch (err) {
        // Fetch failed or aborted — stay on fallback spinner
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.warn('[SiteRay] SSE stream error:', err);
        }
      }
    }

    function handleSSEEvent(event: string, data: string) {
      if (abortController.signal.aborted) return;

      try {
        if (event === 'progress' || event === 'complete') {
          const parsed = JSON.parse(data) as ScanProgressData;
          setProgress(parsed);
          setSseConnected(true);
        } else if (event === 'connection_expired') {
          // Reconnect
          connect();
        }
        // Ignore heartbeat and other events
      } catch {
        // Ignore parse errors
      }
    }

    connect();

    return () => {
      abortController.abort();
      abortRef.current = null;
    };
  }, [runningScan?.scanId]);

  const scanStatus = progress?.status ?? runningScan?.status;
  const isQueued = scanStatus === 'queued';

  // Compute progress from steps
  const completedSteps = progress?.eta?.completedSteps ?? 0;
  const totalSteps = progress?.eta?.totalSteps ?? 0;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Find the currently running step
  const runningStep = progress?.steps?.find(s => s.status === 'running');

  // Status text
  let statusText = 'Scanning...';
  if (isQueued) {
    const ahead = progress?.queuePosition?.ahead;
    statusText = ahead != null ? `Queued (position ${ahead + 1})` : 'Queued...';
  }

  // If SSE never connected, show fallback spinner
  if (!sseConnected) {
    const fallbackStatus = runningScan?.status === 'running' ? 'Scanning...' : 'Queued...';
    return (
      <div class="content">
        <div class="progress-section">
          <div class="spinner" />
          <div class="not-scanned-title">{fallbackStatus}</div>
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
            <ExternalLinkIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="content">
      <div class="progress-section">
        <div class="spinner" />
        <div class="not-scanned-title">{statusText}</div>
        <div class="progress-text">
          Analyzing {domain}
        </div>

        {!isQueued && (
          <div class="progress-details">
            <div class="progress-bar">
              <div
                class="progress-bar-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {runningStep && (
              <div class="progress-step-name">{runningStep.name}</div>
            )}

            {progress?.substep?.text && (
              <div class="progress-substep">{progress.substep.text}</div>
            )}

            {progress?.eta?.displayText && progress.eta.remainingMs > 0 && (
              <div class="progress-eta">{progress.eta.displayText}</div>
            )}
          </div>
        )}

        {isQueued && progress?.queuePosition && (
          <div class="progress-text" style={{ marginTop: '4px' }}>
            {progress.queuePosition.ahead === 0
              ? 'Next in queue'
              : `${progress.queuePosition.ahead} scan${progress.queuePosition.ahead !== 1 ? 's' : ''} ahead`}
          </div>
        )}

        <button class="external-link" onClick={onViewScan}>
          View scan on SiteRay
          <ExternalLinkIcon />
        </button>
      </div>
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
