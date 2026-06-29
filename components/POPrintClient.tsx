'use client'

import { useState } from 'react'
import { fmtDate } from '@/lib/format'

type Supplier = {
  supplier_code: string
  supplier_name: string
  address?: string | null
  primary_contact_phone?: string | null
  primary_contact_name?: string | null
}

const WAREHOUSE_PRESETS: { key: string; name: string; address: string; phone?: string; pic?: string }[] = [
  {
    key: 'ni-hsin',
    name: 'Ni Hsin Warehouse',
    address: 'No. 47, Jalan Taming 2,\nTaman Taming Jaya,\n43300 Seri Kembangan, Selangor.',
    phone: '011-16687215',
    pic: 'Yen',
  },
]

function numToWords(num: number): string {
  if (num === 0) return 'RINGGIT MALAYSIA ZERO ONLY.'
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
    'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']
  function under1000(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) {
      const t = Math.floor(n / 10), o = n % 10
      return tens[t] + (o ? ' ' + ones[o] : '')
    }
    const h = Math.floor(n / 100), rest = n % 100
    let out = ones[h] + ' HUNDRED'
    if (rest) out += ' AND ' + under1000(rest)
    return out
  }
  const intPart = Math.floor(num)
  const cents = Math.round((num - intPart) * 100)
  let words = ''
  const million = Math.floor(intPart / 1_000_000)
  const thousand = Math.floor((intPart % 1_000_000) / 1000)
  const rest = intPart % 1000
  if (million > 0) words += under1000(million) + ' MILLION '
  if (thousand > 0) words += under1000(thousand) + ' THOUSAND '
  if (rest > 0) words += under1000(rest)
  words = words.trim()
  if (cents > 0) words += ' AND ' + under1000(cents) + ' SEN'
  return 'RINGGIT MALAYSIA ' + words + ' ONLY.'
}

export function POPrintClient({ po, items, entity, supplier, allSuppliers }: { po: any; items: any[]; entity: any; supplier: any; allSuppliers: Supplier[] }) {
  const [shipMode, setShipMode] = useState<'preset' | 'supplier' | 'custom'>('preset')
  const [presetKey, setPresetKey] = useState<string>(WAREHOUSE_PRESETS[0].key)
  const [shipSupplierCode, setShipSupplierCode] = useState<string>('')
  const [customShipTo, setCustomShipTo] = useState({
    name: '',
    address: '',
    phone: '',
    pic: '',
  })

  // Vendor (defaults to PO's supplier; can override)
  const [vendorOverride, setVendorOverride] = useState<null | { name: string; address: string; phone: string; pic: string }>(null)
  const [editing, setEditing] = useState<null | 'vendor' | 'shipto'>(null)

  function openShipToEdit() {
    if (shipMode !== 'custom') {
      let current = { name: '', address: '', phone: '', pic: '' }
      if (shipMode === 'preset') {
        const p = WAREHOUSE_PRESETS.find(x => x.key === presetKey) || WAREHOUSE_PRESETS[0]
        current = { name: p.name, address: p.address, phone: p.phone || '', pic: p.pic || '' }
      } else if (shipMode === 'supplier') {
        const s = allSuppliers.find(x => x.supplier_code === shipSupplierCode)
        current = { name: s?.supplier_name || '', address: s?.address || '', phone: s?.primary_contact_phone || '', pic: s?.primary_contact_name || '' }
      }
      setCustomShipTo(current)
      setShipMode('custom')
    }
    setEditing('shipto')
  }

  function openVendorEdit() {
    if (!vendorOverride) {
      setVendorOverride({
        name: supplier?.supplier_name || po.supplier_name || '',
        address: supplier?.address || '',
        phone: supplier?.primary_contact_phone || '',
        pic: supplier?.primary_contact_name || '',
      })
    }
    setEditing('vendor')
  }

  // Resolved vendor info (override wins)
  const vendor = vendorOverride || {
    name: supplier?.supplier_name || po.supplier_name || '',
    address: supplier?.address || '',
    phone: supplier?.primary_contact_phone || '',
    pic: supplier?.primary_contact_name || '',
  }

  // Resolve ship-to
  let shipTo = { label: 'Ship To: Warehouse', name: '', address: '', phone: '', pic: '' }
  if (shipMode === 'preset') {
    const p = WAREHOUSE_PRESETS.find(x => x.key === presetKey) || WAREHOUSE_PRESETS[0]
    shipTo = { label: 'Ship To: Warehouse', name: p.name, address: p.address, phone: p.phone || '', pic: p.pic || '' }
  } else if (shipMode === 'supplier') {
    const s = allSuppliers.find(x => x.supplier_code === shipSupplierCode)
    shipTo = {
      label: 'Ship To: Supplier',
      name: s?.supplier_name || '',
      address: s?.address || '',
      phone: s?.primary_contact_phone || '',
      pic: s?.primary_contact_name || '',
    }
  } else {
    shipTo = { label: 'Ship To:', name: customShipTo.name, address: customShipTo.address, phone: customShipTo.phone, pic: customShipTo.pic }
  }

  const orderDate = fmtDate(po.drafted_at)
  const useNAT = po.entity_code === 'NAT' || po.entity_code === 'HRT'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Toolbar */}
      <div className="po-print-toolbar">
        <button onClick={() => window.print()} className="po-btn-primary">🖨 Print / Save as PDF</button>
        <button onClick={() => window.close()} className="po-btn-ghost">Close</button>
        <span className="po-toolbar-sep" />
        <label className="po-toolbar-lbl">Ship To:</label>
        <select value={shipMode} onChange={e => setShipMode(e.target.value as any)} className="po-toolbar-select">
          <option value="preset">Warehouse Preset</option>
          <option value="supplier">Pick Supplier</option>
          <option value="custom">Custom (key in)</option>
        </select>
        {shipMode === 'preset' && (
          <select value={presetKey} onChange={e => setPresetKey(e.target.value)} className="po-toolbar-select">
            {WAREHOUSE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        )}
        {shipMode === 'supplier' && (
          <select value={shipSupplierCode} onChange={e => setShipSupplierCode(e.target.value)} className="po-toolbar-select">
            <option value="">— select supplier —</option>
            {allSuppliers.map(s => <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_name}</option>)}
          </select>
        )}
        {shipMode === 'custom' && (
          <button onClick={() => setEditing('shipto')} className="po-btn-ghost">Edit Custom Ship-To</button>
        )}
      </div>

      <div className="po-print-root">
        <div className="po-page">
          {useNAT ? (
            <NattomeTemplate po={po} items={items} entity={entity} vendor={vendor} shipTo={shipTo} orderDate={orderDate} onEditShipTo={openShipToEdit} onEditVendor={openVendorEdit} />
          ) : (
            <OnePCTTemplate po={po} items={items} entity={entity} vendor={vendor} shipTo={shipTo} orderDate={orderDate} onEditShipTo={openShipToEdit} onEditVendor={openVendorEdit} />
          )}
        </div>
      </div>

      {editing && (() => {
        const isVendor = editing === 'vendor'
        const data = isVendor ? (vendorOverride || { name: '', address: '', phone: '', pic: '' }) : customShipTo
        const setData = (patch: Partial<typeof data>) => {
          if (isVendor) setVendorOverride(prev => ({ ...(prev || { name: '', address: '', phone: '', pic: '' }), ...patch }))
          else setCustomShipTo(prev => ({ ...prev, ...patch }))
        }
        const close = () => setEditing(null)
        const clearAll = () => {
          if (isVendor) setVendorOverride(null)
          else setCustomShipTo({ name: '', address: '', phone: '', pic: '' })
          close()
        }
        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={close}
            className="po-edit-overlay"
          >
            <div
              style={{ background: 'white', borderRadius: '8px', padding: '24px', width: '460px', maxWidth: '92vw', fontFamily: 'system-ui, sans-serif' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B6B6B', marginBottom: '4px' }}>
                Edit {isVendor ? 'Vendor' : 'Ship-To'}
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '14px' }}>
                {isVendor ? 'Vendor (who the PO is given to)' : 'Custom Ship-To Address'}
              </h2>

              <div style={{ marginBottom: '10px' }}>
                <label style={editLblStyle}>Name</label>
                <input value={data.name} onChange={e => setData({ name: e.target.value })} style={editInputStyle} placeholder={isVendor ? 'e.g. Innogenix Nutraceuticals Sdn Bhd' : 'e.g. Ni Hsin Warehouse'} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={editLblStyle}>Address (newlines OK)</label>
                <textarea value={data.address} onChange={e => setData({ address: e.target.value })} rows={4} style={editInputStyle} placeholder="Multi-line address..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={editLblStyle}>Phone</label>
                  <input value={data.phone} onChange={e => setData({ phone: e.target.value })} style={editInputStyle} />
                </div>
                <div>
                  <label style={editLblStyle}>PIC</label>
                  <input value={data.pic} onChange={e => setData({ pic: e.target.value })} style={editInputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <button onClick={clearAll} style={{ padding: '8px 14px', background: 'transparent', color: '#C8432C', border: '1px solid #C8432C', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                  {isVendor ? 'Reset to PO Supplier' : 'Clear & Close'}
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={close} style={{ padding: '8px 14px', background: 'transparent', color: '#6B6B6B', border: '1px solid #D4D0C7', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                  <button onClick={close} style={{ padding: '8px 14px', background: '#1A1A1A', color: 'white', border: 0, borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Done</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}

const editLblStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B', marginBottom: '4px' }
const editInputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #D4D0C7', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }

// ============ 1PCT Style ============
function OnePCTTemplate({ po, items, entity, vendor, shipTo, orderDate, onEditShipTo, onEditVendor }: any) {
  return (
    <>
      <div className="t1pct-header">
        <div className="t1pct-company">{(entity?.legal_name || po.entity_name).toUpperCase()} <span className="t1pct-reg">({entity?.registration_no || ''})</span></div>
        {entity?.address && <div className="t1pct-addr">{entity.address}</div>}
      </div>

      <h1 className="t1pct-title">PURCHASE ORDER</h1>

      <div className="t1pct-meta">
        <div onClick={onEditVendor} className="t1pct-ship-clickable" title="Click to edit vendor">
          <div className="t1pct-lbl">Vendor: <span className="t1pct-edit-hint">✎ click to edit</span></div>
          {vendor.name && <div className="t1pct-bold">{vendor.name}</div>}
          {vendor.address && <PreLines text={vendor.address} cls="t1pct-line" />}
          {vendor.phone && <div className="t1pct-line">Tel: {vendor.phone}</div>}
          {vendor.pic && <div className="t1pct-line">PIC: {vendor.pic}</div>}
          {!vendor.name && <div className="t1pct-line t1pct-placeholder">Click to set Vendor</div>}
        </div>
        <div onClick={onEditShipTo} className="t1pct-ship-clickable" title="Click to edit ship-to">
          <div className="t1pct-lbl">{shipTo.label} <span className="t1pct-edit-hint">✎ click to edit</span></div>
          {shipTo.name && <div className="t1pct-bold">{shipTo.name}</div>}
          {shipTo.address && <PreLines text={shipTo.address} cls="t1pct-line" />}
          {shipTo.phone && <div className="t1pct-line">Tel: {shipTo.phone}</div>}
          {shipTo.pic && <div className="t1pct-line">PIC: {shipTo.pic}</div>}
          {!shipTo.name && !shipTo.address && <div className="t1pct-line t1pct-placeholder">Click to set Ship-To</div>}
        </div>
        <div className="t1pct-info">
          <div className="t1pct-info-row"><span className="t1pct-info-key">PO No.#</span><span className="t1pct-info-val">{po.po_number}</span></div>
          <div className="t1pct-info-row"><span className="t1pct-info-key">Date</span><span className="t1pct-info-val">{orderDate}</span></div>
          <div className="t1pct-info-row"><span className="t1pct-info-key">Terms</span><span className="t1pct-info-val">{po.terms || '—'}</span></div>
          <div className="t1pct-info-row"><span className="t1pct-info-key">Page</span><span className="t1pct-info-val">1 of 1</span></div>
        </div>
      </div>

      <table className="t1pct-items">
        <thead>
          <tr>
            <th style={{ width: 30 }}>No.</th>
            <th>Description</th>
            <th style={{ width: 60, textAlign: 'right' }}>Qty</th>
            <th style={{ width: 50 }}>UOM</th>
            <th style={{ width: 80, textAlign: 'right' }}><div className="t1pct-rm">RM</div>Unit Price</th>
            <th style={{ width: 100, textAlign: 'right' }}><div className="t1pct-rm">RM</div>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any, idx: number) => (
            <tr key={it.id}>
              <td>{idx + 1}</td>
              <td>
                <div>{it.product_name}</div>
                {it.notes && <div className="t1pct-note">{it.notes}</div>}
              </td>
              <td style={{ textAlign: 'right' }}>{Number(it.qty).toLocaleString()}</td>
              <td>{it.uom}</td>
              <td style={{ textAlign: 'right' }}>{Number(it.unit_cost).toFixed(2)}</td>
              <td style={{ textAlign: 'right' }}>{Number(it.amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {po.notes && (
        <div className="t1pct-deposit-note">{po.notes}</div>
      )}

      <div className="t1pct-total-row">
        <span className="t1pct-total-label">Total (RM)</span>
        <span className="t1pct-total-amount">{Number(po.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
      </div>

      <div className="t1pct-footer">This is a computer-generated document. No signature is required.</div>
    </>
  )
}

// ============ Nattome Style ============
function NattomeTemplate({ po, items, entity, vendor, shipTo, orderDate, onEditShipTo, onEditVendor }: any) {
  return (
    <>
      <div className="tnat-header">
        <div className="tnat-logo">
          {po.entity_code === 'NAT' ? (
            <img src="/nattome-logo.png" alt="Nattome" className="tnat-logo-img" />
          ) : (
            <span className="tnat-logo-text">{entity?.legal_name?.split(' ')[0]}<span className="tnat-tm">™</span></span>
          )}
        </div>
        <div className="tnat-company-block">
          <div className="tnat-company">{(entity?.legal_name || po.entity_name).toUpperCase()}</div>
          <div className="tnat-reg">({entity?.registration_no || ''})</div>
          {entity?.address && <div className="tnat-addr">{entity.address}</div>}
        </div>
      </div>

      <div className="tnat-mid">
        <div /> {/* spacer */}
        <h1 className="tnat-title">PURCHASE ORDER</h1>
        <div className="tnat-pono"><strong>No.</strong> &nbsp;: &nbsp;<strong>{po.po_number}</strong></div>
      </div>

      <div className="tnat-bill-meta">
        <div className="tnat-boxes">
          <div className="tnat-ship-box" onClick={onEditVendor} title="Click to edit vendor">
            <div className="tnat-box-lbl">Vendor:</div>
            {vendor.name && <div className="tnat-bold">{vendor.name}</div>}
            {vendor.address && <PreLines text={vendor.address} cls="tnat-line" />}
            {vendor.phone && <div className="tnat-line">Tel : {vendor.phone}</div>}
            {vendor.pic && <div className="tnat-line">PIC : {vendor.pic}</div>}
            {!vendor.name && <div className="tnat-line tnat-placeholder">Click to set Vendor</div>}
            <div className="tnat-edit-hint">✎ click to edit</div>
          </div>
          <div className="tnat-ship-box" onClick={onEditShipTo} title="Click to edit ship-to">
            <div className="tnat-box-lbl">Ship To:</div>
            {shipTo.name && <div className="tnat-bold">{shipTo.name}</div>}
            {shipTo.address && <PreLines text={shipTo.address} cls="tnat-line" />}
            {shipTo.phone && <div className="tnat-line">Tel : {shipTo.phone}</div>}
            {shipTo.pic && <div className="tnat-line">PIC : {shipTo.pic}</div>}
            {!shipTo.name && !shipTo.address && <div className="tnat-line tnat-placeholder">Click to set Ship-To</div>}
            <div className="tnat-edit-hint">✎ click to edit</div>
          </div>
        </div>
        <div className="tnat-info">
          <div className="tnat-row"><span className="tnat-key">Your Ref.</span><span>:</span><span className="tnat-val">&nbsp;</span></div>
          <div className="tnat-row"><span className="tnat-key">Terms</span><span>:</span><span className="tnat-val">{po.terms || '—'}</span></div>
          <div className="tnat-row"><span className="tnat-key">Date</span><span>:</span><span className="tnat-val">{orderDate}</span></div>
          <div className="tnat-row"><span className="tnat-key">Page</span><span>:</span><span className="tnat-val">1 of 1</span></div>
        </div>
      </div>

      <table className="tnat-items">
        <thead>
          <tr>
            <th style={{ width: 50 }}>Product</th>
            <th>Description</th>
            <th style={{ width: 60, textAlign: 'right' }}>Qty</th>
            <th style={{ width: 50 }}>Unit</th>
            <th style={{ width: 80, textAlign: 'right' }}>Unit Price<div className="tnat-rm">RM</div></th>
            <th style={{ width: 60, textAlign: 'right' }}>Disc.</th>
            <th style={{ width: 100, textAlign: 'right' }}>Total<div className="tnat-rm">RM</div></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any, idx: number) => (
            <tr key={it.id}>
              <td>{idx + 1}.</td>
              <td>
                <div>{it.product_name}</div>
                {it.notes && <div className="tnat-note">{it.notes}</div>}
              </td>
              <td style={{ textAlign: 'right' }}>{Number(it.qty).toLocaleString()}</td>
              <td>{it.uom}</td>
              <td style={{ textAlign: 'right' }}>{Number(it.unit_cost).toFixed(2)}</td>
              <td style={{ textAlign: 'right' }}>&nbsp;</td>
              <td style={{ textAlign: 'right' }}>{Number(it.amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tnat-bottom">
        <div className="tnat-words">{numToWords(Number(po.total_amount))}</div>
        <div className="tnat-total-box">
          <span className="tnat-total-label">Total &nbsp;:</span>
          <span className="tnat-total-amount">{Number(po.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="tnat-eoe">E &amp; OE</div>

      <div className="tnat-sig">
        <div className="tnat-sig-line">&nbsp;</div>
        <div className="tnat-sig-label">Authorised Signature</div>
      </div>
    </>
  )
}

function PreLines({ text, cls }: { text: string; cls: string }) {
  return (
    <>
      {text.split(/\r?\n/).filter(Boolean).map((line, i) => (
        <div key={i} className={cls}>{line}</div>
      ))}
    </>
  )
}

const css = `
.po-print-toolbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100001;
  padding: 10px 16px; background: #1A1A1A; color: white;
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  font-family: system-ui, sans-serif; font-size: 13px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}
.po-btn-primary { padding: 6px 14px; background: white; color: #1A1A1A; border: 0; border-radius: 4px; cursor: pointer; font-weight: 600; }
.po-btn-ghost { padding: 6px 14px; background: transparent; color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer; }
.po-toolbar-sep { width: 1px; height: 22px; background: rgba(255,255,255,0.2); margin: 0 4px; }
.po-toolbar-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.7); }
.po-toolbar-select { padding: 5px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.3); background: #2A2A2A; color: white; font-size: 12px; }

.po-print-root {
  position: fixed; inset: 0; z-index: 100000;
  background: #f0f0f0; overflow-y: auto;
  padding: 60px 16px 16px 16px;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #1A1A1A;
}
.po-page {
  width: 210mm; min-height: 297mm; padding: 14mm 14mm;
  margin: 0 auto; background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

@media print {
  html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
  body * { visibility: hidden !important; }
  .po-print-root, .po-print-root * { visibility: visible !important; }
  .po-print-toolbar { display: none !important; }
  .po-print-root {
    position: absolute !important;
    top: 0 !important; left: 0 !important; right: 0 !important;
    padding: 0 !important;
    background: white !important;
    overflow: visible !important;
    z-index: auto !important;
  }
  .po-page {
    width: auto !important;
    min-height: auto !important;
    margin: 0 !important;
    box-shadow: none !important;
    padding: 12mm 12mm !important;
  }
  @page { size: A4; margin: 0; }
}

.po-page * { box-sizing: border-box; }

/* ============ 1PCT Template ============ */
.t1pct-header { text-align: center; }
.t1pct-company { font-size: 14px; font-weight: 700; }
.t1pct-reg { font-size: 10px; font-weight: 500; }
.t1pct-addr { font-size: 10px; color: #444; margin-top: 4px; white-space: pre-line; }
.t1pct-title { font-size: 26px; font-weight: 700; text-align: right; margin: 14px 0 18px 0; letter-spacing: 0.5px; }
.t1pct-meta { display: grid; grid-template-columns: 1fr 1fr 220px; gap: 14px; margin-bottom: 14px; font-size: 10px; }
.t1pct-lbl { font-weight: 700; margin-bottom: 4px; }
.t1pct-bold { font-weight: 600; font-size: 11px; margin-bottom: 2px; }
.t1pct-line { font-size: 10px; color: #444; line-height: 1.4; }
.t1pct-ship-clickable { cursor: pointer; padding: 4px; margin: -4px; border-radius: 4px; }
.t1pct-ship-clickable:hover { background: #fafaf7; }
.t1pct-edit-hint { font-size: 8px; color: #999; font-weight: 400; opacity: 0; transition: opacity 0.15s; }
.t1pct-ship-clickable:hover .t1pct-edit-hint { opacity: 1; }
.t1pct-placeholder { color: #999; font-style: italic; }
@media print { .t1pct-edit-hint { display: none !important; } .po-edit-overlay { display: none !important; } }
.t1pct-info { border: 1px solid #1A1A1A; }
.t1pct-info-row { display: flex; border-bottom: 1px solid #1A1A1A; font-size: 10px; }
.t1pct-info-row:last-child { border-bottom: none; }
.t1pct-info-key { padding: 3px 8px; font-weight: 700; background: #fafaf7; min-width: 65px; border-right: 1px solid #1A1A1A; }
.t1pct-info-val { padding: 3px 8px; flex: 1; }
.t1pct-items { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
.t1pct-items thead th { border-top: 1px solid #1A1A1A; border-bottom: 1px solid #1A1A1A; padding: 8px 6px; text-align: left; font-weight: 700; font-size: 11px; }
.t1pct-items tbody td { padding: 8px 6px; vertical-align: top; }
.t1pct-rm { font-size: 10px; font-weight: 400; text-align: right; }
.t1pct-note { font-size: 10px; color: #6B6B6B; margin-top: 3px; font-style: italic; }
.t1pct-deposit-note { margin-top: 10px; font-size: 10px; padding-left: 4px; }
.t1pct-total-row { display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid #1A1A1A; margin-top: 10px; padding-top: 8px; font-size: 11px; font-weight: 700; gap: 80px; }
.t1pct-total-label { }
.t1pct-total-amount { min-width: 100px; text-align: right; }
.t1pct-footer { margin-top: 40px; font-size: 9px; color: #6B6B6B; text-align: left; }

/* ============ Nattome Template ============ */
.tnat-header { position: relative; text-align: center; padding-bottom: 6px; border-bottom: 1px solid #ccc; min-height: 100px; }
.tnat-logo { position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; }
.tnat-logo-img { max-width: 230px; max-height: 90px; object-fit: contain; }
.tnat-logo-text { font-family: 'Fraunces', 'Times New Roman', serif; font-size: 48px; font-weight: 500; color: #8B7355; font-style: italic; letter-spacing: 1px; }
.tnat-tm { font-size: 14px; vertical-align: super; font-style: normal; }
.tnat-company-block { display: inline-block; text-align: center; padding: 4px 20px; max-width: 540px; }
.tnat-company { font-size: 17px; font-weight: 700; white-space: nowrap; line-height: 1.2; }
.tnat-reg { font-size: 11px; line-height: 1.2; margin-top: 1px; }
.tnat-addr { font-size: 11px; color: #444; margin-top: 2px; white-space: pre-line; line-height: 1.25; }
.tnat-mid { display: grid; grid-template-columns: 200px 1fr 200px; align-items: center; padding: 6px 0; border-bottom: 1px solid #ccc; }
.tnat-title { font-size: 24px; font-weight: 700; letter-spacing: 0.5px; text-align: center; }
.tnat-pono { font-size: 13px; text-align: right; }
.tnat-bill-meta { display: grid; grid-template-columns: 1fr 220px; gap: 20px; margin: 14px 0; }
.tnat-boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.tnat-box-lbl { font-size: 10px; font-weight: 700; margin-bottom: 4px; text-transform: capitalize; }
.tnat-ship-box { border: 1px solid #1A1A1A; padding: 8px 12px; font-size: 10px; min-height: 110px; cursor: pointer; position: relative; }
.tnat-ship-box:hover { background: #fafaf7; }
.tnat-placeholder { color: #999; font-style: italic; }
.tnat-edit-hint { position: absolute; top: 4px; right: 6px; font-size: 8px; color: #999; opacity: 0; transition: opacity 0.15s; }
.tnat-ship-box:hover .tnat-edit-hint { opacity: 1; }
@media print { .tnat-edit-hint { display: none !important; } }
.tnat-bold { font-weight: 600; font-size: 11px; margin-bottom: 2px; }
.tnat-line { line-height: 1.4; }
.tnat-info { display: flex; flex-direction: column; gap: 4px; font-size: 10px; }
.tnat-row { display: grid; grid-template-columns: 60px 10px 1fr; align-items: center; }
.tnat-key { font-weight: 600; }
.tnat-val { border-bottom: 1px solid #ccc; padding-left: 6px; }
.tnat-items { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
.tnat-items thead th { border-top: 1px solid #1A1A1A; border-bottom: 1px solid #1A1A1A; padding: 8px 6px; text-align: left; font-weight: 700; background: #fafaf7; font-size: 11px; }
.tnat-items tbody td { padding: 8px 6px; vertical-align: top; }
.tnat-rm { font-size: 10px; font-weight: 400; }
.tnat-note { font-size: 10px; color: #6B6B6B; margin-top: 3px; }
.tnat-bottom { margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #ccc; padding-top: 12px; }
.tnat-words { font-size: 10px; max-width: 60%; }
.tnat-total-box { font-size: 11px; font-weight: 700; display: flex; gap: 10px; align-items: center; }
.tnat-total-amount { border: 1px solid #1A1A1A; padding: 4px 14px; min-width: 110px; text-align: right; }
.tnat-eoe { margin-top: 10px; text-align: right; font-size: 10px; font-weight: 600; }
.tnat-sig { margin-top: 40px; max-width: 220px; }
.tnat-sig-line { border-bottom: 1px solid #1A1A1A; height: 30px; }
.tnat-sig-label { margin-top: 4px; font-weight: 700; font-size: 10px; text-align: center; }
`
