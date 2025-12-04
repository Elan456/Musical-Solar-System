import { getAudioBuses } from "./audioContext";
import { midiToFreq, buildGainCurve } from "./audioHelpers";

const PAD_ATTACK = 0.3;
const ATTACK = 0.035;
const SILENT = 0.0001;

export function createNoteOscillator(
  audioCtx: AudioContext,
  midi: number,
  velocity: number,
  isContinuous: boolean,
  reverbAmount: number
): {
  osc: OscillatorNode;
  noteGain: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
  filter?: BiquadFilterNode;
  peakGain: number;
} {
  const { padBus, noteBus, convolver } = getAudioBuses();

  const osc = audioCtx.createOscillator();
  osc.frequency.value = midiToFreq(midi);
  osc.type = "sine";

  if (isContinuous) {
    osc.detune.value = Math.random() * 8 - 4;
  }

  const noteGain = audioCtx.createGain();
  const midpoint = 60;
  const frequencyCompensation = 1.0 - Math.max(0, (midi - midpoint) / 24);
  const baseGain = isContinuous ? velocity * 0.2 : velocity * 0.35;
  const peakGain = baseGain * frequencyCompensation;

  const dryGain = audioCtx.createGain();
  dryGain.gain.value = isContinuous ? 1.0 : 1 - reverbAmount * 0.8;

  const wetGain = audioCtx.createGain();
  wetGain.gain.value = reverbAmount;

  osc.connect(noteGain);

  let outputNode: AudioNode = noteGain;
  let filterNode: BiquadFilterNode | undefined;

  if (isContinuous) {
    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = "lowpass";
    filterNode.frequency.value = 1200;
    filterNode.Q.value = 0.5;
    noteGain.connect(filterNode);
    outputNode = filterNode;
  } else {
    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = "lowpass";
    filterNode.frequency.value = 2800;
    filterNode.Q.value = 0.7;
    noteGain.connect(filterNode);
    outputNode = filterNode;
  }

  outputNode.connect(dryGain);
  const targetBus = isContinuous ? padBus! : noteBus!;
  dryGain.connect(targetBus);

  if (!isContinuous) {
    outputNode.connect(wetGain);
    wetGain.connect(convolver!);
  }

  return { osc, noteGain, dryGain, wetGain, filter: filterNode, peakGain };
}

export function applyNoteEnvelope(
  noteGain: GainNode,
  startTime: number,
  peakGain: number,
  isContinuous: boolean,
  velocityEnvelope?: { t: number; velocity: number }[],
  eccentricity?: number,
  loopDuration?: number
) {
  if (isContinuous && velocityEnvelope && velocityEnvelope.length > 1 && loopDuration) {
    const ecc = eccentricity ?? 0;
    const modulationDepth = 0.5 + ecc * 0.4;
    const minGain = peakGain * (1 - modulationDepth);
    const maxGain = peakGain;
    const curveDuration = loopDuration - PAD_ATTACK;

    const gainCurve = buildGainCurve(velocityEnvelope, loopDuration, minGain, maxGain, 60);

    noteGain.gain.setValueAtTime(SILENT, startTime);
    noteGain.gain.linearRampToValueAtTime(gainCurve[0], startTime + PAD_ATTACK);

    const AUTOMATION_RATE = 0.05;
    const numAutomationPoints = Math.floor(curveDuration / AUTOMATION_RATE);

    for (let i = 0; i < numAutomationPoints; i++) {
      const t = i * AUTOMATION_RATE;
      const curveIndex = Math.floor((t / curveDuration) * (gainCurve.length - 1));
      const gainValue = gainCurve[curveIndex];
      noteGain.gain.setValueAtTime(gainValue, startTime + PAD_ATTACK + t);
    }

    console.log(
      `[PAD] ecc=${ecc.toFixed(2)}, depth=${modulationDepth.toFixed(2)}, gain=${minGain.toFixed(4)}-${maxGain.toFixed(4)}`
    );
  } else if (isContinuous) {
    noteGain.gain.setValueAtTime(SILENT, startTime);
    noteGain.gain.linearRampToValueAtTime(peakGain, startTime + PAD_ATTACK);
  } else {
    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(peakGain, startTime + ATTACK);
  }
}
