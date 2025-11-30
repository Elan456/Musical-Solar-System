// audio.ts
import { Event } from "./types";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let convolver: ConvolverNode | null = null;
let reverbGain: GainNode | null = null;

interface ScheduledNote {
  osc: OscillatorNode;
  gain: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
  peakGain: number;
  startTime: number;
}

let allNotes = new Set<ScheduledNote>();
let notesByPlanet: Record<string, ScheduledNote[]> = {};
let stopTimer: number | null = null;

function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clearStopTimer() {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
}

/**
 * Generate a synthetic impulse response for reverb.
 * Creates a decaying noise buffer that simulates room reflections.
 */
function createImpulseResponse(
  audioCtx: AudioContext,
  duration: number = 2.5,
  decay: number = 2.0
): AudioBuffer {
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate * duration;
  const buffer = audioCtx.createBuffer(2, length, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // White noise with exponential decay
      const envelope = Math.pow(1 - i / length, decay);
      channelData[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  
  return buffer;
}

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    
    // Compressor at the end of the chain
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 40;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);
    
    // Master gain before compressor
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(compressor);
    
    // Reverb send bus
    convolver = ctx.createConvolver();
    convolver.buffer = createImpulseResponse(ctx, 2.5, 2.0);
    
    // Reverb return gain (controls overall reverb level)
    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.7;
    
    convolver.connect(reverbGain);
    reverbGain.connect(masterGain);
  }
  return ctx;
}

export function stopAll() {
  const now = ctx?.currentTime ?? 0;
  
  allNotes.forEach((note) => {
    try {
      note.gain.gain.cancelScheduledValues(now);
      note.gain.gain.setTargetAtTime(0, now, 0.05);
      note.osc.stop(now + 0.3);
    } catch {
      // ignore
    }
  });
  allNotes.clear();
  notesByPlanet = {};
  clearStopTimer();
}

export function playEvents(events: Event[], onDone: () => void) {
  if (!events?.length) {
    onDone();
    return;
  }

  const audioCtx = getContext();
  
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  stopAll();

  const ATTACK = 0.04;
  const RELEASE_TC = 0.08;
  const RELEASE_DURATION = RELEASE_TC * 5;

  events.forEach((e) => {
    if (e.type === "note_on" && e.midi !== undefined) {
      const startTime = audioCtx.currentTime + (e.t || 0);

      const osc = audioCtx.createOscillator();
      osc.frequency.value = midiToFreq(e.midi);
      osc.type = e.instrument === "mallet" ? "sine" : "triangle";

      // Main envelope gain
      const noteGain = audioCtx.createGain();
      
      const velocity = (e.vel ?? 100) / 127;
      const peakGain = velocity * 0.2;
      
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.setTargetAtTime(peakGain, startTime, ATTACK / 3);

      // Dry/wet routing for reverb
      const reverbAmount = e.reverb ?? 0;
      
      // Dry signal (direct to master)
      const dryGain = audioCtx.createGain();
      dryGain.gain.value = 1 - reverbAmount * 0.5; // Keep some dry even at max reverb
      
      // Wet signal (to convolver)
      const wetGain = audioCtx.createGain();
      wetGain.gain.value = reverbAmount;

      // Connect the chain:
      // osc -> noteGain -> dryGain -> masterGain
      //                 -> wetGain -> convolver -> reverbGain -> masterGain
      osc.connect(noteGain);
      noteGain.connect(dryGain);
      noteGain.connect(wetGain);
      dryGain.connect(masterGain!);
      wetGain.connect(convolver!);

      const note: ScheduledNote = { 
        osc, 
        gain: noteGain, 
        dryGain, 
        wetGain, 
        peakGain, 
        startTime 
      };
      allNotes.add(note);
      const bucket = (notesByPlanet[e.planet] ||= []);
      bucket.push(note);

      osc.onended = () => {
        allNotes.delete(note);
        noteGain.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
      };

      osc.start(startTime);
    }

    if (e.type === "note_off") {
      const bucket = notesByPlanet[e.planet];
      if (bucket && bucket.length > 0) {
        const note = bucket.shift()!;
        const stopTime = audioCtx.currentTime + (e.t || 0);

        try {
          note.gain.gain.cancelScheduledValues(stopTime);
          note.gain.gain.setTargetAtTime(0, stopTime, RELEASE_TC);
          
          // Stop oscillator after release + extra time for reverb tail
          note.osc.stop(stopTime + RELEASE_DURATION + 1.0);
        } catch {
          // already stopped
        }
      }
    }
  });

  const lastTime = events.reduce((max, e) => Math.max(max, e.t || 0), 0);

  clearStopTimer();
  // Add extra time for reverb tail to finish
  stopTimer = window.setTimeout(() => {
    stopTimer = null;
    onDone();
  }, (lastTime + RELEASE_DURATION + 2.5) * 1000);
}