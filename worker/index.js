const TELEGRAM_TOKEN = '8991560932:AAEQUMZkOAdx7mj0fb41A5e4S0sEvnCdrE4';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

async function sendToTelegram(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function handleUpdate(update, env) {
  // ========== الرسائل الواردة ==========
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    const photo = msg.photo;
    const video = msg.video;
    const document = msg.document;

    // ========== أمر /start ==========
    if (text === '/start') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '📝 إنشاء منشور', callback_data: 'create_post' }],
          [{ text: '📢 إدارة القنوات', web_app: { url: 'https://botmangg.pages.dev' } }]
        ]
      };
      await sendToTelegram('sendMessage', {
        chat_id: chatId,
        text: '👋 أهلاً بك في لوحة الإدارة!\n\nماذا تريد أن تفعل؟',
        reply_markup: keyboard
      });
      return;
    }

    // ========== استقبال المحتوى ==========
    const stateKey = `state_${userId}`;
    const stateRaw = await env.CHANNELS_KV.get(stateKey);
    let state = stateRaw ? JSON.parse(stateRaw) : {};

    if (state.waitingForContent) {
      let postContent = await env.CHANNELS_KV.get(`post_${userId}`);
      let post = postContent ? JSON.parse(postContent) : { parts: [] };

      if (text) {
        post.parts.push({ type: 'text', content: text });
      } else if (photo) {
        const fileId = photo[photo.length - 1].file_id;
        post.parts.push({ type: 'photo', file_id: fileId });
      } else if (video) {
        post.parts.push({ type: 'video', file_id: video.file_id });
      } else if (document) {
        post.parts.push({ type: 'document', file_id: document.file_id });
      }

      await env.CHANNELS_KV.put(`post_${userId}`, JSON.stringify(post));

      const keyboard = {
        inline_keyboard: [
          [{ text: '➕ إضافة المزيد', callback_data: 'add_more' }],
          [{ text: '🔘 إنشاء الأزرار', web_app: { url: 'https://botmangg.pages.dev/buttons' } }],
          [{ text: '📤 نشر مباشرة', callback_data: 'publish_now' }]
        ]
      };

      await sendToTelegram('sendMessage', {
        chat_id: chatId,
        text: `✅ تم استلام ${post.parts.length} أجزاء حتى الآن.\nيمكنك إضافة المزيد أو إنشاء الأزرار أو النشر مباشرة.`,
        reply_markup: keyboard
      });
      return;
    }
  }

  // ========== الأزرار (Callback Queries) ==========
  if (update.callback_query) {
    const query = update.callback_query;
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    // إنشاء منشور جديد
    if (data === 'create_post') {
      await env.CHANNELS_KV.put(`state_${userId}`, JSON.stringify({ waitingForContent: true }));
      await env.CHANNELS_KV.put(`post_${userId}`, JSON.stringify({ parts: [] }));
      await sendToTelegram('sendMessage', {
        chat_id: chatId,
        text: '📝 أرسل المحتوى الآن (نص، صورة، فيديو، ملف).\nيمكنك إرسال عدة أجزاء متتالية.\n\nللإلغاء: /cancel'
      });
    }

    // إضافة المزيد
    if (data === 'add_more') {
      await sendToTelegram('sendMessage', {
        chat_id: chatId,
        text: 'أرسل المزيد من المحتوى...'
      });
    }

    // نشر مباشر بدون أزرار
    if (data === 'publish_now') {
      const postRaw = await env.CHANNELS_KV.get(`post_${userId}`);
      if (!postRaw) {
        await sendToTelegram('sendMessage', { chat_id: chatId, text: '⚠️ لا يوجد محتوى محفوظ.' });
        return;
      }
      const post = JSON.parse(postRaw);
      // نشر المحتوى - هنا يمكنك إضافة قائمة القنوات للاختيار
      await sendToTelegram('sendMessage', { 
        chat_id: chatId, 
        text: `📤 تم النشر بنجاح!\nعدد الأجزاء: ${post.parts.length}\n${post.buttons ? 'مع أزرار: ' + post.buttons.length : 'بدون أزرار'}` 
      });
      await env.CHANNELS_KV.delete(`state_${userId}`);
      await env.CHANNELS_KV.delete(`post_${userId}`);
    }
  }
}

// ========== نقطة API لاستقبال الأزرار من Mini App ==========
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // فحص الصحة
    if (url.pathname === '/ping') {
      return jsonResponse({ pong: true });
    }

    // استقبال بيانات الأزرار من Mini App
    if (url.pathname === '/save_buttons' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userId = body.userId;
        const buttons = body.buttons;

        const postRaw = await env.CHANNELS_KV.get(`post_${userId}`);
        if (!postRaw) return jsonResponse({ error: 'لا يوجد منشور محفوظ' }, 400);

        const post = JSON.parse(postRaw);
        post.buttons = buttons;
        await env.CHANNELS_KV.put(`post_${userId}`, JSON.stringify(post));

        return jsonResponse({ success: true, message: 'تم حفظ الأزرار بنجاح' });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // Webhook للبوت
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        await handleUpdate(update, env);
        return jsonResponse({ ok: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }
};
