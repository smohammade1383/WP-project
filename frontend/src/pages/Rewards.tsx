import { Navigate } from 'react-router-dom';
import { hasAnyRole, useRoleRouterContext } from '../hooks/useRoleRouterContext';

const Rewards = () => {
  const { isAuthenticated, roles } = useRoleRouterContext();

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (hasAnyRole(roles, ['Basic User', 'Complainant', 'Witness'])) {
    return <Navigate to="/citizen/rewards" replace />;
  }
  if (hasAnyRole(roles, ['Detective'])) return <Navigate to="/detective/rewards" replace />;
  if (hasAnyRole(roles, ['Police Officer', 'Patrol Officer', 'Sergeant', 'Sergent', 'Captain', 'Chief'])) {
    return <Navigate to="/rewards/verify" replace />;
  }
  if (hasAnyRole(roles, ['Administrator'])) return <Navigate to="/admin" replace />;

  return <Navigate to="/403" replace />;
};

export default Rewards;
