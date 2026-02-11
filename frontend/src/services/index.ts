/**
 * Services Index
 * Central export point for all service modules
 */

export { api, default as apiClient } from './api.client';
export { authService } from './auth.service';
export { authApi } from './auth.api';
export type { LoginCredentials, RegisterData, User, LoginResponse } from './auth.api';
export { ErrorHandler } from './error.handler';
export type { ApiError } from './error.handler';
export { statsApi } from './stats.api';
export type { AggregatedStats } from './stats.api';
export { peopleApi } from './people.api';
export type { PublicPerson, WantedPerson } from './people.api';
export { complaintsApi } from './complaints.api';
export type {
  Complaint,
  ComplaintStatus,
  SecondaryComplainant,
  ComplaintDecision,
  ComplaintDecisionRequest,
  ComplaintDecisionResponse,
  OfficerReviewResponse,
} from './complaints.api';
export { rewardsApi } from './rewards.api';
export type { RewardReport, RewardReportStatus } from './rewards.api';
export { paymentsApi } from './payments.api';
export type { PaymentTransaction, PaymentStatus, TransactionType } from './payments.api';
export { crimeSceneApi } from './crime-scene.api';
export type { CrimeSceneCase, CreateCrimeSceneCaseRequest } from './crime-scene.api';
export { usersApi } from './users.api';
export type { Role as AdminRole } from './users.api';
