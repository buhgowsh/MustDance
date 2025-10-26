// src/components/Protected.jsx
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

  // Keep a simple actionable loading state
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
    // ✨ Themed login hero matching your app’s neon/glass aesthetic
    return (
      <div className="relative min-h-[68vh] bg-slate-950 text-white overflow-hidden">
        {/* Ambient background glows */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(1300px 800px at 0% 100%, rgba(56,189,248,0.28), transparent 60%)," +
              "radial-gradient(1200px 700px at 100% 0%, rgba(236,72,153,0.26), transparent 60%)",
          }}
        />

        <div className="max-w-7xl mx-auto px-6 py-16">
          {/* Brand row */}
          <div className="flex items-center gap-4 mb-8">
            <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-slate-900 grid place-items-center font-black tracking-wider shadow-md">
              <span className="select-none">MD</span>
              <span className="pointer-events-none absolute inset-0 rounded-2xl bg-white/30 mix-blend-overlay opacity-0 hover:opacity-10 transition-opacity" />
            </div>
            <div className="leading-tight">
              <h1 className="text-white font-semibold text-xl tracking-wide">Must Dance</h1>
              <p className="text-white/70 text-xs">Learn, groove, and get scored—sign in to start.</p>
            </div>
          </div>

          {/* Glass card */}
          <div className="relative rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg p-8 shadow-[0_0_80px_rgba(34,211,238,0.15)]">
            {/* Subtle accent bars */}
            <div className="absolute -top-1 left-6 h-1 w-24 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500" />
            <div className="absolute -bottom-1 right-6 h-1 w-20 rounded-full bg-gradient-to-r from-pink-500 to-emerald-400" />

            <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] items-center">
              {/* Copy */}
              <div>
                <h2 className="text-3xl md:text-4xl font-extrabold mb-3">
                  Log in to start your session
                </h2>
                <p className="text-white/80">
                  We’ll track your moves, show a coach overlay, and keep scoring accuracy as you dance.
                </p>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    onClick={() => loginWithRedirect()}
                    className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/15
                               bg-white/10 hover:bg-white/15 text-white font-semibold transition
                               focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60"
                    aria-label="Log in"
                  >
                    <span className="pointer-events-none absolute -inset-0.5 rounded-full bg-gradient-to-r from-pink-500/25 via-fuchsia-500/25 to-cyan-400/25 blur opacity-60 group-hover:opacity-80 transition" />
                    <span className="relative">Log in</span>
                    <span className="relative translate-x-0 group-hover:translate-x-0.5 transition">→</span>
                  </button>

                  <span className="text-xs text-white/60">
                    By signing in you agree to our friendly dance vibes ✨
                  </span>
                </div>
              </div>

              {/* Right-side preview vignette */}
              <div className="relative h-48 md:h-56 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/60 to-slate-800/60 overflow-hidden">
                <div className="absolute inset-0 opacity-30"
                  style={{
                    background:
                      "radial-gradient(500px 220px at 20% 80%, rgba(56,189,248,0.45), transparent 60%)," +
                      "radial-gradient(420px 220px at 80% 10%, rgba(236,72,153,0.45), transparent 60%)",
                  }}
                />
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div className="px-6">
                    <div className="text-sm tracking-wide uppercase text-white/70 mb-1">
                      Preview
                    </div>
                    <div className="text-white/90 text-xs">
                      Coach overlay, live scoring, and a neon visualizer—ready when you are.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tiny footer hint */}
          <div className="mt-6 text-xs text-white/60">
            Having trouble logging in? Try disabling popup blockers for this site.
          </div>
        </div>
      </div>
    );
  }

  return children;
}
