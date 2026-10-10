export type Role = 'admin' | 'employee' | 'customer'

export interface Profile {
  id: string
  email: string | null
  full_name: string
  phone: string | null
  role: Role
  active: boolean
  can_manage_inventory: boolean
  can_verify_payments: boolean
  created_at?: string
}

export interface CatalogItem {
  id: string
  code: string
  name: string
  description: string | null
  category_id: string | null
  category_name: string | null
  price: number
  promo_price: number | null
  image_url: string | null
  available: number
  created_at?: string
}

export interface Category { id: string; name: string; active: boolean }

export interface Product {
  id: string
  code: string
  name: string
  description: string | null
  category_id: string | null
  price: number
  image_url: string | null
  stock: number
  reserved: number
  min_stock: number
  active: boolean
}

export interface CartLine {
  product_id: string
  name: string
  price: number
  image_url: string | null
  quantity: number
  available: number
}

export interface PublicOrder {
  code: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  payment_status: 'unpaid' | 'in_review' | 'approved' | 'rejected'
  prep_status: 'not_started' | 'preparing' | 'prepared'
  customer_name: string
  delivery_method: 'pickup' | 'delivery'
  payment_method: 'transfer' | 'qr'
  subtotal: number
  discount_total: number
  total: number
  reserved_until: string | null
  created_at: string
  cancel_reason: string | null
  delivery_status: 'pending' | 'ready_pickup' | 'coordinating' | 'delivered' | null
  delivery_address: string | null
  shipping_cost: number | null
  reject_reason: string | null
  items: { name: string; quantity: number; unit_price: number; line_total: number }[]
  history: { entity: string; to_status: string; at: string }[]
}
