export default function Results({ score, onHome }) {
  return (
    <main className="max-w-xl mx-auto p-6 text-center">
      <h2 className="text-2xl font-bold mb-4">Your Score</h2>
      <div className="text-5xl font-extrabold text-emerald-400">{score ?? 0}</div>
      <p className="mt-4 text-slate-400">Great job! Try another dance or tune your form.</p>
      <button className="btn mt-6" onClick={onHome}>Back to Home</button>
    </main>
  );
}
