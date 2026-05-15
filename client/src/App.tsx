import { Routes, Route, Navigate } from "react-router-dom";
import Marketplace from "./Marketplace";
import FileExplorer from "./FileExplorer";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Marketplace />} />
      <Route path="/app/file-explorer" element={<FileExplorer />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
