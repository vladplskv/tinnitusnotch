export function createRandomNoiseBuffer(
  context: AudioContext,
  durationSeconds = 1,
): AudioBuffer {
  const length = Math.max(1, Math.round(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);

  const randomValues = new Uint32Array(length);
  for (let offset = 0; offset < randomValues.length; offset += 16_384) {
    crypto.getRandomValues(
      randomValues.subarray(
        offset,
        Math.min(offset + 16_384, randomValues.length),
      ),
    );
  }
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = randomValues[index] / 2_147_483_648 - 1;
  }

  return buffer;
}
