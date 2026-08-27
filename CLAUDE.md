# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

360 Party is a static marketing + booking site for a party/event equipment rental business (photo booth platforms, LED cabins, selfie points, etc.) in Tucumán, Argentina. There is no build step, no package manager, and no local server framework — it's plain HTML/CSS/JS deployed as static files via GitHub Pages to the custom domain in `CNAME` (`360partytuc.com.ar`).

Content and UI copy are in Spanish (Argentina).

## Running / previewing

There is no build or test tooling. To preview locally, just open the HTML files in a browser, or serve the directory with any static file server, e.g.:

```
python -m http.server 8000
```

Then visit `http://localhost:8000/index.html` or `/reservas.html`.

## Architecture

The site has three independent surfaces that don't share JS state:

- **`index.html`** — the marketing landing page (services, "Comercio Amigo" partner program, contact info). Uses `js/efectos.js` only, for scroll-based nav-link highlighting. Links out to `reservas.html` and to Google Drive folders for photo galleries.
- **`reservas.html`** — the booking flow. This is the most complex page in the repo; all its logic lives in `js/reservas.js`.
- **`acceso-clientes.html`** — a client/partner login gate driven by `js/validacion-acceso.js`. (`acceso-comercio.html` is currently an empty stub for the equivalent "Comercio Amigo" partner login.)

### Booking flow (`js/reservas.js`)

The booking page talks to an external n8n webhook backend (`API_BASE` at the top of `reservas.js`, currently `https://vps-5990632-x.dattaweb.com/webhook/reservas`) that owns all catalog, pricing, and availability data. There is no backend code in this repo — all business logic for availability/pricing lives server-side; the frontend just orchestrates calls to it and renders results. Key endpoints consumed:

- `GET /localidades` — populates the localidad `<select>` and provides `costoAdicional` (distance surcharge) per locality.
- `GET /catalogo?fecha&horaDesde&horaHasta&carritoIds` — combos + individual services, with live `disponible` (availability) flags for the selected date/time. Re-fetched whenever event date/time changes or the cart changes, so availability badges stay in sync.
- `POST /opciones-eleccion` — for combos that require picking N sub-services (e.g. "Combo 4/5"), returns the choosable options.
- `GET /adicionales?idServicio` — optional add-ons for a given service/combo.
- `POST /confirmar-reserva` — submits the final reservation; a `409` or `{disponible:false}` response means a race-condition conflict (something in the cart lost availability) and the UI re-fetches the catalog and asks the user to review.

State model:
- `carrito` (cart) is an array of line items with `tipo` of `"combo"`, `"individual"`, or `"adicional"`. Combo items carry an `elecciones` array of chosen sub-service IDs. The cart is persisted to `localStorage` under `party360_carrito` with a 30-minute TTL (`CARRITO_TTL_MIN`) — treat "expired cart" as a normal, expected state, not a bug.
- The booking UI is a single-page step flow (not real routing): `.paso` sections are shown/hidden via a `mostrarPaso(idPaso)` helper that also drives the `pasos-indicador` progress stepper. Steps: catálogo → elección (combo sub-choices, conditional) → adicionales (conditional) → dirección/confirmar → confirmación final.
- On successful confirmation, the UI clears the cart and deep-links to WhatsApp (`WHATSAPP_NUMERO`) with a prefilled message returned by the backend (`data.mensajeWhatsapp`), so the actual deposit/payment coordination happens off-site over WhatsApp — this app only creates the reservation record and hands off.

### Access gate (`js/validacion-acceso.js`)

Both `acceso-clientes.html` and the (stub) comercio page validate an ID by fetching a published Google Sheet as CSV (`URL_CLIENTES` / `URL_COMERCIOS`, published via `docs.google.com/.../pub?output=csv`) and doing a naive `split(",")` row scan for a matching ID in column A, then opening a Drive folder link from a fixed column index. This is intentionally low-tech (no backend) — if you change the sheet's column order, the hardcoded column indices (`fila[6]` for clients, `fila[4]` for comercio) must be updated to match.

## Conventions

- HTML/CSS/JS identifiers, IDs, and class names are in Spanish and should stay consistent with that (e.g. `carrito`, `reserva`, `localidad`, `direccion`) — don't mix in English naming for new code in these files.
- `css/estilos.css` holds site-wide/base styles shared across pages; `css/reservas.css` holds booking-page-specific styles layered on top (both are loaded together on `reservas.html`).
- No CSS/JS bundler or minifier is in play — files are linked directly by path, so new files must be added with a `<script>`/`<link>` tag in the relevant HTML file(s) to take effect.
