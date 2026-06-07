import React, { useEffect, useState } from 'react';
import axios from 'axios';

function DashboardPage({ onOpenDocument }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:8000/api/dashboard');
      setData(response.data);
    } catch (err) {
      setError('Napaka pri nalaganju statistik.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenDocument(id) {
    try {
      const response = await axios.get(`http://localhost:8000/api/documents/${id}`);
      if (response.data.error) {
        alert(response.data.error);
        return;
      }
      if (onOpenDocument) onOpenDocument(response.data);
    } catch (err) {
      alert('Napaka pri odpiranju dokumenta.');
    }
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleDateString('sl-SI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function getConfidenceColor(conf) {
    if (conf === null || conf === undefined) return '#5a6070';
    if (conf >= 0.85) return '#22c55e';
    if (conf >= 0.6) return '#f59e0b';
    return '#ef4444';
  }

  function getStatusLabel(status) {
    return {
      pending: 'Čaka pregled',
      reviewed: 'Potrjeno',
      rejected: 'Zavrnjeno',
    }[status] || status;
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9aa0b0' }}>Nalagam dashboard...</div>;
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return null;

  const {
    stats,
    documents_by_day,
    confidence_distribution,
    reliability_bins,
    top_templates,
    recent_documents,
    template_stats,
  } = data;

  // Pripravi zadnjih 30 dni za bar chart, izpolni manjkajoče dneve z 0
  const days = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const isoDay = d.toISOString().slice(0, 10);
    const match = documents_by_day.find(x => x.day === isoDay);
    days.push({
      day: d,
      count: match ? match.count : 0,
    });
  }

  const maxCount = Math.max(1, ...days.map(d => d.count));

  // Donut chart: confidence breakdown
  const totalConfCount = confidence_distribution.high + confidence_distribution.medium + confidence_distribution.low;
  const highPct = totalConfCount ? (confidence_distribution.high / totalConfCount) * 100 : 0;
  const medPct = totalConfCount ? (confidence_distribution.medium / totalConfCount) * 100 : 0;
  const lowPct = totalConfCount ? (confidence_distribution.low / totalConfCount) * 100 : 0;

  // Donut SVG: krog ima obseg 2πr, r=64 → ~402
  const circumference = 2 * Math.PI * 64;
  const highLen = (highPct / 100) * circumference;
  const medLen = (medPct / 100) * circumference;
  const lowLen = (lowPct / 100) * circumference;

  const avgConfPct = Math.round((stats.avg_confidence || 0) * 100);
  const avgProcessingSec = (stats.avg_processing_ms / 1000).toFixed(1);
  const ecePercent = (stats.ece * 100).toFixed(1);

  function getEceColor(ece) {
    if (ece < 0.05) return '#22c55e';
    if (ece < 0.12) return '#f59e0b';
    return '#ef4444';
  }

  function getCorrectionRateColor(rate) {
    if (rate < 0.15) return '#22c55e';
    if (rate < 0.35) return '#f59e0b';
    return '#ef4444';
  }

  return (
    <div className="dashboard-page">

      {/* Stats KPI tiles */}
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Dokumenti</div>
          <div className="stat-value">{stats.total_documents}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Potrjeni</div>
          <div className="stat-value">{stats.confirmed_documents}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Sklopi</div>
          <div className="stat-value">{stats.total_batches}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Predloge</div>
          <div className="stat-value">{stats.total_templates}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg. zanesljivost</div>
          <div className="stat-value" style={{ color: getConfidenceColor(stats.avg_confidence) }}>
            {avgConfPct}%
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Korekcij</div>
          <div className="stat-value">{stats.total_corrections}</div>
        </div>
        <div className="stat" title="Expected Calibration Error — kako poštena je confidence">
          <div className="stat-label">ECE</div>
          <div className="stat-value" style={{ color: getEceColor(stats.ece) }}>
            {ecePercent}%
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg čas</div>
          <div className="stat-value">{avgProcessingSec}s</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="dashboard-grid">

        {/* Bar chart */}
        <div className="chart-card">
          <div className="chart-title">Dokumenti po dnevih (zadnjih 30)</div>
          {totalConfCount === 0 && stats.total_documents === 0 ? (
            <div style={{ color: '#5a6070', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
              Še ni podatkov. Naloži kakšen dokument.
            </div>
          ) : (
            <div className="bar-chart">
              {days.map((d, i) => (
                <div
                  key={i}
                  className="bar"
                  style={{ height: `${(d.count / maxCount) * 100}%` }}
                  title={`${d.day.toLocaleDateString('sl-SI')}: ${d.count}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Donut */}
        <div className="chart-card">
          <div className="chart-title">Razdelitev zanesljivosti</div>
          {totalConfCount === 0 ? (
            <div style={{ color: '#5a6070', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
              Ni dokumentov.
            </div>
          ) : (
            <>
              <div className="donut">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <circle
                    cx="80" cy="80" r="64" fill="none"
                    stroke="#22c55e" strokeWidth="16"
                    strokeDasharray={`${highLen} ${circumference}`}
                    transform="rotate(-90 80 80)"
                  />
                  <circle
                    cx="80" cy="80" r="64" fill="none"
                    stroke="#f59e0b" strokeWidth="16"
                    strokeDasharray={`${medLen} ${circumference}`}
                    strokeDashoffset={-highLen}
                    transform="rotate(-90 80 80)"
                  />
                  <circle
                    cx="80" cy="80" r="64" fill="none"
                    stroke="#ef4444" strokeWidth="16"
                    strokeDasharray={`${lowLen} ${circumference}`}
                    strokeDashoffset={-(highLen + medLen)}
                    transform="rotate(-90 80 80)"
                  />
                </svg>
                <div className="donut-text">
                  <div className="donut-num">{avgConfPct}%</div>
                  <div className="donut-sub">Avg</div>
                </div>
              </div>
              <div className="donut-legend">
                <div><span className="legend-dot" style={{ background: '#22c55e' }}></span> Visoka {confidence_distribution.high}</div>
                <div><span className="legend-dot" style={{ background: '#f59e0b' }}></span> Srednja {confidence_distribution.medium}</div>
                <div><span className="legend-dot" style={{ background: '#ef4444' }}></span> Nizka {confidence_distribution.low}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lists row */}
      <div className="dashboard-grid">

        {/* Top templates */}
        <div className="chart-card">
          <div className="chart-title">Najbolj uporabljene predloge</div>
          {top_templates.length === 0 ? (
            <div style={{ color: '#5a6070', fontSize: '13px', padding: '20px 0' }}>
              Še ni predlog.
            </div>
          ) : (
            <div className="dashboard-list">
              {top_templates.map(t => (
                <div key={t.id} className="dashboard-list-row">
                  <span className="dashboard-list-name">{t.name}</span>
                  <span className="dashboard-list-meta">{t.usage_count}×</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent documents */}
        <div className="chart-card">
          <div className="chart-title">Zadnji dokumenti</div>
          {recent_documents.length === 0 ? (
            <div style={{ color: '#5a6070', fontSize: '13px', padding: '20px 0' }}>
              Še ni dokumentov.
            </div>
          ) : (
            <div className="dashboard-list">
              {recent_documents.map(d => (
                <div
                  key={d.id}
                  className="dashboard-list-row clickable"
                  onClick={() => handleOpenDocument(d.id)}
                >
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div className="dashboard-list-name">{d.filename}</div>
                    <div className="dashboard-list-sub">
                      {formatDate(d.upload_date)} · {getStatusLabel(d.status)}
                    </div>
                  </div>
                  {d.avg_confidence !== null && (
                    <span
                      className="dashboard-list-meta"
                      style={{ color: getConfidenceColor(d.avg_confidence) }}
                    >
                      {Math.round(d.avg_confidence * 100)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reliability diagram */}
      <div className="chart-card">
        <div className="chart-title">
          Reliability diagram
          <span style={{ marginLeft: '8px', color: 'var(--text-dim)', fontWeight: 400, fontSize: '11px' }}>
            (confidence vs dejanska natančnost)
          </span>
        </div>
        {reliability_bins.every(b => b.count === 0) ? (
          <div style={{ color: '#5a6070', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
            Še ni dovolj potrjenih dokumentov za kalibracijo.
          </div>
        ) : (
          <>
            <div className="reliability-chart">
              {reliability_bins.map((b, i) => {
                const labelPct = Math.round((b.lower + b.upper) / 2 * 100);
                const confH = b.count > 0 ? b.avg_conf * 100 : 0;
                const accH = b.count > 0 ? b.accuracy * 100 : 0;
                return (
                  <div key={i} className="reliability-bin">
                    <div className="reliability-bars">
                      <div
                        className="reliability-bar conf"
                        style={{ height: `${confH}%` }}
                        title={`Avg confidence: ${confH.toFixed(0)}%`}
                      />
                      <div
                        className="reliability-bar acc"
                        style={{ height: `${accH}%` }}
                        title={`Accuracy: ${accH.toFixed(0)}% (${b.count} polj)`}
                      />
                    </div>
                    <div className="reliability-label">{labelPct}%</div>
                  </div>
                );
              })}
            </div>
            <div className="reliability-legend">
              <div><span className="legend-dot" style={{ background: 'var(--accent)' }}></span> Avg confidence</div>
              <div><span className="legend-dot" style={{ background: 'var(--green)' }}></span> Dejanska natančnost</div>
            </div>
          </>
        )}
      </div>

      {/* Problematic templates */}
      {template_stats && template_stats.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">Predloge po correction rate</div>
          <div className="dashboard-list">
            {template_stats.map(t => (
              <div key={t.id} className="template-stat-row">
                <div className="template-stat-main">
                  <div className="template-stat-name">{t.name}</div>
                  <div className="template-stat-sub">
                    {t.total_fields} polj · avg conf {Math.round(t.avg_confidence * 100)}%
                    {t.top_corrected_fields.length > 0 && (
                      <> · Najbolj popravljena: {t.top_corrected_fields.map(f => f.field_key).join(', ')}</>
                    )}
                  </div>
                </div>
                <div
                  className="template-stat-rate"
                  style={{ color: getCorrectionRateColor(t.correction_rate) }}
                >
                  {Math.round(t.correction_rate * 100)}%
                  <div className="template-stat-rate-label">popravkov</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '12px' }}>
            Pri visokem correction rate je smiselno izboljšati opise polj v predlogi.
          </div>
        </div>
      )}

    </div>
  );
}

export default DashboardPage;
