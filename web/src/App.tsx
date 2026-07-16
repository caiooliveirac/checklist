import { Route, Routes } from "react-router-dom";
import BoardPage from "./pages/BoardPage";
import ChecklistPage from "./pages/ChecklistPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BoardPage />} />
      <Route path="/b/:code" element={<ChecklistPage />} />
      <Route path="*" element={<BoardPage />} />
    </Routes>
  );
}
