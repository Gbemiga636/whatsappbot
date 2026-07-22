const BaseService = require('../BaseService');
const ai = require('../../providers/openai');
const config = require('../../config');

class AiAssistantService extends BaseService {
  constructor() {
    super('ai', { name: 'AI Assistant', emoji: '🤖', description: 'Your personal AI helper',
      steps: { CHAT: 'ai_chat', AD_GENERATE: 'ad_generate' } });
  }

  async showMenu(ctx) {
    await this.list(ctx.phone, '*🤖 AI Assistant*\n\nI can help with anything — just ask!', 'AI menu', [{
      title: 'Quick actions',
      rows: [
        { id: 'ai_chat', title: '💬 Ask anything', description: 'General assistant' },
        { id: 'ai_ad_flyer', title: '🎨 Generate flyer', description: 'AI ad creative' },
        { id: 'ai_ad_caption', title: '✍️ Social caption', description: 'Facebook/Instagram' },
        { id: 'ai_ad_video', title: '🎬 Video ad script', description: 'Video campaign' },
      ],
    }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU });
  }

  async handle(ctx) {
    if (this.isHome(ctx.text)) return this.goHome(ctx.phone);
    if (this.isCancel(ctx.text)) { await this.reply(ctx.phone, 'Cancelled.'); return this.goHome(ctx.phone); }

    const { choice, step, data, text } = ctx;

    if (choice === 'ai_chat' || step === this.STEPS.CHAT) {
      if (!text) {
        await this.reply(ctx.phone, 'Ask me anything! I can help with payments, orders, ads, homework, and more.');
        await this.updateSession(ctx.phone, { step: this.STEPS.CHAT });
        return;
      }
      await this.reply(ctx.phone, '⏳ Thinking...');
      const response = await ai.chat({
        messages: [
          { role: 'system', content: 'You are Bygate AI, Africa\'s WhatsApp super app assistant. Be helpful, concise, and friendly. You help Nigerians with banking, bills, food, shopping, loans, travel, ads, education, and more. Keep responses under 500 words. Use WhatsApp formatting (*bold*, _italic_).' },
          ...(data.history || []).slice(-6),
          { role: 'user', content: text },
        ],
      });
      const history = [...(data.history || []), { role: 'user', content: text }, { role: 'assistant', content: response.text }];
      await this.reply(ctx.phone, response.text);
      await this.updateSession(ctx.phone, { step: this.STEPS.CHAT, data: { history } });
      return;
    }

    const adTypes = { ai_ad_flyer: 'flyer', ai_ad_caption: 'social media caption', ai_ad_video: 'video ad script' };
    if (adTypes[choice]) {
      await this.reply(ctx.phone, `Describe your business/product for the ${adTypes[choice]}:`);
      await this.updateSession(ctx.phone, { step: this.STEPS.AD_GENERATE, data: { adType: adTypes[choice] } });
      return;
    }

    if (step === this.STEPS.AD_GENERATE && text) {
      await this.reply(ctx.phone, '⏳ Generating...');
      const response = await ai.chat({
        messages: [
          { role: 'system', content: `Generate a professional ${data.adType} for a Nigerian business. Be creative and market-ready.` },
          { role: 'user', content: text },
        ],
      });
      await this.reply(ctx.phone, `*Your ${data.adType}:*\n\n${response.text}\n\n_Type *menu* for home or describe another product._`);
      await this.updateSession(ctx.phone, { step: this.STEPS.CHAT, data: { history: [] } });
      return;
    }

    // Free-form chat when in AI service
    if (text) {
      await this.updateSession(ctx.phone, { step: this.STEPS.CHAT });
      return this.handle({ ...ctx, step: this.STEPS.CHAT, choice: 'ai_chat' });
    }

    return this.showMenu(ctx);
  }
}

module.exports = AiAssistantService;
