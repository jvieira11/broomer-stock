// Modelos dos e-mails do sistema. Cada um tem versão HTML e texto puro
// (alguns leitores de e-mail e filtros de spam preferem o texto).

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function passwordResetEmail(input: {
  name: string;
  link: string;
  expiresInMinutes: number;
}) {
  const name = escapeHtml(input.name);
  const link = escapeHtml(input.link);

  return {
    subject: 'Redefinir sua senha do Broomer Estoque',
    text: [
      `Olá, ${input.name}.`,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta no Broomer Estoque.',
      `Abra o link abaixo para criar uma senha nova (vale por ${input.expiresInMinutes} minutos e só pode ser usado uma vez):`,
      '',
      input.link,
      '',
      'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
    ].join('\n'),
    html: `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#3f3f46">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px">
      <tr><td style="padding:32px">
        <p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#18181b">Broomer Estoque</p>
        <p style="margin:0 0 12px">Olá, ${name}.</p>
        <p style="margin:0 0 24px">Recebemos um pedido para redefinir a senha da sua conta. Clique no botão para criar uma senha nova.</p>
        <p style="margin:0 0 24px">
          <a href="${link}" style="display:inline-block;padding:12px 20px;background:#059669;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">Criar senha nova</a>
        </p>
        <p style="margin:0 0 12px;font-size:13px">O link vale por ${input.expiresInMinutes} minutos e só pode ser usado uma vez.</p>
        <p style="margin:0;font-size:13px">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
