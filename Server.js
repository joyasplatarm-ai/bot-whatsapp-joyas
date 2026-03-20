const express = require("express");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

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
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (message && phoneNumberId) {
      const from = message.from;
      const text = (message.text?.body || "").toLowerCase();

      let reply = "Hola 👋 gracias por escribir a Joyas Plata RM 💎";

      if (text.includes("hola")) {
        reply = "Hola 👋 Bienvenido a Joyas Plata RM 💎\n\nPuedes escribir:\n- catálogo\n- precios\n- dirección\n- horario";
      } else if (text.includes("catalogo") || text.includes("catálogo")) {
        reply = "Claro 💎 Si quieres nuestro catálogo, solicítalo por este medio y te ayudamos de inmediato.";
      } else if (text.includes("direccion") || text.includes("dirección")) {
        reply = "📍 Estamos en Eliodoro Yáñez 1200, Providencia.\nVisitas solo con hora agendada.";
      } else if (text.includes("horario")) {
        reply = "🕒 Lunes a viernes: 12:30 a 19:00\nSábado: 12:00 a 16:00";
      } else if (text.includes("precio") || text.includes("precios")) {
        reply = "💎 Tenemos valores por gramo, medio kilo y kilo. Escríbenos qué producto buscas y te enviamos el detalle.";
      }

      await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply }
        })
      });
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Error en webhook:", error);
    return res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
