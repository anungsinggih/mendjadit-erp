import { Routes, Route } from "react-router-dom";
import MakloonOrderList from "./MakloonOrderList";
import RouteOverlayRedirect from "./RouteOverlayRedirect";

export default function Makloon() {
  return (
    <Routes>
      <Route path="/" element={<MakloonOrderList />} />
      <Route path="/orders" element={<MakloonOrderList />} />
      <Route path="/new" element={<RouteOverlayRedirect to="/makloon/orders" modal="makloon.create" />} />
      <Route path="/:id" element={<RouteOverlayRedirect to="/makloon/orders" modal="makloon.detail" valueParams={{ id: "id" }} />} />
      <Route path="/:id/edit" element={<RouteOverlayRedirect to="/makloon/orders" modal="makloon.edit" valueParams={{ id: "id" }} />} />
      <Route path="/:id/issue" element={<RouteOverlayRedirect to="/makloon/orders" modal="makloon.issue.create" valueParams={{ parentId: "id" }} />} />
      <Route path="/:id/receipt" element={<RouteOverlayRedirect to="/makloon/orders" modal="makloon.receipt.create" valueParams={{ parentId: "id" }} />} />
      <Route path="/issue/:id" element={<RouteOverlayRedirect to="/makloon/orders" modal="makloon.issue.detail" valueParams={{ id: "id" }} />} />
      <Route path="/receipt/:id" element={<RouteOverlayRedirect to="/makloon/orders" modal="makloon.receipt.detail" valueParams={{ id: "id" }} />} />
    </Routes>
  );
}
