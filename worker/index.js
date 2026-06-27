const TELEGRAM_TOKEN = '8991560932:AAEQUMZkOAdx7mj0fb41A5e4S0sEvnCdrE4'; // ⚠️ استبدله

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    try {
      if (path === '/ping') return jsonResponse({ pong: true });

      if (path === '/channels' && request.method === 'GET') {
        const raw = await env.CHANNELS_KV.get('channels_list');
        return jsonResponse(raw ? JSON.parse(raw) : []);
      }

      if (path === '/add_channel' && request.method === 'POST') {
        const { username } = await request.json();
        const clean = username.replace('@', '').trim();
        if (!clean) return jsonResponse({ error: 'معرف مطلوب' }, 400);

        const tgResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getChat?chat_id=@${clean}`);
        const tgData = await tgResp.json();
        if (!tgData.ok) return jsonResponse({ error: 'تأكد أن البوت مشرف' }, 400);

        const chat = tgData.result;
        const newCh = { chat_id: chat.id, title: chat.title || clean, username: clean };

        const raw = await env.CHANNELS_KV.get('channels_list');
        const channels = raw ? JSON.parse(raw) : [];
        if (channels.some(ch => ch.chat_id === newCh.chat_id)) return jsonResponse({ error: 'مضافة مسبقاً' }, 409);

        channels.push(newCh);
        await env.CHANNELS_KV.put('channels_list', JSON.stringify(channels));
        return jsonResponse({ message: 'تمت الإضافة', channel: newCh });
      }

      if (path === '/delete_channel' && request.method === 'POST') {
        const { chat_id } = await request.json();
        const raw = await env.CHANNELS_KV.get('channels_list');
        let channels = raw ? JSON.parse(raw) : [];
        channels = channels.filter(ch => ch.chat_id != chat_id);
        await env.CHANNELS_KV.put('channels_list', JSON.stringify(channels));
        return jsonResponse({ message: 'تم الحذف' });
      }

      if (path === '/publish' && request.method === 'POST') {
        const { chat_id, text, btn_name, btn_url, btn_icon } = await request.json();
        if (!chat_id || !text || !btn_name || !btn_url) return jsonResponse({ error: 'حقول ناقصة' }, 400);

        const replyMarkup = { inline_keyboard: [[{ text: `${btn_icon||''} ${btn_name}`.trim(), url: btn_url }]] };
        const tgResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id, text, reply_markup, parse_mode: 'HTML' })
        });
        const tgData = await tgResp.json();
        if (tgData.ok) return jsonResponse({ message: 'تم النشر' });
        return jsonResponse({ error: tgData.description }, 500);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }
};
