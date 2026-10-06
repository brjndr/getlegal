import type { ReactNode } from "react";
import { formatDate, formatYears, type NdaForm } from "@/lib/nda";
import type { Clause } from "@/lib/standard-terms";

/**
 * A value the user supplies. Filled values read as pen ink; missing ones are
 * highlighted on screen and become a blank line to write on when printed.
 */
export function Fill({ value, placeholder }: { value: string; placeholder: string }) {
  const text = value.trim();
  if (text) {
    return <span className="whitespace-pre-wrap text-pen print:text-ink">{text}</span>;
  }
  return (
    <span
      data-blank
      className="rounded-sm bg-highlight px-1 text-muted print:rounded-none print:border-b print:border-ink print:bg-transparent print:text-transparent"
    >
      {placeholder}
    </span>
  );
}

function Checkbox({ checked, children }: { checked: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        data-checkbox
        className="mt-1 flex size-4 shrink-0 items-center justify-center border border-ink text-xs leading-none font-semibold text-pen print:text-ink"
      >
        {checked ? "✕" : ""}
      </span>
      <span>
        <span className="sr-only">{checked ? "Selected: " : "Not selected: "}</span>
        {children}
      </span>
    </li>
  );
}

export function CoverSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h3 className="font-sans text-base font-semibold">{title}</h3>
      {note && <p className="font-sans text-sm text-muted">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

const cellClass = "border border-rule px-3 py-2 align-top";

function SignatureRow({
  label,
  note,
  tall,
  values,
}: {
  label: string;
  note?: string;
  tall?: boolean;
  values?: [string, string];
}) {
  return (
    <tr className={tall ? "h-16" : undefined}>
      <th scope="row" className={`${cellClass} w-1/4 text-left font-sans text-sm font-semibold`}>
        {label}
        {note && <span className="block text-xs font-normal text-muted">{note}</span>}
      </th>
      {[0, 1].map((index) => (
        <td key={index} className={`${cellClass} wrap-anywhere text-pen print:text-ink`}>
          {values?.[index]}
        </td>
      ))}
    </tr>
  );
}

export type SignerDetail = "name" | "title" | "company" | "noticeAddress";

/** Where the two parties sign, with what is known about each signer filled in. */
export function SignatureTable({
  parties,
  details,
}: {
  parties: [string, string];
  details: Record<SignerDetail, [string, string]>;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-md table-fixed border-collapse text-base print:min-w-0">
        <thead>
          <tr className="font-sans text-sm">
            <td className={`${cellClass} w-1/4`} />
            {parties.map((party) => (
              <th key={party} scope="col" className={`${cellClass} font-semibold`}>
                {party}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <SignatureRow label="Signature" tall />
          <SignatureRow label="Print Name" values={details.name} />
          <SignatureRow label="Title" values={details.title} />
          <SignatureRow label="Company" values={details.company} />
          <SignatureRow
            label="Notice Address"
            note="Use either email or postal address"
            values={details.noticeAddress}
          />
          <SignatureRow label="Date" />
        </tbody>
      </table>
    </div>
  );
}

export const articleClass =
  "mx-auto max-w-[8.5in] bg-paper px-6 py-10 font-serif text-[1.0625rem] leading-relaxed shadow-[0_1px_2px_rgb(26_31_43/0.12),0_12px_32px_-12px_rgb(26_31_43/0.25)] sm:px-14 sm:py-16 print:max-w-none print:p-0 print:text-[11pt] print:shadow-none";

/** The Standard Terms start a new page when the document is printed or saved as a PDF. */
export const termsClass =
  "mt-14 border-t border-rule pt-10 print:mt-0 print:break-before-page print:border-0 print:pt-0";

/** A term the Cover Page defines, where the Standard Terms refer to it. */
export const termClass =
  "underline decoration-rule decoration-2 underline-offset-4 print:no-underline";

export function NdaDocument({
  form,
  effectiveDate,
  clauses,
}: {
  form: NdaForm;
  effectiveDate: string;
  clauses: Clause[];
}) {
  const mndaTermYears = formatYears(form.mndaTermYears);
  const confidentialityYears = formatYears(form.confidentialityYears);

  return (
    <article className={articleClass}>
      <h2 className="text-3xl leading-tight font-medium tracking-tight sm:text-4xl">
        Mutual Non-Disclosure Agreement
      </h2>
      <p className="mt-5">
        This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: (1) this
        Cover Page (“<strong>Cover Page</strong>”) and (2) the Common Paper
        Mutual NDA Standard Terms Version 1.0 (“<strong>Standard Terms</strong>
        ”) identical to those posted at{" "}
        <a
          href="https://commonpaper.com/standards/mutual-nda/1.0"
          className="underline"
        >
          commonpaper.com/standards/mutual-nda/1.0
        </a>
        . Any modifications of the Standard Terms should be made on the Cover
        Page, which will control over conflicts with the Standard Terms.
      </p>

      <CoverSection title="Purpose" note="How Confidential Information may be used">
        <p>
          <Fill value={form.purpose} placeholder="Describe the purpose" />
        </p>
      </CoverSection>

      <CoverSection title="Effective Date">
        <p>
          <Fill value={formatDate(effectiveDate)} placeholder="Effective date" />
        </p>
      </CoverSection>

      <CoverSection title="MNDA Term" note="The length of this MNDA">
        <ul className="space-y-1">
          <Checkbox checked={form.mndaTerm === "expires"}>
            Expires{" "}
            {form.mndaTerm === "expires" ? (
              <Fill value={mndaTermYears} placeholder="number of years" />
            ) : (
              "1 year(s)"
            )}{" "}
            from Effective Date.
          </Checkbox>
          <Checkbox checked={form.mndaTerm === "until-terminated"}>
            Continues until terminated in accordance with the terms of the MNDA.
          </Checkbox>
        </ul>
      </CoverSection>

      <CoverSection
        title="Term of Confidentiality"
        note="How long Confidential Information is protected"
      >
        <ul className="space-y-1">
          <Checkbox checked={form.confidentialityTerm === "years"}>
            {form.confidentialityTerm === "years" ? (
              <Fill value={confidentialityYears} placeholder="number of years" />
            ) : (
              "1 year(s)"
            )}{" "}
            from Effective Date, but in the case of trade secrets until
            Confidential Information is no longer considered a trade secret
            under applicable laws.
          </Checkbox>
          <Checkbox checked={form.confidentialityTerm === "perpetuity"}>
            In perpetuity.
          </Checkbox>
        </ul>
      </CoverSection>

      <CoverSection title="Governing Law & Jurisdiction">
        <p>
          Governing Law: <Fill value={form.governingLaw} placeholder="State" />
        </p>
        <p className="mt-1">
          Jurisdiction:{" "}
          <Fill value={form.jurisdiction} placeholder="City or county and state" />
        </p>
      </CoverSection>

      <CoverSection title="MNDA Modifications">
        <p>
          {form.modifications.trim() ? (
            <Fill value={form.modifications} placeholder="" />
          ) : (
            "None."
          )}
        </p>
      </CoverSection>

      <section className="mt-9 break-inside-avoid">
        <p>
          By signing this Cover Page, each party agrees to enter into this MNDA
          as of the Effective Date.
        </p>
        <SignatureTable
          parties={["Party 1", "Party 2"]}
          details={{
            name: [form.party1.name, form.party2.name],
            title: [form.party1.title, form.party2.title],
            company: [form.party1.company, form.party2.company],
            noticeAddress: [form.party1.noticeAddress, form.party2.noticeAddress],
          }}
        />
      </section>

      <section data-page-break className={termsClass}>
        <h2 className="text-2xl font-medium tracking-tight">Standard Terms</h2>
        <ol className="mt-5 list-decimal space-y-4 pl-6">
          {clauses.map((clause) => (
            <li key={clause.title}>
              <strong>{clause.title}</strong>.{" "}
              {clause.body.map((segment, index) =>
                segment.type === "bold" ? (
                  <strong key={index}>{segment.text}</strong>
                ) : segment.type === "coverPageTerm" ? (
                  <span key={index} className={termClass}>
                    {segment.text}
                  </span>
                ) : (
                  segment.text
                ),
              )}
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-10 font-sans text-xs text-muted">
        Common Paper Mutual Non-Disclosure Agreement{" "}
        <a
          href="https://commonpaper.com/standards/mutual-nda/1.0/"
          className="underline"
        >
          Version 1.0
        </a>{" "}
        free to use under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" className="underline">
          CC BY 4.0
        </a>
        .
      </p>
    </article>
  );
}
