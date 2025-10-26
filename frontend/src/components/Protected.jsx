import { useAuth0 } from "@auth0/auth0-react";

export default function Protected({ children }) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white">
        <div className="text-2xl font-semibold mb-4 animate-pulse">
          Preparing your experience...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-white">
        <h1 className="text-4xl font-bold mb-6">Welcome to Must Dance</h1>
        <p className="text-white/80 mb-8 text-center max-w-md">
          Log in to start your rhythm adventure — move to the beat, earn points,
          and challenge your friends.
        </p>
        <button
          onClick={() => loginWithRedirect()}
          className="px-8 py-3 rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white font-semibold shadow-lg hover:opacity-90 transition"
        >
          Continue
        </button>
      </div>
    );
  }

  // If authenticated, render protected content
  return children;
}
