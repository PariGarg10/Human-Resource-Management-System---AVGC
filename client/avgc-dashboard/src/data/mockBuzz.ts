export type BuzzChannel = 'general' | 'department' | 'projects';

export type BuzzPerson = {
  id: string;
  name: string;
  department: string;
  is_clocked_in: boolean;
};

export type BuzzMessage = {
  id: string;
  channel: BuzzChannel;
  sender: string;
  body: string;
  at: string;
};

export const MOCK_TEAM: BuzzPerson[] = [
  { id: '1', name: 'Priya Nair', department: 'Operations', is_clocked_in: true },
  { id: '2', name: 'James Liu', department: 'Engineering', is_clocked_in: true },
  { id: '3', name: 'Sara Ahmed', department: 'HR', is_clocked_in: false },
  { id: '4', name: 'Marcus Cole', department: 'Engineering', is_clocked_in: true },
];

export const MOCK_MESSAGES: BuzzMessage[] = [
  {
    id: 'm1',
    channel: 'general',
    sender: 'HR Bot',
    body: 'Welcome to AVGC Buzz — keep updates professional and inclusive.',
    at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'm2',
    channel: 'general',
    sender: 'Priya Nair',
    body: 'Town hall slides are on the intranet under Company News.',
    at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'm3',
    channel: 'department',
    sender: 'James Liu',
    body: 'Deploy window tonight 22:00–23:00 IST — no action needed for most teams.',
    at: new Date(Date.now() - 900000).toISOString(),
  },
  {
    id: 'm4',
    channel: 'projects',
    sender: 'Marcus Cole',
    body: 'Sprint 24 scope locked — ping me for dependency risks.',
    at: new Date(Date.now() - 300000).toISOString(),
  },
];
