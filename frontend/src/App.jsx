import { useState } from 'react'
import AuthButtons from './components/AuthButtons.jsx'
import Protected from './components/Protected.jsx'
import Home from './screens/Home.jsx'
import Play from './screens/Play.jsx'
import Results from './screens/Results.jsx'
import './App.css'

function App() {
  const [screen, setScreen] = useState("HOME");
  const [selection, SetSelection] = useState(null);
  const [finalScore, setFinalScore] = useState(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex justify-between items-center p-4 border-b border-slate-800">
        <h1 className="font-bold">Must Dance</h1>
        <AuthButtons />
      </header>
      {screen === "HOME" && (
        <Protected>
          <Home onStart={(danceConfig) => {SetSelection(danceConfig); setScreen("PLAY"); }}/>
        </Protected>
      )}
      {screen === "PLAY" && (
        <Protected>
          <Play
            selection={selection}
            onFinish={(score) => {setFinalScore(score); setScreen("RESULTS");}}
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
  )
}

export default App
