const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(e) {
    res.status(400).send(`Webhook Error: ${e.message}`);
    return;
  }

  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    if (userId) {
      await supa.from('profiles').upsert({
        id: userId,
        is_pro: true,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
      });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const { data: profiles } = await supa
      .from('profiles')
      .select('id')
      .eq('stripe_subscription_id', sub.id);
    if (profiles?.length) {
      await supa.from('profiles').update({ is_pro: false }).eq('stripe_subscription_id', sub.id);
    }
  }

  res.status(200).json({ received: true });
};
