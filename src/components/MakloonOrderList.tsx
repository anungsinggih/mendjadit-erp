import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/Icons";
import { PageHeader } from "./ui/PageHeader";
import { EmptyState } from "./ui/EmptyState";
import { formatCurrency, formatDate } from "../lib/format";

type MakloonOrder = {
  id: string;
  order_no: string | null;
  order_date: string;
  expected_completion_date: string | null;
  status: string;
  total_jasa: number;
  vendor_name: string;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ISSUED: "bg-blue-100 text-blue-700",
  IN_PRODUCTION: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function MakloonOrderList() {
  const [orders, setOrders] = useState<MakloonOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status");

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("makloon_orders")
        .select("id, order_no, order_date, expected_completion_date, status, total_jasa, vendors(name)")
        .order("order_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (!error) {
        setOrders(
          (data || []).map(d => ({
            ...d,
            vendor_name: (d.vendors as { name?: string } | null)?.name || "-",
          }))
        );
      }
      setLoading(false);
    };
    fetchOrders();
  }, []);

  const filtered = useMemo(() => {
    let result = orders;

    if (statusFilter) {
      const allowedStatuses = statusFilter.split(",");
      result = result.filter(o => allowedStatuses.includes(o.status));
    }

    if (search.trim()) {
      const t = search.toLowerCase();
      result = result.filter(o =>
        o.order_no?.toLowerCase().includes(t) ||
        o.vendor_name.toLowerCase().includes(t)
      );
    }

    return result;
  }, [orders, search, statusFilter]);

  return (
    <div className="w-full space-y-6 pb-20">
      <PageHeader
        title="Makloon Orders"
        description="Kelola work order ke vendor konveksi."
        breadcrumbs={[{ label: "Makloon", href: "/makloon" }]}
        actions={
          <Button onClick={() => navigate("/makloon/new")} icon={<Icons.Plus className="w-4 h-4" />}>
            New Makloon Order
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <div className="flex items-center gap-4">
            <CardTitle>Daftar Order ({filtered.length})</CardTitle>
            <Input
              placeholder="Cari No / Vendor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              containerClassName="!mb-0 w-64"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              className="text-sm border rounded-md px-2 py-1"
              value={statusFilter || ""}
              onChange={e => {
                if (e.target.value) {
                  setSearchParams({ status: e.target.value });
                } else {
                  setSearchParams({});
                }
              }}
            >
              <option value="">Semua Status</option>
              <option value="DRAFT">Draft</option>
              <option value="ISSUED">Dikonfirmasi</option>
              <option value="IN_PRODUCTION">Produksi</option>
              <option value="COMPLETED">Selesai</option>
              <option value="CANCELLED">Dibatalkan</option>
              <option value="DRAFT,ISSUED">Draft & Konfirmasi</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Icons.FileText className="w-5 h-5" />}
              title="Belum ada makloon order"
              description="Buat order baru untuk memulai proses makloon"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>No Order</TableHead>
                    <TableHead>Vendor Konveksi</TableHead>
                    <TableHead>Target Selesai</TableHead>
                    <TableHead className="text-right">Estimasi Jasa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(o => (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(`/makloon/${o.id}`)}
                    >
                      <TableCell>{formatDate(o.order_date)}</TableCell>
                      <TableCell className="font-mono text-sm">{o.order_no || o.id.substring(0, 8)}</TableCell>
                      <TableCell>{o.vendor_name}</TableCell>
                      <TableCell>{o.expected_completion_date ? formatDate(o.expected_completion_date) : "-"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(o.total_jasa)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[o.status] || "bg-gray-100 text-gray-700"}>
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div onClick={e => e.stopPropagation()} className="flex justify-end gap-1">
                          {o.status === "ISSUED" && (
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => navigate(`/makloon/${o.id}/issue`)}
                              icon={<Icons.Package className="w-4 h-4 text-orange-600" />}
                              title="Kirim Bahan"
                            />
                          )}
                          {o.status === "IN_PRODUCTION" && (
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => navigate(`/makloon/${o.id}/receipt`)}
                              icon={<Icons.Check className="w-4 h-4 text-green-600" />}
                              title="Terima FG"
                            />
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => navigate(`/makloon/${o.id}`)}
                            icon={<Icons.Eye className="w-4 h-4" />}
                            title="Detail"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}