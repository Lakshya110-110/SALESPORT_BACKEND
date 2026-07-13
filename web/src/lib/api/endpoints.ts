import { api } from './client';
import type {
  Company,
  Contact,
  Dashboard,
  EnquiryDetail,
  EnquiryListItem,
  MasterDataItem,
  Meeting,
  Notification,
  OtpRequestResponse,
  Paginated,
  Proposal,
  User,
  VerifyOtpResponse,
} from './types';

/**
 * Every backend endpoint the frontends touch, typed. Grouped by resource so
 * queryKeys can mirror the shape: ['enquiries', 'list', params] etc.
 */
export const endpoints = {
  // ----- Auth -----
  requestOtp: (phone: string) =>
    api.post<OtpRequestResponse>('/auth/request-otp/', { phone }),
  verifyOtp: (phone: string, code: string) =>
    api.post<VerifyOtpResponse>('/auth/verify-otp/', { phone, code }),
  me: () => api.get<User>('/auth/me/'),

  // ----- Dashboard -----
  // `period`: today | week | month | quarter | ytd — omit for all-time.
  dashboard: (period?: string) =>
    api.get<Dashboard>('/dashboard/', period ? { period } : undefined),

  // ----- Enquiries -----
  enquiries: {
    list: (params?: {
      status?: string;
      source?: string;
      industry?: string;
      enquiry_type?: string;
      /** Hot | Warm | Cold — server-computed from expected_close_date. */
      derived_type?: string;
      /** 1 → open deals untouched ≥3 days, stalest first. */
      stalled?: number;
      /** 'mine' → caller's open deals closing within 7 days, soonest first. */
      queue?: string;
      owner?: number | string;
      /** Filters on created_at, calendar-day inclusive. ISO yyyy-mm-dd. */
      date_from?: string;
      date_to?: string;
      search?: string;
      ordering?: string;
      page?: number;
      page_size?: number;
    }) => api.get<Paginated<EnquiryListItem>>('/enquiries/', params),
    detail: (id: number | string) => api.get<EnquiryDetail>(`/enquiries/${id}/`),
    create: (data: Partial<EnquiryDetail> & { company: number }) =>
      api.post<EnquiryDetail>('/enquiries/', data),
    logTouchpoint: (
      id: number | string,
      data: {
        channel: string;
        outcome?: string;
        note?: string;
        next_action?: string;
        sentiment?: 'Hot' | 'Warm' | 'Cold' | '';
        direction?: 'Outbound' | 'Inbound' | '';
        duration_sec?: number | null;
        subject?: string;
        is_private?: boolean;
      },
    ) => api.post(`/enquiries/${id}/log_touchpoint/`, data),
    changeStatus: (id: number | string, status: string, lost_reason?: string) =>
      api.post<EnquiryDetail>(`/enquiries/${id}/change_status/`, {
        status,
        ...(lost_reason ? { lost_reason } : {}),
      }),
    logRound: (
      id: number | string,
      data: {
        side?: 'Our offer' | 'Customer ask';
        our_quote?: number;
        client_budget?: number;
        client_offer?: number;
        discount_pct?: number;
        round_date?: string | null;
        status?: 'Open' | 'Accepted' | 'Rejected' | 'Countered';
        note?: string;
      },
    ) => api.post(`/enquiries/${id}/log_round/`, data),
    reassign: (id: number | string, owner: number | null) =>
      api.post<EnquiryListItem>(`/enquiries/${id}/reassign/`, { owner }),
    patch: (id: number | string, data: Partial<EnquiryListItem>) =>
      api.patch<EnquiryListItem>(`/enquiries/${id}/`, data),
  },

  // ----- Companies / Contacts -----
  companies: {
    list: (params?: { industry?: string; search?: string; page_size?: number }) =>
      api.get<Paginated<Company>>('/companies/', params),
    create: (data: Partial<Company> & { name: string }) => api.post<Company>('/companies/', data),
  },
  contacts: {
    list: (params?: { company?: number | string; search?: string; page_size?: number }) =>
      api.get<Paginated<Contact>>('/contacts/', params),
    create: (data: Partial<Contact> & { company: number; name: string }) =>
      api.post<Contact>('/contacts/', data),
  },

  // ----- Meetings -----
  meetings: {
    list: (params?: {
      when?: 'upcoming' | 'past';
      search?: string;
      status?: string;
      mode?: string;
      page_size?: number;
    }) => api.get<Paginated<Meeting>>('/meetings/', params),
    create: (data: Partial<Meeting> & { company: number; purpose: string; scheduled_at: string }) =>
      api.post<Meeting>('/meetings/', data),
    reschedule: (id: number | string, scheduled_at: string, extra?: Partial<Meeting>) =>
      api.post<Meeting>(`/meetings/${id}/reschedule/`, { scheduled_at, ...extra }),
    patch: (id: number | string, data: Partial<Meeting>) =>
      api.patch<Meeting>(`/meetings/${id}/`, data),
  },

  // ----- Proposals -----
  proposals: {
    list: (params?: { page_size?: number }) => api.get<Paginated<Proposal>>('/proposals/', params),
    /**
     * Multipart upload — sends `file` as a real File part alongside the text
     * fields. The backend saves the file to MEDIA_ROOT (or S3 if configured)
     * and echoes back a working `file_url` we can link to.
     */
    upload: (data: {
      enquiry: number;
      title: string;
      amount?: number | string;
      status?: Proposal['status'];
      file: File;
    }) =>
      api.postFormData<Proposal>('/proposals/', {
        enquiry: data.enquiry,
        title: data.title,
        amount: data.amount != null ? String(data.amount) : undefined,
        status: data.status,
        file: data.file,
      }),
  },

  // ----- Users -----
  users: {
    list: (params?: { search?: string; page_size?: number }) =>
      api.get<Paginated<User>>('/users/', params),
    create: (data: Partial<User> & { phone: string; name: string }) =>
      api.post<User>('/users/', data),
    patch: (id: number, data: Partial<User>) => api.patch<User>(`/users/${id}/`, data),
  },

  // ----- Master data (writes) -----
  masterDataWrite: {
    create: (data: { category: string; value: string; label: string; order?: number }) =>
      api.post<MasterDataItem>('/master-data/', data),
    patch: (id: number, data: Partial<MasterDataItem>) =>
      api.patch<MasterDataItem>(`/master-data/${id}/`, data),
    delete: (id: number) => api.delete<void>(`/master-data/${id}/`),
  },

  // ----- Notifications -----
  notifications: {
    list: () => api.get<Paginated<Notification>>('/notifications/'),
    markAllRead: () => api.post<{ detail: string }>('/notifications/mark_all_read/'),
  },

  // ----- Master data -----
  masterData: (category: 'industry' | 'source' | 'status' | 'enquiry_type' | 'mode') =>
    api.get<Paginated<MasterDataItem>>('/master-data/', { category }),
};
