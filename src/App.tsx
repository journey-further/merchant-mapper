import { Routes, Route, Navigate } from 'react-router-dom';
import WorkflowPage from './pages/WorkflowPage';

export default function App() {

  return (
    <Routes>
      <Route path="/" element={<WorkflowPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
