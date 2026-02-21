import { api } from './api.client';

export type PaymentStatus = 'initiated' | 'paid' | 'failed';
export type TransactionType = 'bail' | 'fine' | 'reward';

export interface PaymentTransaction {
  id: number;
  payer: number | null;
  case: number | null;
  suspect_profile: number | null;
  amount: number;
  transaction_type: TransactionType;
  status: PaymentStatus;
  case_status?: string;
  suspect_is_arrested?: boolean;
  gateway_reference: string;
  callback_payload: Record<string, unknown>;
  return_url: string;
  created_at: string;
  paid_at: string | null;
}

export interface StartPaymentResponse {
  transaction: PaymentTransaction;
  payment_url: string;
}

export interface BailRequestPayload {
  suspect_profile: number;
  amount: number;
  description?: string;
  return_url?: string;
  sergeant_approved?: boolean;
}

export interface BailRequestResponse {
  transaction: PaymentTransaction;
  authority: string;
  start_url: string;
}

export const paymentsApi = {
  list: async (): Promise<PaymentTransaction[]> => {
    return api.get<PaymentTransaction[]>('/finance/payments/');
  },
  start: async (transactionId: number): Promise<StartPaymentResponse> => {
    return api.post<StartPaymentResponse>(`/finance/payments/${transactionId}/start/`);
  },
  requestBail: async (payload: BailRequestPayload): Promise<BailRequestResponse> => {
    return api.post<BailRequestResponse>('/finance/bail/request/', payload);
  },
};
