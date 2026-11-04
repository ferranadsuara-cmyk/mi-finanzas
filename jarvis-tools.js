(function(){
  'use strict';
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const money=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(n)||0);
  const monthLabel=m=>{const [y,mo]=m.split('-').map(Number);return new Date(y,mo-1,1,12).toLocaleDateString('es-ES',{month:'long',year:'numeric'})};
  function previousMonth(m){const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-2,1,12);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function match(question){
    const q=String(question||'').toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[¿?¡!]/g,' ').replace(/\s+/g,' ').trim();
    if(/^(?:cuanto es|calcula|calcular|haz la cuenta|resuelve)\s+[\d\s.,()+*/%-]+$/.test(q))return {name:'calculate',args:{expression:q.replace(/^(?:cuanto es|calcula|calcular|haz la cuenta|resuelve)\s+/,'')}};
    if(/\b(resumen|balance|cuanto he gastado|cuanto he ingresado|cuanto he ahorrado|mis ingresos|mis gastos)\b/.test(q))return {name:'month_summary',args:{}};
    if(/\b(categoria|categorias|donde gasto mas|en que gasto mas|mayor gasto|top gastos)\b/.test(q))return {name:'top_categories',args:{}};
    if(/\b(compara|comparar|mes anterior|respecto al mes pasado|comparacion mensual)\b/.test(q))return {name:'compare_months',args:{}};
    if(/\b(pagos recurrentes|pagos mensuales|suscripciones|recibos)\b/.test(q))return {name:'recurring_payments',args:{}};
    if(/\b(objetivos|metas de ahorro|progreso de ahorro|mis metas)\b/.test(q))return {name:'savings_goals',args:{}};
    if(/\b(presupuesto|limite de gasto|limites por categoria|cuanto me queda para gastar)\b/.test(q))return {name:'budget_status',args:{}};
    return null;
  }
  function calculate(expression){
    const source=String(expression||'').replace(/,/g,'.').replace(/\s+/g,'');
    if(!source||source.length>80||!/^[0-9.+*/()%\-]+$/.test(source))return {ok:false,error:'Solo puedo calcular operaciones aritméticas básicas.'};
    const tokens=source.match(/\d+(?:\.\d+)?|[()+*/%-]/g)||[];
    if(tokens.join('')!==source)return {ok:false,error:'La operación contiene caracteres no válidos.'};
    const values=[],ops=[],precedence={'%':3,'*':2,'/':2,'+':1,'-':1};
    const apply=()=>{const op=ops.pop();if(op==='('||values.length<2)throw new Error('Operación incompleta.');const b=values.pop(),a=values.pop();let v=op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:op==='/'?a/b:a%b;if(!Number.isFinite(v))throw new Error('No se puede dividir entre cero o el resultado no es válido.');values.push(v)};
    try{
      let expectValue=true;
      for(const token of tokens){
        if(/^\d/.test(token)){if(!expectValue)throw new Error('Falta un operador.');values.push(Number(token));expectValue=false;continue}
        if(token==='('){if(!expectValue)throw new Error('Falta un operador antes del paréntesis.');ops.push(token);expectValue=true;continue}
        if(token===')'){if(expectValue)throw new Error('Paréntesis incompleto.');while(ops.length&&ops[ops.length-1]!=='(')apply();if(!ops.length)throw new Error('Paréntesis no equilibrados.');ops.pop();expectValue=false;continue}
        if(expectValue&&token==='-'){values.push(0);ops.push('-');continue}
        if(expectValue)throw new Error('La operación está incompleta.');
        while(ops.length&&ops[ops.length-1]!=='('&&precedence[ops[ops.length-1]]>=precedence[token])apply();
        ops.push(token);expectValue=true;
      }
      if(expectValue)throw new Error('La operación está incompleta.');
      while(ops.length){if(ops[ops.length-1]==='(')throw new Error('Paréntesis no equilibrados.');apply()}
      if(values.length!==1)throw new Error('No he podido resolver la operación.');
      return {ok:true,value:round(values[0])};
    }catch(e){return {ok:false,error:e.message||'Operación no válida.'}}
  }
  function rowsForMonth(ctx,key){const transactions=ctx.transactions||[],recurring=ctx.recurring||[];const rows=transactions.filter(x=>String(x.date||'').startsWith(key));const [y,m]=key.split('-').map(Number);recurring.filter(r=>r.active&&r.startMonth<=key).forEach(r=>{const day=Math.min(Number(r.day)||1,new Date(y,m,0).getDate());rows.push({id:'rec-'+r.id+'-'+key,type:r.type,amount:r.amount,date:key+'-'+String(day).padStart(2,'0'),cat:r.cat||'Otros',desc:(r.name||'Pago recurrente')+' · Pago recurrente',recurring:true})});return rows}
  function execute(name,args,ctx){
    const month=ctx.month,transactions=ctx.transactions||[],recurring=ctx.recurring||[],goals=ctx.goals||[],budgets=ctx.budgets||{},savingRate=Number(ctx.savingRate)||50;
    const current=rowsForMonth(ctx,month);
    const income=round(current.filter(x=>x.type==='in').reduce((s,x)=>s+Number(x.amount||0),0));
    const expense=round(current.filter(x=>x.type==='out').reduce((s,x)=>s+Number(x.amount||0),0));
    const balance=round(income-expense);
    if(name==='calculate'){const result=calculate(args.expression);return result.ok?'El resultado de '+args.expression+' es '+result.value.toLocaleString('es-ES')+'.':result.error}
    if(name==='month_summary')return 'Resumen de '+monthLabel(month)+':\nIngresos: '+money(income)+'\nGastos: '+money(expense)+'\nBalance: '+money(balance)+'\nObjetivo de ahorro ('+savingRate+' %): '+money(income*savingRate/100)+'.\nCifras calculadas a partir de tus movimientos registrados en Mi Finanzas.';
    if(name==='top_categories'){
      const totals={};current.filter(x=>x.type==='out').forEach(x=>{const key=x.cat||'Otros';totals[key]=(totals[key]||0)+Number(x.amount||0)});
      const rows=Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,5);
      return rows.length?'Tus principales categorías de gasto en '+monthLabel(month)+':\n'+rows.map((x,i)=>(i+1)+'. '+x[0]+': '+money(x[1])).join('\n'):'No hay gastos registrados este mes para comparar categorías.';
    }
    if(name==='compare_months'){
      const previous=previousMonth(month),prior=rowsForMonth(ctx,previous),priorExpense=round(prior.filter(x=>x.type==='out').reduce((s,x)=>s+Number(x.amount||0),0)),delta=round(expense-priorExpense);
      return 'Comparación de gastos:\n'+monthLabel(month)+': '+money(expense)+'\n'+monthLabel(previous)+': '+money(priorExpense)+'\n'+(delta>0?'Has gastado '+money(delta)+' más.':delta<0?'Has gastado '+money(-delta)+' menos.':'Has gastado lo mismo.')+'\nComparación basada en movimientos registrados.';
    }
    if(name==='recurring_payments'){
      const active=recurring.filter(x=>x.active&&x.startMonth<=month);
      return active.length?'Pagos recurrentes activos:\n'+active.map(x=>'• '+x.name+': '+money(x.amount)+' · día '+x.day).join('\n'):'No tienes pagos recurrentes activos registrados.';
    }
    if(name==='savings_goals'){
      return goals.length?'Tus objetivos de ahorro:\n'+goals.map(g=>{const target=Number(g.target)||0,currentValue=Number(g.current)||0,pct=target?Math.min(100,currentValue/target*100):0;return '• '+g.name+': '+money(currentValue)+' de '+money(target)+' ('+pct.toFixed(0)+' %).'}).join('\n'):'Todavía no has creado objetivos de ahorro.';
    }
    if(name==='budget_status'){
      const rows=Object.entries(budgets).filter(([,v])=>Number(v)>0).map(([cat,limit])=>{const spent=round(current.filter(x=>x.type==='out'&&x.cat===cat).reduce((s,x)=>s+Number(x.amount||0),0));return {cat,limit:Number(limit),spent,remaining:round(Number(limit)-spent)}});
      const overall=round(income*(savingRate/100));
      return (rows.length?'Presupuestos por categoría:\n'+rows.map(x=>'• '+x.cat+': '+money(x.spent)+' de '+money(x.limit)+' · '+(x.remaining>=0?'quedan ':'exceso de ')+money(Math.abs(x.remaining))).join('\n'):'No has configurado límites por categoría.')+'\n\nLímite de gasto orientativo para cumplir tu objetivo de ahorro: '+money(income-overall)+'. Gastos registrados: '+money(expense)+'.';
    }
    return 'No reconozco esa herramienta.';
  }
  window.JarvisTools={match,execute,calculate,previousMonth};
})();