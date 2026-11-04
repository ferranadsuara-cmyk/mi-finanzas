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


test('aprende automáticamente preferencias y objetivos expresados por el usuario', () => {
  const memory = createMemory();
  assert.equal(memory.learnFromMessage('Prefiero respuestas claras y paso a paso.').saved, true);
  assert.equal(memory.learnFromMessage('Estoy ahorrando para un coche nuevo.').saved, true);
  assert.match(memory.context(700, '¿Cómo prefiero las explicaciones?'), /respuestas claras/);
  assert.match(memory.context(700, '¿Para qué estoy ahorrando?'), /coche nuevo/);
  assert.equal(memory.learnFromMessage('¿Qué portátil me recomiendas?').saved, false);
});

test('guarda y recupera conversaciones favoritas y las exporta', () => {
  const memory = createMemory();
  const result = memory.starConversation([
    { role: 'user', content: 'Estoy preparando un viaje a Japón.' },
    { role: 'assistant', content: 'Podemos organizar el presupuesto.' }
  ]);
  assert.equal(result.ok, true);
  assert.equal(memory.listStarredConversations().length, 1);
  assert.match(memory.context(700, '¿Qué viaje estaba preparando?'), /viaje a Japón/);
  const restored = createMemory();
  assert.equal(restored.importData(memory.exportData()), true);
  assert.equal(restored.listStarredConversations().length, 1);
  assert.equal(restored.unstarConversation(result.conversation.id), 1);
});


test('aprende una preferencia de estilo cuando el usuario la repite', () => {
  const memory = createMemory();
  const first = memory.learnFromCorrection('No, hazlo más breve.');
  assert.equal(first.recognized, true);
  assert.equal(first.saved, false);
  const second = memory.learnFromCorrection('Te lo he pedido más breve.');
  assert.equal(second.saved, true);
  assert.match(memory.context(500, '¿Cómo prefiero las respuestas?'), /breves y directas/);
});

test('guarda inmediatamente una preferencia formulada como regla futura', () => {
  const memory = createMemory();
  const result = memory.learnFromCorrection('A partir de ahora, explícamelo siempre paso a paso.');
  assert.equal(result.saved, true);
  assert.match(memory.context(500), /paso a paso/);
});

test('actualiza una preferencia de estilo anterior cuando el usuario cambia de opinión', () => {
  const memory = createMemory();
  memory.learnFromCorrection('A partir de ahora, responde más breve.');
  const changed = memory.learnFromCorrection('A partir de ahora, dame explicaciones más detalladas.');
  assert.equal(changed.saved, true);
  assert.match(memory.context(500, '¿Cómo prefiero las respuestas?'), /detalladas/);
  assert.doesNotMatch(memory.context(500, '¿Cómo prefiero las respuestas?'), /breves/);
});

test('no convierte correcciones puntuales en preferencias permanentes', () => {
  const memory = createMemory();
  assert.equal(memory.learnFromCorrection('No, ese cálculo está mal.').recognized, false);
  assert.equal(memory.learnFromCorrection('Dame un ejemplo diferente.').recognized, false);
  assert.equal(memory.list().length, 0);
});


test('crea proyectos, guarda decisiones y recupera su contexto', () => {
  const memory = createMemory();
  const created = memory.createProject('Mi Finanzas', 'Desarrollo del asistente personal JARVIS.');
  assert.equal(created.ok, true);
  assert.equal(memory.activeProject().name, 'Mi Finanzas');
  assert.equal(memory.addProjectNote(created.project.id, 'decision', 'Usaremos Gemma 4 E2B-it como modelo local.').ok, true);
  assert.equal(memory.addProjectNote(created.project.id, 'next', 'Implementar memoria contextual por proyectos.').ok, true);
  const context = memory.projectContext('¿Qué hemos decidido para JARVIS?', 1000);
  assert.match(context, /Mi Finanzas/);
  assert.match(context, /Gemma 4 E2B-it/);
  assert.match(context, /memoria contextual/);
});

test('permite varios proyectos y activa uno sin mezclar sus decisiones', () => {
  const memory = createMemory();
  const finance = memory.createProject('Mi Finanzas');
  const studies = memory.createProject('Estudios');
  memory.addProjectNote(finance.project.id, 'decision', 'La información financiera se queda en local.');
  memory.addProjectNote(studies.project.id, 'decision', 'Preparar el examen de cálculo.');
  assert.equal(memory.setActiveProject(finance.project.id).project.name, 'Mi Finanzas');
  const context = memory.projectContext('¿Qué hemos decidido?', 1000);
  assert.match(context, /información financiera/);
  assert.doesNotMatch(context, /examen de cálculo/);
  assert.equal(memory.listProjects().length, 2);
});

test('exporta e importa proyectos y bloquea credenciales sensibles', () => {
  const memory = createMemory();
  const project = memory.createProject('Aplicación personal');
  assert.equal(memory.addProjectNote(project.project.id, 'note', 'Mi contraseña es secreto123').ok, false);
  memory.addProjectNote(project.project.id, 'progress', 'La interfaz inicial está preparada.');
  const restored = createMemory();
  assert.equal(restored.importData(memory.exportData()), true);
  assert.equal(restored.listProjects().length, 1);
  assert.equal(restored.activeProject().name, 'Aplicación personal');
  assert.match(restored.projectContext('interfaz'), /interfaz inicial/);
});


test('no mezcla notas si se indica un proyecto inexistente', () => {
  const memory = createMemory();
  const project = memory.createProject('Proyecto principal');
  const result = memory.addProjectNote('Proyecto que no existe', 'decision', 'Esta nota no debe guardarse.');
  assert.equal(result.ok, false);
  assert.equal(project.project.notes.length, 0);
});
