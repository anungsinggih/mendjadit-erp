import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryList } from "./InventoryList";
import StockCard from "./StockCard";
import StockAdjustment from "./StockAdjustment";
import { Icons } from "./ui/Icons";
import { PageHeader } from "./ui/PageHeader";

export default function Inventory() {
    const navigate = useNavigate();
    const [view, setView] = useState<'list' | 'card'>('list');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [adjustItem, setAdjustItem] = useState<{ id: string; name: string } | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    function handleAdjustSuccess() {
        setRefreshTrigger(p => p + 1);
        setAdjustItem(null);
    }

    return (
        <div className="w-full space-y-6 pb-20">
            <PageHeader
                title="Inventory Dashboard"
                description="Monitor stock levels, view history, and perform adjustments in real-time."
                breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Inventory' }]}
                actions={
                    <div className="flex flex-wrap gap-2">
                        {selectedId && (
                            <button
                                type="button"
                                onClick={() => setSelectedId(null)}
                                className="inline-flex items-center gap-2 px-4 h-10 text-sm rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-medium transition-colors"
                            >
                                <Icons.Close className="w-4 h-4" />
                                Clear Selection
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => navigate('/stock-adj')}
                            className="inline-flex items-center gap-2 px-4 h-10 text-sm rounded-lg border border-[var(--border)] bg-white hover:bg-[var(--bg-surface-alt)] text-[var(--text-main)]"
                        >
                            <Icons.Edit className="w-4 h-4" />
                            Stock Adjustment
                        </button>

                    </div>
                }
            />

            {/* Mobile Tabs */}
            <div className="flex lg:hidden bg-slate-100/50 border border-slate-200 rounded-lg p-1">
                <button
                    onClick={() => setView('list')}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${view === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    Daftar Barang
                </button>
                <button
                    onClick={() => setView('card')}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${view === 'card' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    Riwayat / Kartu Stok
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start h-[calc(100vh-250px)] min-h-[600px]">
                {/* Left: Inventory List */}
                <div className={`${view === 'list' ? 'block' : 'hidden lg:block'} h-full`}>
                    <InventoryList
                        selectedId={selectedId}
                        onSelect={(id) => {
                            setSelectedId(id);
                            if (id) setView('card'); // Auto switch to card view on mobile when item selected
                        }}
                        onAdjust={(id, name) => setAdjustItem({ id, name })}
                        refreshTrigger={refreshTrigger}
                    />
                </div>

                {/* Right: History / Global Feed */}
                <div className={`h-full ${view === 'card' ? 'block' : 'hidden lg:block'}`}>
                    <StockCard itemId={selectedId} />
                </div>
            </div>

            {/* Adjust Modal */}
            {adjustItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 ring-1 ring-black/5">
                        <div className="bg-orange-50/50 px-6 py-4 border-b border-orange-100/50 flex justify-between items-center">
                            <h3 className="font-bold text-orange-900 flex items-center gap-2">
                                <div className="bg-orange-100 p-1 rounded-full">
                                    <Icons.Edit className="w-4 h-4 text-orange-600" />
                                </div>
                                Adjust Stock: {adjustItem.name}
                            </h3>
                            <button onClick={() => setAdjustItem(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <Icons.Close className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <StockAdjustment
                                initialItemId={adjustItem.id}
                                initialItemName={adjustItem.name}
                                isEmbedded={true}
                                onSuccess={handleAdjustSuccess}
                                onCancel={() => setAdjustItem(null)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
