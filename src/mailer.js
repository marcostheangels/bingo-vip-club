const { Resend } = require('resend');

let resend = null;
let destino = null;
let fromAddress = null;

function init() {
  const apiKey = process.env.RESEND_API_KEY;
  destino = process.env.NOTIFY_EMAIL;
  fromAddress = process.env.MAIL_FROM || 'Bingo VIP Club <onboarding@resend.dev>';
  if (!apiKey || !destino) {
    console.warn('[mailer] Notificações por e-mail DESATIVADAS (defina RESEND_API_KEY e NOTIFY_EMAIL no .env).');
    return;
  }
  resend = new Resend(apiKey);
}

// Envia uma notificação para o e-mail do admin (fire-and-forget, nunca quebra o fluxo).
function notificar(subject, html) {
  return new Promise((resolve) => {
    if (!resend || !destino) return resolve(false);
    resend.emails.send({ from: fromAddress, to: [destino], subject, html })
      .then(() => { console.log('[mailer] Notificação enviada:', subject); resolve(true); })
      .catch((err) => { console.error('[mailer] Falha ao enviar:', (err && err.message) || err); resolve(false); });
  });
}

init();

module.exports = { notificar };
