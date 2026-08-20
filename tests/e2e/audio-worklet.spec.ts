import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { build } from 'vite';

const projectRoot = resolve(import.meta.dirname, '../..');
const workletModule = resolve(
  projectRoot,
  'src/features/frequency-workspace/playback/worklets/decorrelating-am-processor.worklet.ts',
);

let temporaryRoot = '';
let server: Server;
let origin = '';

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'tinnitusnotch-worklet-'));
  const outputDirectory = join(temporaryRoot, 'dist');
  await writeFile(
    join(temporaryRoot, 'index.html'),
    '<button id="start" type="button">Start muted AudioWorklet</button><script type="module" src="./main.ts"></script>',
  );
  await writeFile(
    join(temporaryRoot, 'main.ts'),
    `import workletUrl from ${JSON.stringify(`${workletModule}?worker&url`)};
const button = document.querySelector('#start');
button.addEventListener('click', async () => {
  const context = new AudioContext({ sampleRate: 44100 });
  await context.audioWorklet.addModule(workletUrl);
  const node = new AudioWorkletNode(context, 'decorrelating-am-paper-2025-v1', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      contractVersion: 'paper-2025-v1',
      activeBandHz: [4000, 8000],
      hearingCorrection: 'a1',
      seed: 305419896,
    },
  });
  const muted = context.createGain();
  muted.gain.value = 0;
  node.connect(muted).connect(context.destination);
  node.port.onmessage = async event => {
    if (event.data?.type === 'processed') {
      document.body.dataset.worklet = 'processed';
      await context.close();
    }
  };
  await context.resume();
});`,
  );

  await build({
    configFile: resolve(projectRoot, 'vite.config.ts'),
    root: projectRoot,
    logLevel: 'silent',
    build: {
      emptyOutDir: true,
      outDir: outputDirectory,
      rollupOptions: {
        input: join(temporaryRoot, 'index.html'),
      },
    },
  });

  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = resolve(outputDirectory, `.${requestedPath}`);
      if (!filePath.startsWith(`${outputDirectory}/`)) {
        response.writeHead(403).end();
        return;
      }

      const content = await readFile(filePath);
      const contentType =
        extname(filePath) === '.js' ? 'text/javascript' : 'text/html';
      response.writeHead(200, { 'content-type': contentType }).end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start AudioWorklet spike server');
  }
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
  await rm(temporaryRoot, { force: true, recursive: true });
});

test('built Chromium loads and executes the shared production AudioWorklet', async ({
  page,
}) => {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Start muted AudioWorklet' }).click();

  await expect(page.locator('body')).toHaveAttribute(
    'data-worklet',
    'processed',
  );
});
