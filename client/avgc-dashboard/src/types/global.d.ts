export {};

declare global {
  interface Window {
    HRMS?: {
      toast: (message: string, type?: string) => void;
    };
  }
}
