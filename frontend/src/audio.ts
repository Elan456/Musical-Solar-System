// audio.ts
import { Event } from "./types";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let convolver: ConvolverNode | null = null;
let reverbGain: GainNode | null = null;

// Separate buses for pads and notes for better mix control
let padBus: GainNode | null = null;
let noteBus: GainNode | null = null;

interface ScheduledNote {
  osc: OscillatorNode;
  gain: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
  filter?: BiquadFilterNode;
  peakGain: number;
  startTime: number;
  continuous?: boolean;
}

let allNotes = new Set<ScheduledNote>();
let notesByPlanet: Record<string, ScheduledNote[]> = {};
let stopTimer: number | null = null;
let blinkTimers: Set<number> = new Set();

function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clearStopTimer() {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
}

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
      const envelope = Math.pow(1 - i / length, decay);
      channelData[i] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return buffer;
}

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 30;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    compressor.connect(ctx.destination);

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.4;
    masterGain.connect(compressor);

    // Create separate buses for pads and notes
    padBus = ctx.createGain();
    padBus.gain.value = 0.5; // Increased from 0.35 for better audibility
    padBus.connect(masterGain);

    noteBus = ctx.createGain();
    noteBus.gain.value = 1.0; // Notes at full level
    noteBus.connect(masterGain);

    convolver = ctx.createConvolver();
    convolver.buffer = createImpulseResponse(ctx, 2.5, 2.0);

    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.6;

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
      note.osc.stop(now + 0.5);
    } catch {
      // ignore
    }
  });
  allNotes.clear();
  notesByPlanet = {};
  clearStopTimer();

  // Clear all blink timers
  blinkTimers.forEach((timerId) => clearTimeout(timerId));
  blinkTimers.clear();
}

/**
 * Build a gain curve array for setValueCurveAtTime from velocity envelope
 * 
 * velocityEnvelope contains values from 0.2 to 1.0 (normalized orbital speed)
 * We map these directly to the gain range for maximum dynamic expression
 */
function buildGainCurve(
  velocityEnvelope: { t: number; velocity: number }[],
  duration: number,
  minGain: number,
  maxGain: number,
  sampleRate: number = 100
): Float32Array {
  const numSamples = Math.max(2, Math.floor(duration * sampleRate));
  const curve = new Float32Array(numSamples);

  if (!velocityEnvelope.length) {
    curve.fill((minGain + maxGain) / 2);
    return curve;
  }

  const sorted = [...velocityEnvelope].sort((a, b) => a.t - b.t);
  
  // Find the actual min/max velocity in the envelope for proper normalization
  let envMin = 1, envMax = 0;
  for (const p of sorted) {
    if (p.velocity < envMin) envMin = p.velocity;
    if (p.velocity > envMax) envMax = p.velocity;
  }
  const envRange = envMax - envMin;

  for (let i = 0; i < numSamples; i++) {
    const t = (i / (numSamples - 1)) * duration;

    let prevPoint = sorted[0];
    let nextPoint = sorted[sorted.length - 1];

    for (let j = 0; j < sorted.length - 1; j++) {
      if (sorted[j].t <= t && sorted[j + 1].t >= t) {
        prevPoint = sorted[j];
        nextPoint = sorted[j + 1];
        break;
      }
    }

    let velocity: number;
    if (prevPoint.t === nextPoint.t) {
      velocity = prevPoint.velocity;
    } else {
      const ratio = (t - prevPoint.t) / (nextPoint.t - prevPoint.t);
      velocity = prevPoint.velocity + ratio * (nextPoint.velocity - prevPoint.velocity);
    }

    // Normalize velocity to 0-1 based on actual envelope range
    // This ensures we use the full minGain to maxGain range
    const normalized = envRange > 0.01 
      ? (velocity - envMin) / envRange 
      : 0.5;
    
    // Map directly to gain range (no exponential compression)
    const gain = minGain + normalized * (maxGain - minGain);
    curve[i] = Math.max(0.001, gain);
  }
  
  console.log(`[CURVE] samples=${numSamples}, envRange=${envMin.toFixed(2)}-${envMax.toFixed(2)}, gainRange=${minGain.toFixed(4)}-${maxGain.toFixed(4)}`);

  return curve;
}

export function playEvents(
  events: Event[],
  loopDuration: number,
  onNoteBlink: (planetName: string) => void,
  onDone: () => void
) {
  console.log(`Playing ${events.length} events over ${loopDuration.toFixed(2)} sec`);

  // Debug: show ALL events with their raw structure
  console.log('[DEBUG] All events:', JSON.stringify(events.slice(0, 5), null, 2));

  // Debug: show continuous events
  const continuousEvents = events.filter(e => (e as any).continuous === true);
  console.log(`[DEBUG] Continuous check: found ${continuousEvents.length} continuous events out of ${events.length} total`);

  if (continuousEvents.length > 0) {
    console.log(`[DEBUG] Continuous events:`, continuousEvents);
  }

  if (!events?.length) {
    onDone();
    return;
  }

  const audioCtx = getContext();

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  stopAll();

  // Rocky planet envelope timings - warmer piano-like sound
  const ATTACK = 0.035; // Slightly slower attack for warmth
  const RELEASE_TC = 0.18; // Longer release for piano-like sustain
  
  // Gas planet pad timings
  const PAD_ATTACK = 0.3;
  const PAD_RELEASE_TC = 0.3;
  
  // Use a small but not tiny value for "silent"
  const SILENT = 0.0001;

  events.forEach((e) => {
    if (e.type === "note_on" && e.midi !== undefined) {
      const startTime = audioCtx.currentTime + (e.t || 0);
      const isContinuous = (e as any).continuous === true;
      const velocityEnvelope = (e as any).velocityEnvelope as
        | { t: number; velocity: number }[]
        | undefined;
      const eccentricity = (e as any).eccentricity as number | undefined;

      // Debug logging for continuous events
      if (isContinuous) {
        console.log(`[CONTINUOUS EVENT] planet=${e.planet}, midi=${e.midi}, hasEnvelope=${!!velocityEnvelope}, envelopeLength=${velocityEnvelope?.length ?? 0}`);
      }

      const osc = audioCtx.createOscillator();
      osc.frequency.value = midiToFreq(e.midi);

      // Different oscillator setup for pads vs notes
      if (isContinuous) {
        osc.type = "sine";
        // Slight detune for warmth
        osc.detune.value = Math.random() * 8 - 4;
      } else {
        // Use sine wave for warmer, piano-like tone
        osc.type = "sine";
      }

      const noteGain = audioCtx.createGain();
      const velocity = (e.vel ?? 100) / 127;

      // Apply frequency-dependent volume compensation
      // Higher frequencies sound louder to human ears (Fletcher-Munson curves)
      // Reduce gain for higher MIDI notes to create perceived equal loudness
      const midpoint = 60; // Middle C as reference
      const frequencyCompensation = 1.0 - Math.max(0, (e.midi - midpoint) / 24);

      // Different gain staging for pads vs notes
      // Pads need much higher gain to be audible, modulation will vary the volume
      const baseGain = isContinuous ? velocity * .2 : velocity * 0.35;
      const peakGain = baseGain * frequencyCompensation;

      const reverbAmount = e.reverb ?? 0;

      const dryGain = audioCtx.createGain();
      dryGain.gain.value = 1 - reverbAmount * 0.4;

      const wetGain = audioCtx.createGain();
      wetGain.gain.value = reverbAmount * 0.8;

      // Build the signal chain
      osc.connect(noteGain);

      let outputNode: AudioNode = noteGain;
      let filterNode: BiquadFilterNode | undefined;

      // Add low-pass filter for warmth
      if (isContinuous) {
        // Pads: keep them warm and out of the way
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = "lowpass";
        filterNode.frequency.value = 1200; // Raised from 800 for more presence
        filterNode.Q.value = 0.5;
        noteGain.connect(filterNode);
        outputNode = filterNode;
      } else {
        // Rocky notes: add warmth with gentle low-pass filter for piano-like tone
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = "lowpass";
        filterNode.frequency.value = 2800; // Filters out harsh upper harmonics
        filterNode.Q.value = 0.7; // Slight resonance for character
        noteGain.connect(filterNode);
        outputNode = filterNode;
      }

      outputNode.connect(dryGain);
      outputNode.connect(wetGain);
      
      // Route to appropriate bus
      const targetBus = isContinuous ? padBus! : noteBus!;
      dryGain.connect(targetBus);
      wetGain.connect(convolver!);

      if (isContinuous && velocityEnvelope && velocityEnvelope.length > 1) {
        console.log("Handling continuous pad with velocity envelope:", velocityEnvelope);
        // === CONTINUOUS PAD WITH VELOCITY MODULATION ===
        const ecc = eccentricity ?? 0;

        // Strong modulation depth based on eccentricity
        // Circular orbits (ecc ~0) get subtle modulation
        // Elliptical orbits (ecc ~0.5+) get dramatic swells
        // Range: 0.5 (circular) to 0.9 (highly elliptical)
        const modulationDepth = 0.5 + ecc * 0.4;

        // Wide gain range for audible dynamics
        // minGain is quiet but audible, maxGain is full volume
        const minGain = peakGain * (1 - modulationDepth);
        const maxGain = peakGain;

        // CRITICAL: Use loopDuration for the curve, not the envelope's max time
        // This ensures the curve ends exactly when the loop ends
        const curveDuration = loopDuration - PAD_ATTACK;

        const gainCurve = buildGainCurve(
          velocityEnvelope,
          loopDuration,
          minGain,
          maxGain,
          60 // Slightly higher sample rate for smoother curves
        );

        // Start silent and fade in
        noteGain.gain.setValueAtTime(SILENT, startTime);
        noteGain.gain.linearRampToValueAtTime(gainCurve[0], startTime + PAD_ATTACK);

        // Apply the velocity-modulated curve using multiple setValueAtTime points
        // This is more reliable than setValueCurveAtTime which can fail silently
        const AUTOMATION_RATE = 0.05; // Update every 50ms for smooth modulation
        const numAutomationPoints = Math.floor(curveDuration / AUTOMATION_RATE);

        for (let i = 0; i < numAutomationPoints; i++) {
          const t = i * AUTOMATION_RATE;
          const curveIndex = Math.floor((t / curveDuration) * (gainCurve.length - 1));
          const gainValue = gainCurve[curveIndex];
          noteGain.gain.setValueAtTime(gainValue, startTime + PAD_ATTACK + t);
        }

        console.log(
          `[PAD] ${e.planet}: ecc=${ecc.toFixed(2)}, ` +
          `depth=${modulationDepth.toFixed(2)}, ` +
          `gain=${minGain.toFixed(4)}-${maxGain.toFixed(4)}, ` +
          `automationPoints=${numAutomationPoints}, ` +
          `startTime=${(startTime + PAD_ATTACK).toFixed(2)}, curveDuration=${curveDuration.toFixed(2)}`
        );
      } else if (isContinuous) {
        // Continuous but circular orbit - gentle steady drone
        console.log(`[PAD-STEADY] ${e.planet}: circular orbit, steady drone`);
        noteGain.gain.setValueAtTime(SILENT, startTime);
        noteGain.gain.linearRampToValueAtTime(peakGain, startTime + PAD_ATTACK);
      } else {
        // === REGULAR NOTE (ROCKY PLANET) ===
        // Use linear ramps for attack to avoid exponential curve issues at zero
        noteGain.gain.setValueAtTime(0, startTime);
        noteGain.gain.linearRampToValueAtTime(peakGain, startTime + ATTACK);
      }

      const note: ScheduledNote = {
        osc,
        gain: noteGain,
        dryGain,
        wetGain,
        filter: filterNode,
        peakGain,
        startTime,
        continuous: isContinuous,
      };
      allNotes.add(note);
      const bucket = (notesByPlanet[e.planet] ||= []);
      bucket.push(note);

      osc.onended = () => {
        allNotes.delete(note);
        noteGain.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
        filterNode?.disconnect();
      };

      osc.start(startTime);

      // Trigger blink callback for non-continuous notes
      if (!isContinuous) {
        const blinkDelay = (startTime - audioCtx.currentTime) * 1000;
        const timerId = window.setTimeout(() => {
          blinkTimers.delete(timerId);
          onNoteBlink(e.planet);
        }, Math.max(0, blinkDelay));
        blinkTimers.add(timerId);
      }
    }

    if (e.type === "note_off") {
      const bucket = notesByPlanet[e.planet];
      if (bucket && bucket.length > 0) {
        const note = bucket.shift()!;
        const stopTime = audioCtx.currentTime + (e.t || 0);
        const releaseTC = note.continuous ? PAD_RELEASE_TC : RELEASE_TC;

        try {
          // Cancel any scheduled automation from this point forward
          note.gain.gain.cancelScheduledValues(stopTime);
          
          // IMPORTANT: Don't use setValueAtTime here - it causes discontinuity
          // setTargetAtTime will start from whatever the current value is
          // and smoothly decay to near-zero
          note.gain.gain.setTargetAtTime(0.0001, stopTime, releaseTC);

          // Stop the oscillator well after the release has completed
          // Use 6x time constant to reach ~99.75% of decay
          const stopDelay = releaseTC * 6 + 0.1;
          note.osc.stop(stopTime + stopDelay);
        } catch {
          // Already stopped
        }
      }
    }
  });

  clearStopTimer();
  stopTimer = window.setTimeout(() => {
    stopTimer = null;
    onDone();
  }, loopDuration * 1000);
}