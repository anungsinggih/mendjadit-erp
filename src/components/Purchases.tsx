import { useToast } from "./ui/Toast";
import { PurchaseEntryForm } from "./PurchaseEntryForm";
import { PageHeader } from "./ui/PageHeader";

export default function Purchases() {
  const { toast } = useToast();

  function handleSuccess(msg: string) {
    toast(msg, "success");
  }

  function handleError(msg: string) {
    toast(msg, "error");
  }

  return (
    <div className="relative">
      <div className="w-full space-y-6 pb-28">
        <PageHeader
          title="Purchases"
          description="Record new purchases, manage stock entries, and track supplier invoices."
          breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Purchases" }, { label: "New Purchase" }]}
        />
      </div>

      <div className="space-y-6">
        <PurchaseEntryForm onSuccess={handleSuccess} onError={handleError} />
      </div>
    </div>
  );
}