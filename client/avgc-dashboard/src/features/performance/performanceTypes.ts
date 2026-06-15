export type OkrRating = { okrId: number; score?: number; rating?: number; progress?: number; feedback?: string };

export type PerformanceOkr = {
  id?: number;
  clientKey?: string;
  objective: string;
  keyResult: string;
  kra: string;
  kpi: string;
  weightage: number;
  progressPercent?: number;
  status?: string;
};

export type PerformanceReview = {
  status: string;
  selfRatingPerOkr?: OkrRating[];
  selfCategoryRatings?: Record<string, number>;
  selfOverallRating?: number | null;
  selfFeedback?: string | null;
  managerRatingPerOkr?: OkrRating[];
  managerFeedbackPerOkr?: OkrRating[];
  managerOverallRating?: number | null;
  managerFeedback?: string | null;
  adminRatingPerOkr?: OkrRating[];
  adminFinalQuarterScore?: number | null;
};

export type PerformanceEmployee = {
  id: number;
  name: string;
  employeecode?: string | null;
  department?: string | null;
};

export type EmployeePerformanceBundle = {
  employee: PerformanceEmployee;
  year: number;
  quarter: number;
  okrs: PerformanceOkr[];
  okrsLocked: boolean;
  review: PerformanceReview | null;
};
