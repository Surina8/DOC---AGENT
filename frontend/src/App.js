import React, { useState } from 'react';
import './App.css';
import UploadPage from './pages/UploadPage';
import ReviewPage from './pages/ReviewPage';
import HistoryPage from './pages/HistoryPage';
import TemplatesPage from './pages/TemplatesPage';
import BatchUploadPage from './pages/BatchUploadPage';
import BatchListPage from './pages/BatchListPage';
import BatchResultsPage from './pages/BatchResultsPage';
import ArchivePage from './pages/ArchivePage';

function App() {
  const [activePage, setActivePage] = useState('upload');
  const [extractionResult, setExtractionResult] = useState(null);
  const [viewBatchId, setViewBatchId] = useState(null);

  function goToReview(result) {
    setExtractionResult(result);
    setActivePage('review');
  }

  function openHistoricalDocument(documentData) {
    setExtractionResult(documentData);
    setActivePage('review');
  }

  function handleReviewComplete() {
    // Po potrjevanju dokumenta: počisti state in pojdi na upload
    setExtractionResult(null);
    setActivePage('upload');
  }

  function viewBatchResults(batchId) {
    setViewBatchId(batchId);
    setActivePage('batch-results');
  }

  function backToBatchList() {
    setViewBatchId(null);
    setActivePage('batch-list');
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
            className={`nav-item ${activePage === 'batch' ? 'active' : ''}`}
            onClick={() => setActivePage('batch')}
          >
            Batch upload
          </div>
          <div
            className={`nav-item ${activePage === 'batch-list' || activePage === 'batch-results' ? 'active' : ''}`}
            onClick={() => setActivePage('batch-list')}
          >
            Batch arhiv
          </div>
          <div
            className={`nav-item ${activePage === 'review' ? 'active' : ''}`}
            onClick={() => setActivePage('review')}
          >
            Human Review
            {extractionResult && <span className="nav-badge">1</span>}
          </div>
          <div
            className={`nav-item ${activePage === 'history' ? 'active' : ''}`}
            onClick={() => setActivePage('history')}
          >
            Zgodovina
          </div>
          <div
            className={`nav-item ${activePage === 'archive' ? 'active' : ''}`}
            onClick={() => setActivePage('archive')}
          >
            Arhiv
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
            {activePage === 'batch' && 'Batch upload'}
            {activePage === 'batch-list' && 'Batch arhiv'}
            {activePage === 'batch-results' && 'Rezultati batch-a'}
            {activePage === 'review' && 'Human Review'}
            {activePage === 'history' && 'Zgodovina dokumentov'}
            {activePage === 'archive' && 'Arhiv potrjenih'}
            {activePage === 'templates' && 'Predloge polj'}
            {activePage === 'dashboard' && 'Dashboard'}
          </div>
        </div>
        <div className="content">
          {activePage === 'upload' && <UploadPage onComplete={goToReview} />}
          {activePage === 'batch' && <BatchUploadPage onViewResults={viewBatchResults} />}
          {activePage === 'batch-list' && <BatchListPage onOpenBatch={viewBatchResults} />}
          {activePage === 'batch-results' && (
            <BatchResultsPage batchId={viewBatchId} onBack={backToBatchList} />
          )}
          {activePage === 'review' && (
            <ReviewPage data={extractionResult} onConfirmed={handleReviewComplete} />
          )}
          {activePage === 'history' && <HistoryPage onOpenDocument={openHistoricalDocument} />}
          {activePage === 'archive' && <ArchivePage onOpenDocument={openHistoricalDocument} />}
          {activePage === 'templates' && <TemplatesPage />}
          {activePage === 'dashboard' && <p>Dashboard — kmalu</p>}
        </div>
      </div>
    </div>
  );
}

export default App;