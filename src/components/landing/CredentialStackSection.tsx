import { ScrollReveal } from "@/components/landing/ScrollReveal";

const features = [
  { num: "01", title: "Privacy-first approach", body: "Learner-owned data with selective disclosure controls." },
  { num: "02", title: "Unbeatable scalability", body: "Issue credentials at institutional scale without friction." },
  { num: "03", title: "Badge management", body: "Create, issue, revoke, and track digital badges." },
  { num: "04", title: "Compliance ready", body: "Meet institutional and regulatory requirements." },
  { num: "05", title: "API & webhooks", body: "Integrate SIJIL into your LMS and HR stack." },
  { num: "06", title: "White-label options", body: "Brand credentials with your institution's identity." },
  { num: "07", title: "Data & analytics", body: "Track issuance, completion, and verification metrics." },
  { num: "08", title: "Developer SDK", body: "Embed verification into any application." },
];

export function CredentialStackSection() {
  return (
    <section id="stack" className="landing-section bg-white">
      <div className="landing-container">
        <ScrollReveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            The #1 E-credential stack
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-gray-600">
            Everything you need to issue, verify, and share professional digital credentials.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ num, title, body }, i) => (
            <ScrollReveal key={num} delay={i * 25}>
              <p className="lp-stack-num">{num}</p>
              <h3 className="mt-2 text-sm font-bold text-gray-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{body}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
