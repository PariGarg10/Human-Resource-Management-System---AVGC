/**
 * Mounts the floating policy chatbot on any portal page (employee, manager, admin).
 */
import { createRoot } from 'react-dom/client';
import { FloatingPolicyChatbot } from '@/components/FloatingPolicyChatbot';

export function mountPolicyChatbot(options?: { open?: boolean }) {
  if (document.getElementById('policy-chat-root')) return;
  const el = document.createElement('div');
  el.id = 'policy-chat-root';
  document.body.appendChild(el);
  createRoot(el).render(<FloatingPolicyChatbot initialOpen={Boolean(options?.open)} />);
}
