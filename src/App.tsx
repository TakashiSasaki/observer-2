import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AppPage from './pages/AppPage';
import DevDocPage from './pages/DevDocPage';
import TypesDocPage from './pages/TypesDocPage';
import TestPage from './pages/TestPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<AppPage />} />
        <Route path="/dev" element={<DevDocPage />} />
        <Route path="/dev/types" element={<TypesDocPage />} />
        <Route path="/test" element={<TestPage />} />
      </Routes>
    </BrowserRouter>
  );
}
