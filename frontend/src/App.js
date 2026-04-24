import React, { useState } from 'react';
import './App.css';
import UploadPage from './pages/UploadPage';
import ReviewPage from './pages/ReviewPage';

function App() {
  const [activePage, setActivePage] = useState('upload');
  const [extractionResult, setExtractionResult] = useState(null);

  function goToReview(result) {
    setExtractionResult(result);
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
            className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActivePage('dashboard')}
          >
            Dashboard
          </div>
          <div
            className={`nav-item ${activePage === 'eval' ? 'active' : ''}`}
            onClick={() => setActivePage('eval')}
          >
            Evalvacija
          </div>
        </nav>
      </div>

      <div className="main">
        <div className="topbar">
          <div className="page-title">
            {activePage === 'upload' && 'Nov dokument'}
            {activePage === 'review' && 'Human Review'}
            {activePage === 'dashboard' && 'Dashboard'}
            {activePage === 'eval' && 'Evalvacija modelov'}
          </div>
        </div>
        <div className="content">
          {activePage === 'upload' && (
            <UploadPage onComplete={goToReview} />
          )}
          {activePage === 'review' && (
            <ReviewPage data={extractionResult} />
          )}
          {activePage === 'dashboard' && <p>Dashboard — kmalu</p>}
          {activePage === 'eval' && <p>Evalvacija — kmalu</p>}
        </div>
      </div>
    </div>
  );
}

export default App;
