import { Navigate } from 'react-router-dom';
import { hasAnyRole, useRoleRouterContext } from '../hooks/useRoleRouterContext';

const Finance = () => {
  const { isAuthenticated, roles } = useRoleRouterContext();

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (hasAnyRole(roles, ['Basic User', 'Complainant', 'Witness', 'Suspect', 'Criminal'])) {
    return <Navigate to="/legal-bail" replace />;
  }

  if (hasAnyRole(roles, ['Detective'])) return <Navigate to="/detective/rewards" replace />;
  if (hasAnyRole(roles, ['Sergeant', 'Sergent'])) return <Navigate to="/sergeant/detention" replace />;
  if (hasAnyRole(roles, ['Police Officer', 'Patrol Officer', 'Captain', 'Chief'])) {
    return <Navigate to="/rewards/verify" replace />;
  }
  if (hasAnyRole(roles, ['Judge'])) return <Navigate to="/reports" replace />;
  if (hasAnyRole(roles, ['Administrator'])) return <Navigate to="/admin" replace />;

  return <Navigate to="/403" replace />;
};

export default Finance;
