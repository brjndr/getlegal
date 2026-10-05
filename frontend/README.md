# getlegal frontend

A Next.js app for creating a Mutual NDA. Fill in the form and the agreement
updates alongside it; **Download PDF** opens the browser's print dialog, where
you choose "Save as PDF".

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Signing in needs the backend running on
http://localhost:8000; see the README in the repo root.

## Checks

```bash
npm test        # unit and component tests (Vitest)
npm run lint
npm run build
```

The tests compare the Standard Terms shown in the app against
`../templates/Mutual-NDA.md`, so a parsing change that drops or alters any of
the agreement text fails the suite.

## How it fits together

- `app/page.tsx` reads the Standard Terms from `../templates/Mutual-NDA.md` at
  build time (`lib/standard-terms.ts`), so the repo's templates stay the single
  source of the agreement text.
- The build is a static export (`out/`), which the backend serves. Nothing in
  the app can depend on a Next.js server at run time.
- `components/auth-gate.tsx` sends anyone who has not signed in to `/login`.
  The session (`lib/session.ts`) is the email kept in the browser; there is no
  authentication yet.
- `components/nda-creator.tsx` holds the form state and lays out the form
  (`nda-form.tsx`) next to the document (`nda-document.tsx`).
- The Standard Terms are shown word for word. The details you enter appear on
  the Cover Page, which is how the Common Paper Mutual NDA is designed to be
  completed.
