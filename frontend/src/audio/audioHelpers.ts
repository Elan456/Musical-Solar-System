export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function buildGainCurve(
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

  let envMin = 1,
    envMax = 0;
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

    const normalized = envRange > 0.01 ? (velocity - envMin) / envRange : 0.5;
    const gain = minGain + normalized * (maxGain - minGain);
    curve[i] = Math.max(0.001, gain);
  }

  console.log(
    `[CURVE] samples=${numSamples}, envRange=${envMin.toFixed(2)}-${envMax.toFixed(2)}, gainRange=${minGain.toFixed(
      4
    )}-${maxGain.toFixed(4)}`
  );

  return curve;
}
