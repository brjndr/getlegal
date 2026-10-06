import {
  articleClass,
  CoverSection,
  Fill,
  SignatureTable,
  termClass,
  termsClass,
} from "@/components/nda-document";
import {
  fieldValue,
  partyValue,
  resolveVariable,
  type DocumentSpec,
  type PartyDetail,
  type PartySpec,
  type Values,
} from "@/lib/documents";
import type { Clause, Inline, Template } from "@/lib/template";

// A clause is set out by how deep it sits: a section, its clauses, then (a) and (i) items.
const DEPTH_CLASSES = ["mt-7 font-sans text-base font-semibold", "mt-3", "mt-2 pl-6", "mt-2 pl-12"];

function Body({
  inlines,
  spec,
  values,
}: {
  inlines: Inline[];
  spec: DocumentSpec;
  values: Values;
}) {
  return inlines.map((inline, index) => {
    if (inline.type === "text") return inline.text;
    if (inline.type === "bold") {
      return (
        <strong key={index}>
          <Body inlines={inline.children} spec={spec} values={values} />
        </strong>
      );
    }
    if (inline.type === "link") {
      return (
        <a key={index} href={inline.href} className="underline wrap-anywhere">
          {inline.text}
        </a>
      );
    }
    const resolved = resolveVariable(spec, values, inline.name);
    if (resolved.type === "party") {
      return (
        <span key={index}>
          <Fill value={resolved.value} placeholder={resolved.placeholder} />
          {resolved.suffix}
        </span>
      );
    }
    if (resolved.type === "field" && !resolved.value) {
      return <Fill key={index} value="" placeholder={resolved.placeholder} />;
    }
    return (
      <span key={index}>
        <span className={termClass}>{inline.name}</span>
        {/* The term stays, because the sentence around it is written for the term. */}
        {resolved.type === "field" && (
          <>
            {" ("}
            <Fill value={resolved.value} placeholder="" />)
          </>
        )}
      </span>
    );
  });
}

function ClauseView({
  clause,
  depth,
  spec,
  values,
}: {
  clause: Clause;
  depth: number;
  spec: DocumentSpec;
  values: Values;
}) {
  return (
    <>
      <p data-indent={depth} className={DEPTH_CLASSES[depth] ?? DEPTH_CLASSES.at(-1)}>
        {clause.label} {clause.title && <strong>{clause.title} </strong>}
        <Body inlines={clause.body} spec={spec} values={values} />
      </p>
      {clause.children.map((child, index) => (
        <ClauseView key={index} clause={child} depth={depth + 1} spec={spec} values={values} />
      ))}
    </>
  );
}

/** A document drafted from its spec: a Cover Page of the user's terms, then the Standard Terms. */
export function GeneratedDocument({
  spec,
  template,
  values,
}: {
  spec: DocumentSpec;
  template: Template;
  values: Values;
}) {
  const fields = spec.fields ?? [];
  // Every document drafted from a spec has two parties, which the backend's tests check.
  const [first, second] = spec.parties as [PartySpec, PartySpec];
  const detail = (name: PartyDetail): [string, string] => [
    partyValue(values, first, name),
    partyValue(values, second, name),
  ];

  return (
    <article className={articleClass}>
      <h2 className="text-3xl leading-tight font-medium tracking-tight sm:text-4xl">{spec.name}</h2>
      <p className="mt-5">
        This {spec.name} consists of: (1) this Cover Page (“<strong>Cover Page</strong>”) and (2)
        the Common Paper {spec.name} Standard Terms (“<strong>Standard Terms</strong>”) set out
        below. The Cover Page sets the terms that the Standard Terms leave open.
      </p>

      {fields.map((field) => (
        <CoverSection key={field.key} title={field.label}>
          <p>
            <Fill value={fieldValue(values, field)} placeholder={field.label} />
          </p>
        </CoverSection>
      ))}

      <section className="mt-9 break-inside-avoid">
        <p>By signing this Cover Page, each party agrees to enter into this {spec.name}.</p>
        <SignatureTable
          parties={[first.label, second.label]}
          details={{
            name: detail("Name"),
            title: detail("Title"),
            company: detail("Company"),
            noticeAddress: detail("NoticeAddress"),
          }}
        />
      </section>

      <section data-page-break className={termsClass}>
        <h2 className="text-2xl font-medium tracking-tight">Standard Terms</h2>
        {template.clauses.map((clause, index) => (
          <ClauseView key={index} clause={clause} depth={0} spec={spec} values={values} />
        ))}
      </section>

      <p className="mt-10 font-sans text-xs text-muted">
        Common Paper {spec.name} Standard Terms, free to use under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" className="underline">
          CC BY 4.0
        </a>
        .
      </p>
    </article>
  );
}
