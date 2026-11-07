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
