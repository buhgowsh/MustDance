import { useState } from "react";
import { getDanceConfig } from "../services/danceService";

export default function Home({ onStart }) {
  const [query, setQuery] = useState("salsa-basic");
  const handleStart = async () => onStart(await getDanceConfig(query.trim().toLowerCase()));

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h2 className="text-xl font-semibold mb-4">Pick a dance</h2>
      <div className="flex gap-2">
        <input className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2"
               placeholder="Type a dance (e.g., salsa-basic)"
               value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn" onClick={handleStart}>Start</button>
      </div>
      <p className="mt-6 text-sm text-slate-400">Try <code className="bg-slate-800 px-1 rounded">salsa-basic</code>.</p>
    </main>
  );
}
