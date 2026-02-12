import { Navigate } from 'react-router-dom';
import { hasAnyRole, useRoleRouterContext } from '../hooks/useRoleRouterContext';

const Cases = () => {
  const { isAuthenticated, roles } = useRoleRouterContext();

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  if (hasAnyRole(roles, ['Administrator'])) return <Navigate to="/users" replace />;
  if (hasAnyRole(roles, ['Detective'])) return <Navigate to="/detective/cases" replace />;
  if (hasAnyRole(roles, ['Sergeant', 'Sergent'])) return <Navigate to="/sergeant/operations" replace />;
  if (hasAnyRole(roles, ['Captain'])) return <Navigate to="/captain/interrogations" replace />;
  if (hasAnyRole(roles, ['Chief'])) return <Navigate to="/chief/critical-cases" replace />;
  if (hasAnyRole(roles, ['Judge'])) return <Navigate to="/judge/bench" replace />;
  if (hasAnyRole(roles, ['Coroner'])) return <Navigate to="/coroner/lab" replace />;
  if (hasAnyRole(roles, ['Police Officer', 'Patrol Officer'])) return <Navigate to="/officer/complaints" replace />;
  if (hasAnyRole(roles, ['Cadet'])) return <Navigate to="/cadet/complaints" replace />;
  if (hasAnyRole(roles, ['Basic User', 'Complainant', 'Witness'])) return <Navigate to="/my-cases" replace />;
  if (hasAnyRole(roles, ['Suspect', 'Criminal'])) return <Navigate to="/legal-bail" replace />;

  return <Navigate to="/403" replace />;
};

export default Cases;
