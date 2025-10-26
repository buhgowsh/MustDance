import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import AuthButtons from "./components/AuthButtons.jsx";
import Protected from "./components/Protected.jsx";
import Home from "./screens/Home.jsx";
import Play from "./screens/Play.jsx";
import Results from "./screens/Results.jsx";
import "./App.css";

function App() {
  const [screen, setScreen] = useState("HOME");
  const [selection, setSelection] = useState(null);
  const [finalScore, setFinalScore] = useState(null);
  const { isAuthenticated } = useAuth0();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Show login header ONLY when logged out */}
      {!isAuthenticated && <AuthButtons />}

      {screen === "HOME" && (
        <Protected>
          <Home
            onStart={(danceConfig) => {
              setSelection(danceConfig);
              setScreen("PLAY");
            }}
          />
        </Protected>
      )}

      {screen === "PLAY" && (
        <Protected>
          <Play
            selection={selection}
            onFinish={(score) => {
              setFinalScore(score);
              setScreen("RESULTS");
            }}
            onQuit={() => setScreen("HOME")}
          />
        </Protected>
      )}

      {screen === "RESULTS" && (
        <Protected>
          <Results score={finalScore} onHome={() => setScreen("HOME")} />
        </Protected>
      )}
    </div>
  );
}

export default App;
