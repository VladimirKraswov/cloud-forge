import { Link } from '@tanstack/react-router';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/shared/components/app/empty-state';
import { Button } from '@/shared/components/ui/button';

export function NotFoundPage() {
  return <EmptyState icon={Compass} title="Page not found" description="The requested page does not exist in the Cloud Forge frontend." action={<Button asChild><Link to="/">Go to dashboard</Link></Button>} />;
}
