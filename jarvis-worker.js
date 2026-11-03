import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

// J.A.R.V.I.S. Local: inferencia dentro del navegador, sin API de IA.
const MODEL_ID = 'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA';
let generator = null;
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;

self.onmessage = async (event) => {
  const data = event.data || {};
  if (data.type === 'load') {
    try {
      self.postMessage({ type: 'progress', message: 'Descargando el cerebro local (primera vez)…' });
      generator = await pipeline('text-generation', MODEL_ID, {
        dtype: 'q4',
        progress_callback: (progress) => {
          if (progress && progress.status === 'progress') {
            const percent = Number.isFinite(progress.progress) ? Math.round(progress.progress) : null;
            self.postMessage({ type: 'progress', message: percent === null ? 'Descargando archivos del modelo…' : 'Descargando modelo local… ' + percent + '%' });
          } else if (progress && progress.status) {
            self.postMessage({ type: 'progress', message: 'Preparando modelo: ' + progress.status });
          }
        }
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: error && error.message ? error.message : 'Error al descargar o cargar el modelo' });
    }
    return;
  }
  if (data.type === 'generate' && generator) {
    try {
      const output = await generator(data.messages || [], {
        max_new_tokens: 180,
        do_sample: true,
        temperature: 0.65,
        repetition_penalty: 1.12
      });
      const generated = output && output[0] ? output[0].generated_text : '';
      let answer = '';
      if (typeof generated === 'string') answer = generated;
      else if (Array.isArray(generated)) {
        const last = generated.filter(item => item && item.role === 'assistant').pop();
        answer = last ? (typeof last.content === 'string' ? last.content : JSON.stringify(last.content)) : '';
      }
      self.postMessage({ type: 'result', id: data.id, text: answer });
    } catch (error) {
      self.postMessage({ type: 'error', id: data.id, message: error && error.message ? error.message : 'Error generando respuesta local' });
    }
  }
};
