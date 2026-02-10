import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { ButtonSelect } from "./ui/ButtonSelect";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";

type Props = {
    billId: string;
    initialAmount: number;
    paymentMethods: { code: string; name: string }[];
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
    embedded?: boolean;
};

export function FinancePaymentForm({
    billId,
    initialAmount,
    paymentMethods,
    onSuccess,
    onError,
    embedded = false,
}: Props) {
    const [trxDate, setTrxDate] = useState(
        new Date().toISOString().split("T")[0]
    );
    const [amount, setAmount] = useState(initialAmount);
    const [method, setMethod] = useState("");
    const [submitting, setSubmitting] = useState(false);

    function getErrorMessage(err: unknown) {
        if (err instanceof Error) return err.message;
        if (typeof err === "string") return err;
        if (err && typeof err === "object") {
            const anyErr = err as { message?: string; details?: string; hint?: string };
            const parts = [anyErr.message, anyErr.details, anyErr.hint].filter(Boolean);
            if (parts.length) return parts.join(" - ");
            try {
                return JSON.stringify(anyErr);
            } catch {
                return "Unexpected error";
            }
        }
        return "Unexpected error";
    }

    useEffect(() => {
        setAmount(initialAmount);
    }, [initialAmount]);

    function handleAmountChange(value: string) {
        const parsed = parseFloat(value);
        if (isNaN(parsed)) {
            setAmount(0);
            return;
        }

        const maxOutstanding = Math.max(initialAmount, 0);
        setAmount(Math.min(parsed, maxOutstanding));
    }

    async function handleSubmit() {
        if (!billId) return;
        if (amount <= 0) {
            onError("Amount must be > 0");
            return;
        }
        if (amount > initialAmount) {
            onError("Amount cannot exceed outstanding amount");
            return;
        }
        if (!method) {
            onError("Pilih Metode Pembayaran (CASH/BANK)!");
            return;
        }

        setSubmitting(true);
        try {
            const normalizedMethod = method.toUpperCase();
            const { error } = await supabase.rpc("rpc_create_payment_ap", {
                p_ap_bill_id: billId,
                p_amount: amount,
                p_payment_date: trxDate,
                p_method: normalizedMethod,
            });
            if (error) throw error;
            onSuccess("Payment Created Successfully!");
        } catch (err: unknown) {
            onError(getErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    }

    const methodOptions =
        paymentMethods.length > 0
            ? paymentMethods.map((m) => ({
                label: `${m.code}`, // Short label for buttons
                value: m.code,
            }))
            : [
                { label: "CASH", value: "CASH" },
                { label: "BANK", value: "BANK" },
            ];

    const content = (
        <>
            <div className="text-xs text-gray-500 font-mono mb-2">
                REF: {billId}
            </div>
            <Input
                label="Date"
                type="date"
                value={trxDate}
                onChange={(e) => setTrxDate(e.target.value)}
            />
            <Input
                label="Amount Paid"
                type="number"
                step="1"
                value={amount === 0 ? "" : amount}
                max={initialAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
            />
            <div className="text-[11px] text-gray-500 flex items-center justify-between">
                <span>Outstanding: {initialAmount.toLocaleString()}</span>
                <span>Remaining: {Math.max(initialAmount - amount, 0).toLocaleString()}</span>
            </div>

            <div className="my-2">
                <ButtonSelect
                    label="Method"
                    value={method}
                    onChange={(val) => setMethod(val)}
                    options={methodOptions}
                />
                {!method && <p className="text-xs text-red-500 mt-1">* Wajib pilih metode</p>}
            </div>

            <Button
                className="w-full mt-4 bg-red-600 hover:bg-red-700"
                onClick={handleSubmit}
                disabled={submitting}
                isLoading={submitting}
            >
                Confirm Payment
            </Button>
        </>
    );

    if (embedded) {
        return <div className="space-y-4">{content}</div>;
    }

    return (
        <Card className="border-red-200 shadow-md sticky top-6">
            <CardHeader className="bg-red-100/50 border-b border-red-100">
                <CardTitle className="text-red-900">Process Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">{content}</CardContent>
        </Card>
    );
}
