import React, { useState } from 'react';
import { useAuth } from '../AuthContext';

function RegisterPage({ onSwitchToLogin }) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Geslo mora imeti vsaj 6 znakov.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Gesli se ne ujemata.');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, fullName);
    } catch (err) {
      setError(err.message || 'Napaka pri registraciji.');
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

        <h2 className="auth-title">Registracija</h2>
        <p className="auth-sub">Ustvari nov račun</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">Polno ime</label>
          <input
            type="text"
            className="auth-input"
            placeholder="Ime Priimek"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            autoFocus
          />

          <label className="auth-label">Email</label>
          <input
            type="email"
            className="auth-input"
            placeholder="ime@domena.si"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <label className="auth-label">Geslo</label>
          <input
            type="password"
            className="auth-input"
            placeholder="vsaj 6 znakov"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <label className="auth-label">Ponovi geslo</label>
          <input
            type="password"
            className="auth-input"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
          />

          {error && <div className="error-box">{error}</div>}

          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? 'Ustvarjam račun...' : 'Registracija'}
          </button>
        </form>

        <div className="auth-switch">
          Že imaš račun?{' '}
          <button type="button" className="auth-link" onClick={onSwitchToLogin}>
            Prijava
          </button>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
