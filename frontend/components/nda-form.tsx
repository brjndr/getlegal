import { useId, type ReactNode } from "react";
import type { NdaForm, Party, PartyKey } from "@/lib/nda";

export const inputClass =
  "w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus-visible:border-pen focus-visible:outline-2 focus-visible:outline-pen/30";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-rule px-4 py-6 first:border-t-0 sm:px-6">
      <legend className="float-left mb-4 w-full font-serif text-lg font-medium">
        {title}
      </legend>
      <div className="clear-both space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function YearsInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="number"
      min={1}
      step={1}
      inputMode="numeric"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClass} w-20 disabled:opacity-50`}
    />
  );
}

function PartyFields({
  party,
  onChange,
}: {
  party: Party;
  onChange: (patch: Partial<Party>) => void;
}) {
  return (
    <>
      <Field label="Company">
        {(id) => (
          <input
            id={id}
            type="text"
            autoComplete="off"
            value={party.company}
            onChange={(event) => onChange({ company: event.target.value })}
            className={inputClass}
          />
        )}
      </Field>
      <Field label="Signer’s name">
        {(id) => (
          <input
            id={id}
            type="text"
            autoComplete="off"
            value={party.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className={inputClass}
          />
        )}
      </Field>
      <Field label="Signer’s title">
        {(id) => (
          <input
            id={id}
            type="text"
            autoComplete="off"
            value={party.title}
            onChange={(event) => onChange({ title: event.target.value })}
            className={inputClass}
          />
        )}
      </Field>
      <Field
        label="Notice address"
        hint="An email or postal address where legal notices can be sent."
      >
        {(id) => (
          <input
            id={id}
            type="text"
            autoComplete="off"
            value={party.noticeAddress}
            onChange={(event) => onChange({ noticeAddress: event.target.value })}
            className={inputClass}
          />
        )}
      </Field>
    </>
  );
}

export function NdaFormFields({
  form,
  effectiveDate,
  onChange,
}: {
  form: NdaForm;
  effectiveDate: string;
  onChange: (patch: Partial<NdaForm>) => void;
}) {
  const changeParty = (key: PartyKey) => (patch: Partial<Party>) =>
    onChange({ [key]: { ...form[key], ...patch } });

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <Section title="Purpose">
        <Field
          label="How confidential information may be used"
          hint="Both parties may only use what they receive for this purpose."
        >
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={form.purpose}
              onChange={(event) => onChange({ purpose: event.target.value })}
              className={inputClass}
            />
          )}
        </Field>
      </Section>

      <Section title="Dates and terms">
        <Field label="Effective date">
          {(id) => (
            <input
              id={id}
              type="date"
              value={effectiveDate}
              onChange={(event) => onChange({ effectiveDate: event.target.value })}
              className={inputClass}
            />
          )}
        </Field>

        <div role="radiogroup" aria-labelledby="mnda-term-label">
          <p id="mnda-term-label" className="mb-2 text-sm font-medium">
            How long the NDA lasts
          </p>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mndaTerm"
                checked={form.mndaTerm === "expires"}
                onChange={() => onChange({ mndaTerm: "expires" })}
                className="accent-pen"
              />
              Expires after
              <YearsInput
                label="Years until the NDA expires"
                value={form.mndaTermYears}
                disabled={form.mndaTerm !== "expires"}
                onChange={(mndaTermYears) => onChange({ mndaTermYears })}
              />
              year(s)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mndaTerm"
                checked={form.mndaTerm === "until-terminated"}
                onChange={() => onChange({ mndaTerm: "until-terminated" })}
                className="accent-pen"
              />
              Continues until either party ends it
            </label>
          </div>
        </div>

        <div role="radiogroup" aria-labelledby="confidentiality-term-label">
          <p id="confidentiality-term-label" className="mb-2 text-sm font-medium">
            How long confidential information stays protected
          </p>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="confidentialityTerm"
                checked={form.confidentialityTerm === "years"}
                onChange={() => onChange({ confidentialityTerm: "years" })}
                className="accent-pen"
              />
              For
              <YearsInput
                label="Years confidential information stays protected"
                value={form.confidentialityYears}
                disabled={form.confidentialityTerm !== "years"}
                onChange={(confidentialityYears) =>
                  onChange({ confidentialityYears })
                }
              />
              year(s)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="confidentialityTerm"
                checked={form.confidentialityTerm === "perpetuity"}
                onChange={() => onChange({ confidentialityTerm: "perpetuity" })}
                className="accent-pen"
              />
              Forever
            </label>
          </div>
        </div>
      </Section>

      <Section title="Governing law">
        <Field label="State whose laws apply">
          {(id) => (
            <input
              id={id}
              type="text"
              placeholder="Delaware"
              value={form.governingLaw}
              onChange={(event) => onChange({ governingLaw: event.target.value })}
              className={inputClass}
            />
          )}
        </Field>
        <Field
          label="Where disputes are heard"
          hint="A city or county and state. The agreement reads “courts located in …”."
        >
          {(id) => (
            <input
              id={id}
              type="text"
              placeholder="New Castle, DE"
              value={form.jurisdiction}
              onChange={(event) => onChange({ jurisdiction: event.target.value })}
              className={inputClass}
            />
          )}
        </Field>
      </Section>

      <Section title="Changes to the standard terms">
        <Field
          label="Modifications"
          hint="Leave empty to use the standard terms as they are."
        >
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={form.modifications}
              onChange={(event) => onChange({ modifications: event.target.value })}
              className={inputClass}
            />
          )}
        </Field>
      </Section>

      <Section title="Party 1">
        <PartyFields party={form.party1} onChange={changeParty("party1")} />
      </Section>

      <Section title="Party 2">
        <PartyFields party={form.party2} onChange={changeParty("party2")} />
      </Section>
    </form>
  );
}
