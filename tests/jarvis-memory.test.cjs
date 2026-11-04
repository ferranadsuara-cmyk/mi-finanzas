const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'jarvis-memory.js'), 'utf8');

function createMemory() {
  const store = new Map();
  const context = {
    window: {},
    localStorage: {
      getItem: key => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    },
    crypto: { randomUUID },
    Math, Date, JSON, String, Number, Array, RegExp
  };
  vm.runInNewContext(source, context);
  return context.window.JarvisMemory;
}

test('guarda recuerdos persistentes y evita duplicados', () => {
  const memory = createMemory();
  const first = memory.remember('Prefiero respuestas en español.');
  const second = memory.remember('Prefiero respuestas en español.');
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(memory.list().length, 1);
});

test('bloquea credenciales y números de tarjeta', () => {
  const memory = createMemory();
  assert.equal(memory.remember('Mi contraseña es secreto123').ok, false);
  assert.equal(memory.remember('Mi tarjeta 4111111111111111').ok, false);
  assert.equal(memory.list().length, 0);
});

test('permite consultar, eliminar y vaciar recuerdos', () => {
  const memory = createMemory();
  memory.remember('Estoy ahorrando para un viaje.');
  memory.remember('Prefiero ahorrar cada mes.');
  assert.match(memory.context(500), /viaje|ahorrar/);
  assert.equal(memory.remove('viaje').removed, 1);
  assert.equal(memory.clear(), 1);
  assert.equal(memory.list().length, 0);
});

test('exporta e importa la memoria para copias de seguridad', () => {
  const original = createMemory();
  original.remember('Mi objetivo es ahorrar 300 euros al mes.');
  const backup = original.exportData();
  const restored = createMemory();
  assert.equal(restored.importData(backup), true);
  assert.equal(restored.list()[0].text, 'Mi objetivo es ahorrar 300 euros al mes.');
});

test('limita el contexto para no saturar el modelo local', () => {
  const memory = createMemory();
  for (let i = 0; i < 20; i++) memory.remember('Recuerdo número ' + i + ' con información de prueba.');
  assert.ok(memory.context(250).length <= 250);
  assert.equal(memory.list().length, 20);
});


test('recupera recuerdos relevantes por significado léxico y no solo por antigüedad', () => {
  const memory = createMemory();
  memory.remember('Estoy ahorrando para un viaje a Japón.');
  memory.remember('Prefiero respuestas breves y directas.');
  memory.remember('Mi presupuesto mensual para comida es de 250 euros.');
  const travel = memory.retrieve('¿Qué había dicho sobre mis vacaciones?', 5);
  assert.equal(travel[0].text, 'Estoy ahorrando para un viaje a Japón.');
  const food = memory.context(500, '¿Cuánto destino a alimentación cada mes?');
  assert.match(food, /presupuesto mensual para comida/);
  assert.doesNotMatch(food, /viaje a Japón/);
});

test('no inyecta recuerdos irrelevantes en consultas sin coincidencias', () => {
  const memory = createMemory();
  memory.remember('Prefiero estudiar matemáticas por la mañana.');
  assert.equal(memory.context(500, '¿Quién ganó el último campeonato de ajedrez?'), '');
});

test('mantiene compatibilidad con el contexto reciente cuando no se proporciona consulta', () => {
  const memory = createMemory();
  memory.remember('Primer recuerdo.');
  memory.remember('Segundo recuerdo.');
  assert.match(memory.context(500), /Segundo recuerdo/);
  assert.match(memory.context(500), /Primer recuerdo/);
});
