# Ground Truth

**Tagline:** Your AI agent hires a human for $5. PayPal only pays when the photo proves it.

- Live demo: https://groundtruth-agent.fly.dev/
- Code: https://github.com/kamalbuilds/ground-truth
- Proofs: [PROOFS.md](PROOFS.md) (every PayPal id below is real, sandbox, read back from the PayPal API)

## Inspiration

AI agents can book, buy and write code, but they cannot see the physical world. Is the pharmacy open right now? Is that store still there? An agent has no way to know.

People are already renting out their eyes to agents. RentAHuman launched in February 2026 and passed 787k profiles ([rentahuman.ai/about](https://rentahuman.ai/about)). It pays in crypto or a RentAHuman wallet, and coverage of the company reports it is "currently manually handling any disputes" ([source](https://www.winzheng.com/en/article/rentahuman-rise-bots-hire-humans)). (Both figures are the sources' own claims.)

We asked a simple question: what if PayPal were the trust layer between an agent and a human? The agent's money is held, not spent. A vision model checks the evidence. PayPal only releases the money when the photo proves the answer, and a fake photo costs the agent nothing.

## What it does

1. An agent calls one tool: `hire_human(question, location, budget)`.
2. PayPal **authorizes** $5 from the agent's wallet (Orders v2, `intent: AUTHORIZE`). The money is held, not captured.
3. A nearby human sees the task and the price, accepts, and uploads a photo.
4. A vision model reads the photo against the task and returns a strict JSON verdict: `{pass, reasons[], sign_text, open_status, answer}`.
5. **PASS:** PayPal **captures** the authorization and **Payouts** sends $5 to the worker's PayPal account.
   **FAIL:** the authorization is **voided**. Nothing is captured and nobody is paid.
6. The agent gets back its answer, the photo, the verdict and every PayPal id as proof.

The AI makes the judgment. PayPal enforces it.

## How we built it

- **Server:** Node.js + Express, with multer for photo uploads.
- **Vision:** Google Gemini `gemini-3.5-flash` through the Gemini REST API with `responseMimeType: application/json` and temperature 0. If the model is busy, the server falls back to `gemini-3.8-flash`, `gemini-flash-latest`, then `gemini-3.5-flash-lite`. If no model answers, the verdict is FAIL and the money is not released.
- **PayPal (sandbox):**
  - `POST /v2/checkout/orders` with `intent: AUTHORIZE` and a card payment source (the agent's wallet is a PayPal sandbox test Visa), so the hold is placed instantly with no buyer redirect.
  - `POST /v2/payments/authorizations/{id}/capture` on PASS, `POST /v2/payments/authorizations/{id}/void` on FAIL.
  - `POST /v1/payments/payouts` to pay the worker.
  - Every write is read back with a GET (`/v2/checkout/orders/{id}`, `/v2/payments/authorizations/{id}`, `/v2/payments/captures/{id}`, `/v1/payments/payouts/{batch}`), and the UI only shows the status PayPal returns.
- **Agent tools (MCP-style HTTP endpoints):**
  - `GET /mcp/tools` lists the tools and their input schemas.
  - `POST /mcp/tools/hire_human` posts a task and places the PayPal hold.
  - `POST /mcp/tools/task_status` returns the verdict and all PayPal statuses.
- **Safety in code, not in the prompt:** a task settles once (photo uploads are refused unless the task is still HELD), the capture amount is the task's own budget, and any vision error means FAIL, which voids the hold.
- **Hosting:** Fly.io.

## Real sandbox proof (from PROOFS.md)

**PASS:** "Is the Walgreens on this corner a 24-hour pharmacy?"

| Step | PayPal id | Status |
|---|---|---|
| Order (AUTHORIZE, $5.00) | `6MF32331JX0568151` | COMPLETED |
| Authorization (hold) | `1E1717524F071214K` | CAPTURED |
| Vision verdict | gemini-3.5-flash | PASS, sign "Walgreens 24-HR PHARMACY", `open_24h` |
| Capture | `0DL4887586075903H` | COMPLETED, $5.00 |
| Payout batch | `JA59SN6BUCE46` | SUCCESS |
| Payout item | `MUCJL6UXDS736` (transaction `38171714HM628944X`) | SUCCESS |

**FAIL:** "Is the Rite Aid pharmacy at Union Tpke & 187th St open right now?" The photo shows a music school where the Rite Aid used to be.

| Step | PayPal id | Status |
|---|---|---|
| Order (AUTHORIZE, $5.00) | `858934516D435681K` | COMPLETED |
| Authorization (hold) | `0WN72180YD1254017` | VOIDED |
| Vision verdict | gemini-3.5-flash | FAIL, sign "REAL BRAVE MUSIC INSTRUCTION & PERFORMANCE", `permanently_closed` |
| Capture / payout | none | not captured, not paid |

## Challenges we ran into

- **Attaching money to an AI judgment safely.** The model only returns a verdict. Code decides what happens to the money, and every failure path (bad JSON, model unavailable, wrong store) ends in a void, never a payment.
- **No buyer redirect in an agent flow.** An agent can't click "Approve" on a PayPal page, so the hold uses a card payment source and authorizes in one call.
- **Payouts to the right account.** Our first payouts came back `UNCLAIMED` because the worker email was not a confirmed sandbox account. We now pay a registered sandbox personal account and read the item back until it reports `SUCCESS`.
- **Vision model capacity.** Some Gemini models returned 503 under load, so the server tries a short list of models in order.

## Accomplishments that we're proud of

- A full money loop on real PayPal sandbox APIs: authorize, verify, capture, payout, or void.
- The fail case is the feature: a fake or wrong photo voids the hold and costs the agent nothing.
- Any agent can use it through three MCP-style endpoints.

## What we learned

Authorize-then-capture is the right primitive for paying humans on behalf of agents. It turns "trust the worker" into "trust the evidence".

## What's next

- Worker reputation and location proof (EXIF time and GPS checks).
- Disputes routed through PayPal instead of handled by hand.
- More task types: deliveries, inspections, "does this listing exist".

## Honest limits

- Sandbox only. No real money moves.
- The PASS and FAIL demo photos are real public photos from Wikimedia Commons, not taken by a live worker, so the demo is reproducible. Uploading your own photo runs the exact same path.
- Tasks are kept in memory.

## Photo credits

- "Local markets nlv walgreens storefront 2" by Ken Lund, Wikimedia Commons, CC BY-SA 2.0.
- "Union Tpke 187th St (2022-07-03) 03 - Real Brave Music School (Former Rite Aid)" by Tdorante10, Wikimedia Commons, CC BY-SA 4.0.
