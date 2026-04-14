import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useWorkflowStore } from './store/workflowStore';
import WorkflowPage from './pages/WorkflowPage';

export default function App() {
  const { rawDfBlobUrl, resetSession } = useWorkflowStore();

  // On mount, verify the stored blob URL is still valid.
  // If it's expired (404), reset the session so the user sees the upload screen.
  useEffect(() => {
    if (!rawDfBlobUrl) return;
    fetch(rawDfBlobUrl, { method: 'HEAD' })
      .then((res) => { if (!res.ok) resetSession(); })
      .catch(() => resetSession());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Routes>
      <Route path="/" element={<WorkflowPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
