import { Routes, Route } from 'react-router-dom';
import { SettingsProvider } from './context/SettingsContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import NewTransaction from './pages/NewTransaction.jsx';
import Transactions from './pages/Transactions.jsx';
import Services from './pages/Services.jsx';
import ManageLists from './pages/ManageLists.jsx';
import ManageServices from './pages/ManageServices.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <SettingsProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory/:id" element={<ProductDetail />} />
          <Route path="/new-transaction" element={<NewTransaction />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/services" element={<Services />} />
          <Route path="/services/manage" element={<ManageServices />} />
          <Route path="/lists" element={<ManageLists />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AppLayout>
    </SettingsProvider>
  );
}
