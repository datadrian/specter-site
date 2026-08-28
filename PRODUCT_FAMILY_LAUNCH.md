# SPECTER product family launch checklist

This branch is a local draft. Do not publish until every checkout and fulfillment item below is complete.

## Confirmed pricing

- SPECTER Imaging: $199 one time
- SPECTER SDR: $199 one time
- SPECTER Complete bundle: $349 one time

## Blocking launch work

- Replace the live `STRIPE_PRICE_ID` with the new $199 SPECTER Imaging price. The current production environment may still point to the former $399 price.
- Create a SPECTER SDR Stripe product and $199 price.
- Create the SPECTER Complete Stripe product and $349 price.
- Extend checkout selection and webhook fulfillment so SDR purchases receive an SDR license and bundle purchases receive both product licenses.
- Finalize the SDR license agreement, download route, installer release, support pages, and production domain.
- Enable the currently disabled SDR and bundle purchase buttons only after end-to-end Stripe webhook tests pass.
- Run a full public-copy scan and verify no em dash characters were introduced.
