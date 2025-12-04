import { Event } from "../types";
import { getAudioContext } from "./audioContext";
import { createNoteOscillator, applyNoteEnvelope } from "./noteCreation";
import {
  addNote,
  getNoteForPlanet,
  getAllNotes,
  clearAllNotes,
  clearStopTimer,
  setStopTimer,
  scheduleBlinkCallback,
  clearAllBlinkTimers,
  type ScheduledNote,
} from "./noteManager";

const RELEASE_TC = 0.18;
const PAD_RELEASE_TC = 0.3;

export function stopAllAudio() {
  const now = getAudioContext()?.currentTime ?? 0;

  getAllNotes().forEach((note) => {
    try {
      note.gain.gain.cancelScheduledValues(now);
      note.gain.gain.setTargetAtTime(0, now, 0.05);
      note.osc.stop(now + 0.5);
    } catch {
      // ignore
    }
  });
  clearAllNotes();
  clearStopTimer();
  clearAllBlinkTimers();
}

function handleNoteOn(
  e: Event,
  audioCtx: AudioContext,
  loopDuration: number,
  onNoteBlink: (planetName: string) => void
) {
  if (e.midi === undefined) return;

  const startTime = audioCtx.currentTime + (e.t || 0);
  const isContinuous = (e as any).continuous === true;
  const velocityEnvelope = (e as any).velocityEnvelope as { t: number; velocity: number }[] | undefined;
  const eccentricity = (e as any).eccentricity as number | undefined;

  const velocity = (e.vel ?? 100) / 127;
  const reverbAmount = e.reverb ?? 0;

  const { osc, noteGain, dryGain, wetGain, filter, peakGain } = createNoteOscillator(
    audioCtx,
    e.midi,
    velocity,
    isContinuous,
    reverbAmount
  );

  applyNoteEnvelope(noteGain, startTime, peakGain, isContinuous, velocityEnvelope, eccentricity, loopDuration);

  const note: ScheduledNote = {
    osc,
    gain: noteGain,
    dryGain,
    wetGain,
    filter,
    peakGain,
    startTime,
    continuous: isContinuous,
  };

  addNote(e.planet, note);

  osc.onended = () => {
    getAllNotes().delete(note);
    noteGain.disconnect();
    dryGain.disconnect();
    wetGain.disconnect();
    filter?.disconnect();
  };

  osc.start(startTime);

  if (!isContinuous) {
    scheduleBlinkCallback(startTime, audioCtx.currentTime, e.planet, onNoteBlink);
  }
}

function handleNoteOff(e: Event, audioCtx: AudioContext) {
  const note = getNoteForPlanet(e.planet);
  if (!note) return;

  const stopTime = audioCtx.currentTime + (e.t || 0);
  const releaseTC = note.continuous ? PAD_RELEASE_TC : RELEASE_TC;

  try {
    note.gain.gain.cancelScheduledValues(stopTime);
    note.gain.gain.setTargetAtTime(0.0001, stopTime, releaseTC);
    const stopDelay = releaseTC * 6 + 0.1;
    note.osc.stop(stopTime + stopDelay);
  } catch {
    // Already stopped
  }
}

export function playAudioEvents(
  events: Event[],
  loopDuration: number,
  onNoteBlink: (planetName: string) => void,
  onDone: () => void
) {
  console.log(`Playing ${events.length} events over ${loopDuration.toFixed(2)} sec`);

  if (!events?.length) {
    onDone();
    return;
  }

  const audioCtx = getAudioContext();

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  stopAllAudio();

  events.forEach((e) => {
    if (e.type === "note_on") {
      handleNoteOn(e, audioCtx, loopDuration, onNoteBlink);
    } else if (e.type === "note_off") {
      handleNoteOff(e, audioCtx);
    }
  });

  setStopTimer(loopDuration, onDone);
}
