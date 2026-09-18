# Identifier-free website usage counts

Changed September 17, 2026 at the owner's request. Applies to Imaging and SDR websites, not application telemetry or checkout/legal acceptance.

## Collection contract

The browser sends only `type` (`pageview` or `download`) and `path`. Requests omit credentials and the Referer header. No identifier, session, heartbeat, raw referrer, campaign tag, device fingerprint, user-agent property, location or purchase data is sent in the application payload. Browsers necessarily send network metadata to the host; operational processing is covered separately in the privacy notice.

The backend ignores arbitrary extra body fields and request headers. It accepts only enumerated static public paths from `analytics-public-paths.json`, strips query/fragment components, and records exactly `site`, `type`, `path`, the UTC date represented at midnight in `ts`, and `anonymous: true`. A server-generated random storage key prevents concurrent-write collisions; it is not given to a browser, does not identify a person and is never reused across events. These are unlinked count entries, summed into daily/page totals. No precise arrival timestamp is stored by our analytics code. Host-level storage metadata and operational logs are separate.

The sites remain independently identified server-side. Untagged historical events remain Imaging data. Existing history is preserved, but the admin now reports only pageviews and download clicks, not unique people, sessions, returning visitors, geography, sources or advertising attribution. No new data is linked to old identifiers or to checkout, licensing, support or external advertising systems.

Add new public page paths to the allowlist when adding pages. Unknown paths are deliberately discarded, including all admin paths. Counter failures never block navigation or downloads, but return 503 instead of pretending data was saved.

## User controls

No consent popup is shown. A visible inline footer notice links to the privacy page and its free opt-out control. Global Privacy Control, Do Not Track and earlier saved refusals suppress counting. Opt-out stores only `specter_analytics_opt_out_v1=1`, a preference without an identifier. If browser storage is unavailable, opt-out remains effective for the current page; visitors can also use GPC/DNT for a persistent browser-level signal. Old visitor/session/campaign identifiers are removed from local storage and their cookies expired on each page load without reading or transmitting their values. Original refusals remain respected.

## Regulatory design basis and limits

Reviewed September 17, 2026:

- ICO statistical-purpose exception: narrow service-improvement audience measurement, clear information, simple free objection, no advertising/profiling reuse: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/
- CNIL audience-measurement guidance: notice, objection, limited purpose, no customer-data combination, single-publisher scope, data minimization. CNIL expressly notes national variation: https://www.cnil.fr/en/sheet-ndeg16-use-analytics-your-websites-and-applications

The implementation deliberately avoids analytical device identifiers altogether. It is not a certification or a universal legal opinion. Local requirements, host/subprocessor arrangements and international-transfer obligations still require appropriate review. Adding pixels, unique-visitor estimation, fingerprinting, ad attribution or user profiles requires a new review and may require prior consent. Do not remove opt-out or notice on the basis that the system is cookie-free.

## Accuracy limits

These are browser-reported page loads and link clicks, not a census of people or confirmed downloads/installs. Repeat visits can count again. Script blockers, privacy signals, offline requests and bots can affect totals. Earlier traffic lost to the SDR endpoint's previous 404 cannot be recreated. No counts or historical visits are fabricated.
