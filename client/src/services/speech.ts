export interface SpeechResultEvent {
  resultIndex: number;
  results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } };
}
export interface BrowserRecognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
export interface SpeechCapture { start(): void; stop(): void; abort(): void }
export function speechConstructor(): (new () => BrowserRecognition) | undefined {
  if(typeof window === "undefined") return undefined;
  const browser = window as unknown as { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
let activeCapture: SpeechCapture | undefined;
export function createSpeechCapture(options: {
  Constructor: new () => BrowserRecognition; language: string;
  onFinal: (text: string) => void; onInterim?: (text: string) => void;
  onListening: (value: boolean) => void; onError: (message: string) => void;
  maxDurationMs?: number;
}): SpeechCapture {
  let wanted = false, disposed = false, recognizer: BrowserRecognition | undefined;
  let restart: ReturnType<typeof setTimeout> | undefined, limit: ReturnType<typeof setTimeout> | undefined;
  let networkFailures = 0, startFailures = 0;
  const clearTimers = () => { clearTimeout(restart); clearTimeout(limit); };
  const finish = () => { wanted = false; clearTimers(); options.onListening(false); options.onInterim?.(""); if(activeCapture === capture) activeCapture = undefined; };
  const fatal = (message: string) => { finish(); options.onError(message); recognizer?.abort(); };
  const begin = () => {
    if(!wanted || disposed) return;
    let instance: BrowserRecognition;
    try { instance = new options.Constructor(); }
    catch { fatal("Voice recognition stopped. Try again or type below."); return; }
    recognizer = instance;
    const committed = new Set<number>();
    let pendingInterim = "";
    instance.lang = options.language; instance.continuous = true; instance.interimResults = true;
    instance.onresult = event => {
      if(disposed || recognizer !== instance) return;
      let interim = "";
      for(let i = 0; i < event.results.length; i++) {
        const result = event.results[i], text = String(result[0]?.transcript ?? "").trim();
        if(result.isFinal && !committed.has(i)) { committed.add(i); if(text) { networkFailures = 0; options.onFinal(text); } }
        else if(!result.isFinal) interim += (interim ? " " : "") + text;
      }
      pendingInterim = interim;
      options.onInterim?.(interim);
    };
    instance.onerror = event => {
      if(disposed || !wanted || recognizer !== instance) return;
      switch(event.error) {
        case "no-speech": break; // Silence is recoverable; restart only after onend.
        case "aborted": break;
        case "network": if(++networkFailures >= 3) fatal("Voice recognition could not connect. Check your internet connection or type below."); break;
        case "not-allowed": case "service-not-allowed": fatal("Microphone access was denied. Allow microphone access in your browser and try again."); break;
        case "audio-capture": fatal("No microphone is available. Connect a microphone or type below."); break;
        case "language-not-supported": fatal("Voice recognition is unavailable for this language in your browser. You can type below."); break;
        default: fatal("Voice recognition stopped. Try again or type below.");
      }
    };
    instance.onend = () => {
      if(disposed || recognizer !== instance) return;
      if(pendingInterim) { options.onFinal(pendingInterim); pendingInterim = ""; }
      options.onInterim?.("");
      instance.onend = null; instance.onresult = null; instance.onerror = null;
      if(wanted) restart = setTimeout(begin, 300);
      else { options.onListening(false); options.onInterim?.(""); }
    };
    try { instance.start(); startFailures = 0; }
    catch { if(++startFailures >= 3) fatal("Voice recognition stopped. Try again or type below."); else restart = setTimeout(begin, 500); }
  };
  const capture: SpeechCapture = {
    start() {
      if(disposed || wanted) return;
      activeCapture?.abort(); activeCapture = capture; wanted = true;
      options.onListening(true); options.onInterim?.("");
      limit = setTimeout(() => { capture.stop(); options.onError("Voice input paused after two minutes. Review your text or start the microphone again."); }, options.maxDurationMs ?? 120000);
      begin();
    },
    stop() { if(disposed) return; finish(); recognizer?.stop(); },
    abort() {
      if(disposed) return;
      finish(); disposed = true;
      if(recognizer) { recognizer.onresult = null; recognizer.onend = null; recognizer.onerror = null; recognizer.abort(); }
    },
  };
  return capture;
}
