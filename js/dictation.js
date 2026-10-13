// Dictée vocale continue : le micro reste actif (redémarrage après chaque silence)
// jusqu'à ce qu'on reclique dessus ou qu'on valide.

let recognition = null;
let shouldListen = false;
let fatal = false;
let target = null;
let onChange = () => {};

export function isListening() { return shouldListen; }

export function startDictation(input, changed) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return 'La dictée vocale n\'est pas disponible sur ce navigateur.';
  stopDictation();
  target = input;
  onChange = changed || (() => {});
  shouldListen = true;
  fatal = false;
  onChange();
  start(SR);
  return null;
}

export function stopDictation() {
  const wasListening = shouldListen;
  shouldListen = false;
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  if (wasListening) onChange();
}

function start(SR) {
  recognition = new SR();
  recognition.lang = 'fr-FR';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (e) => {
    let addition = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) addition += (addition ? ' ' : '') + e.results[i][0].transcript;
    }
    if (addition && target) {
      target.value = (target.value ? target.value.trim() + ' ' : '') + addition.trim();
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  recognition.onerror = (e) => {
    if (['not-allowed', 'audio-capture', 'service-not-allowed'].includes(e.error)) {
      fatal = true;
      shouldListen = false;
      onChange('Micro indisponible : autorise l\'accès au micro dans ton navigateur.');
    }
  };
  recognition.onend = () => {
    if (shouldListen && !fatal) setTimeout(() => { if (shouldListen) start(SR); }, 200);
  };
  try { recognition.start(); } catch (e) {}
}
