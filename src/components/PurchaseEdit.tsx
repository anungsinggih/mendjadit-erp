import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { PurchaseEntryForm } from './PurchaseEntryForm';
import { Button } from './ui/Button';
import { useConfirm } from './ui/ConfirmDialogContext';
import { Icons } from './ui/Icons';
import { Alert } from './ui/Alert';

export default function PurchaseEdit() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { confirm } = useConfirm();
    const [hasDP, setHasDP] = useState<boolean | null>(null);

    useEffect(() => {
        if (!id) return;
        const checkDP = async () => {
            const { data, error } = await supabase
                .from('journals')
                .select('id')
                .eq('ref_type', 'PURCHASE_DP')
                .eq('ref_id', id)
                .limit(1);
            if (error) {
                console.error(error);
                setHasDP(false);
                return;
            }
            setHasDP(Array.isArray(data) && data.length > 0);
        };
        checkDP();
    }, [id]);

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

    if (hasDP === null) {
        return (
            <div className="w-full p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-gray-600">Checking...</p>
            </div>
        );
    }

    if (hasDP) {
        return (
            <div className="w-full p-8 space-y-4">
                <Alert
                    variant="warning"
                    title="Tidak Dapat Mengedit"
                    description="Purchase ini sudah memiliki Down Payment (DP). Edit dan delete tidak diizinkan. Hanya POST yang tersedia."
                />
                <Button
                    onClick={() => navigate(`/purchases/${id}`)}
                    variant="outline"
                    icon={<Icons.ArrowLeft className="w-4 h-4" />}
                >
                    Kembali ke Detail
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