import { useAuth0 } from "@auth0/auth0-react";

export default function Protected({ children }) {
  const { isAuthenticated, isLoading, loginWithRedirect, error } = useAuth0();

  if (error) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-white">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Auth error</h2>
          <p className="text-sm opacity-80 mb-4">{String(error.message)}</p>
          <button className="btn" onClick={() => loginWithRedirect()}>Try login again</button>
        </div>
      </div>
    );
  }

  // While Auth0 hydrates on a reload, give the user a real action
  if (isLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-white">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Checking your session…</h2>
          <p className="text-sm opacity-80 mb-4">If this takes more than a second, log in below.</p>
          <button className="btn" onClick={() => loginWithRedirect()}>Log in</button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Welcome to Must Dance</h2>
          <p className="text-sm opacity-80 mb-4">Please log in to continue.</p>
          <button className="btn" onClick={() => loginWithRedirect()}>Log in</button>
        </div>
      </div>
    );
  }

  return children;
}
