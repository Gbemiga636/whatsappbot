/**
 * OpenAI — AI assistant, ad generation, tutoring.
 */

const axios = require('axios');
const config = require('../config');

const BASE = 'https://api.openai.com/v1';

async function chat({ messages, model, temperature, max_tokens }) {
  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    return {
      text: fallbackResponse(messages),
      simulated: true,
    };
  }

  try {
    const { data } = await axios.post(
      `${BASE}/chat/completions`,
      {
        model: model || config.openai.model,
        messages,
        max_tokens: max_tokens || 800,
        temperature: temperature ?? 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const text = data.choices?.[0]?.message?.content || 'I could not generate a response.';
    return { text, usage: data.usage };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { text: `AI temporarily unavailable: ${msg}\n\n_Add OPENAI_API_KEY to .env for full AI features._`, error: true };
  }
}

function fallbackResponse(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const q = (lastUser?.content || '').toLowerCase();

  if (/transfer|send money|bank/.test(q)) {
    return 'I can help you transfer money! Type *menu* → Banking → Transfer money.\n\nOr say: "Transfer ₦5000 to John"';
  }
  if (/airtime|data|mtn|glo/.test(q)) {
    return 'To buy airtime or data, type *menu* → Airtime & Data.\n\nOr say: "Buy MTN airtime ₦500"';
  }
  if (/electricity|bill|dstv|gotv/.test(q)) {
    return 'Pay bills from WhatsApp! Type *menu* → Bills & TV.\n\nOr say: "Pay electricity bill"';
  }
  if (/food|order|jollof|hungry/.test(q)) {
    return 'Hungry? Type *menu* → Food Delivery.\n\nOr say: "Order jollof rice around me"';
  }
  if (/ad|flyer|campaign|market/.test(q)) {
    return 'Create ads with AI! Type *menu* → Ads Studio.\n\nI can generate flyers, captions, and video scripts too.';
  }

  return (
    `*Bygate AI Assistant* 🤖\n\nI can help you with:\n` +
    `• Banking & transfers\n• Airtime & data\n• Bill payments\n• Food & shopping\n• Loans & travel\n• Ads & business tools\n\n` +
    `Type *menu* to see all services, or tell me what you need!\n\n` +
    `_Add OPENAI_API_KEY for full conversational AI._`
  );
}

module.exports = { chat };
