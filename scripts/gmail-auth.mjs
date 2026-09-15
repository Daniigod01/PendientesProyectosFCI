// Script de un solo uso: genera el GMAIL_REFRESH_TOKEN que necesita el
// backend para leer tu correo. Se corre UNA VEZ en tu computador (no en Vercel).
//
// Uso:
//   1. npm install googleapis open --no-save
//   2. GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/gmail-auth.mjs
//   3. Se abre una pestaña del navegador -> inicia sesión con tu correo de
//      la fundación -> acepta permisos de "solo lectura de Gmail".
//   4. El script imprime el refresh token: cópialo a la variable de entorno
//      GMAIL_REFRESH_TOKEN en Vercel.
import { google } from "googleapis";
import http from "node:http";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:53682/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Faltan GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET como variables de entorno.");
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/gmail.readonly"],
});

console.log("\nAbre esta URL en tu navegador e inicia sesión con tu correo de la fundación:\n");
console.log(authUrl + "\n");

const server = http
  .createServer(async (req, res) => {
    if (!req.url.startsWith("/oauth2callback")) return;
    const code = new URL(req.url, REDIRECT_URI).searchParams.get("code");
    res.end("Listo, ya puedes cerrar esta pestaña y volver a la terminal.");
    server.close();

    const { tokens } = await oAuth2Client.getToken(code);
    console.log("\n GMAIL_REFRESH_TOKEN:\n");
    console.log(tokens.refresh_token);
    console.log("\nCopia ese valor a la variable de entorno GMAIL_REFRESH_TOKEN en Vercel.\n");
  })
  .listen(53682);
