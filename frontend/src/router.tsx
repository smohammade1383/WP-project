import { createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import ComponentsDemo from './pages/ComponentsDemo';

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
      // Additional routes will be added here
    ],
  },
]);
