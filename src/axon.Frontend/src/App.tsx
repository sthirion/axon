import { Route, Routes } from 'react-router';

function Home() {
  return (
    <main className="p-6">
      <h1 className="text-3xl font-semibold">Axon</h1>
    </main>
  );
}

function NotFound() {
  return (
    <main className="p-6">
      <h1 className="text-3xl font-semibold">Page not found</h1>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
