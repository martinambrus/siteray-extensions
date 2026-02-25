import { useState } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { CONFIG } from '../../common/config';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  error: string;
}

export function LoginView({ onLogin, error }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
