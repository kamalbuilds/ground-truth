# Ground Truth

Your AI agent hires a human for $5. PayPal only pays when the photo proves it.

Live: https://groundtruth-agent.fly.dev/ · Proofs: [PROOFS.md](PROOFS.md) · Devpost text: [DEVPOST.md](DEVPOST.md)

## How it works

1. An agent calls `hire_human(question, location, budget)`.
2. PayPal Orders v2 `intent: AUTHORIZE` holds the money (sandbox test Visa as the agent's wallet, no redirect).
3. A worker uploads a photo.
4. Gemini `gemini-3.5-flash` returns a strict JSON verdict `{pass, reasons[], sign_text, open_status, answer}`.
5. PASS: capture the authorization, then PayPal Payouts pays the worker. FAIL: void the authorization.
6. Every PayPal status is read back from a GET endpoint before it is shown.

## Agent endpoints (MCP-style)

- `GET /mcp/tools`
- `POST /mcp/tools/hire_human` with `{ "question", "location", "budget" }`
- `POST /mcp/tools/task_status` with `{ "task_id" }`

App endpoints: `GET /api/status`, `POST /api/hire`, `GET /api/task/:id`, `POST /api/task/:id/photo`, and the demo pair `GET /api/demo/{pass|fail}` + `POST /api/demo/{pass|fail}/photo` (real PayPal and Gemini calls with the photos in `evidence/`).

## Run

```sh
cp .env.example .env
# PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET (sandbox), GEMINI_API_KEY, PAYOUT_EMAIL (a sandbox personal account)
npm install && npm start
```

Open http://localhost:3000.

## Status

PayPal sandbox only; no real money moves. If Payouts fails, the app shows "Worker payout: queued" and never fakes SUCCESS. Tasks are kept in memory.

## Photo credits

- "Local markets nlv walgreens storefront 2" by Ken Lund, Wikimedia Commons, CC BY-SA 2.0.
- "Union Tpke 187th St (2022-07-03) 03 - Real Brave Music School (Former Rite Aid)" by Tdorante10, Wikimedia Commons, CC BY-SA 4.0.
