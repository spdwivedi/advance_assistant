import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ExecutionStudio } from './pages/ExecutionStudio';
import { SwarmMonitor } from './pages/SwarmMonitor';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { TokenGovernor } from './pages/TokenGovernor';
import { ApiKeyManager } from './pages/ApiKeyManager';
import { ToolBridges } from './pages/ToolBridges';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ExecutionStudio />} />
          <Route path="swarm" element={<SwarmMonitor />} />
          <Route path="knowledge" element={<KnowledgeBase />} />
          <Route path="governor" element={<TokenGovernor />} />
          <Route path="keys" element={<ApiKeyManager />} />
          <Route path="tools" element={<ToolBridges />} />
          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
