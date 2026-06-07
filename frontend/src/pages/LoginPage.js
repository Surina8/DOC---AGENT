import React, { useState } from 'react';
import { useAuth } from '../AuthContext';

function LoginPage({ onSwitchToRegister }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Napaka pri prijavi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark">D</div>
          <div>
            <div className="auth-logo-name">DocAgent</div>
            <div className="auth-logo-sub">IDP System</div>
          </div>
        </div>

        <h2 className="auth-title">Prijava</h2>
        <p className="auth-sub">Prijavi se za nadaljevanje</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">Email</label>
          <input
            type="email"
            className="auth-input"
            placeholder="ime@domena.si"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />

          <label className="auth-label">Geslo</label>
          <input
            type="password"
            className="auth-input"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {error && <div className="error-box">{error}</div>}

          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? 'Prijavljam...' : 'Prijava'}
          </button>
        </form>

        <div className="auth-switch">
          Še nimaš računa?{' '}
          <button type="button" className="auth-link" onClick={onSwitchToRegister}>
            Registriraj se
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
