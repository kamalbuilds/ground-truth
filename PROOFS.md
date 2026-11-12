# Ground Truth: PayPal sandbox transaction proofs

Recorded 2026-11-12 23:55 IST (18:25 UTC) by running the real API locally (`GET /api/demo/{pass|fail}` then `POST /api/demo/{pass|fail}/photo`).
Every status below was read back from a PayPal GET endpoint after the write call, and re-checked at 23:56 IST.
Environment: PayPal **sandbox** (`api-m.sandbox.paypal.com`). The agent's wallet is a PayPal sandbox test Visa, so the Orders v2 `AUTHORIZE` order authorizes immediately with no buyer redirect.
Vision: Google Gemini (`gemini-3.5-flash`), strict JSON verdict `{pass, reasons[], sign_text, open_status}`.

## PASS: "Is the Walgreens on this corner a 24-hour pharmacy?"

Recorded 2026-11-13 00:00 IST (18:29:53 UTC); payout re-read 00:02 IST.
Evidence photo: `evidence/walgreens-24hr-pharmacy.jpg` ("Local markets nlv walgreens storefront 2", Ken Lund, Wikimedia Commons, CC BY-SA 2.0)
Worker: PayPal sandbox personal account `sb-7eas348407833@personal.example.com`

| Step | PayPal id | Status (read back) |
|---|---|---|
| Order (intent AUTHORIZE, $5.00) | `6MF32331JX0568151` | COMPLETED |
| Authorization (hold) | `1E1717524F071214K` | CREATED, then CAPTURED |
| Vision verdict | gemini-3.5-flash | **PASS**. sign_text "Walgreens 24-HR PHARMACY", open_status `open_24h` |
| Capture | `0DL4887586075903H` | **COMPLETED** ($5.00) |
| Worker payout batch | `JA59SN6BUCE46` | **SUCCESS** |
| Worker payout item | `MUCJL6UXDS736` (transaction `38171714HM628944X`) | **SUCCESS**: $5.00 landed in the worker's sandbox PayPal account |

Agent answer: "Yes, the Walgreens on this corner is a 24-hour pharmacy as clearly indicated by the '24-HR PHARMACY' sign on the building."

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
- Sandbox only: no real money moves. The worker is a PayPal sandbox personal account, and the payout item reads back SUCCESS.
- Demo photos are real public Wikimedia Commons photos, not taken by a live worker. The `/api/hire` and `/api/task/:id/photo` endpoints run the identical path for a real uploaded photo.
