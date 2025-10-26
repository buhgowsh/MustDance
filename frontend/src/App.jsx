import { useState } from "react";
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
  const [finalAccuracy, setFinalAccuracy] = useState(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

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
            onFinish={({ score, accuracy }) => {
              setFinalScore(score);
              setFinalAccuracy(accuracy);
              setScreen("RESULTS");
            }}
            onQuit={() => setScreen("HOME")}
          />
        </Protected>
      )}

      {screen === "RESULTS" && (
        <Protected>
          <Results
            score={finalScore}
            accuracy={finalAccuracy}
            onHome={() => setScreen("HOME")}
          />
        </Protected>
      )}
    </div>
  );
}

export default App;
