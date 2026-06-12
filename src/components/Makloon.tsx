import { Routes, Route, useNavigate } from "react-router-dom";
import { Button } from "./ui/Button";
import { PageHeader } from "./ui/PageHeader";
import { Icons } from "./ui/Icons";
import MakloonOrderList from "./MakloonOrderList";
import MakloonOrderForm from "./MakloonOrderForm";
import MakloonOrderDetail from "./MakloonOrderDetail";
import MakloonMaterialIssueForm from "./MakloonMaterialIssueForm";
import MakloonReceiptForm from "./MakloonReceiptForm";
import MakloonIssueDetail from "./MakloonIssueDetail";
import MakloonReceiptDetail from "./MakloonReceiptDetail";

export default function Makloon() {
  return (
    <Routes>
      <Route path="/" element={<MakloonOrderList />} />
      <Route path="/orders" element={<MakloonOrderList />} />
      <Route path="/new" element={<MakloonOrderForm />} />
      <Route path="/:id" element={<MakloonOrderDetail />} />
      <Route path="/:id/edit" element={<MakloonOrderForm />} />
      <Route path="/:id/issue" element={<MakloonMaterialIssueForm />} />
      <Route path="/:id/receipt" element={<MakloonReceiptForm />} />
      <Route path="/issue/:id" element={<MakloonIssueDetail />} />
      <Route path="/receipt/:id" element={<MakloonReceiptDetail />} />
    </Routes>
  );
}