/**
 * Business partners — onboard businesses & dynamic services menu.
 */

const { getSupabase } = require('../db/supabase');
const logger = require('../core/logger');

async function getActivePartnerServices(limit = 8) {
  const db = getSupabase();
  if (!db) return [];

  try {
    const { data, error } = await db
      .from('business_services')
      .select('id, name, description, price, emoji, business_partners(business_name, category)')
      .eq('active', true)
      .limit(limit);

    if (error) {
      if (error.message.includes('does not exist')) {
        logger.warn('business_services table missing — run migration 002');
      }
      return [];
    }

    return (data || []).filter((s) => s.business_partners);
  } catch {
    return [];
  }
}

async function getServiceById(id) {
  const db = getSupabase();
  if (!db) return null;

  const { data } = await db
    .from('business_services')
    .select('*, business_partners(*)')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();

  return data;
}

async function registerPartner({ ownerPhone, businessName, category, description, serviceName, serviceDescription, price }) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Database not configured' };

  const { data: partner, error: pErr } = await db
    .from('business_partners')
    .insert({
      owner_phone: ownerPhone,
      business_name: businessName,
      category,
      description,
      status: 'active',
    })
    .select()
    .single();

  if (pErr) {
    return { ok: false, message: pErr.message };
  }

  const { data: service, error: sErr } = await db
    .from('business_services')
    .insert({
      partner_id: partner.id,
      name: serviceName,
      description: serviceDescription || description,
      price: Number(price),
      emoji: '🏪',
      active: true,
    })
    .select()
    .single();

  if (sErr) {
    return { ok: false, message: sErr.message };
  }

  return { ok: true, partner, service };
}

async function getPartnersByOwner(phone) {
  const db = getSupabase();
  if (!db) return [];

  const { data } = await db
    .from('business_partners')
    .select('*, business_services(*)')
    .eq('owner_phone', phone);

  return data || [];
}

module.exports = {
  getActivePartnerServices,
  getServiceById,
  registerPartner,
  getPartnersByOwner,
};
