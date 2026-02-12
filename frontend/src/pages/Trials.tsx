import { Navigate } from 'react-router-dom';
import { hasAnyRole, useRoleRouterContext } from '../hooks/useRoleRouterContext';

const Trials = () => {
  const { isAuthenticated, roles } = useRoleRouterContext();

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (hasAnyRole(roles, ['Judge'])) return <Navigate to="/judge/bench" replace />;
  if (hasAnyRole(roles, ['Captain', 'Chief'])) return <Navigate to="/reports" replace />;
  if (hasAnyRole(roles, ['Administrator'])) return <Navigate to="/admin" replace />;

  return <Navigate to="/403" replace />;
};

export default Trials;
