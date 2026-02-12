import { Navigate } from 'react-router-dom';
import { hasAnyRole, useRoleRouterContext } from '../hooks/useRoleRouterContext';

const Evidence = () => {
  const { isAuthenticated, roles } = useRoleRouterContext();

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (hasAnyRole(roles, ['Detective'])) return <Navigate to="/detective/evidence" replace />;
  if (hasAnyRole(roles, ['Coroner'])) return <Navigate to="/coroner/lab" replace />;
  if (hasAnyRole(roles, ['Sergeant', 'Sergent'])) return <Navigate to="/sergeant/operations" replace />;
  if (hasAnyRole(roles, ['Captain', 'Chief', 'Judge'])) return <Navigate to="/reports" replace />;
  if (hasAnyRole(roles, ['Police Officer', 'Patrol Officer'])) return <Navigate to="/officer/crime-scene" replace />;
  if (hasAnyRole(roles, ['Basic User', 'Complainant', 'Witness'])) return <Navigate to="/my-cases" replace />;
  if (hasAnyRole(roles, ['Suspect', 'Criminal'])) return <Navigate to="/legal-bail" replace />;
  if (hasAnyRole(roles, ['Cadet'])) return <Navigate to="/cadet/complaints" replace />;
  if (hasAnyRole(roles, ['Administrator'])) return <Navigate to="/admin" replace />;

  return <Navigate to="/403" replace />;
};

export default Evidence;
