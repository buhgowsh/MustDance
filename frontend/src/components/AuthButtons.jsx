import { useAuth0 } from "@auth0/auth0-react";

export default function AuthButtons() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();

  // If already logged in, render nothing (header disappears)
  if (isAuthenticated) return null;

  // Avoid flicker while Auth0 initializes
  if (isLoading) {
    return (
      <div className="w-full bg-slate-900 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="h-10 w-40 rounded-full bg-white/10 animate-pulse" />
        </div>
      </div>
    );
  }

  // Logged-out state: show a nice “login header”
  return (
    <div className="w-full bg-slate-900/90 backdrop-blur border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 text-slate-900 grid place-items-center font-extrabold">
            MD
          </div>
          <div className="leading-tight">
            <h1 className="text-white font-semibold text-lg tracking-wide">Must Dance</h1>
            <p className="text-white/70 text-xs">Sign in to start learning and scoring your moves.</p>
          </div>
        </div>

        <button
          onClick={() => loginWithRedirect()}
          className="px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white font-semibold shadow-md hover:opacity-90 active:scale-[0.98] transition"
        >
          Log in
        </button>
      </div>
    </div>
  );
}
