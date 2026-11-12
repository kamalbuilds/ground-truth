# Ground Truth: PayPal sandbox transaction proofs

Recorded 2026-11-12 23:55 IST (18:25 UTC) by running the real API locally (`GET /api/demo/{pass|fail}` then `POST /api/demo/{pass|fail}/photo`).
Every status below was read back from a PayPal GET endpoint after the write call, and re-checked at 23:56 IST.
Environment: PayPal **sandbox** (`api-m.sandbox.paypal.com`). The agent's wallet is a PayPal sandbox test Visa, so the Orders v2 `AUTHORIZE` order authorizes immediately with no buyer redirect.
Vision: Google Gemini (`gemini-3.5-flash`), strict JSON verdict `{pass, reasons[], sign_text, open_status}`.

## PASS: "Is the Walgreens on this corner a 24-hour pharmacy?"

Evidence photo: `evidence/walgreens-24hr-pharmacy.jpg` ("Local markets nlv walgreens storefront 2", Ken Lund, Wikimedia Commons, CC BY-SA 2.0)

| Step | PayPal id | Status (read back) |
|---|---|---|
| Order (intent AUTHORIZE, $5.00) | `4L249042LY8548646` | COMPLETED |
| Authorization (hold) | `79E76791CB4290020` | CREATED, then CAPTURED |
| Vision verdict | gemini-3.5-flash | **PASS**. sign_text "Walgreens 24-HR PHARMACY", open_status `open_24h` |
| Capture | `9EJ97542LN928631N` | **COMPLETED** ($5.00) |
| Worker payout batch | `T67G7YCK3BVBQ` | batch SUCCESS |
| Worker payout item | `TJLKKA5U5X4QU` | **UNCLAIMED** (RECEIVER_UNREGISTERED: the demo worker email is not a registered sandbox account, so the $5 waits for the worker to claim it) |

Agent answer: "Yes, the Walgreens at this location features a 24-hour pharmacy."

## FAIL: "Is the Rite Aid pharmacy at Union Tpke & 187th St open right now?"

Evidence photo: `evidence/former-rite-aid-music-school.jpg` ("Union Tpke 187th St (2022-07-03) 03 - Real Brave Music School (Former Rite Aid)", Tdorante10, Wikimedia Commons, CC BY-SA 4.0)

| Step | PayPal id | Status (read back) |
|---|---|---|
| Order (intent AUTHORIZE, $5.00) | `858934516D435681K` | COMPLETED |
| Authorization (hold) | `0WN72180YD1254017` | CREATED, then **VOIDED** |
| Vision verdict | gemini-3.5-flash | **FAIL**. sign_text "REAL BRAVE MUSIC INSTRUCTION & PERFORMANCE", open_status `permanently_closed`. Reason: "The photo does not show a Rite Aid pharmacy..." |
| Capture | none | NOT CAPTURED |
| Worker payout | none | NOT PAID |

## What is real vs. not

- Real: PayPal Orders v2 authorize, capture and void, plus the Payouts API call (sandbox). Gemini vision verdicts.
- Sandbox only: no real money moves. The demo worker email is unregistered, so the payout item is UNCLAIMED rather than SUCCESS.
- Demo photos are real public Wikimedia Commons photos, not taken by a live worker. The `/api/hire` and `/api/task/:id/photo` endpoints run the identical path for a real uploaded photo.
