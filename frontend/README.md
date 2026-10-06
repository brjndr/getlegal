# getlegal frontend

A Next.js app for drafting legal agreements. Chat with the AI assistant and
the agreement fills in alongside the conversation; **Download PDF** saves it as
a PDF file.

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Signing in and the chat need the backend
running on http://localhost:8000; see the README in the repo root.

## Checks

```bash
npm test        # unit and component tests (Vitest)
npm run lint
npm run build
```

The tests compare the agreement text the app reads against the files in
`../templates/`, so a parsing change that drops or alters any of it fails the
suite. They also check that every variable in a template is one its entry in
`../documents/specs.json` knows how to show.

## How it fits together

- `app/page.tsx` reads the list of documents from `../documents/specs.json`
  and the Mutual NDA's Standard Terms from `../templates/Mutual-NDA.md` at
  build time, so the repo's templates stay the single source of the agreement
  text.
- `app/templates.json/route.ts` reads the other ten templates at build time
  (`lib/template.ts`) and writes them to `out/templates.json`, which the page
  fetches when one of those documents is chosen.
- The build is a static export (`out/`), which the backend serves. Nothing in
  the app can depend on a Next.js server at run time.
- `components/app-shell.tsx` frames every screen of the platform with the
  header and footer. Inside it, `components/auth-gate.tsx` sends anyone who has
  not signed in to `/login`. `components/auth-form.tsx` is both the sign-in
  and the sign-up screen.
- The session is a cookie that scripts cannot read, so `lib/session.ts` asks
  the backend who is signed in. Whenever the backend answers that nobody is,
  `lib/api.ts` tells the session, which sends the user to sign in again.
- `components/workspace.tsx` holds the draft (`lib/draft.ts`) and lays out the
  chat (`draft-chat.tsx`) next to the document: `nda-document.tsx` for the
  Mutual NDA, `generated-document.tsx` for the others. On a phone it shows one
  of the two at a time.
- After each reply the workspace saves the agreement and its conversation
  (`lib/use-autosave.ts`). Saves are made one at a time and in order, because
  the first one comes back with the id that the rest save to.
- `components/workspace-loader.tsx` opens the saved document that the address
  names (`/?doc=12`), and puts a new document's id in the address once it is
  saved, so that reloading the page comes back to it. A static export cannot
  have a page per document, which is why the id is in the query.
- `components/document-list.tsx` is the My documents page.
- `components/draft-chat.tsx` sends each message to the backend with the
  conversation so far and the current values, and passes the updated draft
  back to the workspace. When the assistant answers that the user chose a
  document, the chat starts that document empty and sends the same message
  again, so nothing is carried over from the previous one.
- The Mutual NDA's Standard Terms are shown word for word, with the details
  you give on its Cover Page. The other documents have no Cover Page template,
  so one is generated from the document's fields. In their Standard Terms the
  parties are named, and each of your other values is shown beside the term
  it defines.
- `lib/pdf.ts` builds the PDF from the agreement as it is shown on the page,
  using pdfmake, which is loaded only when the button is pressed. It adds the
  warning in `lib/disclaimer.ts` to the foot of every page.
