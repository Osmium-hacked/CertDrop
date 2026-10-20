import type { ReactNode } from 'react';
import { ImageIcon, MailIcon, SendIcon, TableIcon } from '../../components/ui/icons';

export interface StepDefinition {
  id: 'verify' | 'template' | 'participants' | 'send';
  label: string;
  title: string;
  description: string;
  icon: ReactNode;
}

export const STEPS: readonly StepDefinition[] = [
  {
    id: 'verify',
    label: 'Verify email',
    title: 'Confirm it’s you',
    description: 'We’ll email you a 6-digit code. No passwords, no account to manage.',
    icon: <MailIcon />,
  },
  {
    id: 'template',
    label: 'Template',
    title: 'Upload your certificate design',
    description: 'A PNG, JPG or single-page PDF, such as a Canva export. Then mark where the name goes.',
    icon: <ImageIcon />,
  },
  {
    id: 'participants',
    label: 'Participants',
    title: 'Add your participants',
    description:
      'Upload a CSV with a name and an email column. We’ll check every row before anything is sent.',
    icon: <TableIcon />,
  },
  {
    id: 'send',
    label: 'Generate & send',
    title: 'Review and send',
    description: 'Each participant receives their certificate as a PDF with a verification link.',
    icon: <SendIcon />,
  },
];
