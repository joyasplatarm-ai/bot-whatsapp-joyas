const { google } = require("googleapis");
const fs = require("fs");
const express = require("express");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const DRIVE_FOLDER_ID =
  process.env.GOOGLE_DRIVE_CATALOGO_COMPLETO_FOLDER_ID;

const GOOGLE_CREDS_PATH =
  "/etc/secrets/google-service-account.json";

console.log(
  "GOOGLE CREDS EXISTS:",
  fs.existsSync(GOOGLE_CREDS_PATH)
);

if (fs.existsSync(GOOGLE_CREDS_PATH)) {
  console.log(
    "GOOGLE CREDS SIZE:",
    fs.statSync(GOOGLE_CREDS_PATH).size
  );
}

const googleAuth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_CREDS_PATH,
  scopes: [
    "https://www.googleapis.com/auth/drive.readonly"
  ]
});

const drive = google.drive({
  version: "v3",
  auth: googleAuth
});


// =====================================================
// MEMORIA TEMPORAL DEL BOT
// =====================================================

// Conversaciones tomadas por humano
const humanModeUntil = new Map();

// Última respuesta enviada por número
const lastReplies = new Map();

// Sesiones activas
const activeConversations = new Map();

// Fotos enviadas por el bot desde Drive
// messageId -> datos del lote
const sentCatalogMessages = new Map();

// Fotos que pertenecen al catálogo MÁS RECIENTE
// número -> Set(messageIds)
const currentCatalogMessageIds = new Map();

// Lotes elegidos por cada cliente
const customerOrders = new Map();

// IDs de mensajes entrantes ya procesados
const processedMessages = new Map();

// Evita mandar dos catálogos en paralelo
const catalogInProgress = new Set();

const HUMAN_MODE_MINUTES = 30;

const HUMAN_MODE_MS =
  HUMAN_MODE_MINUTES * 60 * 1000;

const REPLY_COOLDOWN_MS =
  10 * 60 * 1000;

const CONVERSATION_SESSION_MS =
  24 * 60 * 60 * 1000;

// Si Render estuvo caído y Meta entrega después mensajes
// antiguos, no queremos responderlos.
const MAX_MESSAGE_AGE_MS =
  2 * 60 * 1000;


// =====================================================
// MENSAJE DE BIENVENIDA
// =====================================================

const WELCOME_MESSAGE = `¡Bienvenido! 👋 Gracias por comunicarte con
JOYAS PLATA RM 💎
Venta Mayorista de Joyas de Plata

📦 Enviamos a todo Chile vía Chilexpress, Bluexpress y Starken.

📍 OFICINA EN PROVIDENCIA
Eliodoro Yáñez 1200
OFICINA 1004 – Piso 10

🔹 ¿Buscas nuestro catálogo actualizado?
Escribe CATÁLOGO y te lo enviamos de inmediato 📲

🌐 También puedes comprar directamente en nuestra página web, desde 1 unidad:
www.joyasplatarm.com

🔹 ¿Quieres agendar una visita presencial?
Indícanos:
• Nombre
• Día
• Hora estimada

💎 Compra mínima presencial por gramo: $30.000

¡Te esperamos! ✨`;


// =====================================================
// FUNCIONES DE CONTROL
// =====================================================

function pausarBotPorHumano(numero) {
  humanModeUntil.set(
    numero,
    Date.now() + HUMAN_MODE_MS
  );

  console.log(
    `👤 Bot pausado por intervención humana: ${numero}`
  );
}


function botPuedeResponder(numero) {
  const hasta =
    humanModeUntil.get(numero);

  if (!hasta) {
    return true;
  }

  if (Date.now() >= hasta) {
    humanModeUntil.delete(numero);
    return true;
  }

  return false;
}


function normalizarTexto(texto = "") {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function contieneAlguna(texto, frases) {
  return frases.some(
    frase => texto.includes(frase)
  );
}


// =====================================================
// DETECTAR SOLICITUD REAL DE CATÁLOGO
// =====================================================

function esSolicitudCatalogo(texto = "") {
  let t =
    normalizarTexto(texto);

  // Quitar saludo inicial
  t = t.replace(
    /^(hola|holaa|buenas|buenos dias|buenas tardes|buenas noches)\s+/,
    ""
  );

  // Quitar "por favor" al final
  t = t.replace(
    /\s+por favor$/,
    ""
  ).trim();

  const frasesExactas = [
    "catalogo",

    "quiero catalogo",
    "quiero el catalogo",

    "quiero ver catalogo",
    "quiero ver el catalogo",

    "quisiera catalogo",
    "quisiera el catalogo",

    "necesito catalogo",
    "necesito el catalogo",

    "enviame catalogo",
    "enviame el catalogo",

    "mandame catalogo",
    "mandame el catalogo",

    "me envias catalogo",
    "me envias el catalogo",

    "me mandas catalogo",
    "me mandas el catalogo",

    "me puedes enviar catalogo",
    "me puedes enviar el catalogo",

    "me puedes mandar catalogo",
    "me puedes mandar el catalogo",

    "puedes enviarme catalogo",
    "puedes enviarme el catalogo",

    "puedes mandarme catalogo",
    "puedes mandarme el catalogo",

    "tienes catalogo",
    "tienen catalogo",

    "ver catalogo",
    "ver el catalogo",

    "muestrame catalogo",
    "muestrame el catalogo"
  ];

  return frasesExactas.includes(t);
}


// =====================================================
// DETECTAR SOLICITUD DE HUMANO
// =====================================================

function esSolicitudHumano(texto = "") {
  const t =
    normalizarTexto(texto);

  return contieneAlguna(
    t,
    [
      "hablar contigo",

      "hablar con vendedor",
      "hablar con un vendedor",

      "hablar con alguien",
      "quiero hablar con alguien",

      "quiero hablar contigo",

      "quiero hablar con vendedor",
      "quiero hablar con un vendedor",

      "hablar con asesor",
      "hablar con un asesor",

      "hablar con ejecutivo",
      "hablar con un ejecutivo",

      "hablar con humano",

      "hablar con una persona"
    ]
  );
}


// =====================================================
// DETECTAR PAGO / COMPROBANTE
// =====================================================

function esAvisoPagoRealizado(texto = "") {
  const t =
    normalizarTexto(texto);

  return contieneAlguna(
    t,
    [
      "te envio comprobante",
      "te envio el comprobante",

      "envio comprobante",
      "envio el comprobante",

      "adjunto comprobante",
      "adjunto el comprobante",

      "ya pague",
      "ya transferi",

      "pago realizado",

      "transferencia realizada",

      "listo pague",
      "listo transferi"
    ]
  );
}


function esperar(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}


// =====================================================
// ENVIAR TEXTO POR WHATSAPP
// =====================================================

async function enviarTextoWhatsApp(
  phoneNumberId,
  to,
  text
) {
  const response =
    await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          messaging_product:
            "whatsapp",

          recipient_type:
            "individual",

          to,

          type:
            "text",

          text: {
            body: text
          }
        })
      }
    );

  if (!response.ok) {
    const error =
      await response.text();

    throw new Error(
      `Error enviando texto: ${error}`
    );
  }

  return response.json();
}


// =====================================================
// ENVIAR IMAGEN POR WHATSAPP
// =====================================================

async function enviarImagenWhatsApp(
  phoneNumberId,
  to,
  mediaId
) {
  const response =
    await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          messaging_product:
            "whatsapp",

          recipient_type:
            "individual",

          to,

          type:
            "image",

          image: {
            id: mediaId
          }
        })
      }
    );

  if (!response.ok) {
    const error =
      await response.text();

    throw new Error(
      `Error enviando imagen: ${error}`
    );
  }

  const data =
    await response.json();

  return (
    data?.messages?.[0]?.id ||
    null
  );
}


// =====================================================
// OBTENER CATÁLOGO DESDE GOOGLE DRIVE
// =====================================================

async function obtenerImagenesCatalogoDrive() {
  const response =
    await drive.files.list({
      q:
        `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,

      fields:
        "files(id,name,mimeType)",

      pageSize:
        1000,

      orderBy:
        "name"
    });

  return (
    response.data.files || []
  ).filter(
    file =>
      [
        "image/jpeg",
        "image/png"
      ].includes(file.mimeType)
  );
}


// =====================================================
// SUBIR IMAGEN DE DRIVE A WHATSAPP
// =====================================================

async function subirImagenDriveAWhatsApp(
  file,
  phoneNumberId
) {
  const response =
    await drive.files.get(
      {
        fileId:
          file.id,

        alt:
          "media"
      },
      {
        responseType:
          "arraybuffer"
      }
    );

  const buffer =
    Buffer.from(response.data);

  const form =
    new FormData();

  form.append(
    "messaging_product",
    "whatsapp"
  );

  form.append(
    "file",

    new Blob(
      [buffer],
      {
        type:
          file.mimeType
      }
    ),

    file.name
  );

  const uploadResponse =
    await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/media`,
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${WHATSAPP_TOKEN}`
        },

        body:
          form
      }
    );

  const data =
    await uploadResponse.json();

  if (
    !uploadResponse.ok ||
    !data.id
  ) {
    throw new Error(
      `Error subiendo imagen a WhatsApp: ${JSON.stringify(data)}`
    );
  }

  return data.id;
}


// =====================================================
// ENVIAR CATÁLOGO COMPLETO
// =====================================================

async function enviarCatalogoCompleto(
  phoneNumberId,
  to
) {
  try {
    // Si un humano tomó el chat,
    // no comenzar catálogo.
    if (!botPuedeResponder(to)) {
      console.log(
        `🛑 Catálogo no iniciado: conversación tomada por humano ${to}`
      );

      return;
    }

    console.log(
      `📂 Iniciando catálogo para ${to}`
    );

    // IMPORTANTE:
    // cada catálogo nuevo invalida las fotos
    // anteriores para selección automática.
    currentCatalogMessageIds.set(
      to,
      new Set()
    );

    await enviarTextoWhatsApp(
      phoneNumberId,
      to,
      "¡Claro! 💎 Te envío nuestro catálogo completo para que puedas revisar todos los modelos y lotes disponibles actualmente."
    );

    const imagenes =
      await obtenerImagenesCatalogoDrive();

    console.log(
      `📸 Imágenes encontradas en Drive: ${imagenes.length}`
    );

    if (imagenes.length === 0) {
      if (botPuedeResponder(to)) {
        await enviarTextoWhatsApp(
          phoneNumberId,
          to,
          "En este momento no tengo imágenes disponibles en el catálogo 💎."
        );
      }

      return;
    }

    for (const imagen of imagenes) {
      // Si durante el catálogo
      // interviene un humano, detener.
      if (!botPuedeResponder(to)) {
        console.log(
          `🛑 Catálogo detenido por intervención humana: ${to}`
        );

        return;
      }

      try {
        console.log(
          `📤 Enviando: ${imagen.name}`
        );

        const mediaId =
          await subirImagenDriveAWhatsApp(
            imagen,
            phoneNumberId
          );

        const sentMessageId =
          await enviarImagenWhatsApp(
            phoneNumberId,
            to,
            mediaId
          );

        if (sentMessageId) {
          sentCatalogMessages.set(
            sentMessageId,
            {
              to,

              mediaId,

              nombre:
                imagen.name,

              driveFileId:
                imagen.id,

              timestamp:
                Date.now()
            }
          );

          // Solo las imágenes del catálogo
          // más reciente son válidas.
          const currentIds =
            currentCatalogMessageIds.get(
              to
            );

          if (currentIds) {
            currentIds.add(
              sentMessageId
            );
          }
        }

        await esperar(700);

      } catch (error) {
        console.error(
          `❌ Error procesando ${imagen.name}:`,
          error.message
        );

        // Un error en una imagen NO cancela
        // todo el catálogo.
      }
    }

    if (!botPuedeResponder(to)) {
      return;
    }

    await enviarTextoWhatsApp(
      phoneNumberId,
      to,
      "¡Listo! 💎 Ese es nuestro catálogo disponible actualmente. Si te gustó algún modelo o lote, respóndeme directamente sobre la foto y te ayudo con la compra."
    );

    console.log(
      `✅ Catálogo terminado para ${to}`
    );

  } catch (error) {
    console.error(
      "❌ ERROR CATÁLOGO DRIVE:",
      error
    );

    if (botPuedeResponder(to)) {
      try {
        await enviarTextoWhatsApp(
          phoneNumberId,
          to,
          "Estoy teniendo un inconveniente para cargar el catálogo en este momento 💎. Intenta nuevamente en unos minutos."
        );

      } catch (error2) {
        console.error(
          "Error enviando aviso:",
          error2
        );
      }
    }
  }
}


// =====================================================
// RUTA PRINCIPAL
// =====================================================

app.get(
  "/",
  (req, res) => {
    res.send("Bot activo");
  }
);


// =====================================================
// VERIFICACIÓN WEBHOOK META
// =====================================================

app.get(
  "/webhook",
  (req, res) => {
    const mode =
      req.query["hub.mode"];

    const token =
      req.query["hub.verify_token"];

    const challenge =
      req.query["hub.challenge"];

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {
      return res
        .status(200)
        .send(challenge);
    }

    return res.sendStatus(403);
  }
);


// =====================================================
// WEBHOOK PRINCIPAL
// =====================================================

app.post(
  "/webhook",
  async (req, res) => {
    try {
      const body =
        req.body;


      // =================================================
      // AUDIO ENVIADO MANUALMENTE POR TRABAJADOR
      // =================================================

      const echoChange =
        body?.entry?.[0]?.changes?.[0];

      const echoValue =
        echoChange?.value;

      if (
        echoChange?.field ===
        "smb_message_echoes"
      ) {
        const echo =
          echoValue
            ?.message_echoes?.[0];

        if (
          echo?.type === "audio" &&
          echo?.to
        ) {
          console.log(
            "🎙️ Audio enviado por humano a:",
            echo.to
          );

          pausarBotPorHumano(
            echo.to
          );

          return res.sendStatus(200);
        }
      }


      // =================================================
      // EXTRAER MENSAJE ENTRANTE
      // =================================================

      const value =
        body
          ?.entry?.[0]
          ?.changes?.[0]
          ?.value;

      const message =
        value
          ?.messages?.[0];

      const phoneNumberId =
        value
          ?.metadata
          ?.phone_number_id;

      if (
        !message ||
        !phoneNumberId
      ) {
        return res.sendStatus(200);
      }


      // =================================================
      // IGNORAR MENSAJES ANTIGUOS
      // =================================================

      const messageTimestampMs =
        Number(
          message.timestamp || 0
        ) * 1000;

      if (
        messageTimestampMs &&
        Date.now() -
          messageTimestampMs >
          MAX_MESSAGE_AGE_MS
      ) {
        console.log(
          "⏱️ Mensaje antiguo ignorado:",
          message.id,
          new Date(
            messageTimestampMs
          ).toISOString()
        );

        return res.sendStatus(200);
      }


      // =================================================
      // EVITAR PROCESAR EL MISMO MENSAJE DOS VECES
      // =================================================

      const messageId =
        message.id;

      if (!messageId) {
        return res.sendStatus(200);
      }

      if (
        processedMessages.has(
          messageId
        )
      ) {
        console.log(
          "♻️ Mensaje duplicado ignorado:",
          messageId
        );

        return res.sendStatus(200);
      }

      processedMessages.set(
        messageId,
        Date.now()
      );


      // =================================================
      // LIMPIEZA DE MEMORIA
      // =================================================

      const limite24h =
        Date.now() -
        24 * 60 * 60 * 1000;

      for (
        const [id, timestamp]
        of processedMessages
      ) {
        if (
          timestamp < limite24h
        ) {
          processedMessages.delete(id);
        }
      }

      for (
        const [id, item]
        of sentCatalogMessages
      ) {
        if (
          item.timestamp < limite24h
        ) {
          sentCatalogMessages.delete(id);
        }
      }

      for (
        const [numero, item]
        of lastReplies
      ) {
        if (
          item.timestamp < limite24h
        ) {
          lastReplies.delete(numero);
        }
      }


      const from =
        message.from;

      const now =
        Date.now();


      // =================================================
      // AUDIO / FOTO / DOCUMENTO DEL CLIENTE
      // =================================================
      //
      // No intentamos interpretar archivos del cliente.
      // Se deriva a humano.
      //
      // Esto evita que el bot responda tonteras después
      // de un comprobante, audio o foto antigua.
      // =================================================

      if (
        [
          "audio",
          "image",
          "document"
        ].includes(
          message.type
        )
      ) {
        console.log(
          `📎 Mensaje ${message.type} recibido de ${from}. Se deriva a humano.`
        );

        pausarBotPorHumano(
          from
        );

        return res.sendStatus(200);
      }


      // =================================================
      // SOLO PROCESAR TEXTO
      // =================================================

      if (
        message.type !== "text"
      ) {
        return res.sendStatus(200);
      }


      const rawText =
        message.text?.body || "";

      const text =
        normalizarTexto(
          rawText
        );


      // =================================================
      // SABER SI RESPONDIÓ UNA FOTO DEL CATÁLOGO ACTUAL
      // =================================================

      const repliedMessageId =
        message.context?.id ||
        null;

      const currentIds =
        currentCatalogMessageIds.get(
          from
        );

      const repliedCatalogItem =
        (
          repliedMessageId &&
          currentIds?.has(
            repliedMessageId
          )
        )
          ? sentCatalogMessages.get(
              repliedMessageId
            )
          : null;


      // =================================================
      // SESIÓN ACTIVA 24 HORAS
      // =================================================

      const sessionUntil =
        activeConversations.get(
          from
        ) || 0;

      const isNewConversation =
        now > sessionUntil;

      activeConversations.set(
        from,
        now +
          CONVERSATION_SESSION_MS
      );


      // =================================================
      // SI ESTÁ EN MODO HUMANO, BOT CALLADO
      // =================================================

      if (
        !botPuedeResponder(from)
      ) {
        const humanUntil =
          humanModeUntil.get(
            from
          );

        console.log(
          `👤 Modo humano activo para ${from} hasta ${new Date(
            humanUntil
          ).toISOString()}`
        );

        return res.sendStatus(200);
      }


      // =================================================
      // SOLICITA HABLAR CON PERSONA
      // =================================================

      if (
        esSolicitudHumano(text)
      ) {
        await enviarTextoWhatsApp(
          phoneNumberId,
          from,
          "Perfecto 💎 Te ayudaremos personalmente por este medio a la brevedad."
        );

        pausarBotPorHumano(
          from
        );

        return res.sendStatus(200);
      }


      // =================================================
      // CLIENTE DICE QUE YA PAGÓ
      // =================================================

      if (
        esAvisoPagoRealizado(text)
      ) {
        await enviarTextoWhatsApp(
          phoneNumberId,
          from,
          "¡Recibido! 💎 Un vendedor revisará tu pago y continuará contigo por este medio."
        );

        pausarBotPorHumano(
          from
        );

        return res.sendStatus(200);
      }


      // =================================================
      // CATÁLOGO
      // =================================================

      if (
        esSolicitudCatalogo(text)
      ) {
        // Si ya estamos enviando catálogo,
        // NO empezar otro en paralelo.
        if (
          catalogInProgress.has(
            from
          )
        ) {
          console.log(
            `📚 Catálogo ya en proceso para ${from}. Solicitud repetida ignorada.`
          );

          return res.sendStatus(200);
        }

        catalogInProgress.add(
          from
        );

        // Respondemos a Meta inmediatamente.
        res.sendStatus(200);

        enviarCatalogoCompleto(
          phoneNumberId,
          from
        )
          .catch(
            error => {
              console.error(
                "ERROR EN ENVÍO DE CATÁLOGO:",
                error
              );
            }
          )
          .finally(
            () => {
              catalogInProgress.delete(
                from
              );
            }
          );

        return;
      }


      // =================================================
      // DETECTAR SELECCIÓN DE LOTE
      // =================================================

      const esSeleccionLote =
        contieneAlguna(
          text,
          [
            "quiero este",
            "quiero ese",

            "me interesa",

            "agregame",
            "agrega este",
            "agrega ese",

            "quiero el lote",
            "quiero este lote",

            "me llevo",

            "este tambien",
            "ese tambien"
          ]
        );


      let reply =
        null;


      // =================================================
      // LOTE RESPONDIDO SOBRE FOTO DEL CATÁLOGO ACTUAL
      // =================================================

      if (
        esSeleccionLote &&
        repliedCatalogItem
      ) {
        const pedido =
          customerOrders.get(
            from
          ) || [];

        // Usamos nombre del archivo Drive,
        // no mediaId, porque mediaId cambia
        // cada vez que se sube a WhatsApp.
        const yaExiste =
          pedido.some(
            item =>
              item.nombre ===
              repliedCatalogItem.nombre
          );

        if (!yaExiste) {
          pedido.push({
            nombre:
              repliedCatalogItem.nombre,

            mediaId:
              repliedCatalogItem.mediaId,

            driveFileId:
              repliedCatalogItem.driveFileId,

            seleccionadoEn:
              Date.now()
          });

          customerOrders.set(
            from,
            pedido
          );

          reply =
            `Perfecto 💎, agregué ese lote a tu pedido. ` +
            `Llevas ${pedido.length} lote` +
            `${pedido.length === 1 ? "" : "s"} seleccionado` +
            `${pedido.length === 1 ? "" : "s"}. ` +
            `¿Quieres agregar otro?`;

        } else {
          reply =
            `Ese lote ya estaba agregado a tu pedido 💎. ` +
            `Actualmente llevas ${pedido.length} lote` +
            `${pedido.length === 1 ? "" : "s"}.`;
        }
      }


      else if (
        esSeleccionLote &&
        !repliedCatalogItem
      ) {
        reply =
          "Perfecto 💎. Para identificar exactamente cuál lote quieres, respóndeme directamente sobre una de las fotos del catálogo actualizado que te enviamos en este chat.";
      }


      // =================================================
      // RESPUESTAS AUTOMÁTICAS
      // =================================================

      if (!reply) {


        // =================================================
        // DOS ENVÍOS / UNIR PEDIDOS
        // =================================================

        if (
          contieneAlguna(
            text,
            [
              "2 envios",
              "dos envios",

              "pagar 2 envios",
              "pagar dos envios",

              "mismo envio",

              "juntar envio",
              "juntar los envios",

              "agregar al envio",
              "sumar al envio",

              "mandar junto",
              "enviar junto"
            ]
          )
        ) {
          reply =
            "Si tu pedido todavía no ha sido despachado 💎, podemos revisar si es posible agregar el nuevo lote al mismo envío para evitar pagar dos veces. Envíame cuál quieres agregar y lo revisamos.";
        }


        // =================================================
        // DIRECCIÓN
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "direccion",
              "ubicacion",
              "donde estan",
              "donde se ubican",
              "donde quedan"
            ]
          )
        ) {
          reply =
            "📍 Estamos en Eliodoro Yáñez 1200, Providencia, oficina 1004, piso 10.";
        }


        // =================================================
        // HORARIOS
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "horario",
              "atienden",
              "abren",
              "hora de atencion",
              "que hora atienden"
            ]
          )
        ) {
          reply =
            "🕒 Horarios de atención:\n" +
            "Lunes a viernes: 12:30 a 19:00\n" +
            "Sábado: 12:00 a 16:00";
        }


        // =================================================
        // MEDIO KILO
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "medio kilo",
              "1/2 kilo",
              "medio kg",

              "precio medio kilo",
              "precios medio kilo",

              "valor medio kilo",
              "valores medio kilo"
            ]
          )
        ) {
          reply =
            "💎 Precios por medio kilo:\n\n" +
            "• Medio kilo cadenas y pulseras hombre: $250.000\n" +
            "• Medio kilo pulseras mujer: $325.000\n" +
            "• Medio kilo aros y medallas: $500.000";
        }


        // =================================================
        // KILO
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "por kilo",
              "precio kilo",
              "precios kilo",
              "valor kilo",
              "valores kilo"
            ]
          )

          ||

          text === "kilo"

          ||

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


        // =================================================
        // GRAMO
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "por gramo",
              "valor del gramo",
              "precio del gramo",
              "precios por gramo",
              "valores por gramo"
            ]
          )

          ||

          text === "gramo"
        ) {
          reply =
            "💎 Valores por gramo:\n\n" +
            "• Cadenas y pulseras hombre: $650 el gramo\n" +
            "• Pulseras mujer: $700 el gramo\n" +
            "• Aros y medallas microcircon: $1.150 el gramo\n" +
            "• Anillos de dama: $1.400 el gramo\n\n" +
            "También trabajamos plata italiana a $2.800 el gramo.";
        }


        // =================================================
        // PRECIOS GENERALES
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "precio",
              "precios",
              "valor",
              "valores",
              "cuanto sale",
              "cuanto vale"
            ]
          )
        ) {
          reply =
            "💎 Trabajamos valores por gramo, medio kilo y kilo.\n\n" +
            "Si deseas un valor específico, puedes escribir por ejemplo:\n" +
            "• valor del gramo\n" +
            "• medio kilo\n" +
            "• kilo";
        }


        // =================================================
        // PREGUNTA SOBRE COMPROBANTES
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "cuando mandan comprobante",
              "cuando envian comprobante",
              "cuando mandan los comprobantes",
              "cuando envian los comprobantes"
            ]
          )
        ) {
          reply =
            "📩 Los comprobantes se envían durante la noche del mismo día.";
        }


        // =================================================
        // HORA DEL ENVÍO
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "a que hora envian",
              "a que hora despachan",
              "horario de envio",
              "hora envio",
              "hora despacho",
              "en que horario envian"
            ]
          )
        ) {
          reply =
            "🚚 Los envíos se realizan durante la tarde del día correspondiente.";
        }


        // =================================================
        // DÍAS / EMPRESAS DE ENVÍO
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "que dias envian",
              "dias de envio",
              "cuando despachan",
              "por donde envian",
              "empresa de envio",
              "empresas de envio",
              "que empresa usan",
              "que empresas usan"
            ]
          )
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


        // =================================================
        // TIPO DE PLATA
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "tipo de plata",
              "que plata trabajan",
              "trabajan plata",
              "son de plata",
              "de que material son",
              "material"
            ]
          )
        ) {
          reply =
            "💎 Trabajamos plata italiana y plata nacional. La plata italiana tiene un valor de $2.800 el gramo.";
        }


        // =================================================
        // PERSONALIZADO / ELECCIÓN
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "personalizado",
              "personalizada",
              "a eleccion",
              "elegir",
              "escoger",
              "unitario",
              "unitarios"
            ]
          )
        ) {
          reply =
            "💎 La compra a elección o personalizada se realiza solo presencial en oficina.\n\n" +

            "Por este medio trabajamos con lotes listos disponibles.\n\n" +

            "También puedes revisar productos unitarios en nuestra web:\n" +

            "www.joyasplatarm.com";
        }


        // =================================================
        // WEB
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "pagina web",
              "sitio web",
              "la web",
              "web"
            ]
          )
        ) {
          reply =
            "🌐 Puedes revisar productos unitarios a elección en nuestra web:\n" +
            "www.joyasplatarm.com";
        }


        // =================================================
        // VISITA PRESENCIAL
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "agendar",
              "agendo",
              "visita",
              "quiero ir",
              "presencial",
              "puedo ir ahora",
              "se puede ir ahora",
              "puedo pasar ahora",
              "puedo ir hoy"
            ]
          )
        ) {
          reply =
            "📅 Si deseas visitarnos, indícanos por favor:\n" +

            "• Nombre y apellido\n" +

            "• Día\n" +

            "• Hora estimada\n\n" +

            "Así confirmamos disponibilidad por este medio.";
        }


        // =================================================
        // SALUDO
        // =================================================

        else if (
          contieneAlguna(
            text,
            [
              "hola",
              "buenas",
              "buenos dias",
              "buenas tardes",
              "buenas noches"
            ]
          )
        ) {
          // No repetir el mensaje largo durante
          // una conversación activa.
          if (isNewConversation) {
            reply =
              WELCOME_MESSAGE;
          } else {
            reply =
              "¡Hola! 💎 ¿En qué te puedo ayudar?";
          }
        }


        // =================================================
        // CONVERSACIÓN NUEVA
        // =================================================

        else if (
          isNewConversation
        ) {
          reply =
            WELCOME_MESSAGE;
        }
      }


      // =================================================
      // SI NO ENTIENDE, NO RESPONDER CUALQUIER COSA
      // =================================================

      if (!reply) {
        console.log(
          `🤐 Sin respuesta automática para ${from}: "${rawText}"`
        );

        return res.sendStatus(200);
      }


      // =================================================
      // REVISAR NUEVAMENTE MODO HUMANO
      // =================================================

      if (
        !botPuedeResponder(from)
      ) {
        console.log(
          `👤 Conversación tomada por humano: ${from}`
        );

        return res.sendStatus(200);
      }


      // =================================================
      // EVITAR REPETIR EXACTAMENTE LA MISMA RESPUESTA
      // =================================================

      const previous =
        lastReplies.get(
          from
        );

      if (
        previous &&

        previous.reply === reply &&

        now -
          previous.timestamp <
          REPLY_COOLDOWN_MS
      ) {
        console.log(
          `♻️ Respuesta repetida evitada para ${from}`
        );

        return res.sendStatus(200);
      }


      // =================================================
      // ENVIAR RESPUESTA
      // =================================================

      await enviarTextoWhatsApp(
        phoneNumberId,
        from,
        reply
      );

      lastReplies.set(
        from,
        {
          reply,

          timestamp:
            now
        }
      );

      return res.sendStatus(200);


    } catch (error) {
      console.error(
        "❌ ERROR EN WEBHOOK:",
        error
      );

      // Respondemos 200 para evitar que Meta
      // reintente el mismo webhook una y otra vez.
      return res.sendStatus(200);
    }
  }
);


// =====================================================
// SERVIDOR
// =====================================================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  () => {
    console.log(
      `✅ Servidor corriendo en puerto ${PORT}`
    );
  }
);