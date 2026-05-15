import React, { useState } from 'react';
import './App.css';
import UploadPage from './pages/UploadPage';
import ReviewPage from './pages/ReviewPage';
import HistoryPage from './pages/HistoryPage';
import TemplatesPage from './pages/TemplatesPage';

function App() {
  const [activePage, setActivePage] = useState('upload');
  const [extractionResult, setExtractionResult] = useState(null);

  function goToReview(result) {
    setExtractionResult(result);
    setActivePage('review');
  }

  function openHistoricalDocument(documentData) {
    setExtractionResult(documentData);
    setActivePage('review');
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="logo">
          <div className="logo-text">DocAgent</div>
          <div className="logo-sub">IDP System</div>
        </div>
        <nav className="nav">
          <div
            className={`nav-item ${activePage === 'upload' ? 'active' : ''}`}
            onClick={() => setActivePage('upload')}
          >
            Nov dokument
          </div>
          <div
            className={`nav-item ${activePage === 'review' ? 'active' : ''}`}
            onClick={() => setActivePage('review')}
          >
            Human Review
            {extractionResult && (
              <span className="nav-badge">1</span>
            )}
          </div>
          <div
            className={`nav-item ${activePage === 'history' ? 'active' : ''}`}
            onClick={() => setActivePage('history')}
          >
            Zgodovina
          </div>
          <div
            className={`nav-item ${activePage === 'templates' ? 'active' : ''}`}
            onClick={() => setActivePage('templates')}
          >
            Predloge
          </div>
          <div
            className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActivePage('dashboard')}
          >
            Dashboard
          </div>
        </nav>
      </div>

      <div className="main">
        <div className="topbar">
          <div className="page-title">
            {activePage === 'upload' && 'Nov dokument'}
            {activePage === 'review' && 'Human Review'}
            {activePage === 'history' && 'Zgodovina dokumentov'}
            {activePage === 'templates' && 'Predloge polj'}
            {activePage === 'dashboard' && 'Dashboard'}
          </div>
        </div>
        <div className="content">
          {activePage === 'upload' && (
            <UploadPage onComplete={goToReview} />
          )}
          {activePage === 'review' && (
            <ReviewPage data={extractionResult} />
          )}
          {activePage === 'history' && (
            <HistoryPage onOpenDocument={openHistoricalDocument} />
          )}
          {activePage === 'templates' && (
            <TemplatesPage />
          )}
          {activePage === 'dashboard' && <p>Dashboard — kmalu</p>}
        </div>
      </div>
    </div>
  );
}

export default App;