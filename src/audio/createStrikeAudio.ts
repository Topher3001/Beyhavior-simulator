export type StrikeAudioController = {
  prime: () => Promise<void>;
  playStrike: (relativeSpeed: number) => void;
  setMuted: (muted: boolean) => void;
  getMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  dispose: () => void;
};

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const STRIKE_COOLDOWN_SECONDS = 0.075;
const DEFAULT_VOLUME = 0.55;

export function createStrikeAudio(): StrikeAudioController {
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let muted = false;
  let volume = DEFAULT_VOLUME;
  let lastStrikeTime = Number.NEGATIVE_INFINITY;

  const ensureContext = () => {
    if (context) {
      return context;
    }

    const AudioContextConstructor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error('Web Audio is not available in this browser.');
    }

    context = new AudioContextConstructor();
    masterGain = context.createGain();
    masterGain.gain.value = muted ? 0 : volume;
    masterGain.connect(context.destination);

    return context;
  };

  const updateMasterGain = () => {
    if (!masterGain) {
      return;
    }

    masterGain.gain.setTargetAtTime(muted ? 0 : volume, masterGain.context.currentTime, 0.015);
  };

  return {
    prime: async () => {
      const audioContext = ensureContext();

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
    },
    playStrike: (relativeSpeed) => {
      if (muted) {
        return;
      }

      let audioContext: AudioContext;

      try {
        audioContext = ensureContext();
      } catch {
        return;
      }

      if (audioContext.state !== 'running' || !masterGain) {
        return;
      }

      const now = audioContext.currentTime;

      if (now - lastStrikeTime < STRIKE_COOLDOWN_SECONDS) {
        return;
      }

      lastStrikeTime = now;
      playMetalDing(audioContext, masterGain, relativeSpeed);
    },
    setMuted: (nextMuted) => {
      muted = nextMuted;
      updateMasterGain();
    },
    getMuted: () => muted,
    setVolume: (nextVolume) => {
      volume = clamp(nextVolume, 0, 1);
      updateMasterGain();
    },
    getVolume: () => volume,
    dispose: () => {
      void context?.close();
      context = null;
      masterGain = null;
    },
  };
}

function playMetalDing(audioContext: AudioContext, destination: AudioNode, relativeSpeed: number): void {
  const impact = clamp((relativeSpeed - 0.15) / 2.6, 0, 1);
  const start = audioContext.currentTime;
  const duration = 0.16 + impact * 0.12;
  const baseFrequency = 760 + impact * 520;
  const output = audioContext.createGain();

  output.gain.setValueAtTime(0.0001, start);
  output.gain.exponentialRampToValueAtTime(0.12 + impact * 0.2, start + 0.006);
  output.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  output.connect(destination);

  const partials = [
    { ratio: 1, gain: 0.7 },
    { ratio: 1.43, gain: 0.42 },
    { ratio: 2.19, gain: 0.22 },
  ];

  for (const partial of partials) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(baseFrequency * partial.ratio, start);
    oscillator.frequency.exponentialRampToValueAtTime(baseFrequency * partial.ratio * 0.985, start + duration);
    gain.gain.value = partial.gain;
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  const clickSource = audioContext.createBufferSource();
  const clickGain = audioContext.createGain();
  const highpass = audioContext.createBiquadFilter();
  const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * 0.022));
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < sampleCount; index += 1) {
    const fade = 1 - index / sampleCount;
    data[index] = (Math.random() * 2 - 1) * fade * fade;
  }

  highpass.type = 'highpass';
  highpass.frequency.value = 2600 + impact * 900;
  clickGain.gain.value = 0.03 + impact * 0.05;
  clickSource.buffer = buffer;
  clickSource.connect(highpass);
  highpass.connect(clickGain);
  clickGain.connect(output);
  clickSource.start(start);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
