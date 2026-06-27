const TELEGRAM_TOKEN = 'ضع_توكن_البوت_هنا'; // ⚠️ استبدله

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // معالجة CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    try {
      // فحص صحة
      if (path === '/ping') {
        return jsonResponse({ pong: true });
      }

      // جلب معلومات قناة (لا تخزين)
      if (path === '/resolve_channel' && request.method === 'POST') {
        const body = await request.json();
        const username = (body.username || '').replace('@', '').trim();
        if (!username) return jsonResponse({ error: 'معرف القناة مطلوب' }, 400);

        const tgResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getChat?chat_id=@${username}`);
        const tgData = await tgResp.json();
        if (!tgData.ok) {
          return jsonResponse({ error: 'تأكد أن البوت مشرف في القناة' }, 400);
        }

        const chat = tgData.result;
        return jsonResponse({
          chat_id: chat.id,
          title: chat.title || username,
          username: username
        });
      }

      // نشر منشور
      if (path === '/publish' && request.method === 'POST') {
        const body = await request.json();
        const { chat_id, text, btn_name, btn_url, btn_icon } = body;
        if (!chat_id || !text || !btn_name || !btn_url) {
          return jsonResponse({ error: 'جميع الحقول مطلوبة' }, 400);
        }

        const buttonText = `${btn_icon || ''} ${btn_name}`.trim();
        const replyMarkup = {
          inline_keyboard: [[{ text: buttonText, url: btn_url }]]
        };

        const payload = {
          chat_id,
          text,
          reply_markup: replyMarkup,
          parse_mode: 'HTML'
        };

        const tgResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const tgData = await tgResp.json();
        if (tgData.ok) return jsonResponse({ message: 'تم النشر بنجاح' });
        return jsonResponse({ error: tgData.description || 'فشل النشر' }, 500);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }
};
