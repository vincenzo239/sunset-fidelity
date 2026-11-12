# SUNSET FIDELITY – nuova versione

Questa è una nuova base di progetto. Usa esclusivamente il piano Free di Supabase e GitHub Pages. I servizi gratuiti hanno limiti e condizioni che possono cambiare.

## Prima di pubblicare
1. In Supabase apri il progetto SUNSET FIDELITY.
2. Vai in Project Settings → API (o Data API / API Keys, secondo la schermata).
3. Copia localmente Project URL e la chiave `publishable` (inizia con `sb_publishable_`).
4. Apri `config.js` e sostituisci i due testi `INCOLLA_QUI...`. Non inviare le chiavi in chat. Non usare mai `service_role` o la password del database nel browser.
5. In Supabase → SQL Editor → New query, incolla tutto `supabase/schema.sql` ed esegui una volta.
6. Pubblica i file su GitHub Pages (istruzioni guidate in chat).

## Rendere amministratore il titolare
Dopo aver registrato il tuo account dall'app e aver confermato l'email, vai in Supabase → SQL Editor ed esegui, sostituendo l'indirizzo:
`update public.profiles set role='admin' where email='LA_TUA_EMAIL';`
Non promuovere altri utenti. Esci e rientra nell'app.

## Funzioni incluse
- Registrazione e accesso cliente
- Tessera personale, nome/colore personalizzabili e QR univoco
- Saldo e storico movimenti
- Elenco premi
- Pannello amministratore: ricerca cliente, lettura QR, accredito punti, storno controllato, impostazioni punti/euro e gestione premi
- RLS e funzioni SQL protette per le operazioni sui punti

## Note importanti
- Il QR identifica l'account: l'app non consente al cliente di accreditarsi punti.
- La scansione QR richiede HTTPS e permesso fotocamera.
- Prima dell'uso reale, testare con account di prova e verificare le regole commerciali desiderate.
- In questa prima versione il riscatto effettivo dei premi al banco va completato con una procedura di conferma amministratore: il saldo viene protetto lato server e non può andare sotto zero, ma non è ancora implementato il flusso completo di prenotazione/riscatto con ricevuta.
- Non inserire dati personali non necessari. Conservare le credenziali in modo sicuro.


## Notifiche push per punti accreditati
Le notifiche richiedono HTTPS e l’autorizzazione esplicita del cliente dal pulsante **Attiva notifiche punti**. Su iPhone/iPad la PWA deve essere aggiunta alla schermata Home; il supporto push è disponibile da iOS/iPadOS 16.4.

### Configurazione da fare nel progetto Supabase
1. In **SQL Editor**, esegui `supabase/push_notifications.sql` una volta.
2. Genera una coppia di chiavi VAPID. La chiave pubblica è identificativa e può stare nella configurazione client; la privata è un segreto e va conservata solo nei secrets Supabase. Non aggiungere la privata a GitHub o inviarla in chat.
3. In **Project Settings → Edge Functions → Secrets** (o tramite Supabase CLI), configura `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (un URI mailto o HTTPS di contatto).
4. Imposta la stessa chiave pubblica VAPID in `config.js` al posto di `INCOLLA_QUI_LA_CHIAVE_PUBBLICA_VAPID`.
5. La Edge Function pubblicata nel dashboard Supabase si chiama `rapid-handler` (l’app invoca questo nome). Il suo codice è conservato in `supabase/functions/send-points-notification/index.ts`; per un deploy manuale dal dashboard mantieni il nome `rapid-handler` e abilita la verifica JWT della funzione. La service role key resta solo nei secrets gestiti da Supabase.
6. Pubblica i file del branch su GitHub Pages. Poi accedi come cliente e attiva le notifiche sul dispositivo.

L’accredito viene eseguito prima tramite la RPC esistente. Solo quando la RPC ha successo il client invoca la Edge Function; quest’ultima verifica il ruolo admin, controlla un accredito recente nel ledger e ricalcola il saldo sul server. Se l’invio fallisce, l’accredito resta valido e l’area admin mostra un avviso.

### Comunicazioni a tutti i clienti
Nel pannello amministratore si può preparare un titolo (massimo 60 caratteri) e un messaggio (massimo 240 caratteri). Prima dell’invio l’app chiede conferma; la notifica raggiunge i dispositivi dei clienti con notifiche attive. Non serve una nuova tabella SQL: il codice aggiornato della funzione `rapid-handler` gestisce sia gli avvisi sia le notifiche degli accrediti. Per rendere disponibile l’invio nel progetto, dopo aver terminato le modifiche, pubblica la versione aggiornata della Edge Function da `supabase/functions/send-points-notification/index.ts`.
