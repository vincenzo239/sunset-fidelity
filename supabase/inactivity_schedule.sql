-- Configurazione del promemoria inattività (7 giorni).
-- Eseguire una sola volta, dopo aver abilitato pg_cron, pg_net e Vault nel progetto Supabase.
--
-- 1. Crea un segreto casuale in Vault. Se lo script viene eseguito più volte,
--    non ripetere questa riga:
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'sunset_inactivity_cron_secret');

-- 2. Copia il valore risultante e salvalo anche nei Supabase Function Secrets
--    con il nome INACTIVITY_CRON_SECRET. Non inserirlo in GitHub o in chat:
select decrypted_secret
from vault.decrypted_secrets
where name = 'sunset_inactivity_cron_secret'
limit 1;

-- 3. Crea o aggiorna il controllo giornaliero alle 09:00 UTC.
--    Il job invia una richiesta solo alla funzione protetta dal segreto sopra.
select cron.schedule(
  'sunset-inactivity-notifications',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://tsvtbephrfhrqkfpvodl.supabase.co/functions/v1/send-inactivity-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'sunset_inactivity_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
