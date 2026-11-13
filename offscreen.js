chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "radar-offscreen" && message.type === "play-price-alert-sound") {
    playShortBeep(message.volume, message.style)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error?.message || "Falha ao gerar o som." }));
    return true;
  }
});

async function playShortBeep(volumePercent = 35, style = "radar") {
  const audio = new AudioContext();
  await audio.resume();
  const start = audio.currentTime;
  const peak = Math.max(0, Math.min(100, Number(volumePercent) || 0)) / 100 * 0.09;
  if (peak === 0) { await audio.close(); return; }
  const presets = {
    radar: [{ frequency: 660, at: 0, duration: 0.12, type: "sine" }, { frequency: 880, at: 0.12, duration: 0.15, type: "sine" }],
    chime: [{ frequency: 784, at: 0, duration: 0.28, type: "triangle" }, { frequency: 1175, at: 0.12, duration: 0.38, type: "sine" }],
    double: [{ frequency: 740, at: 0, duration: 0.09, type: "square" }, { frequency: 740, at: 0.17, duration: 0.09, type: "square" }],
    rise: [{ frequency: 523, at: 0, duration: 0.12, type: "triangle" }, { frequency: 659, at: 0.1, duration: 0.12, type: "triangle" }, { frequency: 784, at: 0.2, duration: 0.18, type: "triangle" }],
    calm: [{ frequency: 659, at: 0, duration: 0.34, type: "sine" }],
    bell: [{ frequency: 523, at: 0, duration: 0.18, type: "sine" }, { frequency: 659, at: 0.14, duration: 0.22, type: "sine" }, { frequency: 784, at: 0.29, duration: 0.34, type: "triangle" }],
    down: [{ frequency: 880, at: 0, duration: 0.16, type: "sine" }, { frequency: 660, at: 0.16, duration: 0.22, type: "sine" }],
    pulse: [{ frequency: 440, at: 0, duration: 0.11, type: "triangle" }, { frequency: 440, at: 0.19, duration: 0.11, type: "triangle" }]
  };
  const notes = presets[style] || presets.radar;
  let remaining = notes.length;
  for (const note of notes) {
    const oscillator = audio.createOscillator();
    const gainNode = audio.createGain();
    const noteStart = start + note.at;
    const attack = Math.min(0.025, note.duration / 4);
    const releaseStart = noteStart + Math.max(attack, note.duration * 0.6);
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gainNode.gain.setValueAtTime(0.0001, noteStart);
    gainNode.gain.exponentialRampToValueAtTime(peak, noteStart + attack);
    gainNode.gain.setValueAtTime(peak, releaseStart);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);
    oscillator.connect(gainNode);
    gainNode.connect(audio.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + note.duration);
    oscillator.addEventListener("ended", () => { remaining -= 1; if (remaining === 0) audio.close(); }, { once: true });
  }
}
