import { useParams, useNavigate } from 'react-router-dom';
import { SalesEntryForm } from './SalesEntryForm';
import { Button } from './ui/Button';
import { useConfirm } from './ui/ConfirmDialogContext';

export default function SalesEdit() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { confirm } = useConfirm();

    // Simple toast handler if no global context, or rely on passed props.
    // In this codebase, it seems components accept onSuccess/onError callbacks.

    // We can use a simple state or just alerts if no UI lib is standard, 
    // but SalesEntryForm usually is used in pages that handle this.
    // SalesEdit page is a route component.

    const handleSuccess = (msg: string) => {
        // SalesEntryForm handles navigation on success based on redirectOnSave
        console.log("Success:", msg);
    };

    const handleError = (msg: string) => {
        console.error("Error:", msg);
        void confirm({
            title: 'Error',
            description: msg,
            confirmText: 'OK',
            hideCancel: true
        });
    };

    if (!id) {
        return (
            <div className="p-8 text-center text-red-600">
                Invalid Sales ID
                <Button onClick={() => navigate('/sales/history')} className="mt-4" variant="outline">
                    Back to History
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full space-y-6 pb-28">
            <SalesEntryForm
                initialSalesId={id}
                onSuccess={handleSuccess}
                onError={handleError}
                redirectOnSave={true}
            />
        </div>
    );
}
