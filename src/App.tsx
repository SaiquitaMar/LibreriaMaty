import { Routes, Route, Navigate } from 'react-router-dom'
import PublicLayout from './components/PublicLayout'
import AdminLayout from './components/AdminLayout'
import Guard from './routes/guards'
import Home from './pages/Home'
import Catalog from './pages/Catalog'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderTracking from './pages/OrderTracking'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import MyOrders from './pages/MyOrders'
import Dashboard from './pages/admin/Dashboard'
import Sales from './pages/admin/Sales'
import Products from './pages/admin/Products'
import Inventory from './pages/admin/Inventory'
import Orders from './pages/admin/Orders'
import Payments from './pages/admin/Payments'
import Deliveries from './pages/admin/Deliveries'
import Suppliers from './pages/admin/Suppliers'
import Purchases from './pages/admin/Purchases'
import Promotions from './pages/admin/Promotions'
import Reports from './pages/admin/Reports'
import Users from './pages/admin/Users'
import SettingsPage from './pages/admin/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/catalogo" element={<Catalog />} />
        <Route path="/producto/:id" element={<ProductDetail />} />
        <Route path="/carrito" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/pedido" element={<OrderTracking />} />
        <Route path="/pedido/:codigo" element={<OrderTracking />} />
        <Route path="/login" element={<Login />} />
        <Route path="/restablecer" element={<ResetPassword />} />
        <Route path="/mis-pedidos" element={<Guard need="customer"><MyOrders /></Guard>} />
      </Route>
      <Route path="/admin" element={<Guard need="staff"><AdminLayout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="ventas" element={<Sales />} />
        <Route path="pedidos" element={<Orders />} />
        <Route path="pagos" element={<Guard need="verify"><Payments /></Guard>} />
        <Route path="entregas" element={<Deliveries />} />
        <Route path="productos" element={<Guard need="inventory"><Products /></Guard>} />
        <Route path="inventario" element={<Inventory />} />
        <Route path="proveedores" element={<Guard need="inventory"><Suppliers /></Guard>} />
        <Route path="compras" element={<Guard need="inventory"><Purchases /></Guard>} />
        <Route path="promociones" element={<Guard need="admin"><Promotions /></Guard>} />
        <Route path="reportes" element={<Guard need="admin"><Reports /></Guard>} />
        <Route path="usuarios" element={<Guard need="admin"><Users /></Guard>} />
        <Route path="configuracion" element={<Guard need="admin"><SettingsPage /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
