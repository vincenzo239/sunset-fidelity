import { createClient } from "npm:@supabase/supabase-js@2";
import { sendNotification, setVapidDetails } from "npm:web-push@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metodo non consentito." }, 405);

  try {
    const expectedSecret = Deno.env.get("INACTIVITY_CRON_SECRET");
    if (!expectedSecret || request.headers.get("x-cron-secret") !== expectedSecret) {
      return json({ error: "Accesso non autorizzato." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");
    if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return json({ error: "Configurazione notifiche incompleta." }, 503);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const customers = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await adminClient
        .from("profiles")
        .select("id, created_at")
        .eq("role", "customer")
        .range(from, from + 499);
      if (error) throw error;
      const page = data || [];
      customers.push(...page);
      if (page.length < 500) break;
    }

    let checked = 0;
    let sent = 0;
    let failed = 0;
    for (let start = 0; start < customers.length; start += 10) {
      const batch = customers.slice(start, start + 10);
      const results = await Promise.all(batch.map(async (customer) => {
        const { data: latestCredit, error } = await adminClient
          .from("point_ledger")
          .select("id, created_at")
          .eq("user_id", customer.id)
          .gt("points", 0)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;

        const lastActivityAt = latestCredit?.created_at || customer.created_at;
        if (!lastActivityAt || new Date(lastActivityAt).getTime() > cutoff) {
          return { checked: false, sent: 0, failed: 0 };
        }

        const activityKey = latestCredit?.id ?? customer.created_at;
        const result = await sendInactivityOnce(
          adminClient,
          customer.id,
          `inactive:${activityKey}`,
          JSON.stringify({
            title: "Ci manchi!",
            body: "Sono passati 7 giorni dall’ultima attività sulla tua tessera. Ti aspettiamo da SUNSET!",
            url: "./",
            tag: `sunset-inactive-${activityKey}`,
          }),
        );
        return {
          checked: true,
          sent: result.sent,
          failed: result.total - result.sent,
        };
      }));
      for (const result of results) {
        if (result.checked) checked++;
        sent += result.sent;
        failed += result.failed;
      }
    }

    return json({ ok: true, checked, sent, failed }, 200);
  } catch (error) {
    console.error("send-inactivity-notifications:", error instanceof Error ? error.message : "errore");
    return json({ error: "Errore durante l’invio dei promemoria." }, 500);
  }
});

async function sendInactivityOnce(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  eventKey: string,
  payload: string,
) {
  const { error: claimError } = await adminClient
    .from("push_notification_deliveries")
    .insert({ user_id: userId, event_key: eventKey });
  if (claimError?.code === "23505") return { sent: 0, total: 0, duplicate: true };
  if (claimError) throw claimError;

  const { data, error } = await adminClient
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) {
    await adminClient.from("push_notification_deliveries").delete()
      .eq("user_id", userId).eq("event_key", eventKey);
    throw error;
  }

  const subscriptions = data || [];
  if (!subscriptions.length) {
    await adminClient.from("push_notification_deliveries").delete()
      .eq("user_id", userId).eq("event_key", eventKey);
    return { sent: 0, total: 0, duplicate: false };
  }

  let sent = 0;
  const expiredIds: string[] = [];
  for (let start = 0; start < subscriptions.length; start += 25) {
    await Promise.all(subscriptions.slice(start, start + 25).map(async (subscription) => {
      try {
        await sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload);
        sent++;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) expiredIds.push(subscription.id);
        else console.error("Invio promemoria non riuscito:", statusCode || "errore");
      }
    }));
  }

  if (expiredIds.length) {
    const { error } = await adminClient.from("push_subscriptions").delete().in("id", expiredIds);
    if (error) console.error("Pulizia subscription scadute non riuscita.");
  }

  if (sent) {
    const { error } = await adminClient.from("push_notification_deliveries")
      .update({ sent_at: new Date().toISOString() })
      .eq("user_id", userId).eq("event_key", eventKey);
    if (error) console.error("Registrazione promemoria non riuscita.");
  } else {
    await adminClient.from("push_notification_deliveries").delete()
      .eq("user_id", userId).eq("event_key", eventKey);
  }
  return { sent, total: subscriptions.length, duplicate: false };
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
