let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let convolver: ConvolverNode | null = null;
let reverbGain: GainNode | null = null;
let padBus: GainNode | null = null;
let noteBus: GainNode | null = null;

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

export function getAudioContext(): AudioContext {
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

    padBus = ctx.createGain();
    padBus.gain.value = 0.5;
    padBus.connect(masterGain);

    noteBus = ctx.createGain();
    noteBus.gain.value = 1.0;
    noteBus.connect(masterGain);

    convolver = ctx.createConvolver();
    convolver.normalize = false;
    convolver.buffer = createImpulseResponse(ctx, 2.5, 2.0);

    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.015;

    convolver.connect(reverbGain);
    reverbGain.connect(masterGain);
  }
  return ctx;
}

export function getAudioBuses() {
  return { padBus, noteBus, convolver };
}
