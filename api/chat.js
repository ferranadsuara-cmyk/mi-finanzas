// Mi Finanzas — agente conversacional con herramientas y acciones confirmables.
const MODEL = "gpt-4.1-mini";
const MAX_TOOL_ROUNDS = 4;

const tools = [
  {
    type: "function",
    name: "get_finance_summary",
    description: "Calcula un resumen verificable de los movimientos del usuario para un mes concreto. Úsalo antes de dar cifras o recomendaciones específicas.",
    strict: true,
    parameters: {
      type: "object",
      properties: { month: { type: "string", description: "Mes en formato YYYY-MM." } },
      required: ["month"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "propose_transaction",
    description: "Prepara un ingreso o gasto para añadir a Mi Finanzas. Nunca lo guarda: el usuario debe pulsar Confirmar en la aplicación.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["in", "out"] },
        amount: { type: "number", description: "Importe positivo en euros." },
        date: { type: "string", description: "Fecha YYYY-MM-DD." },
        category: { type: "string", description: "Categoría del movimiento, por ejemplo Comida, Transporte, Ocio, Compras, Suscripciones, Estudios, Hogar, Salud, Viajes, Salario u Otros." },
        description: { type: "string", description: "Descripción breve del movimiento." }
      },
      required: ["type", "amount", "date", "category", "description"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "propose_savings_goal",
    description: "Prepara un objetivo de ahorro nuevo. No lo guarda: el usuario debe confirmarlo en la aplicación.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del objetivo." },
        target: { type: "number", description: "Cantidad objetivo positiva en euros." },
        current: { type: "number", description: "Cantidad ya ahorrada, normalmente cero." }
      },
      required: ["name", "target", "current"],
      additionalProperties: false
    }
  },
  { type: "web_search_preview" }
];

function summarize(finance, month) {
  const all = Array.isArray(finance.transactions) ? finance.transactions : [];
  const tx = all.filter(x => typeof x.date === "string" && x.date.startsWith(month));
  const income = tx.filter(x => x.type === "in").reduce((s, x) => s + Number(x.amount || 0), 0);
  const expenses = tx.filter(x => x.type === "out").reduce((s, x) => s + Number(x.amount || 0), 0);
  const categories = {};
  for (const x of tx.filter(x => x.type === "out")) {
    const cat = String(x.cat || "Otros");
    categories[cat] = (categories[cat] || 0) + Number(x.amount || 0);
  }
  const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0] || null;
  return {
    month, movements: tx.length,
    income: Number(income.toFixed(2)),
    expenses: Number(expenses.toFixed(2)),
    balance: Number((income - expenses).toFixed(2)),
    savingRate: income ? Number(((income - expenses) / income * 100).toFixed(1)) : null,
    savingTargetPercent: Number(finance.savingRate ?? 50),
    topExpenseCategory: top ? { name: top[0], amount: Number(top[1].toFixed(2)) } : null,
    categoryTotals: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, Number(v.toFixed(2))]))
  };
}

function extractText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  return (response.output || []).flatMap(item => item.content || [])
    .filter(part => part.type === "output_text" || typeof part.text === "string")
    .map(part => part.text || "").join("\n").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "Falta configurar OPENAI_API_KEY en Vercel." });
  }

  try {
    const body = req.body || {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 2000) {
      return res.status(400).json({ error: "El mensaje debe tener entre 1 y 2000 caracteres." });
    }

    const rawFinance = body.finance && typeof body.finance === "object" ? body.finance : {};
    const finance = {
      transactions: Array.isArray(rawFinance.transactions) ? rawFinance.transactions.slice(-500) : [],
      goals: Array.isArray(rawFinance.goals) ? rawFinance.goals.slice(0, 100) : [],
      monthlySettings: rawFinance.monthlySettings || {},
      selectedMonth: typeof rawFinance.selectedMonth === "string" ? rawFinance.selectedMonth : new Date().toISOString().slice(0, 7),
      savingRate: Number(rawFinance.savingRate ?? 50)
    };

    const history = Array.isArray(body.history) ? body.history.slice(-12).filter(x =>
      x && ["user", "assistant"].includes(x.role) && typeof x.content === "string"
    ).map(x => ({ role: x.role, content: x.content.slice(0, 3000) })) : [];
    if (history.length && history[history.length - 1].role === "user" && history[history.length - 1].content === message) history.pop();

    const instructions = [
      "Eres J.A.R.V.I.S., la inteligencia artificial de Mi Finanzas: una asistente personal cercana, resolutiva y rigurosa. Habla siempre en español de España y usa euros.",
      "Tu misión es ayudar a la persona a entender y organizar su dinero. Puedes conversar de forma natural, explicar conceptos, calcular presupuestos, detectar patrones y proponer mejoras.",
      "Los datos financieros incluidos en el mensaje son la fuente de verdad. No inventes saldos, compras, ingresos ni fechas. Si faltan datos, dilo. Usa get_finance_summary para cifras mensuales y cálculos exactos.",
      "Puedes consultar la web cuando pidan comparar productos, tiendas, sucursales, precios o información actual. Distingue precios publicados de disponibilidad y stock confirmados; nunca afirmes que una sucursal tiene stock si la fuente no lo confirma. Indica que los precios pueden cambiar.",
      "Puedes preparar nuevos movimientos y objetivos con tus funciones. Esas funciones SOLO generan propuestas: explica qué has preparado y recuerda que no se guardará hasta que la persona pulse Confirmar. Nunca digas que ya se ha guardado.",
      "No puedes borrar ni modificar movimientos existentes. No solicites contraseñas, números de tarjeta ni credenciales bancarias. No envíes datos financieros a búsquedas web.",
      "Para recomendaciones de ahorro, explica el cálculo, respeta el porcentaje objetivo configurado y evita juzgar al usuario. Sé concreta, útil y no excesivamente extensa."
    ].join(" ");

    const input = [
      ...history,
      { role: "user", content: "CONTEXTO FINANCIERO PRIVADO (úsalo solo para responder; no lo incluyas en búsquedas web):\n" + JSON.stringify(finance) + "\n\nCONSULTA:\n" + message }
    ];
    const actions = [];
    let response;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          instructions,
          input,
          tools,
          tool_choice: "auto",
          max_output_tokens: 1400
        })
      });

      const result = await upstream.json();
      if (!upstream.ok) {
        console.error("OpenAI API error", upstream.status, result);
        return res.status(502).json({ error: "La IA no ha podido responder. Comprueba la configuración de OpenAI." });
      }
      response = result;
      const calls = (result.output || []).filter(item => item.type === "function_call");
      if (!calls.length) break;

      input.push(...result.output);
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch {}
        let output = { ok: false, message: "No se ha podido preparar esta acción." };

        if (call.name === "get_finance_summary") {
          const targetMonth = /^\d{4}-\d{2}$/.test(args.month) ? args.month : finance.selectedMonth;
          output = { ok: true, summary: summarize(finance, targetMonth) };
        } else if (call.name === "propose_transaction") {
          const validDate = typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date) && !Number.isNaN(Date.parse(args.date + "T12:00:00"));
          const amount = Number(args.amount);
          if (["in", "out"].includes(args.type) && Number.isFinite(amount) && amount > 0 && amount <= 10000000 && validDate) {
            const action = {
              id: call.call_id, type: "transaction", transactionType: args.type,
              amount: Math.round(amount * 100) / 100, date: args.date,
              category: String(args.category || "Otros").slice(0, 40),
              description: String(args.description || args.category || "Movimiento").slice(0, 120)
            };
            actions.push(action);
            output = { ok: true, awaitingConfirmation: true, proposed: action };
          } else {
            output = { ok: false, message: "Datos del movimiento no válidos; pide al usuario que aclare importe y fecha." };
          }
        } else if (call.name === "propose_savings_goal") {
          const target = Number(args.target), current = Number(args.current);
          const name = String(args.name || "").trim().slice(0, 80);
          if (name && Number.isFinite(target) && target > 0 && target <= 100000000 && Number.isFinite(current) && current >= 0 && current <= target) {
            const action = { id: call.call_id, type: "goal", name, target: Math.round(target * 100) / 100, current: Math.round(current * 100) / 100 };
            actions.push(action);
            output = { ok: true, awaitingConfirmation: true, proposed: action };
          } else {
            output = { ok: false, message: "Datos del objetivo no válidos; solicita nombre y cantidades correctas." };
          }
        }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) });
      }
    }

    return res.status(200).json({
      reply: extractText(response) || "He terminado de revisar la información, pero no he podido generar una respuesta. Prueba a reformularlo.",
      actions
    });
  } catch (error) {
    console.error("Mi Finanzas agent error", error);
    return res.status(500).json({ error: "Ha ocurrido un error al procesar tu consulta." });
  }
}
