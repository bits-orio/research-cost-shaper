// Tiny synthesized UI sounds: no audio files, a few milliseconds each, quiet.
// The browser only allows audio after a user gesture, and every sound here
// answers one, so the context is created lazily on first use.

const TONES = {
  change: [{ f: 1480, to: 1100, at: 0 }],
  add: [{ f: 1320, to: 1760, at: 0 }],
  remove: [{ f: 990, to: 660, at: 0 }],
  success: [{ f: 1320, to: 1320, at: 0 }, { f: 1760, to: 1760, at: 0.07 }],
};

let ctx = null;
let enabled = true;
try { enabled = localStorage.getItem("rcs.sound") !== "off"; } catch { /* storage blocked */ }

export const soundEnabled = () => enabled;

export function setSound(on) {
  enabled = on;
  try { localStorage.setItem("rcs.sound", on ? "on" : "off"); } catch { /* storage blocked */ }
}

export function play(kind = "change") {
  if (!enabled || !TONES[kind]) return;
  try {
    ctx ||= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    for (const { f, to, at } of TONES[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + at;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + 0.05);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.045, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    }
  } catch { /* no audio available; the visual feedback still shows */ }
}
