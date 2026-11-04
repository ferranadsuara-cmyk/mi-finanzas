const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','jarvis-tools.js'),'utf8');
const context={window:{},Intl,Date,Math,Number,String,Object,Array,RegExp};
vm.runInNewContext(source,context);
const tools=context.window.JarvisTools;
const data={month:'2026-11',savingRate:50,transactions:[
 {date:'2026-11-01',type:'in',amount:2000,cat:'Salario'},
 {date:'2026-11-02',type:'out',amount:100,cat:'Comida'},
 {date:'2026-11-03',type:'out',amount:50,cat:'Ocio'},
 {date:'2026-10-02',type:'out',amount:80,cat:'Comida'}
],recurring:[{name:'Internet',amount:30,day:5,active:true,startMonth:'2026-01'}],goals:[{name:'Viaje',target:1000,current:250}],budgets:{Comida:150}};
test('detecta intenciones sin ejecutar acciones financieras',()=>{
 assert.equal(tools.match('Hazme un resumen del mes').name,'month_summary');
 assert.equal(tools.match('¿En qué categoría gasto más?').name,'top_categories');
 assert.equal(tools.match('Compara con el mes anterior').name,'compare_months');
 assert.equal(tools.match('¿Qué pagos recurrentes tengo?').name,'recurring_payments');
 assert.equal(tools.match('¿Cómo van mis objetivos?').name,'savings_goals');
 assert.equal(tools.match('¿Cómo va mi presupuesto?').name,'budget_status');
});
test('calcula expresiones seguras y rechaza contenido no aritmético',()=>{
 assert.equal(tools.calculate('(20+5)*2').value,50);
 assert.equal(tools.calculate('10/0').ok,false);
 assert.equal(tools.calculate('alert(1)').ok,false);
});
test('consulta cifras del mes y respeta el contexto financiero recibido',()=>{
 assert.match(tools.execute('month_summary',{},data),/Ingresos: \s*(?:2\.000|2000),00/);
 assert.match(tools.execute('month_summary',{},data),/Gastos: \s*150,00/);
 assert.match(tools.execute('top_categories',{},data),/Comida: 100,00/);
 assert.match(tools.execute('compare_months',{},data),/Has gastado 70,00/);
 assert.match(tools.execute('recurring_payments',{},data),/Internet/);
 assert.match(tools.execute('savings_goals',{},data),/Viaje/);
 assert.match(tools.execute('budget_status',{},data),/quedan 50,00/);
});
