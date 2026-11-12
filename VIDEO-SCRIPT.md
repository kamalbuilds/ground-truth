# Ground Truth: video script (target 2:30, hard cap 2:55)

Rule: show, don't list. Every money claim shows a real PayPal sandbox id on screen.

0:00-0:08 COLD OPEN. Black screen, typed text: "Your AI agent can book a flight, write code, buy anything." Beat. "It still can't tell you if the pharmacy is open."
0:08-0:20 THE PROBLEM. Claude/agent console. The user asks: "Is the Walgreens on this corner open all night? My kid needs medicine." The agent: "I can't see the physical world." Narration: "Agents are blind past the edge of the internet. Listings online can be out of date."
0:20-0:35 THE TWIST. The agent calls `hire_human`, $5. Timeline: HELD, with a PayPal authorization id on screen. Narration: "So Ground Truth lets your agent hire a human, and PayPal holds the money, not captures it."
0:35-0:55 THE HUMAN. A phone frame. A notification arrives: "$5 · Photo of the Walgreens storefront sign." The worker sees the price, accepts, and snaps the photo.
0:55-1:20 THE WOW. The vision model checks it live: sign text "Walgreens 24-HR PHARMACY" ✓, open_status open_24h ✓. VERIFIED. Then CAPTURED (capture id), then PAID (payout id, read back from PayPal). The agent answers: "Yes, it's a 24-hour pharmacy. Here's the photo." The payment happens before 1:20.
1:20-1:45 THE TRUST BEAT, the fail case. A second task: "Is the Rite Aid at Union Tpke & 187th St open?" The photo shows a music school where the Rite Aid used to be. The verdict: FAIL, sign reads "REAL BRAVE MUSIC INSTRUCTION & PERFORMANCE", permanently_closed. The authorization is VOIDED and nobody is paid. Narration: "Nobody gets paid for a fake. The AI judges, PayPal enforces."
1:45-2:10 WHO IT'S FOR. Quick cuts: a delivery agent checking that a door is accessible, an insurance agent confirming hail damage, a shopper agent verifying that a Marketplace couch exists. "Every AI agent needs eyes. Every human with a phone can earn."
2:10-2:30 HOW (a 6-second architecture card): MCP tool, then PayPal Orders AUTHORIZE, vision verify, Capture, Payouts. "Any agent can call it. One MCP tool."
2:30-2:40 CLOSE. Logo. "Ground Truth. Agents ask. Humans see. PayPal pays when it's true." Live URL + repo.

Recording notes: 1920x1080, real cursor, no stock footage of fake UI. Show the PayPal sandbox ids at readable size for at least 2s each. Use captions throughout.

Real ids to show (from PROOFS.md): PASS order 6MF32331JX0568151, authorization 1E1717524F071214K, capture 0DL4887586075903H, payout batch JA59SN6BUCE46, payout item MUCJL6UXDS736 SUCCESS. FAIL order 858934516D435681K, authorization 0WN72180YD1254017 VOIDED.
Live URL: https://groundtruth-agent.fly.dev/ · Repo: https://github.com/kamalbuilds/ground-truth
