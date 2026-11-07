"use client";

import { useState } from "react";
import { Check, ChevronRight, Network, Terminal } from "lucide-react";
import Link from "next/link";

export function PracticePreview() {
  const [mode, setMode] = useState<"question" | "lab">("question");
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  return <div className="practice-preview">
    <div className="preview-title"><span className="preview-dot" />Your practice workspace<span>Interactive preview</span></div>
    <div className="preview-tabs" role="tablist" aria-label="Practice preview" onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? "question" : event.key === "End" ? "lab" : mode === "question" ? "lab" : "question"; setMode(next); event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-preview-tab`)?.focus(); }}>
      <button id="question-preview-tab" role="tab" tabIndex={mode === "question" ? 0 : -1} aria-selected={mode === "question"} aria-controls="question-preview" onClick={() => setMode("question")}>Practice question</button>
      <button id="lab-preview-tab" role="tab" tabIndex={mode === "lab" ? 0 : -1} aria-selected={mode === "lab"} aria-controls="lab-preview" onClick={() => setMode("lab")}>Hands-on lab</button>
    </div>
    {mode === "question" ? <div id="question-preview" role="tabpanel" aria-labelledby="question-preview-tab" className="preview-body">
      <div className="preview-meta"><span>NETWORKING FUNDAMENTALS</span><span>Single answer</span></div>
      <h2>Which device forwards packets between different networks?</h2>
      <fieldset><legend className="sr-only">Select your answer</legend>{["Switch", "Router", "Access point"].map((option, index) => <label key={option} className={`preview-choice ${answer === option ? "selected" : ""}`}>
        <input type="radio" name="preview-answer" value={option} checked={answer === option} onChange={() => { setAnswer(option); setChecked(false); }} />
        <span className="preview-letter">{String.fromCharCode(65 + index)}</span>{option}{answer === option && <Check size={16} />}
      </label>)}</fieldset>
      <div className="preview-bottom"><span>Try a question. No sign-in needed.</span><button className="portal-button portal-button-small" disabled={!answer} onClick={() => setChecked(true)}>Check answer <ChevronRight size={15} /></button></div>
      {checked && <p role="status" className={`preview-feedback ${answer === "Router" ? "correct" : ""}`}><strong>{answer === "Router" ? "That’s right." : "Not quite."}</strong> A router uses IP addresses to forward packets between networks.</p>}
    </div> : <div id="lab-preview" role="tabpanel" aria-labelledby="lab-preview-tab" className="preview-body">
      <div className="preview-meta"><span>CONFIGURATION PRACTICE</span><span>Simulated environment</span></div>
      <h2>Put your networking knowledge to work.</h2>
      <div className="preview-topology" aria-label="Example topology: router R1 connected to router R2"><span><Network /><b>R1</b></span><div><small>10.0.0.0 / 24</small><i /></div><span><Network /><b>R2</b></span></div>
      <div className="preview-terminal"><Terminal size={15} /><code>R1(config)# ip route 192.168.20.0 255.255.255.0 10.0.0.2</code></div>
      <div className="preview-bottom"><span>Configure. Check your work. Learn.</span><Link href="/labs" className="portal-button portal-button-small">Explore labs <ChevronRight size={15} /></Link></div>
    </div>}
  </div>;
}
