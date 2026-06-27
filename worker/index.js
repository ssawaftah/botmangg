const TELEGRAM_TOKEN = '8991560932:AAEQUMZkOAdx7mj0fb41A5e4S0sEvnCdrE4'; // ⚠️ توكن مؤقت
const ADMIN_ID = 8361984521; // ⚠️ ضع ID حسابك التليجرامي الرقمي

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
  // ========== رسائل عادية ==========
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    const photo = msg.photo;
    const video = msg.video;
    const document = msg.document;

    if (userId !== ADMIN_ID) {
      await sendToTelegram('sendMessage', { chat_id: chatId, text: '⚠️ هذا البوت خاص بالإدارة فقط.' });
      return;
    }

    // ========== أمر /start ==========
    if (text === '/start') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '📝 إنشاء منشور جديد', callback_data: 'create_post' }],
          [{ text: '📢 إدارة القنوات', web_app: { url: 'https://YOUR_PAGES.pages.dev' } }]
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
      // إنشاء أو تحديث المحتوى المؤقت
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
          [{ text: '💾 حفظ المحتوى', callback_data: 'save_content' }],
          [{ text: '➕ إضافة جزء آخر', callback_data: 'add_more' }],
          [{ text: '🔘 إنشاء الأزرار', web_app: { url: 'https://YOUR_PAGES.pages.dev/buttons' } }]
        ]
      };

      await sendToTelegram('sendMessage', {
        chat_id: chatId,
        text: `✅ تم استلام ${post.parts.length} أجزاء.\nيمكنك إضافة المزيد أو إنشاء الأزرار.`,
        reply_markup: keyboard
      });
      return;
    }

    // ========== أمر /cancel ==========
    if (text === '/cancel') {
      await env.CHANNELS_KV.delete(stateKey);
      await env.CHANNELS_KV.delete(`post_${userId}`);
      await sendToTelegram('sendMessage', { chat_id: chatId, text: 'تم إلغاء العملية.' });
      return;
    }
  }

  // ========== Callback Queries ==========
  if (update.callback_query) {
    const query = update.callback_query;
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;

    if (userId !== ADMIN_ID) return;

    // إنشاء منشور جديد
    if (data === 'create_post') {
      await env.CHANNELS_KV.put(`state_${userId}`, JSON.stringify({ waitingForContent: true }));
      await env.CHANNELS_KV.delete(`post_${userId}`);
      await sendToTelegram('sendMessage', {
        chat_id: chatId,
        text: '📝 أرسل المحتوى الآن (نص، صورة، فيديو، ملف).\nيمكنك إرسال عدة أجزاء.\n\nعند الانتهاء اضغط "حفظ المحتوى".\nللإلغاء: /cancel'
      });
    }

    // حفظ المحتوى
    if (data === 'save_content') {
      const postRaw = await env.CHANNELS_KV.get(`post_${userId}`);
      if (!postRaw) {
        await sendToTelegram('sendMessage', { chat_id: chatId, text: 'لا يوجد محتوى محفوظ.' });
        return;
      }
      await env.CHANNELS_KV.put(`state_${userId}`, JSON.stringify({ waitingForButtons: true }));
      const keyboard = {
        inline_keyboard: [
          [{ text: '🔘 إنشاء الأزرار', web_app: { url: 'https://YOUR_PAGES.pages.dev/buttons' } }],
          [{ text: '📤 تخطي ونشر مباشرة', callback_data: 'publish_now' }]
        ]
      };
      await sendToTelegram('sendMessage', {
        chat_id: chatId,
        text: '✅ تم حفظ المحتوى!\nالآن يمكنك إنشاء أزرار للمنشور أو النشر مباشرة.',
        reply_markup: keyboard
      });
    }

    // إضافة المزيد
    if (data === 'add_more') {
      await sendToTelegram('sendMessage', {
        chat_id: chatId,
        text: 'أرسل المزيد من المحتوى (نص، صورة، فيديو، ملف).'
      });
    }

    // نشر مباشر بدون أزرار
    if (data === 'publish_now') {
      // هنا منطق النشر - سنطوره لاحقاً
      await sendToTelegram('sendMessage', { chat_id: chatId, text: '📤 جاري النشر...' });
      await env.CHANNELS_KV.delete(`state_${userId}`);
      await env.CHANNELS_KV.delete(`post_${userId}`);
    }
  }
}

// ========== نقطة API لاستقبال بيانات الأزرار من Mini App ==========
async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  
  // استقبال بيانات الأزرار
  if (url.pathname === '/save_buttons' && request.method === 'POST') {
    const body = await request.json();
    const userId = body.userId;
    const buttons = body.buttons;
    
    // حفظ الأزرار مع المنشور
    const postRaw = await env.CHANNELS_KV.get(`post_${userId}`);
    if (!postRaw) return jsonResponse({ error: 'لا يوجد منشور محفوظ' }, 400);
    
    const post = JSON.parse(postRaw);
    post.buttons = buttons;
    await env.CHANNELS_KV.put(`post_${userId}`, JSON.stringify(post));
    
    return jsonResponse({ success: true, message: 'تم حفظ الأزرار' });
  }

  // Webhook للبوت
  if (url.pathname === '/webhook' && request.method === 'POST') {
    const update = await request.json();
    await handleUpdate(update, env);
    return jsonResponse({ ok: true });
  }

  if (url.pathname === '/ping') return jsonResponse({ pong: true });
  
  return jsonResponse({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    return handleApiRequest(request, env);
  }
};
