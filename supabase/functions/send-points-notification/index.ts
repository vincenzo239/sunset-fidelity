import { createClient } from "npm:@supabase/supabase-js@2";
import { sendNotification, setVapidDetails } from "npm:web-push@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metodo non consentito." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return json({ error: "Configurazione notifiche incompleta." }, 503);
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Accesso non autorizzato." }, 401);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: "Accesso non autorizzato." }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileError || !callerProfile) return json({ error: "Profilo non trovato." }, 403);

    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Richiesta non valida." }, 400);
    }

    if (body.action === "welcome") {
      if (callerProfile.role !== "customer") {
        return json({ error: "Operazione riservata al cliente." }, 403);
      }
      setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      const result = await sendNotificationOnce(
        adminClient,
        user.id,
        "welcome",
        JSON.stringify({
          title: "Benvenuto in SUNSET FIDELITY",
          body: "La tua tessera è pronta: raccogli punti a ogni acquisto.",
          url: "./",
          tag: "sunset-welcome",
        }),
      );
      return json({ ok: true, sent: result.sent }, 200);
    }

    if (callerProfile.role !== "admin") {
      return json({ error: "Operazione riservata all’amministratore." }, 403);
    }

    if (body.action === "broadcast") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!title || title.length > 60 || !message || message.length > 240) {
        return json({ error: "Titolo o messaggio non validi." }, 400);
      }
      setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      const result = await sendBroadcastToCustomers(adminClient, title, message);
      return json({ ok: true, ...result }, 200);
    }

    const userId = typeof body.user_id === "string" ? body.user_id : "";
    const points = Number(body.points);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
      || !Number.isInteger(points) || points < 1 || points > 1000000) {
      return json({ error: "Richiesta non valida." }, 400);
    }

    // Accetta solo accrediti recenti registrati da questo admin e ricalcola il saldo lato server.
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: confirmedCredit, error: creditError } = await adminClient
      .from("point_ledger")
      .select("id")
      .eq("user_id", userId)
      .eq("points", points)
      .eq("created_by", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (creditError) throw creditError;
    if (!confirmedCredit) return json({ error: "Accredito confermato non trovato." }, 409);

    const { data: ledger, error: ledgerError } = await adminClient
      .from("point_ledger").select("points").eq("user_id", userId);
    if (ledgerError) throw ledgerError;
    const balance = (ledger || []).reduce((sum, row) => sum + Number(row.points), 0);
    const balanceBeforeCredit = balance - points;

    let rewardNames: string[] = [];
    const { data: newlyAvailableRewards, error: rewardsError } = await adminClient
      .from("rewards")
      .select("name, points_cost")
      .eq("active", true)
      .gt("points_cost", balanceBeforeCredit)
      .lte("points_cost", balance)
      .order("points_cost", { ascending: true });
    if (rewardsError) {
      console.error("Controllo traguardi non riuscito:", rewardsError.message);
    } else {
      rewardNames = (newlyAvailableRewards || []).map((reward) => reward.name);
    }

    let bodyText = `Hai ricevuto ${points} punti. Il tuo nuovo saldo è di ${balance} punti.`;
    if (rewardNames.length === 1) {
      bodyText += ` Ora puoi riscattare: ${rewardNames[0]}.`;
    } else if (rewardNames.length > 1) {
      const names = rewardNames.slice(0, 3).join(", ");
      bodyText += ` Hai raggiunto un traguardo: ${names}${rewardNames.length > 3 ? " e altri premi" : ""}.`;
    }

    setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const result = await sendNotificationOnce(
      adminClient,
      userId,
      `credit:${confirmedCredit.id}`,
      JSON.stringify({
        title: rewardNames.length ? "Punti e premio disponibili!" : "Punti accreditati!",
        body: bodyText,
        url: "./",
        tag: `sunset-credit-${confirmedCredit.id}`,
      }),
    );
    return json({ ok: true, sent: result.sent, milestoneCount: rewardNames.length }, 200);
  } catch (error) {
    console.error("send-points-notification:", error instanceof Error ? error.message : "errore");
    return json({ error: "Errore durante l’invio della notifica." }, 500);
  }
});

async function sendNotificationOnce(
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

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (subscriptionsError) {
    await adminClient.from("push_notification_deliveries").delete()
      .eq("user_id", userId).eq("event_key", eventKey);
    throw subscriptionsError;
  }

  const list = subscriptions || [];
  if (!list.length) {
    await adminClient.from("push_notification_deliveries").delete()
      .eq("user_id", userId).eq("event_key", eventKey);
    return { sent: 0, total: 0, duplicate: false };
  }

  let sent = 0;
  const expiredIds: string[] = [];
  for (let start = 0; start < list.length; start += 25) {
    await Promise.all(list.slice(start, start + 25).map(async (subscription) => {
      try {
        await sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload);
        sent++;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) expiredIds.push(subscription.id);
        else console.error("Invio push non riuscito:", statusCode || "errore");
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
    if (error) console.error("Registrazione notifica non riuscita.");
  } else {
    await adminClient.from("push_notification_deliveries").delete()
      .eq("user_id", userId).eq("event_key", eventKey);
  }
  return { sent, total: list.length, duplicate: false };
}

async function sendBroadcastToCustomers(
  adminClient: ReturnType<typeof createClient>,
  title: string,
  message: string,
) {
  const customerIds: string[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "customer")
      .range(from, from + 499);
    if (error) throw error;
    const page = data || [];
    customerIds.push(...page.map((profile) => profile.id));
    if (page.length < 500) break;
  }

  let sent = 0;
  let failed = 0;
  let total = 0;
  const expiredIds: string[] = [];
  const payload = JSON.stringify({
    title,
    body: message,
    url: "./",
    tag: `sunset-announcement-${crypto.randomUUID()}`,
  });

  for (let offset = 0; offset < customerIds.length; offset += 100) {
    const customerBatch = customerIds.slice(offset, offset + 100);
    for (let from = 0; ; from += 500) {
      const { data, error } = await adminClient
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .in("user_id", customerBatch)
        .range(from, from + 499);
      if (error) throw error;
      const subscriptions = data || [];
      total += subscriptions.length;

      for (let batchStart = 0; batchStart < subscriptions.length; batchStart += 25) {
        const sendBatch = subscriptions.slice(batchStart, batchStart + 25);
        await Promise.all(sendBatch.map(async (subscription) => {
          try {
            await sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            }, payload);
            sent++;
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            failed++;
            if (statusCode === 404 || statusCode === 410) expiredIds.push(subscription.id);
            else console.error("Invio comunicazione non riuscito:", statusCode || "errore");
          }
        }));
      }

      if (subscriptions.length < 500) break;
    }
  }

  if (expiredIds.length) {
    const { error } = await adminClient.from("push_subscriptions").delete().in("id", expiredIds);
    if (error) console.error("Pulizia subscription scadute non riuscita.");
  }
  return { sent, failed, total, customers: customerIds.length };
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
