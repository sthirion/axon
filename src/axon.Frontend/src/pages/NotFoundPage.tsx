import { Panel } from '../components/atoms/Panel';
import { PageLayout } from '../components/templates/PageLayout';

export function NotFoundPage() {
  return (
    <PageLayout>
      <Panel as="div">
        <h1 className="type-title">Page not found</h1>
      </Panel>
    </PageLayout>
  );
}
