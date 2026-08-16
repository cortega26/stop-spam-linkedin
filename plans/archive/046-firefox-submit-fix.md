# Plan 046: Fix the Firefox store submission — complete the version creation and fail loudly

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat HEAD..HEAD -- scripts/submit-stores.js .github/workflows/release.yml`
> (HEAD is current main; if these files changed since this plan was
> written, compare the excerpts below against live content before
> proceeding; on a mismatch, treat it as a STOP condition.)

## Status

- **Priority**: P1 (AMO has been stuck at 1.2.4 while three releases
  "succeeded" in CI — a silent store-publishing failure)
- **Effort**: S
- **Risk**: MED (touches the store submission path; must not break the
  working Chrome path)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5420e9a`, 2026-08-15

## Why this matters

AMO still shows 1.2.4. Root cause, verified empirically against the live
AMO API and the CI logs:

1. **`submitFirefox` only uploads — it never creates the version.**
   The AMO v5 flow is two steps: (a) `POST /addons/upload/` with the zip
   → returns an upload `uuid` (async, `processed:false` initially); (b)
   `POST /addons/addon/{addon_id}/versions/{upload_uuid}/` with
   `{"channel": "listed"}` → creates the version and submits it for
   review. The script stops after (a). The v1.3.0 CI upload was verified
   `valid:true, processed:true, submitted:false` on the AMO API — the
   file sat forever as an un-submitted upload.
2. **The script treats HTTP 200 as success.** It never checks
   `valid`/`processed`/`submitted` in the response, so CI reported
   "Mozilla Add-ons: done." for an upload that was never turned into a
   version. The AMO API's addon (id 3013362, guid
   `linkedin-spam-blocker@carlos`) currently has only 1.2.4 and 1.2.0
   published.

The Chrome path works (its response includes `uploadState: SUCCEEDED` and
publish is one call) — do not touch it.

## Current state (verified live at HEAD `5420e9a`)

- `scripts/submit-stores.js:57-96` — `submitFirefox()`:
  ```js
  async function submitFirefox() {
    // ... JWT build (apiKey/apiSecret) ...
    const fileBuffer = fs.readFileSync(zipPath);
    const formData = new FormData();
    formData.append("upload", new Blob([fileBuffer], { type: "application/zip" }), path.basename(zipPath));
    formData.append("channel", "listed");

    console.log(`Uploading ${path.basename(zipPath)} to Mozilla Add-ons...`);
    const response = await fetch("https://addons.mozilla.org/api/v5/addons/upload/", {
      method: "POST",
      headers: { Authorization: `JWT ${jwt}` },
      body: formData,
    });

    const result = await response.json();
    console.log("Response:", JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error("Firefox upload failed:", result);
      process.exit(1);
    }

    console.log("Mozilla Add-ons: done.");
  }
  ```
- `.github/workflows/release.yml:102-130` — the `firefox` job runs
  `npm run submit:firefox` with `FIREFOX_API_KEY`/`FIREFOX_API_SECRET`
  secrets. Correct env wiring; the script is the problem.

Repo conventions: the script uses `process.exit(1)` on failure with a
clear message; the repo treats store submission as a release-triggered
automation. The `.env` file (gitignored) holds the same credentials for
local runs; never print secret values — only the response bodies.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Dry-run (upload only) | `node scripts/submit-stores.js firefox` with a `DRY_RUN=1` guard (see Step 1) | prints upload uuid + valid/processed, NO version creation |
| Real submit | `node scripts/submit-stores.js firefox` | prints upload + version creation + final status |

## Scope

**In scope**:
- `scripts/submit-stores.js` (the `submitFirefox` function only)

**Out of scope** (do NOT touch):
- `submitChrome` — working; leave it byte-identical.
- `.github/workflows/release.yml` — env wiring is correct; no change.
- The zip packaging (`scripts/package-extension.js`).
- The `.env` file and any secret values.

## Git workflow

- Branch: `advisor/046-firefox-submit-fix`
- Commit message style: conventional, e.g. `fix(stores): complete Firefox version creation and check upload validity`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Rewrite `submitFirefox` — poll, validate, create the version

Replace the body of `submitFirefox()` (after the JWT build, which stays
as-is) with:

1. **Upload** (as today, but capture the uuid):
   ```js
   const uploadRes = await fetch("https://addons.mozilla.org/api/v5/addons/upload/", {
     method: "POST", headers: { Authorization: `JWT ${jwt}` }, body: formData,
   });
   const upload = await uploadRes.json();
   if (!uploadRes.ok || !upload.uuid) {
     console.error("Firefox upload failed:", JSON.stringify(upload, null, 2));
     process.exit(1);
   }
   console.log("Upload uuid:", upload.uuid);
   ```
2. **Poll until processed** (uploads are async; AMO returns
   `processed:false` immediately). Poll `GET
   /api/v5/addons/upload/{uuid}/` every 3s, up to ~60s:
   ```js
   const deadline = Date.now() + 60000;
   let status;
   do {
     await new Promise(r => setTimeout(r, 3000));
     status = await fetch(`https://addons.mozilla.org/api/v5/addons/upload/${upload.uuid}/`,
       { headers: { Authorization: `JWT ${jwt}` } }).then(r => r.json());
   } while (!status.processed && Date.now() < deadline);
   if (!status.processed) { console.error("Upload timed out"); process.exit(1); }
   if (!status.valid) {
     console.error("Firefox upload INVALID:", JSON.stringify(status.validation || status, null, 2));
     process.exit(1);
   }
   console.log("Upload valid:", status.valid, "| channel:", status.channel);
   ```
3. **Create the version** (the missing step — this is what submits to
   review):
   ```js
   const versionRes = await fetch(
     `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent("linkedin-spam-blocker@carlos")}/versions/${upload.uuid}/`,
     { method: "POST", headers: { Authorization: `JWT ${jwt}`, "Content-Type": "application/json" },
       body: JSON.stringify({ channel: "listed" }) }
   );
   const version = await versionRes.json();
   if (!versionRes.ok) {
     console.error("Firefox version creation failed:", JSON.stringify(version, null, 2));
     process.exit(1);
   }
   console.log("Version created:", version.version, "| status:", version.status);
   ```
   Read the addon id from the upload response instead of hardcoding the
   guid if the upload response carries it (`upload.addon` or similar —
   check the actual v5 response shape; the guid string is the stable
   documented form — prefer `upload.guid` when present, fall back to the
   guid constant).

**Verify**: `npm run smoke`, `npm run lint`, `npm run typecheck` → exit
0. Then a LOCAL dry-run against the real API that exercises the upload +
poll + validity check but SKIPS version creation (so you don't create a
real version twice): add a `if (process.env.DRY_RUN === "1") { console.log("DRY_RUN: skipping version creation"); return; }` guard after the validity check, and run
`DRY_RUN=1 node scripts/submit-stores.js firefox` → prints the uuid and
`Upload valid: true`, then "DRY_RUN" line, exit 0. (This confirms the
JWT, upload, and polling all work against the live API.)

### Step 2: Real submission of the CURRENT zip (1.4.0)

With the fix in place, run the real submission so AMO actually receives
the new version:

`node scripts/submit-stores.js firefox` → prints upload uuid, `Upload
valid: true`, `Version created: 1.4.0 | status: ...`, exit 0.

Then verify on the live API:
`node -e "<fetch addon versions via JWT — see the pattern in the audit>"` →
the version list shows 1.4.0 (status `pending` or `on_review` — it goes
through AMO review before going public; that is normal and expected).

**Verify**: the version list includes 1.4.0; AMO review status is
`pending`/`on_review` (NOT public yet — that's the store's review
process, out of our control).

### Step 3: Commit and full verification

- `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` → all exit 0 (63 tests)
- `git diff` shows ONLY `scripts/submit-stores.js` changed
- Commit: `fix(stores): complete Firefox version creation and check upload validity`

**Verify**: all gates green; `git status` clean.

## Test plan

No new automated tests — this is a release-script fix whose behavior is
verified against the live AMO API (Step 1 dry-run + Step 2 real
submission). A unit test would require mocking AMO, which the repo
doesn't do for the submit scripts. The dry-run/real-run pair IS the
verification.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `DRY_RUN=1 node scripts/submit-stores.js firefox` prints `Upload valid: true` and skips version creation
- [ ] `node scripts/submit-stores.js firefox` creates version 1.4.0 (response shows version + status)
- [ ] Live API check shows 1.4.0 in the addon's version list
- [ ] `git diff` touches only `scripts/submit-stores.js`
- [ ] `plans/README.md` status row updated (SKIP — reviewer maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The upload response shape doesn't include `uuid`/`processed`/`valid`
  as documented (the v5 API changed) — report the actual shape.
- The dry-run upload comes back `valid:false` — the 1.4.0 zip has a
  packaging problem; report the validation errors instead of submitting.
- The version-creation endpoint returns an error about the addon guid —
  report the correct addon id from the upload response.
- `submitChrome` gets touched by accident.

## Maintenance notes

- After this lands, the v1.4.0 tag push will submit 1.3.0 AND 1.4.0? No
  — releases are per-tag: the CURRENT 1.4.0 version on main was submitted
  in Step 2; the orphaned 1.3.0 upload on AMO can be ignored (it was
  never a version) or cleaned via the AMO dashboard. The NEXT tag push
  will submit the next version correctly through the new flow.
- The Firefox badge in README stays at 1.2.4 until AMO actually
  publishes 1.4.0 (review completes) — then bump it (that's a
  maintainer decision, plan 045 noted it).
- If AMO ever rejects the version in review, the failure is now VISIBLE
  in CI (the script fails on invalid uploads), which is the point of
  this fix.
