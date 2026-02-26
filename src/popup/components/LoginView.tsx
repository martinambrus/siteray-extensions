import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { CONFIG } from '../../common/config';
import type { OAuthProvider } from '../../common/types';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  error: string;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Continue with Google',
  github: 'Continue with GitHub',
  apple: 'Continue with Apple',
};

const PROVIDER_ICONS: Record<string, () => preact.JSX.Element> = {
  google: GoogleIcon,
  github: GitHubIcon,
};

export function LoginView({ onLogin, error }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'GET_OAUTH_PROVIDERS' })
      .then((res: unknown) => {
        const result = res as { success: boolean; providers?: OAuthProvider[] };
        if (result.success && result.providers?.length) {
          setOauthProviders(result.providers);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await onLogin(email, password);
    } finally {
      setLoading(false);
    }
  }

  function handleOAuthClick(provider: OAuthProvider) {
    browser.runtime.sendMessage({ type: 'START_OAUTH', provider });
    window.close();
  }

  return (
    <div class="content">
      <div class="login-title">Sign in to SiteRay</div>
      <div class="login-subtitle">Enter your credentials to see trust scores</div>
      {error && <div class="error">{error}</div>}
      <form class="login-form" onSubmit={handleSubmit}>
        <div class="form-group">
          <label class="form-label" for="email">Email</label>
          <input
            id="email"
            class="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            required
            disabled={loading}
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="password">Password</label>
          <input
            id="password"
            class="input"
            type="password"
            placeholder="Your password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            required
            disabled={loading}
          />
        </div>
        <button class="btn btn-primary btn-full" type="submit" disabled={loading || !email || !password}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
      {oauthProviders.length > 0 && (
        <div class="oauth-section">
          <div class="oauth-divider">
            <div class="oauth-divider-line" />
            <span class="oauth-divider-text">or continue with</span>
            <div class="oauth-divider-line" />
          </div>
          <div class="oauth-buttons">
            {oauthProviders.map((provider) => {
              const Icon = PROVIDER_ICONS[provider];
              return (
                <button
                  key={provider}
                  class="oauth-btn"
                  type="button"
                  onClick={() => handleOAuthClick(provider)}
                >
                  {Icon && <Icon />}
                  {PROVIDER_LABELS[provider] || `Continue with ${provider}`}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ textAlign: 'center' }}>
        <a
          class="link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            browser.tabs.create({ url: `${CONFIG.WEB_BASE_URL}/auth/register`, active: true }).then(() => window.close());
          }}
        >
          Don't have an account? Sign up
        </a>
      </div>
    </div>
  );
}
