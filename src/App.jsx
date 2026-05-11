import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import UserDashboard from './pages/UserDashboard.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import StarfieldBackground from './components/StarfieldBackground.jsx';

// Admin dashboard pulls in recharts (~370KB). Code-splitting it keeps that
// out of the main bundle so regular users never download chart code.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));

export default function App() {
  return (
    <>
      <StarfieldBackground />
      <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route
        path="/user"
        element={
          <ProtectedRoute role="user">
            <UserDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <Suspense
              fallback={
                <div className="loading-shell">
                  <div className="spinner" aria-hidden="true" />
                  <p className="muted">Loading admin…</p>
                </div>
              }
            >
              <AdminDashboard />
            </Suspense>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}
