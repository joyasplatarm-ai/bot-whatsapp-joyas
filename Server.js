const express = require("express");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// Chats en modo humano con vencimiento
const humanModeUntil = new Map();

// Evitar repetir la misma respuesta muy seguido
const lastReplies = new Map();

// Tiempo en modo humano: 30 minutos
const HUMAN_MODE_MINUTES = 30;
const HUMAN_MODE_MS = HUMAN_MODE_MINUTES * 60 * 1000;

// Tiempo para evitar repetir la misma respuesta: 10 minutos
const REPLY_COOLDOWN_MS = 10 * 60 * 1000;

const WELCOME_MESSAGE =
  "Hola 👋 gracias por comunicarte con *JOYAS PLATA RM* 💎\n\n" +
  "Contamos con oficina en Providencia y enviamos a todo Chile 🇨🇱\n\n" +
  "Por este medio trabajamos solo con *lotes listos disponibles*.\n\n" +
  "Escribe:\n" +
  "• catálogo\n" +
  "• dirección\n" +
  "• horario\n" +
  "• envíos\n" +
  "• agendar visita";

app.get("/", (req, res) => {
  res.send("Bot activo");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const value = body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (!message || !phoneNumberId) {
      return res.sendStatus(200);
    }

    if (message.type !== "text") {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = (message.text?.body || "").toLowerCase().trim();
    const now = Date.now();

    // Si está en modo humano y aún no vence, el bot no responde
    const humanUntil = humanModeUntil.get(from);
    if (humanUntil && now < humanUntil) {
      console.log(`Modo humano activo para ${from} hasta ${new Date(humanUntil).toISOString()}`);
      return res.sendStatus(200);
    }

    // Si venció, lo limpiamos
    if (humanUntil && now >= humanUntil) {
      humanModeUntil.delete(from);
    }

    let reply = WELCOME_MESSAGE;

    // HABLAR CON PERSONA / VENDEDOR
    if (
      text.includes("hablar contigo") ||
      text.includes("hablar con vendedor") ||
      text.includes("hablar con alguien") ||
      text.includes("quiero hablar con alguien") ||
      text.includes("quiero hablar contigo") ||
      text.includes("quiero hablar con vendedor") ||
      text.includes("asesor") ||
      text.includes("ejecutivo") ||
      text.includes("vendedor") ||
      text.includes("humano") ||
      text.includes("persona") ||
      text.includes("atencion") ||
      text.includes("atención")
    ) {
      reply = "Perfecto 💎\n\nTe ayudaremos por este medio a la brevedad.";
      humanModeUntil.set(from, now + HUMAN_MODE_MS);
    }

    // CATÁLOGO / FOTOS
    else if (
      text.includes("catalogo") ||
      text.includes("catálogo") ||
      text.includes("fotos") ||
      text.includes("modelos") ||
      text.includes("muestrame") ||
      text.includes("muéstrame")
    ) {
      reply =
        "Perfecto 💎\n\n" +
        "Por este medio trabajamos solo con *lotes listos disponibles*.\n" +
        "En unos momentos te enviaremos imágenes del stock disponible por este medio.\n\n" +
        "Si buscas compra a elección o personalizada, eso se realiza solo presencial en oficina.\n" +
        "También puedes revisar productos unitarios en nuestra web:\n" +
        "Www.joyasplatarm.com";
    }

    // DIRECCIÓN / UBICACIÓN
    else if (
      text.includes("direccion") ||
      text.includes("dirección") ||
      text.includes("ubicacion") ||
      text.includes("ubicación") ||
      text.includes("donde estan") ||
      text.includes("dónde están") ||
      text.includes("donde se ubican") ||
      text.includes("dónde se ubican") ||
      text.includes("donde quedan") ||
      text.includes("dónde quedan")
    ) {
      reply =
        "📍 Estamos en Eliodoro Yáñez 1200, Providencia.\n\n" +
        "Visitas solo con hora agendada.";
    }

    // HORARIO DE ATENCIÓN
    else if (
      text.includes("horario") ||
      text.includes("atienden") ||
      text.includes("abren") ||
      text.includes("hora de atencion") ||
      text.includes("hora de atención") ||
      text.includes("que hora atienden") ||
      text.includes("qué hora atienden")
    ) {
      reply =
        "🕒 Horarios de atención:\n" +
        "Lunes a viernes: 12:30 a 19:00\n" +
        "Sábado: 12:00 a 16:00";
    }

    // PRECIOS POR MEDIO KILO
    else if (
      text.includes("medio kilo") ||
      text.includes("1/2 kilo") ||
      text.includes("medio kg") ||
      text.includes("precio medio kilo") ||
      text.includes("precios medio kilo") ||
      text.includes("valor medio kilo") ||
      text.includes("valores medio kilo")
    ) {
      reply =
        "💎 Precios por medio kilo:\n\n" +
        "• Medio kilo cadenas y pulseras hombre: $250.000\n" +
        "• Medio kilo pulseras mujer: $325.000\n" +
        "• Medio kilo aros y medallas: $500.000";
    }

    // PRECIOS POR KILO
    else if (
      text.includes("por kilo") ||
      text.includes("precio kilo") ||
      text.includes("precios kilo") ||
      text.includes("valor kilo") ||
      text.includes("valores kilo") ||
      text.includes(" kilo") ||
      text === "kilo" ||
      text === "kg"
    ) {
      reply =
        "💎 Precios por kilo:\n\n" +
        "• Pulseras y cadenas hombre: $440.000\n" +
        "• Cadenas mujer: $470.000\n" +
        "• Pulseras mujer: $620.000\n" +
        "• Anillos mujer: $900.000\n" +
        "• Colgante microcircon y aros: $850.000";
    }

    // PRECIOS POR GRAMO
    else if (
      text.includes("gramo") ||
      text.includes("por gramo") ||
      text.includes("valor del gramo") ||
      text.includes("precio del gramo") ||
      text.includes("precios por gramo") ||
      text.includes("valores por gramo")
    ) {
      reply =
        "💎 Valores por gramo:\n\n" +
        "• Cadenas y pulseras hombre: $650 el gramo\n" +
        "• Pulseras mujer: $700 el gramo\n" +
        "• Aros y medallas microcircon: $1.150 el gramo\n" +
        "• Anillos de dama: $1.400 el gramo";
    }

    // PRECIOS / VALORES GENERALES
    else if (
      text.includes("precio") ||
      text.includes("precios") ||
      text.includes("valor") ||
      text.includes("valores") ||
      text.includes("cuanto sale") ||
      text.includes("cuánto sale") ||
      text.includes("cuanto vale") ||
      text.includes("cuánto vale")
    ) {
      reply =
        "💎 Trabajamos valores por gramo, medio kilo y kilo.\n\n" +
        "Si deseas un valor específico, puedes escribir por ejemplo:\n" +
        "• valor del gramo\n" +
        "• medio kilo\n" +
        "• kilo";
    }

    // COMPROBANTES
    else if (
      text.includes("comprobante") ||
      text.includes("comprobantes") ||
      text.includes("boleta") ||
      text.includes("boletas") ||
      text.includes("cuando mandan comprobante") ||
      text.includes("cuándo mandan comprobante") ||
      text.includes("cuando envian comprobante") ||
      text.includes("cuándo envían comprobante") ||
      text.includes("cuando mandan los comprobantes") ||
      text.includes("cuándo mandan los comprobantes")
    ) {
      reply = "📩 Los comprobantes se envían durante la noche del mismo día.";
    }

    // HORA DE ENVÍO / DESPACHO
    else if (
      text.includes("a que hora envian") ||
      text.includes("a qué hora envían") ||
      text.includes("a que hora despachan") ||
      text.includes("a qué hora despachan") ||
      text.includes("horario de envio") ||
      text.includes("horario de envío") ||
      text.includes("hora envio") ||
      text.includes("hora envío") ||
      text.includes("hora despacho") ||
      text.includes("en que horario envian") ||
      text.includes("en qué horario envían")
    ) {
      reply = "🚚 Los envíos se realizan durante la tarde del día correspondiente.";
    }

    // DÍAS DE ENVÍO / EMPRESAS DE ENVÍO
    else if (
      text.includes("envio") ||
      text.includes("envíos") ||
      text.includes("envío") ||
      text.includes("despacho") ||
      text.includes("despachan") ||
      text.includes("cuando envian") ||
      text.includes("cuándo envían") ||
      text.includes("que dias envian") ||
      text.includes("qué días envían") ||
      text.includes("dias de envio") ||
      text.includes("días de envío") ||
      text.includes("por donde envian") ||
      text.includes("por dónde envían") ||
      text.includes("empresa de envio") ||
      text.includes("empresa de envío")
    ) {
      reply =
        "📦 Días de envío:\n\n" +
        "• Lunes: Chilexpress y Bluexpress\n" +
        "• Miércoles: Chilexpress, Bluexpress y Starken\n" +
        "• Viernes: Chilexpress, Bluexpress y Starken\n\n" +
        "⚠️ Importante:\n" +
        "Los envíos NO se realizan el mismo día del pago.\n\n" +
        "• Para envío lunes → pagos hasta domingo\n" +
        "• Para envío miércoles → pagos hasta martes\n" +
        "• Para envío viernes → pagos hasta jueves";
    }

    // TIPO DE PLATA
    else if (
      text.includes("plata") ||
      text.includes("material") ||
      text.includes("son de plata") ||
      text.includes("tipo de plata") ||
      text.includes("que plata trabajan") ||
      text.includes("qué plata trabajan") ||
      text.includes("trabajan plata") ||
      text.includes("de que material son") ||
      text.includes("de qué material son")
    ) {
      reply = "💎 Trabajamos plata italiana y nacional.";
    }

    // PERSONALIZADO / A ELECCIÓN
    else if (
      text.includes("personalizado") ||
      text.includes("personalizada") ||
      text.includes("a eleccion") ||
      text.includes("a elección") ||
      text.includes("elegir") ||
      text.includes("escoger") ||
      text.includes("unitario") ||
      text.includes("unitarios")
    ) {
      reply =
        "💎 La compra a elección o personalizada se realiza solo presencial en oficina.\n\n" +
        "Por este medio trabajamos solo con lotes listos disponibles.\n\n" +
        "También puedes revisar productos unitarios en nuestra web:\n" +
        "Www.joyasplatarm.com";
    }

    // WEB / PÁGINA
    else if (
      text.includes("web") ||
      text.includes("pagina") ||
      text.includes("página") ||
      text.includes("sitio web") ||
      text.includes("pagina web") ||
      text.includes("página web")
    ) {
      reply =
        "🌐 Puedes revisar productos unitarios a elección en nuestra web:\n" +
        "Www.joyasplatarm.com";
    }

    // AGENDAR VISITA / PUEDO IR AHORA
    else if (
      text.includes("agendar") ||
      text.includes("agendo") ||
      text.includes("visita") ||
      text.includes("quiero ir") ||
      text.includes("presencial") ||
      text.includes("puedo ir ahora") ||
      text.includes("se puede ir ahora") ||
      text.includes("puedo pasar ahora") ||
      text.includes("puedo ir hoy")
    ) {
      reply =
        "📅 Si deseas visitarnos, indícanos por favor:\n" +
        "• Nombre y apellido\n" +
        "• Hora en que asistirías\n\n" +
        "Así confirmamos disponibilidad por este medio.";
    }

    // SALUDO
    else if (
      text.includes("hola") ||
      text.includes("buenas") ||
      text.includes("buenos dias") ||
      text.includes("buenos días") ||
      text.includes("buenas tardes") ||
      text.includes("buenas noches")
    ) {
      reply = WELCOME_MESSAGE;
    }

    // Evita repetir exactamente la misma respuesta dentro de 10 minutos
    const previous = lastReplies.get(from);
    if (
      previous &&
      previous.reply === reply &&
      now - previous.timestamp < REPLY_COOLDOWN_MS
    ) {
      console.log(`Respuesta repetida evitada para ${from}`);
      return res.sendStatus(200);
    }

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply }
        })
      }
    );

    const data = await response.text();
    console.log("RESPUESTA META:", response.status, data);

    lastReplies.set(from, {
      reply,
      timestamp: now
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error("ERROR EN WEBHOOK:", error);
    return res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
