import { useToast } from "./ui/Toast";
import { PurchaseEntryForm } from "./PurchaseEntryForm";

export default function Purchases() {
  const { toast } = useToast();

  function handleSuccess(msg: string) {
    toast(msg, 'success');
  }

  function handleError(msg: string) {
    toast(msg, 'error');
  }

  return (
    <div className="relative">
      <div className="w-full space-y-6 pb-28">
        <div className="flex items-baseline justify-between">
          <h2 className="hidden md:block text-3xl font-bold tracking-tight text-gray-900">
            Purchases Management
          </h2>
          <span className="hidden md:block text-sm text-gray-500">
            Draft = editable, Posted = locked
          </span>
        </div>
      </div>


      <div className="space-y-6">
        <PurchaseEntryForm onSuccess={handleSuccess} onError={handleError} />
      </div>
    </div>

  );
}
