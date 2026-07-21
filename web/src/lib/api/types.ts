/**
 * Backend response shapes for the Django + DRF API. Kept aligned with
 * `backend/crm/serializers.py`. Any addition to a serializer must also land
 * here or TS will (rightly) refuse to accept it.
 */

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type User = {
  id: number;
  phone: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'founder' | 'sales_head' | 'consultant';
  avatar_color: string;
  initials: string;
  is_active: boolean;
  created_at: string;
};

export type OtpRequestResponse = {
  detail: string;
  phone: string;
  otp?: string; // Dev only — returned when OTP_RETURN_IN_RESPONSE is true.
};

export type VerifyOtpResponse = {
  access: string;
  refresh: string;
  user: User;
  new_user: boolean;
};

export type LostReason =
  | 'Price'
  | 'Timing'
  | 'Competitor'
  | 'No budget'
  | 'No response'
  | 'Feature gap'
  | 'Went in-house'
  | 'Other';

export type Dashboard = {
  total_enquiries: number;
  open_enquiries: number;
  won_count: number;
  won_value: number;
  pipeline_value: number;
  /**
   * Won / (Won + Lost) over all time, role-scoped — the real historical win
   * rate, which drives the Forecast KPI. `null` when nothing has resolved yet:
   * "no evidence" is not "we never win", so render a dash, not a 0.
   */
  win_rate: number | null;
  /** The sample `win_rate` was computed from — show it, don't just trust it. */
  won_resolved: number;
  resolved_count: number;
  by_stage: Array<{ status: string; count: number }>;
  upcoming_meetings: number;
  /** Admin-only. */
  by_consultant?: Array<{ owner__name: string; count: number }>;
  /** Admin-only. */
  unassigned?: number;
  /** Real Why-we-lose feed from Phase 4 backend (only Lost enquiries with a reason). */
  by_lost_reason?: Array<{ lost_reason: LostReason; count: number }>;
};

export type Company = {
  id: number;
  name: string;
  industry: string;
  gstin: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  contact_count: number;
  created_at: string;
};

export type Contact = {
  id: number;
  company: number;
  company_name: string;
  name: string;
  designation: string;
  phone: string;
  email: string;
  is_primary: boolean;
  created_at: string;
};

export type EnquiryStatus =
  | 'New'
  | 'In Progress'
  | 'Won'
  | 'Lost'
  | 'Spam';

export type EnquiryType = 'Hot' | 'Warm' | 'Cold';

export type EnquiryListItem = {
  id: number;
  lead_id: string;
  company: number;
  company_name: string;
  contact: number | null;
  contact_name: string | null;
  /** Job title of the linked contact, e.g. "Purchase Head". Null when the
   *  enquiry has no contact, or the contact has no designation recorded. */
  contact_designation: string | null;
  phone: string;
  email: string;
  source: string;
  enquiry_type: EnquiryType;
  status: EnquiryStatus;
  industry: string;
  expected_value: string; // Decimal comes back as string from DRF.
  expected_close_date: string | null;
  owner: number | null;
  owner_name: string | null;
  lost_reason: LostReason | '';
  /** Hot/Warm/Cold computed server-side from expected_close_date. */
  derived_type: EnquiryType;
  /** ISO timestamp of the newest touchpoint; null when no touchpoints. */
  last_touch_at: string | null;
  /** Scheduled follow-up date (yyyy-mm-dd); only set on the My Queue slice. */
  next_followup_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * `Created` is system-generated — the timeline's opening entry, written by the
 * server when the enquiry is created. It is never offered in the composer.
 */
export type TouchpointChannel =
  | 'Call' | 'WhatsApp' | 'SMS' | 'Email' | 'Note' | 'Meeting' | 'Negotiation' | 'Created';

export type Touchpoint = {
  id: number;
  enquiry: number;
  channel: TouchpointChannel;
  outcome: string;
  note: string;
  next_action: string;
  next_action_date: string | null;
  /** Hot | Warm | Cold, or '' if not set. */
  sentiment: 'Hot' | 'Warm' | 'Cold' | '';
  /** Call only; '' otherwise. */
  direction: 'Outbound' | 'Inbound' | '';
  /** Call only; null otherwise. */
  duration_sec: number | null;
  /** Email only; '' otherwise. */
  subject: string;
  /** Note only; always false otherwise. */
  is_private: boolean;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
};

export type NegotiationRound = {
  id: number;
  enquiry: number;
  side: 'Our offer' | 'Customer ask';
  our_quote: string;
  client_budget: string;
  client_offer: string;
  discount_pct: string;
  round_date: string | null;
  status: 'Open' | 'Accepted' | 'Rejected' | 'Countered';
  gap: string;
  note: string;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
};

export type Proposal = {
  id: number;
  enquiry: number;
  title: string;
  amount: string;
  status: 'Draft' | 'Sent' | 'Viewed' | 'Accepted' | 'Rejected';
  file_url: string;
  sent_at: string | null;
  created_at: string;
};

export type MeetingOutcome = 'Positive' | 'Neutral' | 'Negative';

export type Meeting = {
  id: number;
  enquiry: number | null;
  company: number;
  company_name: string;
  purpose: string;
  mode: 'In-person' | 'Online' | 'Phone';
  scheduled_at: string;
  duration_min: number;
  location: string;
  consultant: number | null;
  consultant_name: string | null;
  status: 'Scheduled' | 'Done' | 'Cancelled';
  notify_email: boolean;
  notify_whatsapp: boolean;
  message: string;
  /** Composed notification content — actually persisted and routed through
   *  the backend's NotificationService (no-op/logged until a real provider
   *  is wired up). */
  email_subject: string;
  email_body: string;
  whatsapp_message: string;
  /** Reason for the most recent reschedule; '' if never rescheduled. */
  reschedule_reason: string;
  outcome_sentiment: MeetingOutcome | '';
  decision_maker_present: boolean | null;
  outcome_notes: string;
  created_at: string;
};

export type SolutionType =
  | 'SalesPort (DMS + SFA)'
  | 'Supply Chain Management'
  | 'Procurement Management'
  | 'Livestock Management'
  | 'Inventory Management'
  | 'Production Management'
  | 'Accounts Management'
  | 'HR Management'
  | 'Institute Management & Resource Optimization'
  | 'Other';

export type EnquiryDetail = EnquiryListItem & {
  gstin: string;
  description: string;
  /** Which Sort String product/service this enquiry is for; '' if unset. */
  solution_type: SolutionType | '';
  /** Free-text detail — only meaningful when solution_type is 'Other'. */
  solution_type_other: string;
  touchpoints: Touchpoint[];
  negotiation_rounds: NegotiationRound[];
  proposals: Proposal[];
  meetings: Meeting[];
};

export type Notification = {
  id: number;
  audience: 'admin' | 'consultant' | 'all';
  ntype:
    | 'pending_approval'
    | 'discrepancy'
    | 'new_enquiry'
    | 'overdue'
    | 'proposal_opened'
    | 'meeting_reminder'
    | 'deal_won'
    | 'status_changed'
    | 'team_update';
  title: string;
  subtitle: string;
  is_read: boolean;
  link_type: string;
  link_id: string;
  created_at: string;
};

export type MasterDataItem = {
  id: number;
  category: 'industry' | 'source' | 'status' | 'enquiry_type' | 'mode';
  value: string;
  label: string;
  order: number;
  is_active: boolean;
};


/** A DLT-approved SMS a consultant can send to a lead. `body` carries
 *  {name}/{company}/{lead_id}/{consultant} blanks; the rest must match the
 *  registered template word-for-word (India DLT). */
export type SmsTemplate = {
  id: number;
  name: string;
  body: string;
  dlt_template_id: string;
  is_active: boolean;
  created_at: string;
};

