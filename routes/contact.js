const express = require("express");
const { Resend } = require("resend");
const { z } = require("zod");
const { rateLimit } = require("express-rate-limit");

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
});

const contactSchema = z.object({
  method: z.enum(["email", "telegram"]),

  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters long")
    .max(80, "Name is too long"),

  email: z
    .union([z.string().trim().email("Invalid email address"), z.literal("")])
    .optional(),

  subject: z.string().trim().max(120).optional().default(""),

  telegramUsername: z.string().trim().max(64).optional().default(""),

  message: z
    .string()
    .trim()
    .min(5, "Message must be at least 5 characters long")
    .max(3000, "Message is too long"),
});

function escapeHTML(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

router.post("/", contactLimiter, async (req, res, next) => {
  try {
    const validation = contactSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: "Form data is invalid",
        fields: validation.error.flatten().fieldErrors,
      });
    }

    const {
      method,
      name,
      email,
      subject,
      telegramUsername,
      message,
    } = validation.data;

    if (method === "email") {
      if (!email) {
        return res.status(400).json({
          success: false,
          error: "Email address is required",
        });
      }

      const apiKey = process.env.RESEND_API_KEY;
      const destinationEmail = process.env.CONTACT_TO_EMAIL;

      if (!apiKey || !destinationEmail) {
        console.error("Resend environment variables are missing");

        return res.status(500).json({
          success: false,
          error: "Server configuration is incomplete",
        });
      }

      const resend = new Resend(apiKey);

      const formattedMessage = escapeHTML(message).replace(
        /\n/g,
        "<br />",
      );

      const { error } = await resend.emails.send({
        from:
          process.env.RESEND_FROM ||
          "Portfolio Contact <onboarding@resend.dev>",

        to: destinationEmail,
        replyTo: email,
        subject: subject || `Yeni portfolio mesajı — ${name}`,

        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Yeni portfolio mesajı</h2>

            <p>
              <strong>Ad:</strong>
              ${escapeHTML(name)}
            </p>

            <p>
              <strong>E-poçt:</strong>
              ${escapeHTML(email)}
            </p>

            <p>
              <strong>Mövzu:</strong>
              ${subject ? escapeHTML(subject) : "Qeyd edilməyib"}
            </p>

            <hr />

            <p><strong>Mesaj:</strong></p>
            <p>${formattedMessage}</p>
          </div>
        `,
      });

      if (error) {
        console.error("Resend error:", error);

        return res.status(502).json({
          success: false,
          error: "Failed to send email",
        });
      }

      return res.json({
        success: true,
        message: "Email sent successfully",
      });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.error("Telegram environment variables are missing");

      return res.status(500).json({
        success: false,
        error: "Server configuration is incomplete",
      });
    }

    const safeName = escapeHTML(name);
    const safeUsername = escapeHTML(telegramUsername);
    const safeMessage = escapeHTML(message);

    const telegramText = [
      "📩 <b>Yeni Portfolio Mesajı</b>",
      "",
      `👤 <b>Ad:</b> ${safeName}`,
      safeUsername
        ? `💬 <b>Telegram:</b> ${safeUsername}`
        : "",
      "",
      "<b>Mesaj:</b>",
      safeMessage,
    ]
      .filter(Boolean)
      .join("\n");

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: telegramText,
          parse_mode: "HTML",
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!telegramResponse.ok) {
      const telegramError = await telegramResponse.text();
      console.error("Telegram error:", telegramError);

      return res.status(502).json({
        success: false,
        error: "Failed to send Telegram message",
      });
    }

    return res.json({
      success: true,
      message: "Telegram message sent successfully",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;