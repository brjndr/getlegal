# getlegal frontend

A Next.js app for creating a Mutual NDA. Fill in the form and the agreement
updates alongside it; **Download PDF** opens the browser's print dialog, where
you choose "Save as PDF".

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## How it fits together

- `app/page.tsx` reads the Standard Terms from `../templates/Mutual-NDA.md` at
  build time (`lib/standard-terms.ts`), so the repo's templates stay the single
  source of the agreement text.
- `components/nda-creator.tsx` holds the form state and lays out the form
  (`nda-form.tsx`) next to the document (`nda-document.tsx`).
- The Standard Terms are shown word for word. The details you enter appear on
  the Cover Page, which is how the Common Paper Mutual NDA is designed to be
  completed.
