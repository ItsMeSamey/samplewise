import { analyze } from './optimizer.mjs';
self.onmessage = event => {
  const { id, input, sensitivityIndex } = event.data;
  try { self.postMessage({ id, result: analyze(input, sensitivityIndex) }); }
  catch (error) { self.postMessage({ id, error: error.message }); }
};
