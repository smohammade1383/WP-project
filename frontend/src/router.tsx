import { createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import ComponentsDemo from './pages/ComponentsDemo';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import DetectiveBoard from './pages/DetectiveBoard';
import Cases from './pages/Cases';
import Complaints from './pages/Complaints';
import MostWanted from './pages/MostWanted';
import MostWantedDetail from './pages/MostWantedDetail';
import Evidence from './pages/Evidence';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Trials from './pages/Trials';
import Finance from './pages/Finance';
import Rewards from './pages/Rewards';
import AdminPanel from './pages/AdminPanel';
import Users from './pages/Users';
import MyCases from './pages/MyCases';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'demo',
        element: <ComponentsDemo />,
      },
      {
        path: 'auth',
        element: <Auth />,
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      {
        path: 'detective-board',
        element: <DetectiveBoard />,
      },
      {
        path: 'cases',
        element: <Cases />,
      },
      {
        path: 'complaints',
        element: <Complaints />,
      },
      {
        path: 'most-wanted',
        element: <MostWanted />,
      },
      {
        path: 'most-wanted/:suspectId',
        element: <MostWantedDetail />,
      },
      {
        path: 'evidence',
        element: <Evidence />,
      },
      {
        path: 'reports',
        element: <Reports />,
      },
      {
        path: 'profile',
        element: <Profile />,
      },
      {
        path: 'notifications',
        element: <Notifications />,
      },
      {
        path: 'trials',
        element: <Trials />,
      },
      {
        path: 'finance',
        element: <Finance />,
      },
      {
        path: 'rewards',
        element: <Rewards />,
      },
      {
        path: 'admin',
        element: <AdminPanel />,
      },
      {
        path: 'users',
        element: <Users />,
      },
      {
        path: 'my-cases',
        element: <MyCases />,
      },
      // Additional routes will be added here
    ],
  },
]);
