import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/Icons";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { formatDate } from "../lib/format";
import { useConfirm } from "./ui/ConfirmDialogContext";

type Issue = {
  id: string;
  issue_no: string | null;
  issue_date: string;
  status: string;
  notes: string | null;
  makloon_order_id: string;
  makloon_orders: {
    order_no: string | null;
  } | null;
  vendors: {
    name: string;
  } | null;
};

type IssueItem = {
  id: string;
  item_name: string;
  uom_snapshot: string;
  qty: number;
};

type IssueItemRow = {
  id: string;
  item_id: string;
  uom_snapshot: string;
  qty: number;
};

type ItemNameRow = {
  id: string;
  name: string;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  POSTED: "bg-green-100 text-green-700",
};

export default function MakloonIssueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirm } = useConfirm();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [items, setItems] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const [iRes, itemsRes] = await Promise.all([
        supabase
          .from("makloon_material_issues")
          .select("*, makloon_orders(order_no), vendors(name)")
          .eq("id", id)
          .single(),
        supabase
          .from("makloon_issue_items")
          .select("id, item_id, uom_snapshot, qty")
          .eq("issue_id", id),
      ]);
      if (iRes.error) {
        setError("Issue tidak ditemukan");
        setLoading(false);
        return;
      }
      const issueItems = (itemsRes.data as IssueItemRow[]) || [];
      const itemIds = [...new Set(issueItems.map((item) => item.item_id))];
      const itemNameMap = new Map<string, string>();

      if (itemIds.length > 0) {
        const { data: itemRows } = await supabase
          .from("items")
          .select("id, name")
          .in("id", itemIds);

        ((itemRows as ItemNameRow[]) || []).forEach((item) => {
          itemNameMap.set(item.id, item.name);
        });
      }

      setIssue(iRes.data as unknown as Issue);
      setItems(
        issueItems.map((item) => ({
          id: item.id,
          item_name: itemNameMap.get(item.item_id) || "-",
          uom_snapshot: item.uom_snapshot,
          qty: item.qty,
        })),
      );
      setLoading(false);
    };
    fetch();
  }, [id]);

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Hapus Issue?",
      description: "Draft issue ini akan dihapus secara permanen.",
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
    });
    if (confirmed) {
      const { error } = await supabase.from("makloon_material_issues").delete().eq("id", id);
      if (error) {
        alert(error.message);
      } else {
        navigate(`/makloon/${issue?.makloon_order_id}`);
      }
    }
  };

  const handlePost = async () => {
    const confirmed = await confirm({
      title: "Post Issue?",
      description: "Stok bahan akan dikurangi. Aksi ini tidak dapat dibatalkan.",
      confirmText: "Ya, Post",
      cancelText: "Batal",
    });
    if (confirmed) {
      const { error } = await supabase.rpc("rpc_post_makloon_material_issue", { p_issue_id: id });
      if (error) {
        alert(error.message);
      } else {
        window.location.reload();
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;
  if (error) return <Alert variant="error" title="Error" description={error} />;
  if (!issue) return null;

  return (
    <div className="w-full space-y-6 pb-20">
      <PageHeader
        title={`Material Issue ${issue.issue_no || issue.id.substring(0, 8)}`}
        breadcrumbs={[
          { label: "Makloon", href: "/makloon" },
          { label: `Order ${issue.makloon_orders?.order_no || "Detail"}`, href: `/makloon/${issue.makloon_order_id}` },
          { label: "Issue" }
        ]}
        actions={
          <div className="flex gap-2">
            {issue.status === "DRAFT" && (
              <>
                <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={handleDelete} icon={<Icons.Trash className="w-4 h-4" />}>
                  Hapus
                </Button>
                <Button onClick={handlePost} icon={<Icons.Check className="w-4 h-4" />}>
                  Post Issue
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => navigate(`/makloon/${issue.makloon_order_id}`)} icon={<Icons.ArrowLeft className="w-4 h-4" />}>
              Kembali
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Detail Issue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div>
                <span className="text-gray-500">No Issue</span>
                <div className="font-medium font-mono">{issue.issue_no || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500">Tanggal Pengiriman</span>
                <div className="font-medium">{formatDate(issue.issue_date)}</div>
              </div>
              <div>
                <span className="text-gray-500">Status</span>
                <div>
                  <Badge className={STATUS_COLORS[issue.status] || "bg-gray-100"}>{issue.status}</Badge>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-gray-500">Vendor Konveksi</span>
                <div className="font-medium">{issue.vendors?.name || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500">Terkait Makloon Order</span>
                <div className="font-medium font-mono">{issue.makloon_orders?.order_no || issue.makloon_order_id.substring(0, 8)}</div>
              </div>
            </div>
          </div>
          {issue.notes && (
            <div className="pt-4 border-t">
              <span className="text-gray-500 text-sm">Catatan</span>
              <div className="font-medium">{issue.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item yang Dikirim ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Satuan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.item_name}</TableCell>
                    <TableCell>{it.qty}</TableCell>
                    <TableCell>{it.uom_snapshot}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-500">Tidak ada item</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}