import { useToast } from "./ui/Toast";
import { SalesEntryForm } from "./SalesEntryForm";
import { PageHeader } from "./ui/PageHeader";

export default function Sales() {
  const { toast } = useToast();

  function handleSuccess(msg: string) {
    toast(msg, 'success');
  }

  function handleError(msg: string) {
    toast(msg, 'error');
  }

  return (
    <div className="w-full space-y-6 pb-28">
      <PageHeader
        title="Sales Management"
        description="Process sales, manage drafts, and finalize transactions. (Draft = editable, Posted = locked)"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Sales" }]}
      />

      <div className="space-y-6">
        <SalesEntryForm onSuccess={handleSuccess} onError={handleError} />
      </div>
    </div>
  );
}
