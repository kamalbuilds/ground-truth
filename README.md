# Ground Truth

An agent requests a physical-world check, a worker submits a photo, and the photo verdict controls sandbox payment settlement.

## Run

```sh
cp .env.example .env
# Add PayPal sandbox client credentials and optional GEMINI_API_KEY
npm install && npm start
```

Open `http://localhost:3000`. The PASS and FAIL demo buttons use clearly labeled synthetic SVG evidence and do not call PayPal. Live requests create a PayPal Orders v2 authorization; the payer must approve it before the worker task can be completed. Configure a Gemini API key for actual image analysis. PayPal Payouts capability is displayed from the connected account; if disbursement is unavailable, the app reports payout queued after capture.

## Status

This build uses PayPal sandbox endpoints. Synthetic examples are labeled. Do not interpret demo statuses as PayPal transactions. A live transaction requires a payer-approved authorization, an uploaded image, and a configured vision key.
