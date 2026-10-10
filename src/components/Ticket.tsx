import { Modal } from './ui'
import { money, dateTime, PAY_METHOD } from '../lib/format'

export interface TicketData {
  business: string
  ticket_no: number
  created_at: string
  seller?: string
  payment_method: string
  customer_name?: string | null
  items: { product_name: string; quantity: number; unit_price: number; line_total: number }[]
  subtotal: number
  discount_total: number
  total: number
  voided?: boolean
}

export default function Ticket({ data, onClose }: { data: TicketData; onClose: () => void }) {
  return (
    <Modal title={`Ticket #${data.ticket_no}`} onClose={onClose}>
      <div className="print-area">
        <div className="ticket">
          <h4>{data.business}</h4>
          <div style={{ textAlign: 'center' }}>Comprobante interno de venta<br />No es factura fiscal</div>
          <hr />
          <div>Ticket: #{data.ticket_no}{data.voided ? ' (ANULADO)' : ''}</div>
          <div>Fecha: {dateTime(data.created_at)}</div>
          {data.seller && <div>Atendió: {data.seller}</div>}
          {data.customer_name && <div>Cliente: {data.customer_name}</div>}
          <div>Pago: {PAY_METHOD[data.payment_method] ?? data.payment_method}</div>
          <hr />
          <table style={{ width: '100%' }}>
            <tbody>
              {data.items.map((i, idx) => (
                <tr key={idx}>
                  <td>{i.quantity} x {i.product_name}<br /><span>@ {money(i.unit_price)}</span></td>
                  <td className="num">{money(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr />
          <table style={{ width: '100%' }}>
            <tbody>
              <tr><td>Subtotal</td><td className="num">{money(data.subtotal)}</td></tr>
              <tr><td>Descuentos</td><td className="num">- {money(data.discount_total)}</td></tr>
              <tr><td><b>TOTAL</b></td><td className="num"><b>{money(data.total)}</b></td></tr>
            </tbody>
          </table>
          <hr />
          <div style={{ textAlign: 'center' }}>¡Gracias por tu compra!</div>
        </div>
      </div>
      <div className="row mt">
        <button className="btn" onClick={() => window.print()}>Imprimir ticket</button>
        <button className="btn ghost" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}
