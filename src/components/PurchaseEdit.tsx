import { useParams, useNavigate } from 'react-router-dom';
import { PurchaseEntryForm } from './PurchaseEntryForm';
import { Button } from './ui/Button';
import { useConfirm } from './ui/ConfirmDialogContext';

export default function PurchaseEdit() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { confirm } = useConfirm();
    const handleSuccess = (msg: string) => {
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
                Invalid Purchase ID
                <Button onClick={() => navigate('/purchases/history')} className="mt-4" variant="outline">
                    Back to History
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full space-y-6 pb-28">
            <PurchaseEntryForm
                initialPurchaseId={id}
                onSuccess={handleSuccess}
                onError={handleError}
                redirectOnSave={true}
            />
        </div>
    );
}
