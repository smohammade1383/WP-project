import { Navigate } from 'react-router-dom';
import { hasAnyRole, useRoleRouterContext } from '../hooks/useRoleRouterContext';

const Complaints = () => {
  const { isAuthenticated, roles } = useRoleRouterContext();

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (hasAnyRole(roles, ['Administrator'])) return <Navigate to="/admin" replace />;
  if (hasAnyRole(roles, ['Cadet'])) return <Navigate to="/cadet/complaints" replace />;
  if (hasAnyRole(roles, ['Police Officer', 'Patrol Officer'])) return <Navigate to="/officer/complaints" replace />;
  if (hasAnyRole(roles, ['Basic User', 'Complainant', 'Witness'])) {
    return <Navigate to="/citizen/complaints" replace />;
  }

  return <Navigate to="/403" replace />;
};

export default Complaints;
