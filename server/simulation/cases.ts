import type { EmailAddress, CaseRecord, EmailMessage, ExternalWorldState } from "../../shared/types";
import { dateOnlyDaysFromNow, isoDaysFromNow } from "../util/id";

/**
 * Scenario definitions.
 *
 * These describe the *outside world*, not the agent. Each case declares its own
 * milestone chain, what each milestone means, what has to happen next, and what
 * the external system does when it moves. The agent never sees this file — it
 * only sees the normalized `CaseView` a tool builds from it.
 *
 * Adding a third scenario means adding a case here and a tool that can inspect
 * it. No agent logic, no runtime logic, and no UI code needs to change.
 */

export const SIMULATED_USER: EmailAddress = {
  name: "Jordan Reyes",
  address: "jordan.reyes@fastmail.com",
};

export const ACME_REFUND_CASE_ID = "case_acme_refund";
export const NORTHGATE_LETTER_CASE_ID = "case_northgate_letter";

/**
 * A fact value of `NOW` means "stamp the current time here when this
 * transition fires", so scenario data stays static and declarative.
 */
export const NOW = "$now";

/* ------------------------------------------------------------------ *
 * Scenario 1 — a refund that was approved but never paid
 * ------------------------------------------------------------------ */

function buildAcmeRefundCase(now: number): CaseRecord {
  const approvedEmail = {
    from: { name: "Priya Raman", address: "support@acmeelectronics.com" },
    subject: "Re: your refund for order AC-55913",
    body: [
      "Hi Jordan,",
      "",
      "Thanks for following up — and apologies for the delay.",
      "",
      "I've checked case RMA-889201. Your refund of $184.99 has now been approved by our finance team.",
      "",
      "Refund reference: RF-40218",
      "Amount: $184.99",
      "Method: original payment method",
      "",
      "Approved refunds are released on our next payment run, which happens every 5-7 business days. You'll get a separate confirmation the moment the funds leave our account.",
      "",
      "Best,",
      "Priya Raman",
      "Customer Care - Acme Electronics",
    ].join("\n"),
  };

  const issuedEmail = {
    from: { name: "Acme Electronics Payments", address: "payments@acmeelectronics.com" },
    subject: "Your Acme Electronics refund has been issued",
    body: [
      "Hello Jordan,",
      "",
      "This is a confirmation that we have released your refund.",
      "",
      "Order: AC-55913",
      "Refund reference: RF-40218",
      "Amount: $184.99",
      "Method: original payment method (card ending 4417)",
      "",
      "Depending on your bank, the credit may take 3-5 business days to appear on your statement.",
      "",
      "Regards,",
      "Acme Electronics Payments",
    ].join("\n"),
  };

  const receivedEmail = {
    from: { name: "Meridian Bank Alerts", address: "alerts@meridianbank.com" },
    subject: "Alert: credit posted to your card ending 4417",
    body: [
      "A credit has posted to your Meridian card ending 4417.",
      "",
      "Merchant: ACME ELECTRONICS",
      "Amount: +$184.99",
      "Type: Refund",
      "Reference: RF-40218",
      "",
      "Your available balance has been updated.",
    ].join("\n"),
  };

  return {
    id: ACME_REFUND_CASE_ID,
    kind: "REFUND",
    title: "Acme Electronics refund",
    counterparty: { name: "Acme Electronics", address: "support@acmeelectronics.com" },
    reference: "AC-55913",
    subject: "the $184.99 refund for order AC-55913",
    milestones: ["PENDING_APPROVAL", "APPROVED", "ISSUED", "RECEIVED"],
    status: "PENDING_APPROVAL",
    completeStatus: "RECEIVED",
    statusMeaning: {
      PENDING_APPROVAL:
        "Your return was received and inspected, but Acme's finance team has not approved the refund yet.",
      APPROVED:
        "Acme has approved the refund. Approval is not payment — the money has not been released.",
      ISSUED:
        "Acme has released the funds to the original payment method. The credit has not posted to your account yet.",
      RECEIVED: "The $184.99 credit has posted to the original payment method.",
    },
    nextStep: {
      PENDING_APPROVAL: "Acme's finance team to approve the refund",
      APPROVED: "Acme to release the approved funds to the original payment method",
      ISSUED: "the credit to post to the original payment method",
      RECEIVED: "",
    },
    dueBy: dateOnlyDaysFromNow(15, now),
    note: "Return received at the Acme warehouse and passed inspection. Refund queued for finance review.",
    informationRequest: null,
    facts: {
      amount: 184.99,
      currency: "USD",
      orderNumber: "AC-55913",
      returnReference: "RMA-889201",
      returnStatus: "RECEIVED",
      item: "AuraSound Pro Wireless Headphones (Midnight)",
      approvedAt: null,
      issuedAt: null,
      receivedAt: null,
      paymentReference: null,
    },
    timeline: [
      { at: isoDaysFromNow(36, now), label: "Return requested" },
      { at: isoDaysFromNow(35, now), label: "Return authorised (RMA-889201)" },
      { at: isoDaysFromNow(26, now), label: "Return received and inspected" },
      { at: isoDaysFromNow(15, now), label: "Refund was due to the customer" },
    ],
    onEnter: {
      APPROVED: {
        timelineLabel: "Refund approved (RF-40218)",
        note: "Refund approved by Acme finance. Awaiting the next payment run before funds are released.",
        facts: { approvedAt: NOW, paymentReference: "RF-40218" },
        email: approvedEmail,
      },
      ISSUED: {
        timelineLabel: "Refund issued (RF-40218) — $184.99",
        note: "Funds released to the original payment method. Banks typically post the credit within 3-5 business days.",
        facts: { issuedAt: NOW },
        email: issuedEmail,
      },
      RECEIVED: {
        timelineLabel: "Credit posted to the account: $184.99",
        note: "Credit posted to the original payment method. The refund is complete.",
        facts: { receivedAt: NOW },
        email: receivedEmail,
      },
    },
    holdingReply: {
      subject: "Re: your refund for order AC-55913",
      body: [
        "Hi Jordan,",
        "",
        "Thanks for chasing. I've escalated this to our finance team and flagged the delay.",
        "",
        "We're a little backed up on payment runs at the moment, but someone will come back to you as soon as there's news.",
        "",
        "Thanks for your patience,",
        "Priya",
      ].join("\n"),
    },
    informationRequestEmail: {
      subject: "Re: your refund for order AC-55913",
      body: [
        "Hi Jordan,",
        "",
        "I'm sorry for the runaround. Our warehouse can't match the returned unit to your account yet.",
        "",
        "Could you reply with the RMA number written on the outside of the package, or a photo of the shipping label?",
        "",
        "Once we have that we can release the $184.99 refund straight away.",
        "",
        "Best,",
        "Priya Raman",
        "Customer Care - Acme Electronics",
      ].join("\n"),
    },
    outcomeKeywords: [
      "acme",
      "refund",
      "reimburse",
      "chargeback",
      "return",
      "184.99",
      "ac-55913",
      "rma-889201",
      "headphones",
      "money back",
    ],
  };
}

function acmeMailbox(now: number): EmailMessage[] {
  const caseId = ACME_REFUND_CASE_ID;
  return [
    {
      id: "mail_acme_01",
      threadId: "thread_acme_return",
      subject: "Return request for order AC-55913",
      direction: "OUTBOUND",
      from: SIMULATED_USER,
      to: [{ name: "Acme Electronics", address: "support@acmeelectronics.com" }],
      body: [
        "Hi Acme,",
        "",
        "The headphones in order AC-55913 developed a fault in the left driver after two weeks.",
        "I'd like to return them for a full refund of $184.99.",
        "",
        "Thanks,",
        "Jordan",
      ].join("\n"),
      sentAt: isoDaysFromNow(36, now),
      read: true,
      agentSeen: true,
      caseId,
    },
    {
      id: "mail_acme_02",
      threadId: "thread_acme_return",
      subject: "Re: Return request for order AC-55913",
      direction: "INBOUND",
      from: { name: "Priya Raman", address: "support@acmeelectronics.com" },
      to: [SIMULATED_USER],
      body: [
        "Hi Jordan,",
        "",
        "Sorry to hear about the driver fault. Your return has been authorised.",
        "",
        "RMA number: RMA-889201",
        "Please ship the item back in its original packaging and write the RMA number on the outside of the box.",
        "",
        "Once we receive it we'll process the refund to your original payment method.",
        "",
        "Best,",
        "Priya",
      ].join("\n"),
      sentAt: isoDaysFromNow(35, now),
      read: true,
      agentSeen: true,
      caseId,
    },
    {
      id: "mail_acme_03",
      threadId: "thread_acme_return",
      subject: "Re: Return request for order AC-55913",
      direction: "INBOUND",
      from: { name: "Acme Electronics Returns", address: "returns@acmeelectronics.com" },
      to: [SIMULATED_USER],
      body: [
        "Hello Jordan,",
        "",
        "We've received your return for RMA-889201 and it has passed inspection.",
        "",
        "Your refund of $184.99 will be issued to the original payment method within 5-7 business days.",
        "",
        "Regards,",
        "Acme Electronics Returns",
      ].join("\n"),
      sentAt: isoDaysFromNow(26, now),
      read: true,
      agentSeen: true,
      caseId,
    },
    {
      id: "mail_acme_04",
      threadId: "thread_acme_chase",
      subject: "Still waiting on my $184.99 refund (RMA-889201)",
      direction: "OUTBOUND",
      from: SIMULATED_USER,
      to: [{ name: "Acme Electronics", address: "support@acmeelectronics.com" }],
      body: [
        "Hi Acme,",
        "",
        "You confirmed receipt of my return on RMA-889201, but the $184.99 refund still hasn't landed.",
        "",
        "It's now well past the 5-7 business days you quoted. Can you tell me where this is?",
        "",
        "Jordan",
      ].join("\n"),
      sentAt: isoDaysFromNow(12, now),
      read: true,
      agentSeen: true,
      caseId,
    },
    {
      id: "mail_acme_05",
      threadId: "thread_newsletter",
      subject: "Acme Electronics: Spring clearance starts today",
      direction: "INBOUND",
      from: { name: "Acme Electronics", address: "news@acmeelectronics.com" },
      to: [SIMULATED_USER],
      body: "Up to 40% off open-box audio. Free shipping over $50.",
      sentAt: isoDaysFromNow(4, now),
      read: true,
      agentSeen: true,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Scenario 2 — a document request that was promised but never delivered
 * ------------------------------------------------------------------ */

export const NORTHGATE_COUNSELLOR: EmailAddress = {
  name: "Mr. Daniel Alvarez",
  address: "d.alvarez@northgatehigh.edu",
};

function buildNorthgateLetterCase(now: number): CaseRecord {
  const acknowledgedEmail = {
    from: NORTHGATE_COUNSELLOR,
    subject: "Re: Recommendation letter for my Westbrook University application",
    body: [
      "Hi Jordan,",
      "",
      "Happy to write this one. I'll have it done this week — I have your file from last term.",
      "",
      "Best,",
      "Dan Alvarez",
      "School Counsellor, Northgate High",
    ].join("\n"),
  };

  const draftedEmail = {
    from: NORTHGATE_COUNSELLOR,
    subject: "Re: Recommendation letter for my Westbrook University application",
    body: [
      "Hi Jordan,",
      "",
      "The letter is written. I just need to get it into the applicant portal — I'll do that when I'm back at my desk.",
      "",
      "Dan",
    ].join("\n"),
  };

  const submittedEmail = {
    from: NORTHGATE_COUNSELLOR,
    subject: "Re: Recommendation letter for my Westbrook University application",
    body: [
      "Hi Jordan,",
      "",
      "Done on my end — I've uploaded the recommendation to the Westbrook Applicant Portal.",
      "",
      "It should show up on your checklist once their system syncs.",
      "",
      "Dan",
    ].join("\n"),
  };

  const receivedEmail = {
    from: { name: "Westbrook University Admissions", address: "admissions@westbrook.edu" },
    subject: "Application ACK-88214 — counsellor recommendation received",
    body: [
      "Dear Jordan,",
      "",
      "Your application to Westbrook University is now complete.",
      "",
      "Item received: Counsellor Recommendation (Northgate High School)",
      "Submitted by: D. Alvarez",
      "Received: today",
      "",
      "No items remain outstanding. We will contact you when a decision has been made.",
      "",
      "Westbrook University Admissions",
    ].join("\n"),
  };

  return {
    id: NORTHGATE_LETTER_CASE_ID,
    kind: "DOCUMENT_REQUEST",
    title: "Northgate recommendation letter",
    counterparty: NORTHGATE_COUNSELLOR,
    reference: "REC-2026-0417",
    subject: "the counsellor recommendation letter for your Westbrook University application",
    milestones: ["REQUESTED", "ACKNOWLEDGED", "DRAFTED", "SUBMITTED", "RECEIVED"],
    status: "ACKNOWLEDGED",
    completeStatus: "RECEIVED",
    statusMeaning: {
      REQUESTED: "The request was sent to the counsellor and nothing has come back.",
      ACKNOWLEDGED: "Mr. Alvarez said he would write the letter, but no letter exists yet.",
      DRAFTED: "The letter has been written but has not been submitted to the university.",
      SUBMITTED:
        "Mr. Alvarez says he has uploaded the letter. Submitted is not the same as received — the university has not confirmed it on the application checklist.",
      RECEIVED: "Westbrook University has confirmed the recommendation is attached to your application.",
    },
    nextStep: {
      REQUESTED: "a reply to the request",
      ACKNOWLEDGED: "the recommendation letter to be written",
      DRAFTED: "the letter to be submitted to the university portal",
      SUBMITTED: "Westbrook University to confirm receipt on the application checklist",
      RECEIVED: "",
    },
    dueBy: dateOnlyDaysFromNow(6, now),
    note: "Mr. Alvarez acknowledged the request and said he would write the letter this week. Nothing has been submitted to the university yet.",
    informationRequest: null,
    facts: {
      university: "Westbrook University",
      portal: "Westbrook Applicant Portal",
      applicationReference: "ACK-88214",
      universityDeadline: dateOnlyDaysFromNow(-3, now),
      letterType: "Counsellor recommendation",
      acknowledgedAt: isoDaysFromNow(13, now),
      submittedAt: null,
      receivedAt: null,
    },
    timeline: [
      { at: isoDaysFromNow(20, now), label: "Recommendation requested" },
      { at: isoDaysFromNow(13, now), label: "Counsellor acknowledged the request" },
      { at: isoDaysFromNow(6, now), label: "Counsellor's own deadline passed" },
    ],
    onEnter: {
      ACKNOWLEDGED: {
        timelineLabel: "Counsellor acknowledged the request",
        note: "Mr. Alvarez said he would write the letter this week.",
        facts: { acknowledgedAt: NOW },
        email: acknowledgedEmail,
      },
      DRAFTED: {
        timelineLabel: "Letter drafted",
        note: "The letter has been written but not submitted to the university portal.",
        facts: { draftedAt: NOW },
        email: draftedEmail,
      },
      SUBMITTED: {
        timelineLabel: "Letter submitted to the portal",
        note: "Mr. Alvarez has uploaded the letter. The university has not confirmed receipt yet.",
        facts: { submittedAt: NOW },
        email: submittedEmail,
      },
      RECEIVED: {
        timelineLabel: "Westbrook University confirmed receipt",
        note: "The recommendation is attached to the application. Nothing is outstanding.",
        facts: { receivedAt: NOW },
        email: receivedEmail,
      },
    },
    holdingReply: {
      subject: "Re: Recommendation letter for my Westbrook University application",
      body: [
        "Hi Jordan,",
        "",
        "Got your nudge, thank you. I'm aware of the deadline and I'm on it.",
        "",
        "Things are busy here this week — I'll get it into the portal as soon as I can.",
        "",
        "Dan",
      ].join("\n"),
    },
    informationRequestEmail: {
      subject: "Re: Recommendation letter for my Westbrook University application",
      body: [
        "Hi Jordan,",
        "",
        "Before I can submit this, I need two things from you:",
        "",
        "1. Your Westbrook applicant ID (it starts with ACK-).",
        "2. The exact link the portal gave you for the recommendation upload.",
        "",
        "I can't attach the letter to your file without those.",
        "",
        "Dan",
      ].join("\n"),
    },
    outcomeKeywords: [
      "recommendation",
      "recommendation letter",
      "rec letter",
      "counsellor",
      "counselor",
      "northgate",
      "alvarez",
      "westbrook",
      "rec-2026-0417",
      "school letter",
    ],
  };
}

function northgateMailbox(now: number): EmailMessage[] {
  const caseId = NORTHGATE_LETTER_CASE_ID;
  return [
    {
      id: "mail_ng_01",
      threadId: "thread_ng_letter",
      subject: "Recommendation letter for my Westbrook University application",
      direction: "OUTBOUND",
      from: SIMULATED_USER,
      to: [NORTHGATE_COUNSELLOR],
      body: [
        "Hi Mr. Alvarez,",
        "",
        "I'm applying to Westbrook University and they need a counsellor recommendation.",
        "The application deadline is coming up and the portal says this is the only item outstanding on my checklist.",
        "",
        "Would you be able to write it for me?",
        "",
        "Thanks,",
        "Jordan",
      ].join("\n"),
      sentAt: isoDaysFromNow(20, now),
      read: true,
      agentSeen: true,
      caseId,
    },
    {
      id: "mail_ng_02",
      threadId: "thread_ng_letter",
      subject: "Re: Recommendation letter for my Westbrook University application",
      direction: "INBOUND",
      from: NORTHGATE_COUNSELLOR,
      to: [SIMULATED_USER],
      body: [
        "Hi Jordan,",
        "",
        "Happy to write this one. I'll have it done this week — I have your file from last term.",
        "",
        "Best,",
        "Dan Alvarez",
        "School Counsellor, Northgate High",
      ].join("\n"),
      sentAt: isoDaysFromNow(13, now),
      read: true,
      agentSeen: true,
      caseId,
    },
    {
      id: "mail_ng_03",
      threadId: "thread_ng_letter",
      subject: "Gentle nudge — recommendation letter",
      direction: "OUTBOUND",
      from: SIMULATED_USER,
      to: [NORTHGATE_COUNSELLOR],
      body: [
        "Hi Mr. Alvarez,",
        "",
        "Just checking in on the recommendation letter — the Westbrook deadline is getting close.",
        "",
        "Thanks,",
        "Jordan",
      ].join("\n"),
      sentAt: isoDaysFromNow(8, now),
      read: true,
      agentSeen: true,
      caseId,
    },
    {
      id: "mail_ng_04",
      threadId: "thread_westbrook",
      subject: "Application ACK-88214 — 1 item outstanding",
      direction: "INBOUND",
      from: { name: "Westbrook University Admissions", address: "admissions@westbrook.edu" },
      to: [SIMULATED_USER],
      body: [
        "Dear Jordan,",
        "",
        "We have received your application to Westbrook University.",
        "",
        "Application reference: ACK-88214",
        "Status: Incomplete — 1 item outstanding",
        "Outstanding: Counsellor Recommendation (Northgate High School)",
        "",
        "Your application cannot be reviewed until all items are received. Please ask your counsellor to submit through the Westbrook Applicant Portal.",
        "",
        "Westbrook University Admissions",
      ].join("\n"),
      sentAt: isoDaysFromNow(9, now),
      read: true,
      agentSeen: true,
      caseId,
    },
    {
      id: "mail_ng_05",
      threadId: "thread_library",
      subject: "Library notice: 1 item due soon",
      direction: "INBOUND",
      from: { name: "Northgate Public Library", address: "noreply@northgatelibrary.org" },
      to: [SIMULATED_USER],
      body: "Your loan 'Physics for Scientists and Engineers' is due in 3 days. Renew online to avoid a fine.",
      sentAt: isoDaysFromNow(2, now),
      read: true,
      agentSeen: true,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * World assembly
 * ------------------------------------------------------------------ */

export function createSimulatedWorld(now: number = Date.now()): ExternalWorldState {
  return {
    user: SIMULATED_USER,
    mailbox: [...acmeMailbox(now), ...northgateMailbox(now)],
    cases: [buildAcmeRefundCase(now), buildNorthgateLetterCase(now)],
    reminders: [],
    revision: 1,
    lastChangeAt: new Date(now).toISOString(),
    lastChangeLabel: "Scenarios initialised",
  };
}
