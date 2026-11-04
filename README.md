# Weather Alert – έρχεται βροχή προς το σπίτι μου;

Self-hosted εφαρμογή που κάθε μία ώρα «σαρώνει» την περιοχή σε ακτίνα 100 km γύρω από την Αθήνα,
βλέπει πού βρέχει και προς τα πού κινείται η βροχή, και σε ειδοποιεί (push στο κινητό ή email) όταν
κάποιο κύτταρο βροχής κατευθύνεται προς την τοποθεσία που έχεις ορίσει (π.χ. Νέος Κόσμος).
Χτισμένη πάνω στο ίδιο σκελετό με το [Bill Split](../bill-split): ίδιο login (email & κωδικός ή
Cloudflare Access), React PWA, Node API, PostgreSQL, docker compose για Raspberry Pi.

## Λειτουργίες

- **Λογαριασμοί** όπως στο Bill Split: εγγραφή / σύνδεση με email & κωδικό, «ξέχασα τον κωδικό»,
  προαιρετικά single sign-on μέσω Cloudflare Access. Κάθε λογαριασμός παρακολουθεί τη δική του τοποθεσία.
- **Σάρωση ανά ώρα** (ρυθμιζόμενο): ένα πλέγμα ~140 σημείων (ανά 15 km) μέσα σε ακτίνα 100 km από το κέντρο.
  Για κάθε σημείο διαβάζεται η τρέχουσα βροχόπτωση (mm/h) και ο άνεμος των 850 hPa, που είναι αυτός που
  «κουβαλάει» τα κύτταρα βροχής.
- **Εντοπισμός πορείας**: για κάθε σημείο που βρέχει, υπολογίζεται αν η τροχιά του (θέση + ταχύτητα × χρόνος)
  περνάει μέσα από την ακτίνα ειδοποίησης γύρω από το σπίτι σου και σε πόση ώρα. Ο αλγόριθμος είναι
  ντετερμινιστικός και με tests (`api/src/lib/approach.ts`).
- **Δεύτερη γνώμη από την πρόγνωση**: για το σημείο σου διαβάζεται και η πρόγνωση ανά 15 λεπτά (6 ώρες) και
  ανά ώρα (12 ώρες), ώστε να φαίνεται και βροχή που «γεννιέται» από πάνω σου χωρίς να έρχεται από αλλού.
- **Πέντε καταστάσεις**: Βρέχει τώρα · Έρχεται βροχή (με εκτίμηση άφιξης, κατεύθυνση, απόσταση) · Πιθανή βροχή
  (μόνο από πρόγνωση) · Βροχή στην περιοχή αλλά όχι προς εσάς · Καθαρά.
- **Ειδοποιήσεις** μόνο όταν αλλάζει κάτι: όταν αρχίζει να έρχεται βροχή, όταν αρχίζει να βρέχει, (προαιρετικά)
  όταν η βροχή απομακρυνθεί ή όταν μόνο η πρόγνωση δείχνει βροχή. Web Push σε όσες συσκευές το ενεργοποιήσεις,
  email αν υπάρχει SMTP, ώρες ησυχίας, όριο μίας ειδοποίησης ανά 30 λεπτά.
- **Dashboard**: κατάσταση, χάρτης της περιοχής σάρωσης (σημεία βροχής, ένταση, βέλη πορείας, το σπίτι σου με την
  ακτίνα ειδοποίησης), λίστα κυττάρων βροχής, γράφημα πρόγνωσης, «Σάρωση τώρα».
- **Ιστορικό** ειδοποιήσεων και σαρώσεων. **Mobile-first UI** στα ελληνικά, light/dark mode, PWA.

## Πηγές δεδομένων

| Provider | Τι δίνει | Κλειδί |
|---|---|---|
| **Open-Meteo** (προεπιλογή) | Τρέχουσα βροχόπτωση ανά 15΄ και άνεμος 850 hPa για όλο το πλέγμα με **μία** κλήση, πρόγνωση σημείου, geocoding | Όχι (δωρεάν για μη εμπορική χρήση) |
| **OpenWeatherMap** (`WEATHER_PROVIDER=openweathermap`) | «Current weather» ανά σημείο, που συνδυάζει μετεωρολογικούς σταθμούς με μοντέλο. Μόνο επιφανειακός άνεμος, άρα πιο χοντρική εκτίμηση πορείας | `OWM_API_KEY` (δωρεάν plan: 60 κλήσεις/λεπτό) |

Σημείωση: και οι δύο πηγές δίνουν τιμές μοντέλου στις οποίες έχουν αφομοιωθεί οι μετρήσεις των σταθμών, όχι
«ωμές» μετρήσεις από τον κάθε σταθμό (το ΕΑΑ/meteo.gr δεν έχει δημόσιο API). Η διεπαφή
`ObservationProvider` (`api/src/weather/provider.ts`) είναι ένα function: αν βρεθεί άλλη πηγή, μπαίνει εκεί.

## Αρχιτεκτονική

```
web/   React + Vite + TypeScript (PWA με δικό της service worker για push), σερβίρεται από nginx που κάνει reverse proxy το /api
api/   Node 22 + Express 5 + TypeScript, JWT auth, bcrypt, zod, web-push, scheduler σάρωσης
db     PostgreSQL 16 (schema δημιουργείται αυτόματα στην εκκίνηση του api)
```

Όλα τα images είναι multi-arch (amd64 / arm64 / armv7) χωρίς native dependencies, οπότε χτίζουν στο Raspberry Pi.

## Γρήγορη εκκίνηση (τοπικά ή σε Raspberry Pi)

Προαπαιτούμενα: Docker + Docker Compose.

```bash
cd weather-alert
cp .env.example .env
# Άλλαξε τουλάχιστον το JWT_SECRET (π.χ. openssl rand -hex 32) και το APP_URL
docker compose up -d --build
```

Άνοιξε `http://<ip-του-server>:8081` (η θύρα 8081 ώστε να συνυπάρχει με το Bill Split στην 8080), φτιάξε
λογαριασμό, πήγαινε **Ρυθμίσεις** → διάλεξε την τοποθεσία σου (αναζήτηση, «η θέση μου» ή συντεταγμένες) →
**Ενεργοποίηση** push σε αυτή τη συσκευή → **Δοκιμή**. Στο κινητό πρώτα «Προσθήκη στην αρχική οθόνη»
(στο iPhone είναι υποχρεωτικό για push, iOS 16.4+), μετά άνοιγμα από εκεί και ενεργοποίηση.

Η πρώτη σάρωση γίνεται 5 δευτερόλεπτα μετά την εκκίνηση και μετά κάθε `SCAN_INTERVAL_MIN` λεπτά.

### Μεταβλητές `.env`

| Μεταβλητή | Περιγραφή |
|---|---|
| `WEB_PORT` | Θύρα της εφαρμογής (default 8081) |
| `APP_URL` | Δημόσιο URL (σύνδεσμοι επαναφοράς κωδικού, μόνο επιτρεπτό CORS origin) |
| `JWT_SECRET` | Μυστικό υπογραφής των tokens σύνδεσης. **Άλλαξέ το.** |
| `DISPLAY_TZ` | Ζώνη ώρας για τα κείμενα των ειδοποιήσεων (default `Europe/Athens`) |
| `WEATHER_PROVIDER` / `OWM_API_KEY` | `open-meteo` (default) ή `openweathermap` + κλειδί |
| `SCAN_CENTER_LAT` / `SCAN_CENTER_LON` / `SCAN_RADIUS_KM` | Κέντρο και ακτίνα της περιοχής (default Αθήνα, 100 km) |
| `SCAN_GRID_KM` | Απόσταση σημείων του πλέγματος (15 km ≈ 140 σημεία, 10 km ≈ 315) |
| `SCAN_INTERVAL_MIN` | Κάθε πόσο γίνεται σάρωση (default 60) |
| `RAIN_MIN_RATE` | mm/h από τα οποία ένα σημείο μετράει ως «βρέχει» (default 0.2) |
| `ALERT_COOLDOWN_MIN` | Ελάχιστος χρόνος μεταξύ δύο ειδοποιήσεων στο ίδιο άτομο (default 30, δεν ισχύει όταν αρχίζει να βρέχει) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Κλειδιά Web Push. Κενά = δημιουργούνται μία φορά και μένουν στη βάση |
| `COMPOSE_PROFILES` / `TUNNEL_TOKEN` | `internet` + token του Cloudflare Tunnel για πρόσβαση από το Internet |
| `SMTP_*` | Προαιρετικά, για ειδοποιήσεις email και «ξέχασα τον κωδικό» |

Οι ρυθμίσεις **ανά χρήστη** (τοποθεσία, ακτίνα ειδοποίησης 1–50 km, ορίζοντας 30΄–6 ώρες, κανάλια, ώρες
ησυχίας) γίνονται μέσα από την εφαρμογή.

### Χρήσιμες εντολές

```bash
docker compose logs -f api                 # σαρώσεις, αξιολογήσεις, ειδοποιήσεις (JSON ανά γραμμή)
docker compose logs --no-log-prefix api | jq -c 'select(.msg=="scan done" or .msg=="alert")'
docker compose exec db pg_dump -U weather weather > backup.sql
docker compose down                        # στοπ (τα δεδομένα μένουν στο volume pgdata)
```

Χαρακτηριστικές γραμμές: `scan done` (πόσα σημεία, πόσα με βροχή, μέγιστη ένταση, χρόνος), `alert`
(σε ποιον, ποια κατάσταση, από ποια, ETA, push/email/suppressed), `evaluated` (σε `LOG_LEVEL=debug`).

## Πώς αποφασίζει ότι «έρχεται»

1. Το πλέγμα γεμίζει τον κύκλο των 100 km με σημεία ανά 15 km. Κάθε σημείο εκπροσωπεί ένα τετράγωνο 15×15 km.
2. Σημεία με βροχόπτωση ≥ `RAIN_MIN_RATE` είναι «κύτταρα βροχής». Η ταχύτητά τους εκτιμάται ως 0.85 × άνεμος
   850 hPa (`STEERING_FACTOR_850`), ή 1.5 × επιφανειακός άνεμος όταν δεν υπάρχει (`STEERING_FACTOR_10M`).
3. Για κάθε κύτταρο στη θέση **P** (σε km από το σπίτι) με ταχύτητα **V**: βρίσκεται ο πρώτος χρόνος t ≥ 0 που
   |P + V·t| ≤ r, όπου r = ακτίνα ειδοποίησης + μισό πλέγμα. Αν υπάρχει και είναι μέσα στον ορίζοντα → «έρχεται»
   με ETA = t. Αν η τροχιά δεν περνά ποτέ τόσο κοντά → «δεν έρχεται» (φαίνεται η ελάχιστη απόσταση που θα φτάσει).
4. «Βρέχει τώρα» = η πρόγνωση σημείου δείχνει βροχή τώρα ή το κύτταρο που καλύπτει το σπίτι βρέχει.
   «Πιθανή βροχή» = μόνο η πρόγνωση ανά 15΄/ώρα περιμένει βροχή μέσα στον ορίζοντα.
5. Ειδοποίηση φεύγει μόνο σε αλλαγή κατάστασης (π.χ. Καθαρά → Έρχεται), όχι σε κάθε σάρωση.

Η ακρίβεια εξαρτάται από το μοντέλο: ένα πλέγμα 15 km και μια σάρωση ανά ώρα πιάνουν μέτωπα και εκτεταμένες
βροχές, όχι μια τοπική καλοκαιρινή μπόρα που ζει 20 λεπτά. Για πιο πυκνή παρακολούθηση: `SCAN_GRID_KM=10`,
`SCAN_INTERVAL_MIN=30` (το Open-Meteo επιτρέπει ~10.000 σημεία/ημέρα για μη εμπορική χρήση).

## Αυτόματο deploy στο Raspberry Pi

Ίδια λογική με το Bill Split, με ξεχωριστό χρήστη `weather` στο Pi (για να μην πειράξει το κλειδί του Bill Split)
και SSH alias `weather-pi`:

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\weather_deploy -C weather-deploy
# στο ~/.ssh/config:
#   Host weather-pi
#       HostName ninblack-pi.local
#       User weather
#       IdentityFile ~/.ssh/weather_deploy
#       IdentitiesOnly yes
scp scripts\pi-setup-deploy.sh $HOME\.ssh\weather_deploy.pub <user>@ninblack-pi.local:~/
ssh -t <user>@ninblack-pi.local "sudo sh ~/pi-setup-deploy.sh ~/weather_deploy.pub"
.\scripts\deploy.ps1          # ανεβάζει το τελευταίο commit (χρειάζεται git repo)
ssh weather-pi status / logs api / restart
```

Το `.env` στο Pi (`/home/weather/weather-alert/.env`) δεν αλλάζει ποτέ από το deploy.

## Πρόσβαση από το Internet (Cloudflare Tunnel + Access)

Όπως στο Bill Split: δικό του tunnel `weather-alert` με public hostname `weather.ninblack.com → http://web:80`,
το CNAME, και μια Access application `Weather Alert` με policy emails. Όλα αυτά τα στήνει το script με ένα
API token (scopes: `Cloudflare Tunnel: Edit`, `Access: Apps and Policies: Edit`, `DNS: Edit` στη ζώνη):

```powershell
$env:CLOUDFLARE_API_TOKEN = "..."
node scripts/cloudflare-setup.mjs --hostname weather.ninblack.com --copy-emails-from <id της Access app του Bill Split>
# ή --emails a@example.com,b@example.com
```

Γράφει `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` στο `cloudflare-access.env` (ώστε το login να γίνεται αυτόματα από το
Access) και τυπώνει το `TUNNEL_TOKEN`. Στο `.env` του **Pi** μπαίνουν: `APP_URL=https://weather.ninblack.com`,
`COMPOSE_PROFILES=internet`, `TUNNEL_TOKEN=…`, και μετά `scripts/deploy.ps1`. Τα push notifications θέλουν
HTTPS, άρα από το Internet δουλεύουν μέσω του tunnel· στο τοπικό δίκτυο δουλεύουν μόνο σε `http://localhost`.

## Ανάπτυξη (χωρίς docker)

```bash
docker compose up -d db                       # μόνο η βάση
cd api && npm install && npm run dev          # http://localhost:4000
cd web && npm install && npm run dev          # http://localhost:5173, proxy του /api στο 4000
cd api && npm test                            # tests γεωμετρίας και πορείας
```

## API (σύνοψη)

| Method | Path | Περιγραφή |
|---|---|---|
| POST | `/api/auth/signup` · `/login` · `/access` · `/forgot` · `/reset` | Λογαριασμός |
| GET/PATCH | `/api/auth/me` | Προφίλ |
| GET/PUT | `/api/settings` | Τοποθεσία, ακτίνα, ορίζοντας, κανάλια, ώρες ησυχίας |
| GET | `/api/settings/geocode?q=` | Αναζήτηση τοποθεσίας |
| GET | `/api/push/key` · `/api/push/devices` | Δημόσιο κλειδί VAPID, συσκευές |
| POST/DELETE | `/api/push/subscribe` | Εγγραφή / διαγραφή συσκευής |
| POST | `/api/push/test` | Δοκιμαστική ειδοποίηση |
| GET | `/api/status` | Τελευταία σάρωση + αξιολόγηση για τον χρήστη + πρόγνωση σημείου |
| POST | `/api/scan` | Σάρωση τώρα (το πολύ μία ανά 3 λεπτά) |
| GET | `/api/alerts?limit=` · `/api/scans?limit=` | Ιστορικό |

Όλα τα endpoints εκτός των auth απαιτούν header `Authorization: Bearer <token>`.
