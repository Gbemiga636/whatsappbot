const BaseService = require('../BaseService');
const chowdeck = require('../../providers/chowdeck');
const wallet = require('../../wallet/walletService');
const { confirmAndPay } = require('../../wallet/purchaseHelper');
const {
  paginateItems,
  formatCatalogListRow,
  formatCatalogPagePreamble,
  formatProviderListRow,
  PAGE_SIZE,
} = require('../../utils/vtuCatalog');

const LAGOS_AREAS = [
  { id: 'ikeja', name: 'Ikeja', lat: 6.6018, lng: 3.3515 },
  { id: 'lekki', name: 'Lekki', lat: 6.4474, lng: 3.5562 },
  { id: 'vi', name: 'Victoria Island', lat: 6.4281, lng: 3.4219 },
  { id: 'yaba', name: 'Yaba', lat: 6.5158, lng: 3.3711 },
  { id: 'surulere', name: 'Surulere', lat: 6.4969, lng: 3.3587 },
  { id: 'ojodu', name: 'Ojodu', lat: 6.6568, lng: 3.3394 },
  { id: 'ikeja_gra', name: 'Ikeja GRA', lat: 6.5833, lng: 3.35 },
  { id: 'ajah', name: 'Ajah', lat: 6.4683, lng: 3.5832 },
];

class FoodService extends BaseService {
  constructor() {
    super('food', {
      name: 'Order Food',
      emoji: '🍔',
      description: 'Chowdeck — restaurants near you',
      steps: {
        LOCATION: 'food_location',
        STORES: 'food_stores',
        CATEGORIES: 'food_categories',
        ITEMS: 'food_items',
        QUANTITY: 'food_quantity',
        CART: 'food_cart',
        CONFIRM: 'food_confirm',
      },
    });
  }

  async showMenu(ctx) {
    if (!(await this.ensureAuth(ctx))) return;

    if (!chowdeck.isConfigured()) {
      await this.reply(
        ctx.phone,
        '⚠️ *Food ordering is not configured yet.*\n\nAdd `CHOWDECK_API_KEY` to your `.env` file and restart the bot.'
      );
      return;
    }

    const balance = await wallet.getBalance(ctx.phone);
    await this.reply(
      ctx.phone,
      `*🍔 Order Food (Chowdeck)*\n\nWallet: ${wallet.formatNaira(balance)}\n\n` +
        `First, share your *delivery location* so we can show restaurants near you — just like the Chowdeck app.`
    );
    await this.buttons(ctx.phone, 'How would you like to set your location?', [
      { id: 'food_loc_gps', title: '📍 Share location' },
      { id: 'food_loc_area', title: '🏙️ Pick area' },
      { id: 'food_cart_view', title: '🛒 My cart' },
    ]);
    await this.updateSession(ctx.phone, {
      step: this.STEPS.LOCATION,
      data: { food: { cart: [] } },
    });
  }

  buildLocationLabel(loc) {
    if (!loc) return 'your area';
    return loc.address || loc.name || loc.areaName || 'your location';
  }

  async saveLocationAndShowStores(ctx, location) {
    if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) {
      await this.reply(ctx.phone, 'Could not read that location. Try again or pick an area.');
      return this.showMenu(ctx);
    }

    await this.reply(ctx.phone, '⏳ Finding restaurants near you…');

    const result = await chowdeck.listVendors();
    if (!result.ok || !result.vendors.length) {
      await this.reply(ctx.phone, `❌ ${result.message || 'No restaurants available right now. Try again later.'}`);
      return this.showMenu(ctx);
    }

    const vendors = chowdeck.enrichVendors(result.vendors, location);
    const food = {
      cart: ctx.data?.food?.cart || [],
      location,
      vendors,
      storePage: 0,
    };

    await this.updateSession(ctx.phone, { step: this.STEPS.STORES, data: { food } });
    return this.showStores(ctx, food, 0);
  }

  async showStores(ctx, food, page = 0) {
    const { items, hasMore, total } = paginateItems(food.vendors, page);
    const rows = items.map((v, i) => {
      const open = Number(v.is_open) === 1 ? '🟢' : '🔴';
      const rating = v.average_rating ? `⭐${v.average_rating}` : '';
      const dist = v.distanceLabel || '';
      const row = formatProviderListRow({
        name: `${open} ${v.name}`,
        code: rating || v.location || 'Restaurant',
        subtitle: [dist, v.minOrderNaira ? `Min ₦${v.minOrderNaira}` : ''].filter(Boolean).join(' · '),
      });
      return {
        id: `food_store_p${page}_i${i}`,
        title: row.title,
        description: row.description,
      };
    });

    if (page > 0) {
      rows.unshift({ id: `food_store_page_${page - 1}`, title: '⬅️ Previous', description: 'Earlier stores' });
    }
    if (hasMore) {
      rows.push({ id: `food_store_page_${page + 1}`, title: '➡️ More stores', description: `Page ${page + 2}` });
    }

    const preamble = formatCatalogPagePreamble(items, {
      getLabel: (v) => v.name,
      getAmount: (v) => (v.minOrderNaira ? v.minOrderNaira * 100 : null),
    });

    await this.list(
      ctx.phone,
      `*Restaurants near ${this.buildLocationLabel(food.location)}*\n` +
        `${total} store(s) — page ${page + 1}\n\n` +
        `*On this page:*\n${preamble}\n\n` +
        `_Tap a restaurant to see the menu._`,
      'Restaurants',
      [{ title: 'Near you', rows: rows.slice(0, 10) }]
    );

    await this.updateSession(ctx.phone, {
      step: this.STEPS.STORES,
      data: { food: { ...food, storePage: page } },
    });
  }

  resolveStoreFromChoice(choice, food, page) {
    const m = String(choice || '').match(/^food_store_p(\d+)_i(\d+)$/);
    if (!m) return null;
    const idx = Number(m[2]);
    const p = Number(m[1]);
    const listPage = p === page ? page : p;
    const start = listPage * PAGE_SIZE;
    return food.vendors?.[start + idx] || null;
  }

  async showAreaPicker(ctx) {
    await this.list(ctx.phone, '*Pick your delivery area* (Lagos):', 'Areas', [{
      title: 'Lagos',
      rows: LAGOS_AREAS.map((a) => ({
        id: `food_area_${a.id}`,
        title: a.name,
        description: 'Show nearby restaurants',
      })),
    }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.LOCATION, data: ctx.data });
  }

  async loadVendorMenu(ctx, vendor) {
    await this.reply(ctx.phone, `⏳ Loading *${vendor.name}* menu…`);

    const [catRes, itemRes] = await Promise.all([
      chowdeck.listMenuCategories(vendor.reference),
      chowdeck.listMenuItems(vendor.reference),
    ]);

    if (!itemRes.ok || !itemRes.items.length) {
      await this.reply(ctx.phone, `❌ ${itemRes.message || 'Menu not available for this restaurant.'}`);
      return null;
    }

    let categories = catRes.ok ? catRes.categories : [];
    if (!categories.length) {
      const names = new Set();
      for (const item of itemRes.items) {
        const n = item.category?.name || (item.tags?.[0]?.name) || 'Menu';
        names.add(n);
      }
      categories = [...names].map((name, id) => ({ id, name, reference: `cat_${id}` }));
    }

    return {
      vendor,
      categories,
      items: itemRes.items,
      categoryPage: 0,
    };
  }

  async showCategories(ctx, food) {
    const { categories, vendor } = food;
    const { items, hasMore, total } = paginateItems(categories, food.categoryPage || 0);
    const page = food.categoryPage || 0;

    const rows = items.map((c, i) => ({
      id: `food_cat_p${page}_i${i}`,
      title: String(c.name || 'Category').slice(0, 24),
      description: `${c.food_count != null ? `${c.food_count} items` : 'View dishes'}`,
    }));

    if (page > 0) {
      rows.unshift({ id: `food_cat_page_${page - 1}`, title: '⬅️ Previous', description: 'Back' });
    }
    if (hasMore) {
      rows.push({ id: `food_cat_page_${page + 1}`, title: '➡️ More', description: 'Next page' });
    }
    rows.push({ id: 'food_cart_view', title: '🛒 View cart', description: 'Checkout' });

    await this.list(
      ctx.phone,
      `*${vendor.name}*\n📍 ${vendor.pretty_name || vendor.location || ''}\n\n` +
        `Pick a category (${total}):`,
      'Menu',
      [{ title: 'Categories', rows: rows.slice(0, 10) }]
    );

    await this.updateSession(ctx.phone, { step: this.STEPS.CATEGORIES, data: { food } });
  }

  resolveCategory(food, page, idx) {
    const start = page * PAGE_SIZE;
    return food.categories?.[start + idx] || null;
  }

  async showCategoryItems(ctx, food, category, page = 0) {
    const filtered = chowdeck.itemsForCategory(food.items, category);
    if (!filtered.length) {
      await this.reply(ctx.phone, 'No items in this category. Pick another.');
      return this.showCategories(ctx, food);
    }

    const { items, hasMore, total } = paginateItems(filtered, page);
    const rows = items.map((item, i) => {
      const row = formatCatalogListRow({ name: item.name, amount: item.price });
      return {
        id: `food_item_p${page}_i${i}`,
        title: row.title,
        description: row.description,
      };
    });

    if (page > 0) {
      rows.unshift({ id: `food_item_page_${page - 1}`, title: '⬅️ Previous', description: 'Back' });
    }
    if (hasMore) {
      rows.push({ id: `food_item_page_${page + 1}`, title: '➡️ More', description: 'Next' });
    }
    rows.push({ id: 'food_back_cats', title: '⬅️ Categories', description: 'Back to menu' });
    rows.push({ id: 'food_cart_view', title: '🛒 Cart', description: 'View cart' });

    const preamble = formatCatalogPagePreamble(items, {
      getLabel: (item) => item.name,
      getAmount: (item) => item.price,
    });

    await this.list(
      ctx.phone,
      `*${food.vendor.name}* — *${category.name}*\n${total} item(s)\n\n` +
        `${preamble}\n\n_Tap to add to cart._`,
      'Dishes',
      [{ title: category.name.slice(0, 24), rows: rows.slice(0, 10) }]
    );

    await this.updateSession(ctx.phone, {
      step: this.STEPS.ITEMS,
      data: {
        food: {
          ...food,
          activeCategory: category,
          categoryItems: filtered,
          itemPage: page,
        },
      },
    });
  }

  resolveMenuItem(food, page, idx) {
    const filtered = food.categoryItems || chowdeck.itemsForCategory(food.items, food.activeCategory);
    const start = page * PAGE_SIZE;
    return filtered[start + idx] || null;
  }

  async promptQuantity(ctx, food, item) {
    await this.buttons(
      ctx.phone,
      `*${item.name}*\n${chowdeck.formatNaira(item.price)} each\n\nHow many?`,
      [
        { id: 'food_qty_1', title: '1' },
        { id: 'food_qty_2', title: '2' },
        { id: 'food_qty_3', title: '3' },
        { id: 'food_qty_more', title: 'Other qty' },
      ]
    );
    await this.updateSession(ctx.phone, {
      step: this.STEPS.QUANTITY,
      data: { food: { ...food, pendingItem: item } },
    });
  }

  addToCart(cart, item, qty) {
    const next = [...(cart || [])];
    const existing = next.find((l) => l.reference === item.reference);
    if (existing) {
      existing.quantity += qty;
    } else {
      next.push({
        reference: item.reference,
        name: item.name,
        priceKobo: item.price,
        quantity: qty,
      });
    }
    return next;
  }

  cartSubtotalKobo(cart) {
    return (cart || []).reduce((sum, l) => sum + l.priceKobo * l.quantity, 0);
  }

  formatCartSummary(cart) {
    if (!cart?.length) return '_Your cart is empty._';
    return cart
      .map((l, i) => `${i + 1}. ${l.quantity}× ${l.name} — ${chowdeck.formatNaira(l.priceKobo * l.quantity)}`)
      .join('\n');
  }

  async showCart(ctx, food) {
    const subtotal = this.cartSubtotalKobo(food.cart);
    const body =
      `*🛒 Your cart*\n` +
      `Restaurant: *${food.vendor?.name || '—'}*\n` +
      `Deliver to: ${this.buildLocationLabel(food.location)}\n\n` +
      `${this.formatCartSummary(food.cart)}\n\n` +
      `*Subtotal:* ${chowdeck.formatNaira(subtotal)}`;

    const buttons = [{ id: 'food_checkout', title: '✅ Checkout' }];
    if (food.vendor) {
      buttons.push({ id: 'food_back_cats', title: '➕ Add more' });
    }
    buttons.push({ id: 'food_clear_cart', title: '🗑️ Clear' });

    await this.buttons(ctx.phone, body, buttons.slice(0, 3));
    await this.updateSession(ctx.phone, { step: this.STEPS.CART, data: { food } });
  }

  async prepareCheckout(ctx, food) {
    if (!food.cart?.length) {
      await this.reply(ctx.phone, 'Your cart is empty. Pick a restaurant and add items first.');
      return this.showMenu(ctx);
    }

    if (!food.vendor?.coord || !food.location) {
      await this.reply(ctx.phone, 'Missing location or restaurant. Start again from *Order Food*.');
      return this.showMenu(ctx);
    }

    const subtotalKobo = this.cartSubtotalKobo(food.cart);
    const minKobo = Number(food.vendor.minimum_order_amount || 0);
    if (minKobo > 0 && subtotalKobo < minKobo) {
      await this.reply(
        ctx.phone,
        `Minimum order for *${food.vendor.name}* is ${chowdeck.formatNaira(minKobo)}.\n\nAdd more items to continue.`
      );
      return this.showCart(ctx, food);
    }

    await this.reply(ctx.phone, '⏳ Calculating delivery fee…');

    const source = {
      lat: food.vendor.coord.lat,
      lng: food.vendor.coord.lng,
      address: food.vendor.pretty_name || food.vendor.name,
    };
    const destination = {
      lat: food.location.lat,
      lng: food.location.lng,
      address: this.buildLocationLabel(food.location),
    };

    const fee = await chowdeck.getDeliveryFee({
      source,
      destination,
      orderAmountKobo: subtotalKobo,
    });

    const deliveryKobo = fee.ok ? fee.deliveryKobo : 0;
    const totalKobo = subtotalKobo + deliveryKobo;
    const afford = await wallet.canAffordPurchase(ctx.phone, chowdeck.koboToNaira(totalKobo));

    if (!afford.ok) {
      await this.reply(
        ctx.phone,
        `💳 *Insufficient balance*\n\n` +
          `Food: ${chowdeck.formatNaira(subtotalKobo)}\n` +
          `Delivery: ${fee.ok ? chowdeck.formatNaira(deliveryKobo) : 'TBD'}\n` +
          `*Total:* ${chowdeck.formatNaira(totalKobo)}\n\n` +
          `Your balance: *${wallet.formatNaira(afford.balance)}*\n` +
          `Short by: *${wallet.formatNaira(afford.shortfall)}*`
      );
      const { sendTopUpPrompt } = require('../../wallet/purchaseHelper');
      await sendTopUpPrompt(ctx.phone, afford.shortfall, 'this order');
      return;
    }

    const feeNote = fee.ok
      ? `Delivery: *${chowdeck.formatNaira(deliveryKobo)}*`
      : `_Delivery fee estimate unavailable — ${fee.message || 'will confirm at dispatch'}_`;

    await this.buttons(
      ctx.phone,
      `*Confirm food order*\n\n` +
        `🍽 ${food.vendor.name}\n` +
        `📍 ${this.buildLocationLabel(food.location)}\n\n` +
        `${this.formatCartSummary(food.cart)}\n\n` +
        `Subtotal: ${chowdeck.formatNaira(subtotalKobo)}\n` +
        `${feeNote}\n` +
        `*Total: ${chowdeck.formatNaira(totalKobo)}*\n\n` +
        wallet.formatWalletSummary(chowdeck.koboToNaira(totalKobo)).text,
      [
        { id: 'food_confirm', title: '✅ Pay & order' },
        { id: 'food_cart_view', title: 'Back to cart' },
        { id: 'air_cancel', title: 'Cancel' },
      ]
    );

    await this.updateSession(ctx.phone, {
      step: this.STEPS.CONFIRM,
      data: {
        food: {
          ...food,
          checkout: {
            subtotalKobo,
            deliveryKobo,
            totalKobo,
            feeId: fee.ok ? fee.feeId : null,
            source,
            destination,
          },
        },
      },
    });
  }

  async executeOrder(ctx, food) {
    const checkout = food.checkout;
    if (!checkout) {
      return this.prepareCheckout(ctx, food);
    }

    const orderRef = chowdeck.buildOrderReference();
    const summary = `${food.vendor.name} — ${food.cart.length} item(s)`;

    const purchase = await confirmAndPay(ctx.phone, {
      service: 'food',
      baseAmount: chowdeck.koboToNaira(checkout.totalKobo),
      summaryText: summary,
      execute: async () => {
        let deliveryNote = '';
        if (checkout.feeId) {
          const user = ctx.user || {};
          const delivery = await chowdeck.createRelayDelivery({
            feeId: checkout.feeId,
            source: checkout.source,
            destination: checkout.destination,
            customer: {
              name: user.firstName || 'Mysogi Customer',
              phone: ctx.phone,
              email: user.email,
            },
            orderReference: orderRef,
            notes: `Food order ${orderRef}: ${food.cart.map((l) => `${l.quantity}x ${l.name}`).join(', ')}`,
          });
          if (delivery.ok) {
            deliveryNote = `\nDelivery ref: *${delivery.reference}*`;
          } else {
            deliveryNote = `\n_Note: ${delivery.message || 'Delivery dispatch pending'}_`;
          }
        }

        return {
          ok: true,
          message:
            `Order placed with *${food.vendor.name}*.${deliveryNote}\n\n` +
            `We'll notify you when it's on the way.`,
          orderReference: orderRef,
        };
      },
    });

    if (purchase?.awaitingPin || purchase?.awaitingPinSetup || purchase?.locked) return;

    if (purchase?.ok) {
      await this.reply(
        ctx.phone,
        `✅ *Food order confirmed!*\n\n` +
          `${purchase.result?.message || ''}\n\n` +
          `Ref: *${purchase.reference}*\n` +
          `Paid: ${wallet.formatNaira(purchase.total)}\n` +
          `Balance: ${wallet.formatNaira(purchase.balance)}`
      );
    } else if (!purchase?.prompted && !purchase?.insufficient) {
      await this.reply(ctx.phone, `❌ ${purchase?.message || 'Order could not be completed.'}`);
    }

    return this.showMenu(ctx);
  }

  async handle(ctx) {
    if (this.isHome(ctx.text)) return this.goHome(ctx.phone);
    if (this.isCancel(ctx.text) || ctx.choice === 'air_cancel') {
      await this.reply(ctx.phone, 'Order cancelled.');
      return this.goHome(ctx.phone);
    }

    const { choice, step, data, text, location } = ctx;
    let food = data?.food || { cart: [] };

    if (location && (step === this.STEPS.LOCATION || step === this.STEPS.STORES || !food.location)) {
      const loc = {
        lat: location.lat,
        lng: location.lng,
        address: [location.name, location.address].filter(Boolean).join(', '),
        name: location.name,
      };
      return this.saveLocationAndShowStores(ctx, loc);
    }

    if (choice === 'food_loc_gps') {
      await this.reply(
        ctx.phone,
        '📍 Tap the *+ attachment* icon → *Location* → *Send your current location*.'
      );
      await this.updateSession(ctx.phone, { step: this.STEPS.LOCATION, data: { food } });
      return;
    }

    if (choice === 'food_loc_area') {
      return this.showAreaPicker(ctx);
    }

    if (choice?.startsWith('food_area_')) {
      const id = choice.replace('food_area_', '');
      const area = LAGOS_AREAS.find((a) => a.id === id);
      if (!area) return this.showAreaPicker(ctx);
      return this.saveLocationAndShowStores(ctx, {
        lat: area.lat,
        lng: area.lng,
        areaName: area.name,
        address: `${area.name}, Lagos`,
      });
    }

    if (choice?.startsWith('food_store_page_')) {
      const page = Number(choice.replace('food_store_page_', ''));
      return this.showStores(ctx, food, page);
    }

    if (choice?.startsWith('food_store_p')) {
      const vendor = this.resolveStoreFromChoice(choice, food, food.storePage || 0);
      if (!vendor) {
        await this.reply(ctx.phone, 'Store not found. Pick again.');
        return this.showStores(ctx, food, food.storePage || 0);
      }
      const menu = await this.loadVendorMenu(ctx, vendor);
      if (!menu) return this.showStores(ctx, food, food.storePage || 0);
      food = { ...food, ...menu, categoryPage: 0 };
      return this.showCategories(ctx, food);
    }

    if (choice?.startsWith('food_cat_page_')) {
      food.categoryPage = Number(choice.replace('food_cat_page_', ''));
      return this.showCategories(ctx, food);
    }

    if (choice?.startsWith('food_cat_p')) {
      const m = choice.match(/^food_cat_p(\d+)_i(\d+)$/);
      if (!m) return this.showCategories(ctx, food);
      const category = this.resolveCategory(food, Number(m[1]), Number(m[2]));
      if (!category) return this.showCategories(ctx, food);
      return this.showCategoryItems(ctx, food, category, 0);
    }

    if (choice === 'food_back_cats' && food.vendor) {
      return this.showCategories(ctx, food);
    }

    if (choice?.startsWith('food_item_page_')) {
      const page = Number(choice.replace('food_item_page_', ''));
      return this.showCategoryItems(ctx, food, food.activeCategory, page);
    }

    if (choice?.startsWith('food_item_p')) {
      const m = choice.match(/^food_item_p(\d+)_i(\d+)$/);
      if (!m) return this.showCategories(ctx, food);
      const item = this.resolveMenuItem(food, Number(m[1]), Number(m[2]));
      if (!item) {
        await this.reply(ctx.phone, 'Item not found.');
        return this.showCategoryItems(ctx, food, food.activeCategory, food.itemPage || 0);
      }
      return this.promptQuantity(ctx, food, item);
    }

    if (choice?.startsWith('food_qty_') && food.pendingItem) {
      let qty = 1;
      if (choice === 'food_qty_2') qty = 2;
      else if (choice === 'food_qty_3') qty = 3;
      else if (choice === 'food_qty_more') {
        await this.reply(ctx.phone, 'Type how many you want (e.g. *4*):');
        await this.updateSession(ctx.phone, { step: this.STEPS.QUANTITY, data: { food } });
        return;
      }
      const itemName = food.pendingItem.name;
      food.cart = this.addToCart(food.cart, food.pendingItem, qty);
      food.pendingItem = null;
      await this.reply(ctx.phone, `✅ Added *${qty}× ${itemName}* to cart.`);
      return this.showCart(ctx, food);
    }

    if (step === this.STEPS.QUANTITY && food.pendingItem && /^\d+$/.test(String(text || '').trim())) {
      const qty = Math.min(20, Math.max(1, Number(text.trim())));
      const itemName = food.pendingItem.name;
      food.cart = this.addToCart(food.cart, food.pendingItem, qty);
      food.pendingItem = null;
      await this.reply(ctx.phone, `✅ Added *${qty}× ${itemName}* to cart.`);
      return this.showCart(ctx, food);
    }

    if (choice === 'food_cart_view') {
      return this.showCart(ctx, food);
    }

    if (choice === 'food_clear_cart') {
      food.cart = [];
      await this.reply(ctx.phone, 'Cart cleared.');
      if (food.vendor) return this.showCategories(ctx, food);
      return this.showMenu(ctx);
    }

    if (choice === 'food_checkout') {
      return this.prepareCheckout(ctx, food);
    }

    if (choice === 'food_confirm' && food.checkout) {
      return this.executeOrder(ctx, food);
    }

    if (step && step.startsWith('food_') && step !== this.STEPS.MENU) {
      await this.reply(ctx.phone, '_Use the buttons or list above, or type *menu* to go home._');
      return;
    }

    return this.showMenu(ctx);
  }
}

module.exports = FoodService;
