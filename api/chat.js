export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "Falta configurar OPENAI_API_KEY en las variables de entorno de Vercel." });
  }
  try {
    const body = req.body || {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 2000) {
      return res.status(400).json({ error: "El mensaje debe tener entre 1 y 2000 caracteres." });
    }
    const finance = body.finance && typeof body.finance === "object" ? body.finance : {};
    const history = Array.isArray(body.history) ? body.history.slice(-12).filter(x =>
      x && ["user", "assistant"].includes(x.role) && typeof x.content === "string"
    ).map(x => ({ role: x.role, content: x.content.slice(0, 3000) })) : [];
    if (history.length && history[history.length - 1].role === "user" && history[history.length - 1].content === message) history.pop();
    const instructions = [
      "Eres el asistente financiero personal integrado en Mi Finanzas. Habla siempre en español, con tono cercano, claro y práctico.",
      "Analiza exclusivamente los datos financieros facilitados por el usuario. No inventes movimientos ni saldos. Si faltan datos, dilo claramente.",
      "Los importes están en euros. Distingue ingresos de gastos. Puedes calcular totales, medias, porcentajes, categorías principales, comparaciones por fechas y presupuestos.",
      "Cuando recomiendes ahorrar o gastar, explica el cálculo y deja claro que es orientativo. No ejecutes operaciones ni modifiques datos.",
      "La información de movimientos es privada y solo debe usarse para responder a la consulta actual. No pidas contraseñas, números de tarjeta ni credenciales bancarias."
    ].join(" ");
    const input = [
      ...history,
      { role: "user", content: "DATOS FINANCIEROS ACTUALES (JSON):\n" + JSON.stringify(finance) + "\n\nPREGUNTA DEL USUARIO:\n" + message }
    ];
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: "gpt-4.1-mini", instructions, input, max_output_tokens: 900 })
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      console.error("OpenAI API error", upstream.status, result);
      return res.status(502).json({ error: "El servicio de IA no ha podido responder. Revisa la configuración de la API." });
    }
    const reply = result.output_text || (result.output || []).flatMap(item => item.content || []).map(x => x.text || "").join("\n").trim();
    return res.status(200).json({ reply: reply || "No he podido generar una respuesta. Inténtalo de nuevo." });
  } catch (error) {
    console.error("Financial assistant error", error);
    return res.status(500).json({ error: "Ha ocurrido un error al procesar tu consulta." });
  }
}
