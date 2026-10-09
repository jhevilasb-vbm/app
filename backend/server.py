import os
import math
import uuid
import logging
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import Any, Optional

import bcrypt
import jwt
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request
from fastapi.responses import Response
from fastapi.security import HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.environ["JWT_SECRET"]
TZ = ZoneInfo("America/Sao_Paulo")
logger = logging.getLogger("vbm")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="VBM Gestão 3D")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

COLS = {"clients", "suppliers", "materials", "products", "printers", "purchases",
        "transactions", "jobs", "quotes", "orders", "categories"}
OPEN_ORDER = ["confirmado", "em_producao", "pronto"]
ACTIVE_JOB = ["planejado", "na_fila", "imprimindo"]


# ---------------------------------------------------------------- helpers
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_s():
    return datetime.now(TZ).date().isoformat()


def r2(v):
    return round(float(v or 0) + 1e-9, 2)


def num(v):
    try:
        return None if v in (None, "") else float(v)
    except (TypeError, ValueError):
        return None


def nid():
    return str(uuid.uuid4())


def add_months(d: str, n: int) -> str:
    y, m, dd = map(int, d[:10].split("-"))
    m0 = m - 1 + n
    y += m0 // 12
    m = m0 % 12 + 1
    for day in (dd, 30, 29, 28):
        try:
            return date(y, m, day).isoformat()
        except ValueError:
            continue
    return d


NF = {"_id": 0}


async def find(col, q=None, sort=("created_at", -1), limit=5000):
    q = dict(q or {})
    q.setdefault("deleted", {"$ne": True})
    return await db[col].find(q, NF).sort(*sort).to_list(limit)


async def get_one(col, id_):
    doc = await db[col].find_one({"id": id_, "deleted": {"$ne": True}}, NF)
    if not doc:
        raise HTTPException(404, "Registro não encontrado")
    return doc


async def audit(user, entity, entity_id, action, summary=""):
    await db.audit_logs.insert_one({"id": nid(), "entity": entity, "entity_id": entity_id, "action": action,
                                    "summary": summary, "user_name": user["name"], "user_id": user["id"],
                                    "at": now_iso()})


async def next_number(prefix):
    c = await db.counters.find_one_and_update({"id": prefix}, {"$inc": {"seq": 1}}, upsert=True,
                                              return_document=True)
    return f"{prefix}-{c['seq']:04d}"


async def get_settings():
    s = await db.settings.find_one({"id": "main"}, NF)
    return s or {"id": "main"}


def stamp(doc, user, new=False):
    doc["updated_at"] = now_iso()
    doc["updated_by"] = user["name"]
    if new:
        doc["id"] = doc.get("id") or nid()
        doc["created_at"] = now_iso()
        doc["created_by"] = user["name"]
    return doc


# ---------------------------------------------------------------- auth
class LoginIn(BaseModel):
    email: str
    password: str


def make_token(uid):
    exp = datetime.now(timezone.utc) + timedelta(days=30)
    return jwt.encode({"sub": uid, "exp": exp}, JWT_SECRET, algorithm="HS256")


async def get_user(request: Request, cred=Depends(security)):
    token = cred.credentials if cred else request.query_params.get("token")
    if not token:
        raise HTTPException(401, "Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Sessão expirada")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "Usuário inválido")
    return user


@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    att = await db.login_attempts.find_one({"email": email}) or {}
    if att.get("count", 0) >= 5 and att.get("until", "") > now_iso():
        raise HTTPException(429, "Muitas tentativas. Aguarde 15 minutos.")
    user = await db.users.find_one({"email": email})
    if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        expired = att.get("until", "") <= now_iso()
        cnt = 1 if expired else att.get("count", 0) + 1
        await db.login_attempts.update_one({"email": email}, {"$set": {
            "count": cnt, "until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}}, upsert=True)
        raise HTTPException(401, "E-mail ou senha incorretos")
    await db.login_attempts.delete_one({"email": email})
    return {"token": make_token(user["id"]), "user": {"id": user["id"], "name": user["name"], "email": user["email"]}}


@api.get("/auth/me")
async def me(user=Depends(get_user)):
    return user


class PwdIn(BaseModel):
    current_password: str
    new_password: str
    name: Optional[str] = None


@api.post("/auth/change-password")
async def change_password(body: PwdIn, user=Depends(get_user)):
    u = await db.users.find_one({"id": user["id"]})
    if not bcrypt.checkpw(body.current_password.encode(), u["password_hash"].encode()):
        raise HTTPException(400, "Senha atual incorreta")
    if len(body.new_password) < 6:
        raise HTTPException(400, "A nova senha deve ter ao menos 6 caracteres")
    upd = {"password_hash": bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()}
    if body.name:
        upd["name"] = body.name.strip()
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return {"ok": True}


# ---------------------------------------------------------------- calculator
def psych(p):
    n = math.floor(p)
    r = n + 0.9
    if r < p - 1e-9:
        r = n + 1.9
    return round(r, 2)


def calc(inp: dict, s: dict, printer: Optional[dict]):
    warns = []

    def pick(key, *sources, label=None, skey=None):
        v = num(inp.get(key))
        if v is None:
            for src in sources:
                v = num((src or {}).get(skey or key))
                if v is not None:
                    break
        if v is None:
            if label:
                warns.append(label)
            v = 0.0
        return v

    pr = printer or {}
    qty = max(1, int(num(inp.get("qty")) or 1))
    weight = pick("weight_g", label="Peso de filamento por unidade")
    fil_kg = pick("filament_cost_kg", s, label="Custo do filamento por kg")
    minutes = pick("print_minutes", label="Tempo de impressão")
    hours = minutes / 60
    power = pick("power_w", pr, label=f"Consumo (W) da impressora {pr.get('name', '')}".strip())
    kwh = pick("kwh_cost", s, label="Custo do kWh")
    pprice = pick("purchase_price", pr, label=f"Valor de compra da {pr.get('name', 'impressora')}")
    life = pick("lifespan_hours", pr, label=f"Vida útil (h) da {pr.get('name', 'impressora')}")
    maint = pick("maintenance_pct", pr, s, label="% de manutenção")
    fail = pick("failure_pct", s, label="% de falhas e desperdício")
    waste_mode = inp.get("waste_mode") or s.get("waste_mode") or "material"
    labor_min = pick("labor_minutes")
    labor_hour = pick("labor_hour", s, label="Valor da hora de trabalho") if labor_min else pick("labor_hour", s)
    extras = pick("extras_unit")
    pack = pick("packaging_unit")
    mkt = pick("marketplace_pct", s)
    pay = pick("payment_pct", s)
    fixed_fee = pick("fixed_fee_order", s, skey="fixed_fee")
    ship = pick("shipping_paid_order")
    fixed_hour = num(inp.get("fixed_cost_hour"))
    if fixed_hour is None:
        fm, ph = num(s.get("fixed_costs_monthly")), num(s.get("productive_hours_month"))
        if fm is not None and ph:
            fixed_hour = fm / ph
        else:
            fixed_hour = 0.0
            warns.append("Custos fixos mensais / horas produtivas")
    mode = inp.get("pricing_mode") or s.get("pricing_mode") or "margem"
    margin = pick("margin_pct", s, label="Margem desejada" if mode == "margem" else None)
    markup = pick("markup_pct", s, label="Markup desejado" if mode == "markup" else None)

    c_fil = weight / 1000 * fil_kg
    c_energy = power / 1000 * hours * kwh
    dep_h = pprice / life if life > 0 else 0
    c_machine = hours * dep_h * (1 + maint / 100)
    c_labor = labor_min / 60 * labor_hour
    base = c_fil + c_energy + c_machine + c_labor + extras + pack
    c_waste = (c_fil if waste_mode == "material" else base) * fail / 100
    c_fixed = hours * fixed_hour
    cost = base + c_waste + c_fixed
    p = (mkt + pay) / 100
    f_u = fixed_fee / qty
    s_u = ship / qty
    errors = []
    breakeven = (cost + f_u + s_u) / (1 - p) if p < 1 else None
    min_price = None
    if mode == "margem":
        den = 1 - p - margin / 100
        if den > 0:
            min_price = (cost + f_u + s_u) / den
        else:
            errors.append("Taxas + margem ≥ 100%: impossível calcular o preço")
    else:
        if p < 1:
            min_price = (cost * (1 + markup / 100) + f_u + s_u) / (1 - p)
    recommended = psych(min_price) if min_price else None
    price = num(inp.get("unit_price")) or recommended or 0
    fees_u = price * p + f_u
    profit_u = price - fees_u - cost - s_u
    return {
        "qty": qty, "printer_id": pr.get("id"), "printer_name": pr.get("name"),
        "pricing_mode": mode, "waste_mode": waste_mode,
        "breakdown": {
            "filament": r2(c_fil), "energy": r2(c_energy), "machine": r2(c_machine), "labor": r2(c_labor),
            "extras": r2(extras), "packaging": r2(pack), "waste": r2(c_waste), "fixed": r2(c_fixed),
        },
        "unit_cost": r2(cost),
        "fees_pct": r2(p * 100), "fees_unit": r2(fees_u), "shipping_unit": r2(s_u),
        "breakeven_price": r2(breakeven) if breakeven else None,
        "min_price": r2(min_price) if min_price else None,
        "recommended_price": recommended,
        "unit_price": r2(price),
        "profit_unit": r2(profit_u), "profit_order": r2(profit_u * qty),
        "margin_real_pct": r2(profit_u / price * 100) if price else 0,
        "markup_real_pct": r2(profit_u / cost * 100) if cost else 0,
        "order_total": r2(price * qty), "order_cost": r2(cost * qty),
        "print_hours_total": r2(hours * qty), "labor_hours_total": r2(labor_min * qty / 60),
        "profit_per_print_hour": r2(profit_u / hours) if hours else None,
        "warnings": sorted(set(warns)), "errors": errors,
        "inputs": inp,
    }


@api.post("/calc")
async def calc_ep(inp: dict, user=Depends(get_user)):
    s = await get_settings()
    printers = await find("printers", sort=("name", 1))
    sel = next((p for p in printers if p["id"] == inp.get("printer_id")), printers[0] if printers else None)
    res = calc(inp, s, sel)
    res["comparison"] = []
    for p in printers:
        c = calc({**inp, "unit_price": res["unit_price"]}, s, p)
        res["comparison"].append({"printer_id": p["id"], "printer_name": p["name"], "unit_cost": c["unit_cost"],
                                  "profit_unit": c["profit_unit"], "profit_order": c["profit_order"],
                                  "margin_real_pct": c["margin_real_pct"],
                                  "profit_per_print_hour": c["profit_per_print_hour"],
                                  "compatible": p.get("compat_all", True) or (inp.get("printer_compat") != "a1")})
    return res


async def product_calc_inputs(prod):
    mats = {m["id"]: m for m in await find("materials")}
    extras = pack = 0.0
    for b in prod.get("bom") or []:
        m = mats.get(b.get("material_id"))
        if not m:
            continue
        c = (num(b.get("qty")) or 0) * (num(m.get("avg_cost")) or 0)
        if m.get("kind") == "embalagem":
            pack += c
        else:
            extras += c
    fil = mats.get(prod.get("filament_material_id"))
    out = {"weight_g": prod.get("weight_g"), "print_minutes": prod.get("print_minutes"),
           "labor_minutes": prod.get("labor_minutes"), "extras_unit": r2(extras), "packaging_unit": r2(pack),
           "product_id": prod["id"], "name": prod.get("name"), "printer_compat": prod.get("printer_compat")}
    if fil and num(fil.get("avg_cost")):
        out["filament_cost_kg"] = r2(num(fil["avg_cost"]) * 1000)
    if num(prod.get("margin_pct")) is not None:
        out["margin_pct"] = prod["margin_pct"]
    return out


@api.get("/products/{pid}/calc-inputs")
async def product_inputs_ep(pid: str, user=Depends(get_user)):
    return await product_calc_inputs(await get_one("products", pid))


# ---------------------------------------------------------------- stock
async def add_movement(user, material_id, mtype, qty, unit_cost=None, note="", ref=None, force=False, demo=False):
    m = await get_one("materials", material_id)
    cur = num(m.get("qty")) or 0
    qty = float(qty)
    avg = num(m.get("avg_cost")) or 0
    if mtype == "entrada":
        uc = num(unit_cost) if num(unit_cost) is not None else avg
        new = cur + qty
        avg = (cur * avg + qty * uc) / new if new > 0 else uc
        delta = qty
    elif mtype == "ajuste":
        delta = qty - cur
        new = qty
    else:
        delta = -qty
        new = cur - qty
    if new < -1e-9 and not force:
        raise HTTPException(409, f"Estoque insuficiente de {m['name']}: disponível {r2(cur)} {m.get('unit', '')}")
    await db.materials.update_one({"id": material_id}, {"$set": {"qty": r2(new) if m.get("unit") != "g" else round(new, 1),
                                                                 "avg_cost": round(avg, 6), "updated_at": now_iso(),
                                                                 "updated_by": user["name"]}})
    mv = {"id": nid(), "material_id": material_id, "material_name": m["name"], "type": mtype, "qty": qty,
          "delta": delta, "balance": new, "unit_cost": num(unit_cost) if unit_cost is not None else avg,
          "note": note, "ref": ref, "date": today_s(), "created_at": now_iso(), "created_by": user["name"],
          "demo": demo or m.get("demo", False)}
    await db.stock_movements.insert_one(mv)
    min_q = num(m.get("min_qty"))
    if delta < 0 and min_q is not None and new <= min_q:
        open_p = await db.purchases.find_one({"material_id": material_id, "deleted": {"$ne": True},
                                              "status": {"$in": ["planejado", "aprovado", "comprado"]}})
        if not open_p:
            pdoc = stamp({"material_id": material_id, "name": m["name"], "qty": max(min_q * 2 - new, min_q or 1),
                          "unit": m.get("unit"), "est_unit_price": avg, "supplier_id": m.get("supplier_id"),
                          "reason": "Estoque mínimo atingido (automático)", "status": "planejado",
                          "priority": "alta", "demo": m.get("demo", False)}, user, True)
            await db.purchases.insert_one(pdoc)
    mv.pop("_id", None)
    return mv


class MoveIn(BaseModel):
    material_id: str
    type: str
    qty: float
    unit_cost: Optional[float] = None
    note: str = ""
    force: bool = False


@api.post("/stock/movement")
async def movement_ep(body: MoveIn, user=Depends(get_user)):
    if body.type not in ("entrada", "saida", "ajuste", "desperdicio") or body.qty < 0:
        raise HTTPException(400, "Movimentação inválida")
    mv = await add_movement(user, body.material_id, body.type, body.qty, body.unit_cost, body.note, force=body.force)
    await audit(user, "materials", body.material_id, f"movimentação {body.type}", f"{body.qty} - {body.note}")
    return mv


@api.get("/stock/movements")
async def movements_ep(material_id: Optional[str] = None, user=Depends(get_user)):
    q = {"material_id": material_id} if material_id else {}
    return await db.stock_movements.find(q, NF).sort("created_at", -1).to_list(1000)


# ---------------------------------------------------------------- products / finished goods
@api.get("/products/overview")
async def products_overview(user=Depends(get_user)):
    prods = await find("products", sort=("name", 1))
    orders = await find("orders", {"status": {"$in": OPEN_ORDER}})
    jobs = await find("jobs", {"status": {"$in": ACTIVE_JOB}})
    res = []
    for p in prods:
        reserved = sum(num(i.get("qty")) or 0 for o in orders for i in o.get("items", []) if i.get("product_id") == p["id"])
        ready = sum(num(i.get("qty")) or 0 for o in orders if o["status"] == "pronto" for i in o.get("items", [])
                    if i.get("product_id") == p["id"])
        inprod = sum(num(j.get("qty")) or 0 for j in jobs if j.get("product_id") == p["id"])
        fs = num(p.get("finished_stock")) or 0
        res.append({**p, "reserved": reserved, "ready_to_ship": min(ready, fs), "in_production": inprod,
                    "available": max(fs - reserved, 0), "low": fs <= (num(p.get("min_stock")) or -1)})
    return res


class FinAdj(BaseModel):
    delta: float
    note: str = ""


@api.post("/products/{pid}/finished-adjust")
async def finished_adjust(pid: str, body: FinAdj, user=Depends(get_user)):
    p = await get_one("products", pid)
    new = (num(p.get("finished_stock")) or 0) + body.delta
    if new < 0:
        raise HTTPException(409, "Estoque de produto acabado não pode ficar negativo")
    await db.products.update_one({"id": pid}, {"$set": {"finished_stock": new}})
    await db.finished_movements.insert_one({"id": nid(), "product_id": pid, "delta": body.delta, "note": body.note,
                                            "created_at": now_iso(), "created_by": user["name"]})
    await audit(user, "products", pid, "ajuste estoque acabado", f"{body.delta} {body.note}")
    return {"finished_stock": new}


# ---------------------------------------------------------------- orders / quotes
def compute_items(d):
    items = d.get("items") or []
    for i in items:
        i["qty"] = num(i.get("qty")) or 0
        i["unit_price"] = num(i.get("unit_price")) or 0
        i["unit_cost"] = num(i.get("unit_cost")) or 0
        i["total"] = r2(i["qty"] * i["unit_price"])
    sub = sum(i["total"] for i in items)
    d["items"] = items
    d["subtotal"] = r2(sub)
    d["discount"] = num(d.get("discount")) or 0
    return sub


def compute_order(d):
    sub = compute_items(d)
    d["shipping_charged"] = num(d.get("shipping_charged")) or 0
    d["shipping_paid"] = num(d.get("shipping_paid")) or 0
    d["marketplace_fee"] = num(d.get("marketplace_fee")) or 0
    d["payment_fee"] = num(d.get("payment_fee")) or 0
    d["total"] = r2(sub - d["discount"] + d["shipping_charged"])
    d["fees"] = r2(d["marketplace_fee"] + d["payment_fee"])
    d["cost_total"] = r2(sum(i["qty"] * i["unit_cost"] for i in d["items"]) + d["shipping_paid"])
    d["profit"] = r2(d["total"] - d["fees"] - d["cost_total"])
    d.setdefault("fees_deducted", True)
    d["expected_receipt"] = r2(d["total"] - (d["fees"] if d["fees_deducted"] else 0))
    d.setdefault("status", "confirmado")
    d.setdefault("order_date", today_s())


def compute_quote(d):
    sub = compute_items(d)
    d["total"] = r2(sub - d["discount"])
    d["cost_total"] = r2(sum(i["qty"] * i["unit_cost"] for i in d["items"]))
    d["profit"] = r2(d["total"] - d["cost_total"] - sum(num(i.get("fees_total")) or 0 for i in d["items"]))
    d["deposit"] = num(d.get("deposit")) or 0
    d["balance"] = r2(d["total"] - d["deposit"])
    d.setdefault("status", "rascunho")
    d.setdefault("quote_date", today_s())


async def sync_order_fees(order, user):
    q = {"order_id": order["id"], "source": "taxa_pedido", "deleted": {"$ne": True}}
    existing = await db.transactions.find_one(q)
    need = (not order.get("fees_deducted", True)) and order.get("fees", 0) > 0 and order.get("status") != "cancelado"
    if need:
        if existing:
            if not existing.get("paid_date"):
                await db.transactions.update_one({"id": existing["id"]}, {"$set": {"amount": order["fees"]}})
        else:
            await db.transactions.insert_one(stamp({
                "type": "despesa", "scope": "empresa", "description": f"Taxas do pedido {order.get('number')}",
                "category": "Taxas de marketplace", "amount": order["fees"], "due_date": order.get("order_date"),
                "order_id": order["id"], "source": "taxa_pedido", "in_result": False, "demo": order.get("demo", False)},
                user, True))
    elif existing and not existing.get("paid_date"):
        await db.transactions.update_one({"id": existing["id"]}, {"$set": {"deleted": True}})


async def order_finance(order):
    txs = await find("transactions", {"order_id": order["id"], "type": "receita"})
    paid = sum(t["amount"] for t in txs if t.get("paid_date"))
    sched = sum(t["amount"] for t in txs if not t.get("paid_date"))
    exp = order.get("expected_receipt", order.get("total", 0))
    bal = r2(exp - paid) if order.get("status") != "cancelado" else 0
    status = "pago" if bal <= 0.009 and exp > 0 else ("parcial" if paid > 0 else "pendente")
    return {"paid": r2(paid), "scheduled": r2(sched), "balance": max(bal, 0), "unscheduled": max(r2(bal - sched), 0),
            "payment_status": status, "transactions": txs}


@api.get("/orders/summary")
async def orders_summary(user=Depends(get_user)):
    orders = await find("orders")
    out = []
    t = today_s()
    for o in orders:
        f = await order_finance(o)
        f.pop("transactions")
        late = o.get("due_date") and o["due_date"] < t and o["status"] in OPEN_ORDER
        out.append({**o, **f, "late": bool(late)})
    return out


@api.get("/orders/{oid}/detail")
async def order_detail(oid: str, user=Depends(get_user)):
    o = await get_one("orders", oid)
    f = await order_finance(o)
    jobs = await find("jobs", {"order_id": oid})
    hist = await db.audit_logs.find({"entity_id": oid}, NF).sort("at", -1).to_list(100)
    return {**o, **f, "jobs": jobs, "history": hist}


class PayIn(BaseModel):
    amount: float
    date: Optional[str] = None
    method: str = ""
    note: str = ""
    n: int = 1
    scheduled: bool = False


@api.post("/orders/{oid}/payments")
async def order_payment(oid: str, body: PayIn, user=Depends(get_user)):
    o = await get_one("orders", oid)
    if body.amount <= 0:
        raise HTTPException(400, "Valor inválido")
    f = await order_finance(o)
    limit = f["unscheduled"] if body.scheduled else f["balance"]
    if body.amount > limit + 0.009:
        raise HTTPException(409, f"Valor maior que o saldo disponível (R$ {limit:.2f})")
    n = max(1, body.n)
    each = math.floor(body.amount / n * 100) / 100
    created = []
    group = nid()
    first = body.date or today_s()
    for k in range(n):
        amt = r2(body.amount - each * (n - 1)) if k == n - 1 else each
        due = add_months(first, k)
        paid = (not body.scheduled) and k == 0 and n == 1
        doc = stamp({"type": "receita", "scope": "empresa",
                     "description": f"Pedido {o.get('number')}" + (f" - parcela {k + 1}/{n}" if n > 1 else "") +
                                    (f" ({body.note})" if body.note else ""),
                     "category": "Vendas", "amount": amt, "due_date": due, "paid_date": due if paid else None,
                     "method": body.method, "order_id": oid, "client_id": o.get("client_id"), "channel": o.get("channel"),
                     "source": "venda", "in_result": False, "installment": f"{k + 1}/{n}" if n > 1 else None,
                     "installment_group": group if n > 1 else None, "demo": o.get("demo", False)}, user, True)
        await db.transactions.insert_one(doc)
        doc.pop("_id", None)
        created.append(doc)
    await audit(user, "orders", oid, "pagamento" if not body.scheduled else "parcelas a receber", f"R$ {body.amount:.2f}")
    return created


class StatusIn(BaseModel):
    status: str
    force: bool = False


@api.post("/orders/{oid}/status")
async def order_status(oid: str, body: StatusIn, user=Depends(get_user)):
    o = await get_one("orders", oid)
    if body.status not in ("confirmado", "em_producao", "pronto", "entregue", "cancelado"):
        raise HTTPException(400, "Status inválido")
    upd = {"status": body.status}
    if body.status == "entregue" and not o.get("stock_out_done"):
        prods = {p["id"]: p for p in await find("products")}
        short = []
        for i in o.get("items", []):
            p = prods.get(i.get("product_id"))
            if p and (num(p.get("finished_stock")) or 0) < i["qty"]:
                short.append(f"{p['name']} (disponível {num(p.get('finished_stock')) or 0}, necessário {i['qty']})")
        if short and not body.force:
            raise HTTPException(409, "Estoque de produto acabado insuficiente: " + "; ".join(short))
        for i in o.get("items", []):
            p = prods.get(i.get("product_id"))
            if p:
                newv = max((num(p.get("finished_stock")) or 0) - i["qty"], 0)
                await db.products.update_one({"id": p["id"]}, {"$set": {"finished_stock": newv}})
                await db.finished_movements.insert_one({"id": nid(), "product_id": p["id"], "delta": -i["qty"],
                                                        "note": f"Entrega pedido {o.get('number')}",
                                                        "created_at": now_iso(), "created_by": user["name"]})
        upd["stock_out_done"] = True
        upd["delivered_date"] = today_s()
    await db.orders.update_one({"id": oid}, {"$set": stamp(upd, user)})
    o.update(upd)
    await sync_order_fees(o, user)
    if o.get("client_id"):
        stage = {"em_producao": "pedido_em_producao", "pronto": "pronto_entrega", "entregue": "entregue"}.get(body.status)
        if stage:
            await db.clients.update_one({"id": o["client_id"]}, {"$set": {"stage": stage}})
    await audit(user, "orders", oid, "status", body.status)
    return await get_one("orders", oid)


@api.post("/orders/{oid}/jobs")
async def order_jobs(oid: str, user=Depends(get_user)):
    o = await get_one("orders", oid)
    prods = {p["id"]: p for p in await find("products")}
    existing = await find("jobs", {"order_id": oid, "status": {"$nin": ["cancelado", "falhou"]}})
    created = []
    for i in o.get("items", []):
        p = prods.get(i.get("product_id"))
        if not p or any(j.get("product_id") == p["id"] for j in existing):
            continue
        doc = stamp({"order_id": oid, "order_number": o.get("number"), "product_id": p["id"], "product_name": p["name"],
                     "qty": i["qty"], "material_id": p.get("filament_material_id"),
                     "est_weight": r2((num(p.get("weight_g")) or 0) * i["qty"]),
                     "est_minutes": (num(p.get("print_minutes")) or 0) * i["qty"], "status": "planejado",
                     "printer_id": i.get("printer_id"), "due_date": o.get("due_date"),
                     "colors": i.get("color") or p.get("color"), "notes": i.get("customization", ""),
                     "demo": o.get("demo", False)}, user, True)
        await db.jobs.insert_one(doc)
        doc.pop("_id", None)
        created.append(doc)
    if created and o["status"] == "confirmado":
        await db.orders.update_one({"id": oid}, {"$set": {"status": "em_producao"}})
    await auto_assign(user)
    await audit(user, "orders", oid, "gerou trabalhos de produção", str(len(created)))
    return created


@api.post("/quotes/{qid}/convert")
async def convert_quote(qid: str, user=Depends(get_user)):
    q = await get_one("quotes", qid)
    if q.get("order_id"):
        raise HTTPException(409, "Este orçamento já foi convertido em pedido")
    items = [{k: i.get(k) for k in ("product_id", "name", "description", "qty", "unit_price", "unit_cost",
                                   "customization", "color", "printer_id", "calc")} for i in q.get("items", [])]
    fees = sum(num(i.get("fees_total")) or 0 for i in q.get("items", []))
    o = {"client_id": q.get("client_id"), "client_name": q.get("client_name"), "channel": q.get("channel") or "whatsapp",
         "items": items, "discount": q.get("discount", 0), "marketplace_fee": r2(fees), "payment_fee": 0,
         "fees_deducted": True, "due_date": add_days(today_s(), int(num(q.get("production_days")) or 7)),
         "notes": q.get("notes", ""), "payment_terms": q.get("payment_terms"), "quote_id": qid,
         "quote_number": q.get("number"), "status": "confirmado", "order_date": today_s(), "demo": q.get("demo", False)}
    compute_order(o)
    o["number"] = await next_number("P")
    stamp(o, user, True)
    await db.orders.insert_one(o)
    await db.quotes.update_one({"id": qid}, {"$set": {"status": "aprovado", "order_id": o["id"],
                                                      "approved_at": now_iso(), "approved_by": user["name"]}})
    if q.get("deposit"):
        await db.transactions.insert_one(stamp({
            "type": "receita", "scope": "empresa", "description": f"Sinal pedido {o['number']} (pendente)",
            "category": "Vendas", "amount": q["deposit"], "due_date": today_s(), "paid_date": None,
            "order_id": o["id"], "client_id": o.get("client_id"), "channel": o["channel"], "source": "venda",
            "in_result": False, "demo": o["demo"]}, user, True))
    if q.get("client_id"):
        await db.clients.update_one({"id": q["client_id"]}, {"$set": {"stage": "aprovado"}})
    await audit(user, "quotes", qid, "convertido em pedido", o["number"])
    await audit(user, "orders", o["id"], "criado a partir do orçamento", q.get("number", ""))
    o.pop("_id", None)
    return o


def add_days(d, n):
    return (date.fromisoformat(d[:10]) + timedelta(days=n)).isoformat()


# ---------------------------------------------------------------- production
async def schedule_data():
    printers = await find("printers", sort=("name", 1))
    jobs = await find("jobs", {"status": {"$in": ACTIVE_JOB}}, sort=("created_at", 1))
    nowdt = datetime.now(timezone.utc)
    avail = {p["id"]: nowdt for p in printers}
    order_key = {"imprimindo": 0, "na_fila": 1, "planejado": 2}
    jobs.sort(key=lambda j: (order_key[j["status"]], j.get("due_date") or "9999", j["created_at"]))
    lanes = {p["id"]: [] for p in printers}
    unassigned = []
    for j in jobs:
        pid = j.get("printer_id")
        if pid not in avail:
            unassigned.append(j)
            continue
        dur = timedelta(minutes=num(j.get("est_minutes")) or 0)
        if j["status"] == "imprimindo" and j.get("start_time"):
            try:
                st = datetime.fromisoformat(j["start_time"])
                if st.tzinfo is None:
                    st = st.replace(tzinfo=TZ)
            except ValueError:
                st = avail[pid]
        else:
            st = avail[pid]
        end = max(st + dur, nowdt) if j["status"] == "imprimindo" else st + dur
        avail[pid] = end
        endl = end.astimezone(TZ)
        lanes[pid].append({**j, "pred_start": st.astimezone(TZ).isoformat(), "pred_end": endl.isoformat(),
                           "late": bool(j.get("due_date") and endl.date().isoformat() > j["due_date"])})
    return printers, lanes, unassigned, avail


async def auto_assign(user):
    printers, lanes, unassigned, avail = await schedule_data()
    prods = {p["id"]: p for p in await find("products")}
    n = 0
    for j in unassigned:
        compat = (prods.get(j.get("product_id")) or {}).get("printer_compat", "ambas")
        cands = [p for p in printers if compat == "ambas" or p.get("code") == compat] or printers
        if not cands:
            break
        best = min(cands, key=lambda p: avail[p["id"]])
        avail[best["id"]] += timedelta(minutes=num(j.get("est_minutes")) or 0)
        await db.jobs.update_one({"id": j["id"]}, {"$set": {"printer_id": best["id"], "printer_name": best["name"]}})
        n += 1
    return n


@api.get("/production/schedule")
async def schedule_ep(user=Depends(get_user)):
    printers, lanes, unassigned, _ = await schedule_data()
    return {"printers": [{**p, "jobs": lanes[p["id"]],
                          "free_at": lanes[p["id"]][-1]["pred_end"] if lanes[p["id"]] else None} for p in printers],
            "unassigned": unassigned}


@api.post("/production/auto-assign")
async def auto_assign_ep(user=Depends(get_user)):
    return {"assigned": await auto_assign(user)}


class CompleteIn(BaseModel):
    status: str = "concluido"
    real_weight: Optional[float] = None
    real_minutes: Optional[float] = None
    approved_qty: float = 0
    defect_qty: float = 0
    redo_qty: float = 0
    failure_reason: str = ""
    add_to_stock: bool = True
    force: bool = False


@api.post("/jobs/{jid}/start")
async def job_start(jid: str, user=Depends(get_user)):
    j = await get_one("jobs", jid)
    if j["status"] not in ("planejado", "na_fila"):
        raise HTTPException(409, "Trabalho não pode ser iniciado neste status")
    await db.jobs.update_one({"id": jid}, {"$set": stamp({"status": "imprimindo",
                                                          "start_time": datetime.now(TZ).isoformat()}, user)})
    await audit(user, "jobs", jid, "iniciado")
    return await get_one("jobs", jid)


@api.post("/jobs/{jid}/complete")
async def job_complete(jid: str, body: CompleteIn, user=Depends(get_user)):
    j = await get_one("jobs", jid)
    if j.get("consumed"):
        raise HTTPException(409, "Este trabalho já foi finalizado e os materiais já foram baixados")
    if body.status not in ("concluido", "falhou", "cancelado"):
        raise HTTPException(400, "Status inválido")
    end = datetime.now(TZ)
    upd = {"status": body.status, "end_time": end.isoformat(), "approved_qty": body.approved_qty,
           "defect_qty": body.defect_qty, "redo_qty": body.redo_qty, "failure_reason": body.failure_reason}
    real_min = body.real_minutes
    if real_min is None and j.get("start_time"):
        try:
            real_min = round((end - datetime.fromisoformat(j["start_time"])).total_seconds() / 60)
        except ValueError:
            real_min = None
    upd["real_minutes"] = real_min if real_min is not None else (j.get("est_minutes") if body.status != "cancelado" else 0)
    if body.status == "cancelado":
        await db.jobs.update_one({"id": jid}, {"$set": stamp({**upd, "consumed": True}, user)})
        await audit(user, "jobs", jid, "cancelado")
        return await get_one("jobs", jid)
    weight = body.real_weight if body.real_weight is not None else (num(j.get("est_weight")) or 0)
    upd["real_weight"] = weight
    prod = await db.products.find_one({"id": j.get("product_id")}, NF) or {}
    units = body.approved_qty + body.defect_qty
    needs = []
    if j.get("material_id") and weight > 0:
        good = weight * (body.approved_qty / units) if units and body.status == "concluido" else 0
        if good > 0:
            needs.append((j["material_id"], "saida", good, f"Produção {prod.get('name', '')}"))
        if weight - good > 0.001:
            needs.append((j["material_id"], "desperdicio", weight - good, f"Falha/defeito: {body.failure_reason}"))
    if body.status == "concluido":
        for b in prod.get("bom") or []:
            q = (num(b.get("qty")) or 0) * units
            if b.get("material_id") and q > 0:
                needs.append((b["material_id"], "saida", q, f"Ficha técnica {prod.get('name', '')}"))
    if not body.force:
        totals = {}
        for mid, _, q, _ in needs:
            totals[mid] = totals.get(mid, 0) + q
        short = []
        for mid, q in totals.items():
            m = await db.materials.find_one({"id": mid}, NF)
            if m and (num(m.get("qty")) or 0) < q - 1e-9:
                short.append(f"{m['name']} (disponível {r2(m.get('qty'))}, necessário {r2(q)})")
        if short:
            raise HTTPException(409, "Estoque insuficiente: " + "; ".join(short))
    for mid, t, q, note in needs:
        await add_movement(user, mid, t, q, note=note, ref=jid, force=True, demo=j.get("demo", False))
    upd["consumed"] = True
    if body.status == "concluido" and body.add_to_stock and prod and body.approved_qty > 0:
        await db.products.update_one({"id": prod["id"]}, {"$inc": {"finished_stock": body.approved_qty}})
        await db.finished_movements.insert_one({"id": nid(), "product_id": prod["id"], "delta": body.approved_qty,
                                                "note": f"Produção concluída {j.get('order_number') or ''}",
                                                "created_at": now_iso(), "created_by": user["name"]})
        upd["stock_added"] = True
    await db.jobs.update_one({"id": jid}, {"$set": stamp(upd, user)})
    if j.get("printer_id") and upd["real_minutes"]:
        await db.printers.update_one({"id": j["printer_id"]}, {"$inc": {"hours_used": r2(upd["real_minutes"] / 60)}})
    if body.status == "concluido" and j.get("order_id"):
        pend = await find("jobs", {"order_id": j["order_id"], "status": {"$in": ACTIVE_JOB}})
        if not pend:
            await db.orders.update_one({"id": j["order_id"], "status": {"$in": ["confirmado", "em_producao"]}},
                                       {"$set": {"status": "pronto"}})
    await audit(user, "jobs", jid, body.status, f"aprovadas {body.approved_qty}, defeito {body.defect_qty}")
    return await get_one("jobs", jid)


# ---------------------------------------------------------------- finance
def tx_status(t):
    if t.get("paid_date"):
        return "pago"
    return "vencido" if (t.get("due_date") or "9999") < today_s() else "pendente"


class BatchIn(BaseModel):
    base: dict
    mode: str = "parcelado"
    total_amount: float
    n: int
    first_due: str


@api.post("/transactions/batch")
async def tx_batch(body: BatchIn, user=Depends(get_user)):
    if body.n < 1 or body.n > 120 or body.total_amount <= 0:
        raise HTTPException(400, "Dados inválidos")
    group = nid()
    each = math.floor(body.total_amount / body.n * 100) / 100 if body.mode == "parcelado" else r2(body.total_amount)
    out = []
    for k in range(body.n):
        amt = r2(body.total_amount - each * (body.n - 1)) if (body.mode == "parcelado" and k == body.n - 1) else each
        doc = await prep_tx({**body.base, "amount": amt, "due_date": add_months(body.first_due, k), "paid_date": None,
                             "installment": f"{k + 1}/{body.n}", "installment_group": group,
                             "recurrence": body.mode == "recorrente",
                             "description": f"{body.base.get('description', '')} ({k + 1}/{body.n})"})
        stamp(doc, user, True)
        await db.transactions.insert_one(doc)
        doc.pop("_id", None)
        out.append(doc)
    await audit(user, "transactions", group, f"criou {body.mode}", f"{body.n}x {body.base.get('description')}")
    return out


class PayTx(BaseModel):
    paid_date: Optional[str] = None
    amount: Optional[float] = None


@api.post("/transactions/{tid}/pay")
async def tx_pay(tid: str, body: PayTx, user=Depends(get_user)):
    t = await get_one("transactions", tid)
    upd = {"paid_date": body.paid_date or today_s()}
    if body.amount:
        upd["amount"] = r2(body.amount)
    await db.transactions.update_one({"id": tid}, {"$set": stamp(upd, user)})
    await audit(user, "transactions", tid, "baixa", t.get("description", ""))
    return await get_one("transactions", tid)


@api.post("/transactions/{tid}/unpay")
async def tx_unpay(tid: str, user=Depends(get_user)):
    await get_one("transactions", tid)
    await db.transactions.update_one({"id": tid}, {"$set": stamp({"paid_date": None}, user)})
    await audit(user, "transactions", tid, "estorno da baixa")
    return await get_one("transactions", tid)


async def prep_tx(d):
    d["amount"] = r2(abs(num(d.get("amount")) or 0))
    d.setdefault("type", "despesa")
    d.setdefault("scope", "empresa")
    if "in_result" not in d:
        if d["type"] == "despesa":
            cat = await db.categories.find_one({"name": d.get("category"), "deleted": {"$ne": True}})
            d["in_result"] = cat.get("in_result", True) if cat else True
        else:
            d["in_result"] = d["type"] == "receita" and not d.get("order_id")
    d.setdefault("source", "manual")
    return d


async def cash_balance(s, until=None):
    txs = await find("transactions", {"scope": "empresa", "paid_date": {"$ne": None}})
    bal = num(s.get("initial_balance")) or 0
    for t in txs:
        if until and t["paid_date"] > until:
            continue
        bal += t["amount"] if t["type"] in ("receita", "aporte") else -t["amount"]
    return r2(bal)


class ReconIn(BaseModel):
    counted_balance: float
    note: str = ""
    create_adjustment: bool = True


@api.post("/finance/reconcile")
async def reconcile(body: ReconIn, user=Depends(get_user)):
    s = await get_settings()
    sysb = await cash_balance(s)
    diff = r2(body.counted_balance - sysb)
    rec = {"id": nid(), "date": today_s(), "system_balance": sysb, "counted_balance": body.counted_balance, "diff": diff,
           "note": body.note, "created_by": user["name"], "created_at": now_iso()}
    await db.reconciliations.insert_one(rec)
    if body.create_adjustment and abs(diff) >= 0.01:
        await db.transactions.insert_one(stamp({
            "type": "receita" if diff > 0 else "despesa", "scope": "empresa", "description": "Ajuste de conciliação de caixa",
            "category": "Ajuste de caixa", "amount": abs(diff), "due_date": today_s(), "paid_date": today_s(),
            "source": "conciliacao", "in_result": False}, user, True))
    await audit(user, "finance", rec["id"], "conciliação", f"diferença {diff}")
    rec.pop("_id", None)
    return rec


@api.get("/finance/reconciliations")
async def reconciliations(user=Depends(get_user)):
    return await db.reconciliations.find({}, NF).sort("created_at", -1).to_list(50)


def month_range():
    t = datetime.now(TZ).date()
    start = t.replace(day=1)
    end = (date.fromisoformat(add_months(start.isoformat(), 1)) - timedelta(days=1))
    return start.isoformat(), end.isoformat()


async def period_metrics(start, end):
    orders = await find("orders", {"status": {"$ne": "cancelado"}, "order_date": {"$gte": start, "$lte": end}})
    txs = await find("transactions", {"scope": "empresa"})
    revenue = sum(o["total"] for o in orders)
    fees = sum(o.get("fees", 0) for o in orders)
    cogs = sum(o.get("cost_total", 0) for o in orders)
    gross = revenue - fees - cogs
    in_period = [t for t in txs if start <= (t.get("due_date") or "") <= end]
    paid_period = [t for t in txs if t.get("paid_date") and start <= t["paid_date"] <= end]
    opex = sum(t["amount"] for t in in_period if t["type"] == "despesa" and t.get("in_result"))
    other_rev = sum(t["amount"] for t in in_period if t["type"] == "receita" and t.get("in_result"))
    expenses_all = sum(t["amount"] for t in in_period if t["type"] == "despesa")
    received = sum(t["amount"] for t in paid_period if t["type"] == "receita")
    paid_out = sum(t["amount"] for t in paid_period if t["type"] == "despesa")
    by_cat = {}
    for t in in_period:
        if t["type"] == "despesa":
            by_cat[t.get("category") or "Sem categoria"] = by_cat.get(t.get("category") or "Sem categoria", 0) + t["amount"]
    by_channel = {}
    for o in orders:
        by_channel[o.get("channel") or "outros"] = by_channel.get(o.get("channel") or "outros", 0) + o["total"]
    prods = {}
    for o in orders:
        for i in o.get("items", []):
            k = i.get("product_id") or i.get("name")
            pr = prods.setdefault(k, {"name": i.get("name"), "qty": 0, "revenue": 0, "profit": 0})
            pr["qty"] += i["qty"]
            pr["revenue"] += i["total"]
            pr["profit"] += i["qty"] * (i["unit_price"] - i["unit_cost"])
    plist = [{**v, "revenue": r2(v["revenue"]), "profit": r2(v["profit"])} for v in prods.values()]
    return {
        "revenue": r2(revenue), "fees": r2(fees), "cogs": r2(cogs), "gross_profit": r2(gross),
        "opex": r2(opex), "other_revenue": r2(other_rev), "net_profit": r2(gross - opex + other_rev),
        "expenses_total": r2(expenses_all), "received": r2(received), "paid_out": r2(paid_out),
        "cash_result": r2(received - paid_out + sum(t["amount"] for t in paid_period if t["type"] == "aporte")
                          - sum(t["amount"] for t in paid_period if t["type"] == "retirada")),
        "aportes": r2(sum(t["amount"] for t in paid_period if t["type"] == "aporte")),
        "retiradas": r2(sum(t["amount"] for t in paid_period if t["type"] == "retirada")),
        "orders_count": len(orders),
        "expenses_by_category": sorted([{"name": k, "value": r2(v)} for k, v in by_cat.items()], key=lambda x: -x["value"]),
        "revenue_by_channel": sorted([{"name": k, "value": r2(v)} for k, v in by_channel.items()], key=lambda x: -x["value"]),
        "top_products_qty": sorted(plist, key=lambda x: -x["qty"])[:5],
        "top_products_profit": sorted(plist, key=lambda x: -x["profit"])[:5],
        "products": plist,
    }


async def receivables_total():
    orders = await find("orders", {"status": {"$ne": "cancelado"}})
    tot = 0
    for o in orders:
        tot += (await order_finance(o))["unscheduled"]
    pend = await find("transactions", {"scope": "empresa", "type": "receita", "paid_date": None})
    return r2(tot + sum(t["amount"] for t in pend)), pend


@api.get("/finance/overview")
async def finance_overview(user=Depends(get_user)):
    s = await get_settings()
    t = today_s()
    txs = await find("transactions", {"scope": "empresa"})
    pend_out = [x for x in txs if x["type"] in ("despesa", "retirada") and not x.get("paid_date")]
    rec_total, pend_in = await receivables_total()

    def due_within(lst, days):
        lim = add_days(t, days)
        return r2(sum(x["amount"] for x in lst if t <= (x.get("due_date") or "") <= lim))

    overdue = [x for x in pend_out if (x.get("due_date") or "9999") < t]
    bal = await cash_balance(s)
    proj = []
    run = bal
    for k in range(6):
        ms = add_months(t[:8] + "01", k)
        me_ = add_days(add_months(ms, 1), -1)
        ins = sum(x["amount"] for x in pend_in if ms <= (x.get("due_date") or "") <= me_ or (k == 0 and (x.get("due_date") or "") < ms))
        outs = sum(x["amount"] for x in pend_out if ms <= (x.get("due_date") or "") <= me_ or (k == 0 and (x.get("due_date") or "") < ms))
        run += ins - outs
        proj.append({"month": ms[:7], "in": r2(ins), "out": r2(outs), "balance": r2(run)})
    return {"balance": bal, "initial_balance": num(s.get("initial_balance")),
            "overdue_total": r2(sum(x["amount"] for x in overdue)), "overdue_count": len(overdue),
            "due_7": due_within(pend_out, 7), "due_15": due_within(pend_out, 15), "due_30": due_within(pend_out, 30),
            "payables_total": r2(sum(x["amount"] for x in pend_out)), "receivables_total": rec_total,
            "receivables_scheduled_7": due_within(pend_in, 7), "projection": proj,
            "cash_need": r2(max(0, due_within(pend_out, 30) - bal - due_within(pend_in, 30)))}


@api.get("/dashboard")
async def dashboard(start: Optional[str] = None, end: Optional[str] = None, user=Depends(get_user)):
    ds, de = month_range()
    start, end = start or ds, end or de
    m = await period_metrics(start, end)
    fin = await finance_overview(user)
    t = today_s()
    quotes = await find("quotes", {"status": {"$in": ["enviado", "aguardando"]}})
    orders = await find("orders", {"status": {"$in": OPEN_ORDER}})
    jobs = await find("jobs", {"status": {"$in": ACTIVE_JOB}})
    mats = await find("materials")
    low = [x for x in mats if num(x.get("min_qty")) is not None and (num(x.get("qty")) or 0) <= num(x["min_qty"])]
    purch = await find("purchases", {"status": {"$in": ["planejado", "aprovado", "comprado"]}})
    upcoming = sorted([x for x in await find("transactions", {"scope": "empresa", "type": "despesa", "paid_date": None})],
                      key=lambda x: x.get("due_date") or "")[:8]
    printers = await find("printers", sort=("name", 1))
    done_jobs = await find("jobs", {"status": {"$in": ["concluido", "falhou"]}})
    ph = []
    for p in printers:
        mins = sum(num(j.get("real_minutes")) or 0 for j in done_jobs if j.get("printer_id") == p["id"]
                   and start <= (j.get("end_time") or "")[:10] <= end)
        ph.append({"name": p["name"], "period_hours": r2(mins / 60), "total_hours": r2((num(p.get("initial_hours")) or 0) + (num(p.get("hours_used")) or 0)),
                   "queue": sum(1 for j in jobs if j.get("printer_id") == p["id"])})
    chart = []
    for k in range(5, -1, -1):
        ms = add_months(t[:8] + "01", -k)
        me_ = add_days(add_months(ms, 1), -1)
        pm = await period_metrics(ms, me_)
        chart.append({"month": ms[:7], "revenue": pm["revenue"], "expenses": pm["expenses_total"],
                      "received": pm["received"], "net": pm["net_profit"]})
    clients = await find("clients")
    reminders = [{"client_id": c["id"], "client": c["name"], **r} for c in clients for r in c.get("reminders", [])
                 if not r.get("done") and (r.get("date") or "") <= add_days(t, 3)]
    prods = await products_overview(user)
    return {"period": {"start": start, "end": end}, "metrics": m, "finance": fin,
            "quotes_waiting": len(quotes), "quotes_waiting_value": r2(sum(q["total"] for q in quotes)),
            "orders_open": len(orders), "orders_late": sum(1 for o in orders if o.get("due_date") and o["due_date"] < t),
            "orders_ready": sum(1 for o in orders if o["status"] == "pronto"),
            "jobs_printing": sum(1 for j in jobs if j["status"] == "imprimindo"), "jobs_queue": len(jobs),
            "finished_ready_units": sum(p.get("finished_stock") or 0 for p in prods),
            "low_stock": low, "purchases_open": len(purch),
            "purchases_value": r2(sum((num(x.get("qty")) or 0) * (num(x.get("est_unit_price")) or 0) for x in purch)),
            "upcoming_bills": upcoming, "printer_hours": ph, "chart": chart, "reminders": reminders}


# ---------------------------------------------------------------- purchases
@api.get("/purchases/suggestions")
async def purchase_suggestions(user=Depends(get_user)):
    mats = {m["id"]: m for m in await find("materials")}
    open_p = await find("purchases", {"status": {"$in": ["planejado", "aprovado", "comprado"]}})
    open_ids = {p.get("material_id") for p in open_p}
    prods = {p["id"]: p for p in await find("products")}
    orders = await find("orders", {"status": {"$in": ["confirmado", "em_producao"]}})
    need = {}
    for o in orders:
        for i in o.get("items", []):
            p = prods.get(i.get("product_id"))
            if not p:
                continue
            units = max(i["qty"] - (num(p.get("finished_stock")) or 0), 0)
            if p.get("filament_material_id"):
                need[p["filament_material_id"]] = need.get(p["filament_material_id"], 0) + units * (num(p.get("weight_g")) or 0)
            for b in p.get("bom") or []:
                need[b.get("material_id")] = need.get(b.get("material_id"), 0) + units * (num(b.get("qty")) or 0)
    out = []
    for mid, m in mats.items():
        if mid in open_ids or m.get("kind") == "ferramenta":
            continue
        qty = num(m.get("qty")) or 0
        mn = num(m.get("min_qty"))
        req = need.get(mid, 0)
        reasons = []
        if mn is not None and qty <= mn:
            reasons.append("Estoque mínimo atingido")
        if req > 0 and qty - req < (mn or 0):
            reasons.append(f"Pedidos confirmados precisam de {r2(req)} {m.get('unit', '')}")
        if reasons:
            sug = max((mn or 0) * 2 + req - qty, mn or 1)
            out.append({"material_id": mid, "name": m["name"], "unit": m.get("unit"), "qty_now": qty, "needed": r2(req),
                        "suggested_qty": r2(sug), "est_unit_price": m.get("avg_cost"), "supplier_id": m.get("supplier_id"),
                        "reason": "; ".join(reasons)})
    return out


class PStatus(BaseModel):
    status: str
    paid: bool = False
    due_date: Optional[str] = None
    unit_price: Optional[float] = None
    qty: Optional[float] = None


@api.post("/purchases/{pid}/status")
async def purchase_status(pid: str, body: PStatus, user=Depends(get_user)):
    p = await get_one("purchases", pid)
    if body.status not in ("planejado", "aprovado", "comprado", "recebido"):
        raise HTTPException(400, "Status inválido")
    upd = {"status": body.status}
    if body.unit_price is not None:
        upd["unit_price"] = body.unit_price
    if body.qty is not None:
        upd["qty"] = body.qty
    qty = num(upd.get("qty", p.get("qty"))) or 0
    up = num(upd.get("unit_price", p.get("unit_price"))) or num(p.get("est_unit_price")) or 0
    total = num(p.get("total_price")) if num(p.get("total_price")) and body.unit_price is None else r2(qty * up)
    if body.status in ("comprado", "recebido") and not p.get("transaction_id"):
        tx = stamp({"type": "despesa", "scope": "empresa", "description": f"Compra: {p.get('name')}",
                    "category": p.get("category") or "Compra de materiais", "amount": r2(total),
                    "due_date": body.due_date or today_s(), "paid_date": (body.due_date or today_s()) if body.paid else None,
                    "supplier_id": p.get("supplier_id"), "purchase_id": pid, "source": "compra", "in_result": False,
                    "demo": p.get("demo", False)}, user, True)
        await db.transactions.insert_one(tx)
        upd["transaction_id"] = tx["id"]
        upd["purchased_date"] = today_s()
    if body.status == "recebido" and not p.get("received_done"):
        if p.get("material_id"):
            await add_movement(user, p["material_id"], "entrada", qty, (total / qty) if qty else up,
                               note=f"Compra recebida: {p.get('name')}", ref=pid, demo=p.get("demo", False))
            if p.get("supplier_id"):
                await db.materials.update_one({"id": p["material_id"]}, {"$set": {"supplier_id": p["supplier_id"],
                                                                                   "last_purchase": today_s()}})
        upd["received_done"] = True
        upd["received_date"] = today_s()
    await db.purchases.update_one({"id": pid}, {"$set": stamp(upd, user)})
    await audit(user, "purchases", pid, "status", body.status)
    return await get_one("purchases", pid)


# ---------------------------------------------------------------- clients CRM
class ContactIn(BaseModel):
    note: str
    reminder_date: Optional[str] = None


@api.post("/clients/{cid}/contacts")
async def add_contact(cid: str, body: ContactIn, user=Depends(get_user)):
    await get_one("clients", cid)
    c = {"id": nid(), "note": body.note, "at": now_iso(), "by": user["name"]}
    push = {"contacts": c}
    if body.reminder_date:
        push["reminders"] = {"id": nid(), "date": body.reminder_date, "note": body.note, "done": False}
    await db.clients.update_one({"id": cid}, {"$push": push})
    return await get_one("clients", cid)


@api.post("/clients/{cid}/reminders/{rid}/done")
async def reminder_done(cid: str, rid: str, user=Depends(get_user)):
    await db.clients.update_one({"id": cid, "reminders.id": rid}, {"$set": {"reminders.$.done": True}})
    return await get_one("clients", cid)


@api.get("/clients/{cid}/history")
async def client_history(cid: str, user=Depends(get_user)):
    return {"orders": await find("orders", {"client_id": cid}), "quotes": await find("quotes", {"client_id": cid})}


# ---------------------------------------------------------------- reports
@api.get("/reports")
async def reports(start: str, end: str, product_id: Optional[str] = None, client_id: Optional[str] = None,
                  channel: Optional[str] = None, printer_id: Optional[str] = None, user=Depends(get_user)):
    oq = {"status": {"$ne": "cancelado"}, "order_date": {"$gte": start, "$lte": end}}
    if client_id:
        oq["client_id"] = client_id
    if channel:
        oq["channel"] = channel
    orders = await find("orders", oq)
    if product_id:
        orders = [o for o in orders if any(i.get("product_id") == product_id for i in o.get("items", []))]
    sales = []
    for o in orders:
        for i in o.get("items", []):
            if product_id and i.get("product_id") != product_id:
                continue
            sales.append({"data": o["order_date"], "pedido": o.get("number"), "cliente": o.get("client_name"),
                          "canal": o.get("channel"), "produto": i.get("name"), "qtd": i["qty"], "preco": i["unit_price"],
                          "receita": i["total"], "custo": r2(i["qty"] * i["unit_cost"]),
                          "lucro": r2(i["total"] - i["qty"] * i["unit_cost"])})
    m = await period_metrics(start, end)
    txs = await find("transactions", {"scope": "empresa"})
    t = today_s()
    bills = [{"descricao": x.get("description"), "categoria": x.get("category"), "tipo": x["type"], "valor": x["amount"],
              "vencimento": x.get("due_date"), "pagamento": x.get("paid_date"), "status": tx_status(x)}
             for x in txs if start <= (x.get("due_date") or "") <= end]
    qs = await find("quotes", {"quote_date": {"$gte": start, "$lte": end}})
    approved = sum(1 for q in qs if q["status"] in ("aprovado", "convertido"))
    refused = sum(1 for q in qs if q["status"] == "recusado")
    jq = {"status": {"$in": ["concluido", "falhou"]}}
    if printer_id:
        jq["printer_id"] = printer_id
    jobs = [j for j in await find("jobs", jq) if start <= (j.get("end_time") or "")[:10] <= end]
    printers = {p["id"]: p["name"] for p in await find("printers")}
    perf = {}
    for j in jobs:
        k = printers.get(j.get("printer_id"), "Sem impressora")
        pp = perf.setdefault(k, {"impressora": k, "trabalhos": 0, "falhas": 0, "horas": 0, "aprovadas": 0, "defeitos": 0, "refeitas": 0, "filamento_g": 0})
        pp["trabalhos"] += 1
        pp["falhas"] += 1 if j["status"] == "falhou" else 0
        pp["horas"] = r2(pp["horas"] + (num(j.get("real_minutes")) or 0) / 60)
        pp["aprovadas"] += num(j.get("approved_qty")) or 0
        pp["defeitos"] += num(j.get("defect_qty")) or 0
        pp["refeitas"] += num(j.get("redo_qty")) or 0
        pp["filamento_g"] = r2(pp["filamento_g"] + (num(j.get("real_weight")) or 0))
    mv = await db.stock_movements.find({"date": {"$gte": start, "$lte": end}, "type": {"$in": ["saida", "desperdicio"]}}, NF).to_list(5000)
    mats = {x["id"]: x for x in await find("materials")}
    cons = {}
    for x in mv:
        mm = mats.get(x["material_id"], {})
        if mm.get("kind") != "filamento":
            continue
        c = cons.setdefault(x["material_name"], {"filamento": x["material_name"], "consumo_g": 0, "desperdicio_g": 0})
        c["consumo_g" if x["type"] == "saida" else "desperdicio_g"] = r2(c["consumo_g" if x["type"] == "saida" else "desperdicio_g"] + x["qty"])
    stock = [{"item": x["name"], "tipo": x.get("kind"), "qtd": x.get("qty"), "unidade": x.get("unit"), "minimo": x.get("min_qty"),
              "custo_medio": x.get("avg_cost"), "valor": r2((num(x.get("qty")) or 0) * (num(x.get("avg_cost")) or 0))}
             for x in mats.values()]
    purch = [{"item": p.get("name"), "qtd": p.get("qty"), "status": p.get("status"),
              "valor_estimado": r2((num(p.get("qty")) or 0) * (num(p.get("est_unit_price")) or 0))}
             for p in await find("purchases", {"status": {"$ne": "recebido"}})]
    return {"summary": {k: m[k] for k in ("revenue", "received", "fees", "cogs", "gross_profit", "opex", "net_profit",
                                          "expenses_total", "paid_out", "orders_count")},
            "quotes": {"total": len(qs), "approved": approved, "refused": refused,
                       "conversion_pct": r2(approved / len(qs) * 100) if qs else 0},
            "sales": sales, "products": sorted(m["products"], key=lambda x: -x["profit"]),
            "expenses_by_category": m["expenses_by_category"], "revenue_by_channel": m["revenue_by_channel"],
            "bills": bills, "bills_status": {s_: r2(sum(b["valor"] for b in bills if b["status"] == s_ and b["tipo"] == "despesa"))
                                             for s_ in ("pago", "pendente", "vencido")},
            "printers": list(perf.values()), "filament": list(cons.values()), "stock": stock, "purchases": purch,
            "losses": {"defeitos": sum(p["defeitos"] for p in perf.values()), "refeitas": sum(p["refeitas"] for p in perf.values()),
                       "falhas": sum(p["falhas"] for p in perf.values()),
                       "desperdicio_g": r2(sum(c["desperdicio_g"] for c in cons.values()))}}


# ---------------------------------------------------------------- settings / audit
@api.get("/settings")
async def settings_get(user=Depends(get_user)):
    return await get_settings()


@api.put("/settings")
async def settings_put(body: dict, user=Depends(get_user)):
    body.pop("_id", None)
    body["id"] = "main"
    stamp(body, user)
    await db.settings.update_one({"id": "main"}, {"$set": body}, upsert=True)
    await audit(user, "settings", "main", "alterou premissas")
    return await get_settings()


@api.get("/audit")
async def audit_list(entity_id: Optional[str] = None, user=Depends(get_user)):
    q = {"entity_id": entity_id} if entity_id else {}
    return await db.audit_logs.find(q, NF).sort("at", -1).to_list(200)


# ---------------------------------------------------------------- files
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = os.environ.get("APP_NAME", "vbm-gestao-3d")
storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path, data, ct):
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(), "Content-Type": ct},
                        data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path):
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage()}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


@api.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(get_user)):
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "Arquivo muito grande (máx. 8MB)")
    ext = (file.filename or "img.jpg").rsplit(".", 1)[-1].lower()[:5]
    path = f"{APP_NAME}/uploads/{uuid.uuid4()}.{ext}"
    try:
        res = await run_in_threadpool(put_object, path, data, file.content_type or "image/jpeg")
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else 500
        raise HTTPException(402 if code == 402 else 502, "Falha no envio da imagem" + (" (sem créditos)" if code == 402 else ""))
    await db.files.insert_one({"id": nid(), "path": res["path"], "name": file.filename, "created_by": user["name"],
                               "created_at": now_iso()})
    return {"path": res["path"]}


@api.get("/files/{path:path}")
async def get_file(path: str, user=Depends(get_user)):
    if not await db.files.find_one({"path": path}):
        raise HTTPException(404, "Arquivo não encontrado")
    data, ct = await run_in_threadpool(get_object, path)
    return Response(content=data, media_type=ct, headers={"Cache-Control": "private, max-age=86400"})


# ---------------------------------------------------------------- demo data
@api.post("/demo/seed")
async def demo_seed(user=Depends(get_user)):
    if await db.clients.find_one({"demo": True}):
        raise HTTPException(409, "Os dados de demonstração já existem")
    D = {"demo": True}
    t = today_s()
    sup = stamp({"name": "[DEMO] Fornecedor Filamentos", "phone": "", "notes": "Fictício", **D}, user, True)
    await db.suppliers.insert_one(sup)
    mats = []
    for name, kind, unit, qty, cost, mn in [
        ("[DEMO] PLA Preto 1kg", "filamento", "g", 1800, 0.10, 500), ("[DEMO] PLA Branco 1kg", "filamento", "g", 400, 0.10, 500),
        ("[DEMO] Argola de chaveiro", "consumivel", "un", 120, 0.35, 50), ("[DEMO] Saquinho 8x12", "embalagem", "un", 200, 0.12, 50),
        ("[DEMO] Etiqueta VBM", "embalagem", "un", 30, 0.20, 40), ("[DEMO] Alicate de corte", "ferramenta", "un", 1, 25, None)]:
        m = stamp({"name": name, "kind": kind, "unit": unit, "qty": 0, "avg_cost": cost, "min_qty": mn,
                   "supplier_id": sup["id"], "location": "Prateleira A", **D}, user, True)
        await db.materials.insert_one(m)
        await add_movement(user, m["id"], "entrada", qty, cost, "Saldo inicial demo", demo=True)
        mats.append(m)
    p1 = stamp({"name": "[DEMO] Chaveiro personalizado", "sku": "DEMO-CH01", "category": "Chaveiros", "price": 12.9,
                "weight_g": 8, "print_minutes": 25, "labor_minutes": 5, "filament_material_id": mats[0]["id"],
                "color": "Preto", "filament_type": "PLA", "colors_count": 1, "finished_stock": 10, "min_stock": 5,
                "printer_compat": "ambas", "photos": [],
                "bom": [{"material_id": mats[2]["id"], "qty": 1}, {"material_id": mats[3]["id"], "qty": 1},
                        {"material_id": mats[4]["id"], "qty": 1}], **D}, user, True)
    p2 = stamp({"name": "[DEMO] Porta-canetas hexagonal", "sku": "DEMO-PC01", "category": "Escritório", "price": 34.9,
                "weight_g": 85, "print_minutes": 210, "labor_minutes": 10, "filament_material_id": mats[1]["id"],
                "color": "Branco", "filament_type": "PLA", "colors_count": 1, "finished_stock": 2, "min_stock": 2,
                "printer_compat": "a1", "photos": [], "bom": [{"material_id": mats[3]["id"], "qty": 1}], **D}, user, True)
    await db.products.insert_many([p1, p2])
    c1 = stamp({"name": "[DEMO] Maria Silva", "phone": "(11) 90000-0000", "whatsapp": "11900000000", "origin": "instagram",
                "stage": "aguardando_resposta", "contacts": [], "reminders": [{"id": nid(), "date": t, "note": "Retornar sobre orçamento", "done": False}], **D}, user, True)
    c2 = stamp({"name": "[DEMO] Loja Exemplo", "company": "Loja Exemplo", "origin": "shopee", "stage": "pedido_em_producao",
                "contacts": [], "reminders": [], **D}, user, True)
    await db.clients.insert_many([c1, c2])
    q = {"client_id": c1["id"], "client_name": c1["name"], "items": [{"product_id": p1["id"], "name": p1["name"], "qty": 20,
         "unit_price": 11.9, "unit_cost": 4.2, "customization": "Nomes dos convidados"}], "discount": 0, "production_days": 5,
         "valid_until": add_days(t, 7), "payment_terms": "50% de sinal, saldo na entrega", "deposit": 119, "status": "enviado", **D}
    compute_quote(q)
    q["number"] = await next_number("Q")
    await db.quotes.insert_one(stamp(q, user, True))
    o = {"client_id": c2["id"], "client_name": c2["name"], "channel": "shopee", "items": [{"product_id": p2["id"], "name": p2["name"],
         "qty": 3, "unit_price": 34.9, "unit_cost": 14.5}], "marketplace_fee": 20.94, "payment_fee": 0, "fees_deducted": True,
         "due_date": add_days(t, 4), "status": "confirmado", **D}
    compute_order(o)
    o["number"] = await next_number("P")
    await db.orders.insert_one(stamp(o, user, True))
    await db.transactions.insert_one(stamp({"type": "receita", "scope": "empresa", "description": f"Pedido {o['number']} - repasse parcial",
                                            "category": "Vendas", "amount": 40, "due_date": t, "paid_date": t, "order_id": o["id"],
                                            "source": "venda", "in_result": False, "channel": "shopee", **D}, user, True))
    await tx_batch(BatchIn(base={"type": "despesa", "description": "[DEMO] Parcela impressora fictícia", "category": "Equipamentos (parcelas)", **D},
                           mode="parcelado", total_amount=1200, n=6, first_due=add_days(t, -5)), user)
    await db.transactions.insert_one(await prep_tx(stamp({"type": "despesa", "description": "[DEMO] Marketing Instagram", "category": "Marketing",
                                                          "amount": 50, "due_date": t, "paid_date": None, **D}, user, True)))
    await db.jobs.insert_one(stamp({"order_id": o["id"], "order_number": o["number"], "product_id": p2["id"], "product_name": p2["name"],
                                    "qty": 3, "material_id": mats[1]["id"], "est_weight": 255, "est_minutes": 630,
                                    "status": "na_fila", "due_date": o["due_date"], **D}, user, True))
    await auto_assign(user)
    await audit(user, "demo", "demo", "criou dados de demonstração")
    return {"ok": True}


@api.delete("/demo")
async def demo_clear(user=Depends(get_user)):
    n = 0
    for c in list(COLS) + ["stock_movements"]:
        r = await db[c].delete_many({"demo": True})
        n += r.deleted_count
    await audit(user, "demo", "demo", "removeu dados de demonstração", str(n))
    return {"removed": n}


# ---------------------------------------------------------------- generic CRUD
def decorate(col, d):
    if col == "transactions":
        d["status"] = tx_status(d)
    if col == "materials":
        mn = num(d.get("min_qty"))
        d["low"] = mn is not None and (num(d.get("qty")) or 0) <= mn
    return d


async def prepare(col, d, user, old=None):
    for k in ("id", "_id", "created_at", "created_by", "status_computed"):
        d.pop(k, None)
    if col == "orders":
        if old:
            d.pop("status", None)  # status changes go through /orders/{id}/status
        merged = {**(old or {}), **d}
        compute_order(merged)
        d.update(merged)
        d.pop("_id", None)
    if col == "quotes":
        merged = {**(old or {}), **d}
        compute_quote(merged)
        d.update(merged)
        d.pop("_id", None)
    if col == "transactions":
        d.pop("status", None)
        merged = await prep_tx({**(old or {}), **d})
        d.update(merged)
        d.pop("_id", None)
    if col == "materials":
        if old:
            d.pop("qty", None)
            d.pop("avg_cost", None)
        d.pop("low", None)
    if col == "products" and old:
        d.pop("finished_stock", None)
    if col in ("orders", "quotes") and d.get("client_id"):
        c = await db.clients.find_one({"id": d["client_id"]}, NF)
        d["client_name"] = c["name"] if c else d.get("client_name")
    if col == "jobs" and d.get("printer_id"):
        p = await db.printers.find_one({"id": d["printer_id"]}, NF)
        d["printer_name"] = p["name"] if p else None
    if col == "jobs" and d.get("product_id"):
        p = await db.products.find_one({"id": d["product_id"]}, NF)
        d["product_name"] = p["name"] if p else d.get("product_name")
    if col == "jobs" and d.get("order_id"):
        o = await db.orders.find_one({"id": d["order_id"]}, NF)
        if o:
            d["order_number"] = o.get("number")
            d.setdefault("due_date", o.get("due_date"))
    return d


def check_col(col):
    if col not in COLS:
        raise HTTPException(404, "Coleção inválida")


@api.get("/c/{col}")
async def list_ep(col: str, user=Depends(get_user)):
    check_col(col)
    return [decorate(col, d) for d in await find(col)]


@api.get("/c/{col}/{id_}")
async def get_ep(col: str, id_: str, user=Depends(get_user)):
    check_col(col)
    return decorate(col, await get_one(col, id_))


@api.post("/c/{col}")
async def create_ep(col: str, body: dict, user=Depends(get_user)):
    check_col(col)
    init_qty = num(body.get("qty")) if col == "materials" else None
    d = await prepare(col, dict(body), user)
    if col == "materials":
        d["qty"] = 0
        d["avg_cost"] = num(body.get("unit_cost")) or 0
    if col == "products":
        d.setdefault("finished_stock", num(body.get("finished_stock")) or 0)
    if col in ("orders", "quotes"):
        d["number"] = await next_number("P" if col == "orders" else "Q")
    stamp(d, user, True)
    await db[col].insert_one(d)
    d.pop("_id", None)
    if col == "materials" and init_qty:
        await add_movement(user, d["id"], "entrada", init_qty, num(body.get("unit_cost")) or 0, "Saldo inicial")
    if col == "orders":
        await sync_order_fees(d, user)
    if col == "jobs" and not d.get("printer_id"):
        await auto_assign(user)
    await audit(user, col, d["id"], "criado", d.get("name") or d.get("description") or d.get("number") or "")
    return decorate(col, await get_one(col, d["id"]))


@api.put("/c/{col}/{id_}")
async def update_ep(col: str, id_: str, body: dict, user=Depends(get_user)):
    check_col(col)
    old = await get_one(col, id_)
    if col == "jobs" and old.get("consumed"):
        for k in ("status", "real_weight", "approved_qty", "defect_qty", "material_id"):
            body.pop(k, None)
    if col == "quotes" and old.get("order_id"):
        body.pop("items", None)
    d = await prepare(col, dict(body), user, old)
    stamp(d, user)
    await db[col].update_one({"id": id_}, {"$set": d})
    new = await get_one(col, id_)
    if col == "orders":
        await sync_order_fees(new, user)
    changed = [k for k in body if k not in ("updated_at",) and old.get(k) != new.get(k)]
    await audit(user, col, id_, "alterado", ", ".join(changed[:8]))
    return decorate(col, new)


@api.delete("/c/{col}/{id_}")
async def delete_ep(col: str, id_: str, user=Depends(get_user)):
    check_col(col)
    doc = await get_one(col, id_)
    if col == "orders":
        if (await order_finance(doc))["paid"] > 0:
            raise HTTPException(409, "Pedido possui pagamentos recebidos. Cancele o pedido ou estorne os pagamentos.")
        await db.transactions.update_many({"order_id": id_, "paid_date": None}, {"$set": {"deleted": True}})
    if col == "clients" and await db.orders.find_one({"client_id": id_, "deleted": {"$ne": True}, "status": {"$in": OPEN_ORDER}}):
        raise HTTPException(409, "Cliente possui pedidos em aberto")
    if col == "jobs" and doc.get("consumed") and doc["status"] != "cancelado":
        raise HTTPException(409, "Trabalho finalizado com baixa de estoque não pode ser excluído")
    if col == "purchases" and doc.get("transaction_id"):
        raise HTTPException(409, "Compra já gerou lançamento financeiro. Exclua o lançamento antes, se necessário.")
    await db[col].update_one({"id": id_}, {"$set": {"deleted": True, "deleted_at": now_iso(), "deleted_by": user["name"]}})
    await audit(user, col, id_, "excluído", doc.get("name") or doc.get("description") or doc.get("number") or "")
    return {"ok": True}


# ---------------------------------------------------------------- startup
DEFAULT_CATEGORIES = [
    ("Compra de filamentos", False), ("Compra de materiais", False), ("Embalagens", False),
    ("Equipamentos (parcelas)", False), ("Energia elétrica", False), ("Manutenção", False),
    ("Taxas de marketplace", False), ("Custos fixos (rateados)", False), ("Ferramentas", True),
    ("Marketing", True), ("Frete", True), ("Impostos", True), ("Outras despesas", True),
]


@app.on_event("startup")
async def startup():
    for i in (1, 2):
        email = os.environ[f"USER{i}_EMAIL"].lower()
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({"id": nid(), "email": email, "name": os.environ[f"USER{i}_NAME"],
                                       "password_hash": bcrypt.hashpw(os.environ[f"USER{i}_PASSWORD"].encode(), bcrypt.gensalt()).decode(),
                                       "created_at": now_iso()})
    await db.users.create_index("email", unique=True)
    sys_user = {"name": "Sistema", "id": "system"}
    if not await db.printers.find_one({}):
        for code, name in (("a1", "Bambu Lab A1"), ("a1mini", "Bambu Lab A1 Mini")):
            await db.printers.insert_one(stamp({"code": code, "name": name, "power_w": None, "purchase_price": None,
                                                "lifespan_hours": None, "maintenance_pct": None, "initial_hours": 0,
                                                "hours_used": 0, "status": "ativa"}, sys_user, True))
    if not await db.categories.find_one({}):
        for name, inr in DEFAULT_CATEGORIES:
            await db.categories.insert_one(stamp({"name": name, "type": "despesa", "in_result": inr}, sys_user, True))
    if not await db.settings.find_one({"id": "main"}):
        await db.settings.insert_one({"id": "main", "company_name": "VBM 3D", "waste_mode": "material",
                                      "pricing_mode": "margem", "quote_validity_days": 7})
    for c in COLS:
        await db[c].create_index("id")
    try:
        await run_in_threadpool(init_storage)
    except Exception as e:  # storage optional at boot
        logger.warning(f"storage init failed: {e}")


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
